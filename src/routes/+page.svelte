<script>
	import { onMount } from 'svelte';
	import { FMEngine } from '$lib/synth.js';
	import { parseMidiMessage, noteName, CC_MAP, MIDI } from '$lib/midi.js';
	import { subscribeMidi, sendMidi } from '$lib/router.js';

	const engine = new FMEngine();

	// --- Descripteurs des paramètres exposés (bornes de slider indépendantes du CC) ---
	const PARAMS = [
		{ param: 'volume', label: 'Volume', min: -40, max: 0, step: 0.5, unit: 'dB' },
		{ param: 'harmonicity', label: 'Harmonicity', min: 0.25, max: 8, step: 0.05, unit: '' },
		{ param: 'modulationIndex', label: 'FM Index', min: 0, max: 25, step: 0.1, unit: '' },
		{ param: 'attack', label: 'Attack', min: 0.001, max: 2, step: 0.001, unit: 's' },
		{ param: 'decay', label: 'Decay', min: 0.01, max: 2, step: 0.01, unit: 's' },
		{ param: 'release', label: 'Release', min: 0.01, max: 4, step: 0.01, unit: 's' },
		{ param: 'reverb', label: 'Reverb', min: 0, max: 1, step: 0.01, unit: '' }
	];

	// --- Numéro(s) de CC assigné(s) à chaque paramètre (déduit de CC_MAP) ---
	const CC_BY_PARAM = Object.entries(CC_MAP).reduce((acc, [num, cc]) => {
		(acc[cc.param] ??= []).push(Number(num));
		return acc;
	}, {});
	const ccFor = (param) => {
		const list = CC_BY_PARAM[param];
		return list?.length ? 'CC ' + list.join(', ') : '';
	};

	// --- État réactif (runes Svelte 5) ---
	let started = $state(false);
	let filterChannel = $state(-1); // -1 = Omni
	let activeNotes = $state({}); // { [note]: true }
	let lastMsg = $state(null);
	let log = $state([]);
	let values = $state({
		volume: -8,
		harmonicity: 3,
		modulationIndex: 10,
		attack: 0.01,
		decay: 0.2,
		release: 0.8,
		reverb: 0.15
	});

	// --- Clavier virtuel : 2 octaves à partir de C4 (60) ---
	const START = 60;
	const OCTAVES = 2;
	const WHITE_SEMI = [0, 2, 4, 5, 7, 9, 11];
	const BLACK_AFTER = { 0: 1, 1: 3, 3: 6, 4: 8, 5: 10 };
	const whiteKeys = [];
	const blackKeys = [];
	for (let o = 0; o < OCTAVES; o++) {
		WHITE_SEMI.forEach((s, wi) => {
			const idx = o * 7 + wi;
			whiteKeys.push({ note: START + o * 12 + s, idx });
			if (BLACK_AFTER[wi] !== undefined) {
				blackKeys.push({ note: START + o * 12 + BLACK_AFTER[wi], idx });
			}
		});
	}
	const keyW = 100 / (OCTAVES * 7);

	// --- Réception MIDI ---
	function handleMidi(bytes) {
		const msg = parseMidiMessage(bytes);
		if ('channel' in msg && filterChannel !== -1 && msg.channel !== filterChannel) return;

		lastMsg = msg;
		log.unshift({ ...msg, bytes, t: performance.now() });
		if (log.length > 7) log.pop();

		switch (msg.type) {
			case 'noteon':
				engine.noteOn(msg.note, msg.velocity);
				activeNotes[msg.note] = true;
				break;
			case 'noteoff':
				engine.noteOff(msg.note);
				delete activeNotes[msg.note];
				break;
			case 'cc': {
				const cc = CC_MAP[msg.controller];
				if (cc) {
					const v = cc.scale(msg.value);
					values[cc.param] = v;
					engine.setParam(cc.param, v);
				}
				break;
			}
			case 'pitchbend':
				engine.setPitchBend(msg.value);
				break;
		}
	}

	onMount(() => subscribeMidi(handleMidi));

	// --- Démarrage audio (geste utilisateur) ---
	async function startAudio() {
		await engine.start();
		for (const p of PARAMS) engine.setParam(p.param, values[p.param]);
		started = true;
	}

	// --- Contrôle local des paramètres depuis les sliders ---
	function onSlider(param, value) {
		values[param] = value;
		engine.setParam(param, value);
	}

	// --- Clavier virtuel : joue localement ET émet vers les autres onglets ---
	function outChannel() {
		return filterChannel === -1 ? 0 : filterChannel;
	}
	function press(note) {
		if (!started) return;
		engine.noteOn(note, 100);
		activeNotes[note] = true;
		sendMidi([MIDI.NOTE_ON | outChannel(), note, 100]);
	}
	function release(note) {
		if (!started) return;
		engine.noteOff(note);
		delete activeNotes[note];
		sendMidi([MIDI.NOTE_OFF | outChannel(), note, 0]);
	}

	// --- Affichage LCD ---
	function fmt(msg) {
		if (!msg) return 'En attente de MIDI…';
		switch (msg.type) {
			case 'noteon':
				return `NOTE ON   ${noteName(msg.note)}  vel ${msg.velocity}  ch ${msg.channel + 1}`;
			case 'noteoff':
				return `NOTE OFF  ${noteName(msg.note)}          ch ${msg.channel + 1}`;
			case 'cc': {
				const cc = CC_MAP[msg.controller];
				const tail = cc ? `→ ${cc.label}` : '(non mappé)';
				return `CC ${String(msg.controller).padStart(3)}  val ${String(msg.value).padStart(3)}  ${tail}`;
			}
			case 'pitchbend':
				return `PITCH BEND  ${msg.value}  ch ${msg.channel + 1}`;
			case 'realtime':
				return `REALTIME 0x${msg.status.toString(16).toUpperCase()}`;
			default:
				return msg.type.toUpperCase();
		}
	}

	function fmtLog(e) {
		if (e.type === 'noteon') return `♪ ${noteName(e.note)} · ${e.velocity}`;
		if (e.type === 'noteoff') return `× ${noteName(e.note)}`;
		if (e.type === 'cc') return `CC${e.controller} · ${e.value}`;
		if (e.type === 'pitchbend') return `bend · ${e.value}`;
		return e.type;
	}
</script>

<svelte:window on:pointerup={() => started && Object.keys(activeNotes).forEach((n) => release(+n))} />

<main>
	<div class="panel">
		<header>
			<div class="brand">
				<span class="dot" class:live={started}></span>
				<h1>FM&nbsp;Synth</h1>
				<span class="sub">synthé FM · piloté en MIDI inter-onglets</span>
			</div>
			<div class="controls">
				<label class="chan">
					Canal
					<select bind:value={filterChannel}>
						<option value={-1}>Omni</option>
						{#each Array(16) as _, i}
							<option value={i}>{i + 1}</option>
						{/each}
					</select>
				</label>
				{#if !started}
					<button class="power" onclick={startAudio}>Démarrer l'audio</button>
				{:else}
					<span class="ready">Audio actif</span>
				{/if}
			</div>
		</header>

		<!-- Écran LCD : élément signature -->
		<div class="lcd" class:on={started}>
			<div class="lcd-main">{fmt(lastMsg)}</div>
			<div class="lcd-log">
				{#each log as e (e.t)}
					<span class="chip">{fmtLog(e)}</span>
				{/each}
			</div>
		</div>

		<!-- Paramètres -->
		<section class="params">
			{#each PARAMS as p}
				{const cc = ccFor(p.param)}
				<div class="param">
					<div class="row">
						<span class="name">{p.label}{#if cc}<span class="cc">{cc}</span>{/if}</span>
						<span class="val">
							{values[p.param] === -Infinity ? '−∞' : Number(values[p.param]).toFixed(p.step < 0.01 ? 3 : 2)}<em>{p.unit}</em>
						</span>
					</div>
					<input
						type="range"
						min={p.min}
						max={p.max}
						step={p.step}
						value={values[p.param] === -Infinity ? p.min : values[p.param]}
						oninput={(e) => onSlider(p.param, parseFloat(e.currentTarget.value))}
					/>
				</div>
			{/each}
		</section>

		<!-- Clavier de test (joue en local + émet en MIDI) -->
		<section class="keyboard" class:disabled={!started}>
			{#each whiteKeys as k}
				<button
					class="wkey"
					class:active={activeNotes[k.note]}
					style="left:{k.idx * keyW}%; width:{keyW}%"
					onpointerdown={() => press(k.note)}
					onpointerup={() => release(k.note)}
					onpointerenter={(e) => e.buttons && press(k.note)}
					onpointerleave={(e) => e.buttons && release(k.note)}
					aria-label={noteName(k.note)}
				></button>
			{/each}
			{#each blackKeys as k}
				<button
					class="bkey"
					class:active={activeNotes[k.note]}
					style="left:calc({(k.idx + 1) * keyW}% - {keyW * 0.32}%); width:{keyW * 0.64}%"
					onpointerdown={() => press(k.note)}
					onpointerup={() => release(k.note)}
					aria-label={noteName(k.note)}
				></button>
			{/each}
		</section>

		<footer>
			CC mappés :
			{#each Object.entries(CC_MAP) as [num, cc], i}<span>{i > 0 ? ' · ' : ''}CC{num}→{cc.label}</span>{/each}
		</footer>
	</div>
</main>

<style>
	/* Palette : châssis graphite, membrane crème (héritage DX7), écran phosphore vert. */
	:global(body) {
		margin: 0;
		background: #14161a;
		color: #d9d4c4;
		font-family: 'Inter', system-ui, sans-serif;
	}

	main {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 28px 16px;
	}

	.panel {
		width: min(760px, 100%);
		background: linear-gradient(#2a2d33, #232529);
		border: 1px solid #34383f;
		border-radius: 14px;
		box-shadow: 0 1px 0 #40444c inset, 0 18px 50px rgba(0, 0, 0, 0.5);
		padding: 22px;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 16px;
	}
	.brand {
		display: flex;
		align-items: baseline;
		gap: 10px;
		flex-wrap: wrap;
	}
	.brand h1 {
		font-size: 20px;
		font-weight: 600;
		letter-spacing: 0.02em;
		margin: 0;
		color: #ece7d6;
	}
	.brand .sub {
		font-size: 12.5px;
		color: #8a9088;
	}
	.dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #4b4f57;
		align-self: center;
		transition: background 0.3s, box-shadow 0.3s;
	}
	.dot.live {
		background: #86f0b0;
		box-shadow: 0 0 10px #86f0b0aa;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.chan {
		font-size: 12px;
		color: #8a9088;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	select {
		background: #1a1c20;
		color: #d9d4c4;
		border: 1px solid #3a3e45;
		border-radius: 6px;
		padding: 4px 6px;
		font: inherit;
		font-size: 12px;
	}
	.power {
		background: #86f0b0;
		color: #10221a;
		border: none;
		border-radius: 8px;
		padding: 9px 16px;
		font: inherit;
		font-weight: 600;
		font-size: 13px;
		cursor: pointer;
	}
	.power:hover {
		background: #9df5c1;
	}
	.ready {
		font-size: 12px;
		color: #86f0b0;
	}

	/* --- Écran LCD phosphore : l'unique élément "bold" du panneau --- */
	.lcd {
		background: #0c130e;
		border: 1px solid #1d2a20;
		border-radius: 8px;
		padding: 12px 14px;
		margin-bottom: 20px;
		box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.6);
		font-family: ui-monospace, 'SF Mono', 'Cascadia Code', monospace;
	}
	.lcd-main {
		color: #3f6b4e;
		font-size: 14px;
		letter-spacing: 0.04em;
		white-space: pre;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.lcd.on .lcd-main {
		color: #7df2a8;
		text-shadow: 0 0 8px #7df2a877;
	}
	.lcd-log {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		margin-top: 9px;
		min-height: 18px;
	}
	.chip {
		font-size: 11px;
		color: #57a374;
		background: #0f1a12;
		border: 1px solid #1e3325;
		border-radius: 4px;
		padding: 1px 6px;
	}

	/* --- Sliders --- */
	.params {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 16px 22px;
		margin-bottom: 22px;
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 6px;
	}
	.name {
		font-size: 13px;
		color: #c4bfae;
		display: inline-flex;
		align-items: baseline;
		gap: 7px;
	}
	.cc {
		font-family: ui-monospace, monospace;
		font-size: 10px;
		color: #7d827a;
		border: 1px solid #3a3e45;
		border-radius: 4px;
		padding: 0 5px;
		letter-spacing: 0.02em;
	}
	.val {
		font-family: ui-monospace, monospace;
		font-size: 13px;
		color: #ece7d6;
	}
	.val em {
		font-style: normal;
		color: #7d827a;
		font-size: 11px;
		margin-left: 2px;
	}
	input[type='range'] {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 4px;
		border-radius: 3px;
		background: #3a3e45;
		outline: none;
	}
	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #e6dfc9;
		border: 2px solid #2a2d33;
		cursor: pointer;
	}
	input[type='range']::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #e6dfc9;
		border: 2px solid #2a2d33;
		cursor: pointer;
	}
	input[type='range']:focus-visible {
		box-shadow: 0 0 0 3px #86f0b055;
	}

	/* --- Clavier --- */
	.keyboard {
		position: relative;
		height: 130px;
		border-radius: 8px;
		background: #1a1c20;
		border: 1px solid #34383f;
		overflow: hidden;
		touch-action: none;
	}
	.keyboard.disabled {
		opacity: 0.45;
		pointer-events: none;
	}
	.wkey {
		position: absolute;
		top: 0;
		bottom: 0;
		background: linear-gradient(#f3eede, #ded7c2);
		border: 1px solid #2a2d33;
		border-radius: 0 0 5px 5px;
		padding: 0;
		cursor: pointer;
	}
	.wkey.active {
		background: linear-gradient(#bfe9cd, #86f0b0);
	}
	.bkey {
		position: absolute;
		top: 0;
		height: 62%;
		background: linear-gradient(#33373d, #1a1c20);
		border: 1px solid #0c0d10;
		border-radius: 0 0 4px 4px;
		z-index: 2;
		cursor: pointer;
	}
	.bkey.active {
		background: linear-gradient(#3a7a55, #2b8f52);
	}

	footer {
		margin-top: 16px;
		font-size: 11px;
		color: #6c7169;
		line-height: 1.5;
	}

	@media (prefers-reduced-motion: reduce) {
		.dot,
		.lcd-main {
			transition: none;
		}
	}
</style>