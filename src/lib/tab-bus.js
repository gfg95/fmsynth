// tab-bus.js  MidiKeyboard
export class TabBus {
  constructor(options = {}) {
    this.mode = options.mode || "extension";



    this.listeners = new Map();   // endpoint -> Set<callback>


    // --- Garde SSR ---
    // SvelteKit exécute ce module côté serveur, où window/document n'existent pas.
    // bus.js instancie le singleton au chargement du module (donc aussi sur le serveur).
    // On ne touche au DOM que dans le navigateur ; le module est ré-évalué côté client
    // à l'hydratation, et c'est là que l'initialisation réelle a lieu.
    if (typeof window === "undefined") return;

    this._onMessage = this._onMessage.bind(this);
    window.addEventListener("message", this._onMessage);

  }

 

  _onMessage(event) {
    if (this.mode === "extension") {
      if (event.source !== window) return;                 // relais du content-script
    } 
    const { type, endpoint, payload } = event.data || {};



    if ((type === "JSON_API_IN" || type === "ROUTER_PAYLOAD") && endpoint) {
      this.listeners.get(endpoint)?.forEach((cb) => cb(payload));
    }
  }

  send(endpoint, payload = {}) {
    if (typeof window === "undefined") return; // no-op côté serveur
    if (this.mode === "extension") {
      window.postMessage({ type: "JSON_API_OUT", endpoint, payload }, "*");
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

    this.listeners.clear();
  }

  // raccourcis MIDI
  sendMidi(midiData) { this.send("/midi", { midiData }); }
  onMidi(callback) { return this.on("/midi", (data) => callback(data.midiData)); }
}