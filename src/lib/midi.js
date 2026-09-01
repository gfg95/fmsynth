// src/lib/midi.js
// Décodage des messages MIDI bruts + table de correspondance CC -> paramètre de synthèse.

export const MIDI = {
	NOTE_OFF: 0x80,
	NOTE_ON: 0x90,
	CONTROL_CHANGE: 0xb0,
	PITCH_BEND: 0xe0
};

// Mise à l'échelle linéaire d'une valeur MIDI (0..127) vers [min, max].
const lin = (v, min, max) => min + (max - min) * (v / 127);
// Mise à l'échelle exponentielle : mieux adaptée aux temps d'enveloppe.
const exp = (v, min, max) => min * Math.pow(max / min, v / 127);

/**
 * Table CC -> paramètre du synthé.
 *  param  : nom logique consommé par FMEngine.setParam() et par l'UI
 *  label  : libellé affiché
 *  unit   : unité affichée
 *  scale  : convertit une valeur MIDI 0..127 en valeur réelle
 *
 * Numéros CC choisis d'après les conventions courantes (7 = volume, 1 = mod wheel).
 * Modifie librement cette table pour l'adapter à ton contrôleur / séquenceur.
 */
export const CC_MAP = {
	7: { param: 'volume', label: 'Volume', unit: 'dB', scale: (v) => (v === 0 ? -Infinity : lin(v, -40, 0)) },
	74: { param: 'harmonicity', label: 'Harmonicity', unit: '', scale: (v) => lin(v, 0.25, 8) },
	71: { param: 'modulationIndex', label: 'FM Index', unit: '', scale: (v) => lin(v, 0, 25) },
	1: { param: 'modulationIndex', label: 'FM Index (mod wheel)', unit: '', scale: (v) => lin(v, 0, 25) },
	73: { param: 'attack', label: 'Attack', unit: 's', scale: (v) => exp(v, 0.001, 2) },
	75: { param: 'decay', label: 'Decay', unit: 's', scale: (v) => exp(v, 0.01, 2) },
	72: { param: 'release', label: 'Release', unit: 's', scale: (v) => exp(v, 0.01, 4) },
	91: { param: 'reverb', label: 'Reverb', unit: '', scale: (v) => lin(v, 0, 1) }
};

/**
 * Décode un message MIDI brut (tableau d'octets) en objet exploitable.
 * @param {number[]} bytes  ex. [0x90, 60, 127]
 */
export function parseMidiMessage(bytes) {
	if (!bytes || bytes.length === 0) return { type: 'empty' };
	const status = bytes[0];

	// Messages temps réel : 0xF8 clock, 0xFA start, 0xFC stop, etc.
	if (status >= 0xf8) return { type: 'realtime', status };

	const command = status & 0xf0;
	const channel = status & 0x0f; // 0..15

	switch (command) {
		case MIDI.NOTE_ON: {
			const note = bytes[1];
			const velocity = bytes[2] ?? 0;
			// Note On à vélocité 0 = Note Off (convention MIDI standard).
			return velocity > 0
				? { type: 'noteon', channel, note, velocity }
				: { type: 'noteoff', channel, note, velocity: 0 };
		}
		case MIDI.NOTE_OFF:
			return { type: 'noteoff', channel, note: bytes[1], velocity: bytes[2] ?? 0 };
		case MIDI.CONTROL_CHANGE:
			return { type: 'cc', channel, controller: bytes[1], value: bytes[2] ?? 0 };
		case MIDI.PITCH_BEND: {
			// 14 bits : LSB puis MSB, centré sur 8192.
			const value = ((bytes[2] ?? 0) << 7) | (bytes[1] ?? 0);
			return { type: 'pitchbend', channel, value };
		}
		default:
			return { type: 'unknown', status };
	}
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Nom lisible d'une note MIDI (60 -> "C4"). */
export function noteName(note) {
	return NOTE_NAMES[note % 12] + (Math.floor(note / 12) - 1);
}