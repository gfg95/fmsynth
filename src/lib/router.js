// src/lib/router.js
// Pont vers l'extension « Web MIDI Tab Router » via window.postMessage.
// Aucune dépendance : l'extension écoute/relaie les messages postés sur la fenêtre.

// Type documenté par l'extension pour le sens SORTANT (onglet -> extension).
const OUT_TYPE = 'MIDI_OUT_TO_EXTENSION';

// ⚠️ IMPORTANT — sens ENTRANT (extension -> onglet).
// La doc de l'extension ne décrit que le sens sortant. On suppose donc que
// l'extension relaie vers les autres onglets avec le type ci-dessous et la
// même structure { type, midiData }. Si ton extension utilise un autre nom
// (ex. "MIDI_FROM_EXTENSION", "MIDI_IN", ...), change UNIQUEMENT cette ligne.
const IN_TYPE = 'MIDI_IN_FROM_EXTENSION';

/**
 * Émet un message MIDI vers les autres onglets (via l'extension).
 * @param {number[]} bytes  Octets MIDI [status, data1, data2]
 */
export function sendMidi(bytes) {
	if (typeof window === 'undefined') return;
	window.postMessage({ type: OUT_TYPE, midiData: Array.from(bytes) }, '*');
}

/**
 * S'abonne aux messages MIDI entrants relayés par l'extension.
 * @param {(bytes:number[]) => void} onBytes  Callback appelé pour chaque message
 * @returns {() => void} Fonction de désabonnement
 */
export function subscribeMidi(onBytes) {
	if (typeof window === 'undefined') return () => {};

	const handler = (event) => {
		const data = event.data;
		if (!data || typeof data !== 'object') return;
		if (data.type !== IN_TYPE) return; // on ignore tout le reste (y compris nos propres émissions)
		if (!Array.isArray(data.midiData)) return;
		onBytes(data.midiData);
	};

	window.addEventListener('message', handler);
	return () => window.removeEventListener('message', handler);
}