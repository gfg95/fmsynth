# FM Tab Router — synthé FM piloté en MIDI inter-onglets

Synthétiseur FM polyphonique (Tone.js) pour SvelteKit, dont les notes **et** les
paramètres de synthèse sont pilotables en MIDI via l'extension **Web MIDI Tab Router**.

## Installation

Le projet n'inclut pas les fichiers de configuration SvelteKit : on part d'un
scaffold propre puis on dépose les fichiers `src/` fournis ici.

```bash
# 1. Scaffolder un projet SvelteKit (choisir « SvelteKit minimal », JS ou TS)
npx sv create fm-synth-midi
cd fm-synth-midi

# 2. Ajouter Tone.js
npm install tone            # v15.x

# 3. Copier les fichiers fournis dans src/ (écrase +page.svelte)
#    src/lib/midi.js
#    src/lib/router.js
#    src/lib/synth.js
#    src/routes/+page.js
#    src/routes/+page.svelte

# 4. Lancer
npm run dev -- --open       # http://localhost:5173
```

Cliquer sur **Démarrer l'audio** (le navigateur exige un geste utilisateur pour
ouvrir l'AudioContext).

## Comment ça marche

- **`src/lib/synth.js`** — `FMEngine`, un wrapper autour de `Tone.PolySynth(Tone.FMSynth)`.
- **`src/lib/midi.js`** — décodage des octets MIDI + table `CC_MAP` (CC → paramètre).
- **`src/lib/router.js`** — pont `window.postMessage` avec l'extension.
- **`src/routes/+page.svelte`** — UI, clavier de test, écran d'état, câblage.
- **`src/routes/+page.js`** — `ssr = false` (appli audio 100 % navigateur).

L'appli **reçoit** le MIDI relayé par l'extension et **émet** aussi (clavier de test
et pitch bend), donc l'onglet est un citoyen complet du bus.

## ⚠️ Point d'attention : le message *entrant*

La spec de l'extension que tu m'as donnée ne documente que le **sens sortant** :

```js
window.postMessage({ type: 'MIDI_OUT_TO_EXTENSION', midiData: [...] }, '*');
```

Le format du message **entrant** (extension → onglet) n'y figure pas. J'ai supposé
que l'extension relaie avec le type `MIDI_IN_FROM_EXTENSION` et la même structure
`{ type, midiData }`. Cette hypothèse est isolée en **une seule constante** :

```js
// src/lib/router.js
const IN_TYPE = 'MIDI_IN_FROM_EXTENSION';   // ← à ajuster si besoin
```

Vérifie le nom réel dans le code de l'extension (ce que le content-script fait au
moment de rediffuser vers les autres onglets) et remplace cette ligne le cas échéant.

## Paramètres pilotables en MIDI (Control Change)

| CC  | Paramètre        | Plage           |
|-----|------------------|-----------------|
| 7   | Volume           | −40 → 0 dB      |
| 1   | FM Index (mod wheel) | 0 → 25      |
| 71  | FM Index         | 0 → 25          |
| 74  | Harmonicity      | 0.25 → 8        |
| 73  | Attack           | 0.001 → 2 s     |
| 75  | Decay            | 0.01 → 2 s      |
| 72  | Release          | 0.01 → 4 s      |
| 91  | Reverb (wet)     | 0 → 1           |

Autres messages gérés : **Note On/Off** (vélocité comprise), **Pitch Bend** (±2 demi-tons).
La modification de la table se fait dans `CC_MAP` (`src/lib/midi.js`) — un seul endroit.

Exemple, depuis un autre onglet compatible :

```js
// Harmonicity à ~50 % (CC 74) sur le canal 1
window.postMessage({ type: 'MIDI_OUT_TO_EXTENSION', midiData: [0xB0, 74, 64] }, '*');
// Jouer Do4
window.postMessage({ type: 'MIDI_OUT_TO_EXTENSION', midiData: [0x90, 60, 100] }, '*');
```

## Tester avec deux onglets

1. Ouvre le synthé dans un onglet, clique **Démarrer l'audio**.
2. Dans un autre onglet (un séquenceur, ou une simple page qui poste des
   `MIDI_OUT_TO_EXTENSION`), envoie des notes / CC.
3. L'extension relaie ; l'écran du synthé affiche le trafic et le son suit.

Sélecteur **Canal** : « Omni » écoute tout, sinon filtre sur le canal choisi.

> Si tu entends des notes doublées en jouant sur le clavier virtuel, c'est que le
> routeur renvoie aussi les messages à l'onglet émetteur : dans ce cas, retire
> l'appel `sendMidi(...)` des fonctions `press`/`release` du composant, ou filtre
> la source dans `subscribeMidi`.