// src/lib/synth.js
// Moteur de synthèse FM polyphonique basé sur Tone.FMSynth.
import * as Tone from 'tone';

export class FMEngine {
	constructor() {
		this.ready = false;
		this.synth = null;
		this.volume = null;
		this.reverb = null;
	}

	/**
	 * Démarre l'AudioContext et construit la chaîne audio.
	 * DOIT être appelé depuis un geste utilisateur (clic) — sinon le navigateur
	 * garde l'audio suspendu.
	 */
	async start() {
		if (this.ready) return;
		await Tone.start();

		this.volume = new Tone.Volume(-8);
		this.reverb = new Tone.Reverb({ decay: 2.5, wet: 0.15 });
		// Attend la génération de la réponse impulsionnelle de la reverb.
		if (typeof this.reverb.generate === 'function') {
			try {
				await this.reverb.generate();
			} catch (_) {
				/* la reverb reste utilisable, simplement muette un court instant */
			}
		}

		this.synth = new Tone.PolySynth(Tone.FMSynth, {
			harmonicity: 3,
			modulationIndex: 10,
			oscillator: { type: 'sine' },
			modulation: { type: 'square' },
			envelope: { attack: 0.01, decay: 0.2, sustain: 0.6, release: 0.8 },
			modulationEnvelope: { attack: 0.02, decay: 0.2, sustain: 0.3, release: 0.5 }
		});
		this.synth.maxPolyphony = 16;

		// synth -> volume -> reverb -> sortie
		this.synth.chain(this.volume, this.reverb, Tone.getDestination());
		this.ready = true;
	}

	noteOn(note, velocity = 100) {
		if (!this.ready) return;
		const freq = Tone.Frequency(note, 'midi').toFrequency();
		this.synth.triggerAttack(freq, Tone.now(), Math.max(0.05, velocity / 127));
	}

	noteOff(note) {
		if (!this.ready) return;
		const freq = Tone.Frequency(note, 'midi').toFrequency();
		this.synth.triggerRelease(freq, Tone.now());
	}

	/**
	 * Applique une valeur DÉJÀ mise à l'échelle (voir CC_MAP / PARAMS).
	 * @param {string} param
	 * @param {number} value
	 */
	setParam(param, value) {
		if (!this.ready) return;
		switch (param) {
			case 'volume':
				// rampTo(-Infinity) est instable : on coupe franchement dans ce cas.
				if (isFinite(value)) this.volume.volume.rampTo(value, 0.03);
				else this.volume.volume.value = -Infinity;
				break;
			case 'harmonicity':
				this.synth.set({ harmonicity: value });
				break;
			case 'modulationIndex':
				this.synth.set({ modulationIndex: value });
				break;
			case 'attack':
				this.synth.set({ envelope: { attack: value } });
				break;
			case 'decay':
				this.synth.set({ envelope: { decay: value } });
				break;
			case 'release':
				this.synth.set({ envelope: { release: value } });
				break;
			case 'reverb':
				this.reverb.wet.rampTo(value, 0.05);
				break;
		}
	}

	/**
	 * Pitch bend : valeur MIDI 14 bits (0..16383, centre 8192) -> ±2 demi-tons.
	 * @param {number} value14
	 */
	setPitchBend(value14) {
		if (!this.ready) return;
		const cents = ((value14 - 8192) / 8192) * 200; // ±200 cents = ±2 demi-tons
		this.synth.set({ detune: cents });
	}

	dispose() {
		this.synth?.dispose();
		this.reverb?.dispose();
		this.volume?.dispose();
		this.ready = false;
	}
}