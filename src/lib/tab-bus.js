// tab-bus.js
export class TabBus {
  constructor(options = {}) {
    this.mode = options.mode || "extension";
    this.routerUrl = options.routerUrl || "https://router.tabmidi.app/bridge";
    this.routerOrigin = this.mode === "iframe" ? new URL(this.routerUrl).origin : null;
    this.apiKey = options.apiKey || null;

    this.listeners = new Map();   // endpoint -> Set<callback>
    this.iframe = null;
    this.iframeReady = false;
    this.pending = [];            // messages émis avant que l'iframe soit prête

    // --- Garde SSR ----
    // SvelteKit exécute ce module côté serveur, où window/document n'existent pas.
    // bus.js instancie le singleton au chargement du module (donc aussi sur le serveur).
    // On ne touche au DOM que dans le navigateur ; le module est ré-évalué côté client
    // à l'hydratation, et c'est là que l'initialisation réelle a lieu.
    if (typeof window === "undefined") return;

    this._onMessage = this._onMessage.bind(this);
    window.addEventListener("message", this._onMessage);

    if (this.mode === "iframe") this._initIframe();
  }

  _initIframe() {
    this.iframe = document.createElement("iframe");
    this.iframe.src = this.routerUrl;
    this.iframe.setAttribute("aria-hidden", "true");
    this.iframe.style.cssText = "position:absolute;width:0;height:0;border:0;visibility:hidden;";
    this.iframe.addEventListener("load", () => {
      this.iframeReady = true;
      // Tentative précoce (best-effort). Le CONNECT fiable arrive sur BRIDGE_READY,
      // une fois qu'on est certain que le listener du bridge est en place.
      this._postToIframe({ action: "CONNECT", apiKey: this.apiKey });
      for (const msg of this.pending) this._postToIframe(msg);
      this.pending = [];
    });
    document.body.appendChild(this.iframe);
  }

  _onMessage(event) {
    if (this.mode === "extension") {
      if (event.source !== window) return;                 // relais du content-script
    } else {
      if (event.source !== this.iframe?.contentWindow) return; // uniquement NOTRE iframe
      if (event.origin !== this.routerOrigin) return;          // uniquement NOTRE router
    }
    const { type, endpoint, payload } = event.data || {};

    if (type === "BRIDGE_READY") {
      // Le bridge a fini de s'initialiser : on (re)envoie le handshake maintenant
      // qu'on est sûr que son listener écoute. Corrige les apps qui n'émettent pas
      // (sinon leur parentOrigin ne serait jamais mémorisée par le bridge).
      this._postToIframe({ action: "CONNECT", apiKey: this.apiKey });
      return;
    }

    if ((type === "JSON_API_IN" || type === "ROUTER_PAYLOAD") && endpoint) {
      this.listeners.get(endpoint)?.forEach((cb) => cb(payload));
    }
  }

  send(endpoint, payload = {}) {
    if (typeof window === "undefined") return; // no-op côté serveur
    if (this.mode === "extension") {
      window.postMessage({ type: "JSON_API_OUT", endpoint, payload }, "*");
    } else {
      this._postToIframe({ action: "JSON_API_OUT", apiKey: this.apiKey, endpoint, payload });
    }
  }

  _postToIframe(message) {
    if (this.iframeReady && this.iframe?.contentWindow) {
      this.iframe.contentWindow.postMessage(message, this.routerOrigin);
    } else {
      this.pending.push(message); // file d'attente au lieu d'écraser onload
    }
  }

  on(endpoint, callback) {
    if (!this.listeners.has(endpoint)) this.listeners.set(endpoint, new Set());
    this.listeners.get(endpoint).add(callback);
    return () => this.off(endpoint, callback);
  }

  off(endpoint, callback) {
    this.listeners.get(endpoint)?.delete(callback);
  }

  destroy() {
    if (typeof window !== "undefined") window.removeEventListener("message", this._onMessage);
    this.iframe?.remove();
    this.listeners.clear();
  }

  // raccourcis MIDI
  sendMidi(midiData) { this.send("/midi", { midiData }); }
  onMidi(callback) { return this.on("/midi", (data) => callback(data.midiData)); }
}