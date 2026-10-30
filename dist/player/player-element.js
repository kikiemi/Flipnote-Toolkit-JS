import { EQUALIZER_FREQUENCIES, EQUALIZER_MAX_GAIN, EQUALIZER_PRESETS, } from '../audio/equalizer.js';
import { FlipnotePlayer } from './player.js';
const ICONS = {
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
    pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/>',
    previous: '<path d="M6.5 5v14" stroke="currentColor" stroke-width="2"/><path d="M18 5.5v13L8.5 12z" fill="currentColor"/>',
    next: '<path d="M17.5 5v14" stroke="currentColor" stroke-width="2"/><path d="M6 5.5v13l9.5-6.5z" fill="currentColor"/>',
    loop: '<path d="M4.5 11V9a2 2 0 0 1 2-2h11.5M15 4l3 3-3 3M19.5 13v2a2 2 0 0 1-2 2H6M9 20l-3-3 3-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    sound: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="M15 9.5a3.5 3.5 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    muted: '<path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    equalizer: '<path d="M6 4.5v15M12 4.5v15M18 4.5v15" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity=".45"/><path d="M3.5 14.5h5M9.5 8.5h5M15.5 12.5h5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    fullscreen: '<path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
};
function icon(name) {
    return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${ICONS[name]}</svg>`;
}
const CHEVRON = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%23888' stroke-width='1.6'/%3E%3C/svg%3E\")";
const STYLE = `
:host { display: inline-block; max-width: 100%; color: var(--fp-text); font: 13px/1.4 system-ui, sans-serif;
  --fp-surface: #f6f4ef; --fp-bar: #ffffff; --fp-text: #2b2723; --fp-muted: #7d7469; --fp-line: #ddd5c7;
  --fp-accent: #e8682a; --fp-hover: #f0ebe2; }
@media (prefers-color-scheme: dark) {
  :host { --fp-surface: #1d1c1a; --fp-bar: #262422; --fp-text: #ece7df; --fp-muted: #a39a8f;
    --fp-line: #3a3733; --fp-hover: #302d2a; }
}
.frame { position: relative; background: var(--fp-surface); border: 1px solid var(--fp-line);
  border-radius: 10px; overflow: hidden; container-type: inline-size; }
canvas { display: block; width: 100%; height: auto; image-rendering: pixelated; cursor: pointer; }
.bar { display: flex; align-items: center; gap: 2px; padding: 4px 6px; background: var(--fp-bar);
  border-top: 1px solid var(--fp-line); }
:host(:not([controls])) .bar { display: none; }
button { all: unset; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 6px;
  color: var(--fp-text); cursor: pointer; }
button:hover { background: var(--fp-hover); }
button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--fp-accent); outline-offset: 1px; }
button[aria-pressed="true"] { color: var(--fp-accent); }
input[type=range] { accent-color: var(--fp-accent); margin: 0 4px; }
.seek { flex: 1; min-width: 40px; }
.volume { width: 64px; }
.time { min-width: 64px; text-align: center; color: var(--fp-muted); font-variant-numeric: tabular-nums; }
select { appearance: none; height: 28px; padding: 0 26px 0 10px; margin-left: 4px; color: var(--fp-text);
  background: var(--fp-surface) ${CHEVRON} no-repeat right 9px center / 10px 7px;
  border: 1px solid var(--fp-line); border-radius: 6px; font: inherit; cursor: pointer; }
select:hover { border-color: var(--fp-muted); }
select option { background: var(--fp-bar); color: var(--fp-text); }
.drop { position: absolute; inset: 0; display: none; place-items: center; background: #000a; color: #fff; }
.frame.dragging .drop { display: grid; }
.frame:fullscreen { display: grid; grid-template-rows: minmax(0, 1fr) auto; border: 0; border-radius: 0; }
.frame:fullscreen canvas { width: auto; height: 100%; max-width: 100%; margin: auto; }
.eq { position: absolute; right: 8px; bottom: 46px; display: none; padding: 10px 12px 8px;
  background: var(--fp-bar); border: 1px solid var(--fp-line); border-radius: 8px;
  box-shadow: 0 6px 20px #0003; }
.frame.eq-open .eq { display: block; }
.eq-head { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  margin-bottom: 6px; }
.eq-head select { margin: 0; }
.eq-bands { display: grid; grid-template-columns: repeat(${EQUALIZER_FREQUENCIES.length}, 24px);
  justify-items: center; }
.eq-bands input { writing-mode: vertical-lr; direction: rtl; width: 20px; height: 96px; margin: 0; }
.eq-bands span { font-size: 10px; color: var(--fp-muted); font-variant-numeric: tabular-nums; }
@container (max-width: 560px) { .volume { display: none; } }
@container (max-width: 400px) { .time { display: none; } }
@container (max-width: 300px) { .back, .next, .loop, .equalizer { display: none; } }
`;
const PRESET_LABELS = {
    flat: 'Flat',
    bass: 'Bass',
    treble: 'Treble',
    voice: 'Voice',
    loudness: 'Loudness',
    soft: 'Soft',
};
function frequencyLabel(frequency) {
    return frequency >= 1000 ? `${frequency / 1000}k` : String(frequency);
}
const EQUALIZER_PANEL = `
<div class="eq" part="equalizer" role="group" aria-label="Equalizer">
  <div class="eq-head">
    <strong>Equalizer</strong>
    <select class="eq-preset" aria-label="Equalizer preset">
      ${Object.entries(PRESET_LABELS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('')}
      <option value="custom" hidden>Custom</option>
    </select>
  </div>
  <div class="eq-bands">
    ${EQUALIZER_FREQUENCIES.map((frequency) => `<input type="range" min="-${EQUALIZER_MAX_GAIN}" max="${EQUALIZER_MAX_GAIN}" step="1" value="0" aria-label="${frequency} Hz">`).join('')}
    ${EQUALIZER_FREQUENCIES.map((frequency) => `<span>${frequencyLabel(frequency)}</span>`).join('')}
  </div>
</div>`;
const TEMPLATE = `
<div class="frame" part="frame">
  <canvas part="canvas"></canvas>
  <div class="drop">Drop a .ppm or .kwz file</div>
  ${EQUALIZER_PANEL}
  <div class="bar" part="controls">
    <button class="play" aria-label="Play">${icon('play')}</button>
    <button class="back" aria-label="Previous frame">${icon('previous')}</button>
    <button class="next" aria-label="Next frame">${icon('next')}</button>
    <input class="seek" type="range" min="0" value="0" aria-label="Frame">
    <span class="time">0 / 0</span>
    <button class="loop" aria-label="Loop" aria-pressed="false">${icon('loop')}</button>
    <button class="mute" aria-label="Mute" aria-pressed="false">${icon('sound')}</button>
    <input class="volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume">
    <select class="stereo" aria-label="3D view" hidden>
      <option value="">2D</option>
      <option value="anaglyph">3D (red/cyan)</option>
      <option value="side-by-side">3D side by side</option>
      <option value="side-by-side-half">3D half side by side</option>
      <option value="top-bottom">3D top and bottom</option>
    </select>
    <button class="equalizer" aria-label="Equalizer" aria-expanded="false">${icon('equalizer')}</button>
    <button class="full" aria-label="Fullscreen">${icon('fullscreen')}</button>
  </div>
</div>`;
function frameAttribute(value) {
    return value === null || value === '' ? undefined : Number(value);
}
/** A preset name or ten comma-separated gains in dB; empty turns the equalizer off. */
function equalizerAttribute(value) {
    if (!value)
        return null;
    return value.includes(',') ? value.split(',').map(Number) : value;
}
/**
 * Registers the `<flipnote-player>` element. Attributes: `src`, `controls`, `autoplay`, `loop`,
 * `muted`, `stereo`, `crop` (full, canvas, dsi or auto), `palette` (screen or app),
 * `start`/`end` frames and `equalizer` (a preset or ten gains in dB). Frames are drawn with
 * WebGL when available. Dropping a file onto it plays that file.
 */
export function defineFlipnotePlayer(tagName = 'flipnote-player') {
    if (customElements.get(tagName))
        return;
    class FlipnotePlayerElement extends HTMLElement {
        static observedAttributes = [
            'src',
            'loop',
            'muted',
            'stereo',
            'crop',
            'palette',
            'start',
            'end',
            'equalizer',
        ];
        player;
        root;
        constructor() {
            super();
            this.root = this.attachShadow({ mode: 'open' });
            this.root.innerHTML = `<style>${STYLE}</style>${TEMPLATE}`;
            this.player = new FlipnotePlayer({
                canvas: this.query('canvas'),
                scaling: 'sharp',
            });
            this.bind();
        }
        query(selector) {
            return this.root.querySelector(selector);
        }
        bind() {
            const { player } = this;
            const seek = this.query('.seek');
            const play = this.query('.play');
            const loop = this.query('.loop');
            const mute = this.query('.mute');
            const stereo = this.query('.stereo');
            const time = this.query('.time');
            const frame = this.query('.frame');
            const update = () => {
                seek.min = String(player.firstFrame);
                seek.max = String(player.lastFrame);
                seek.value = String(player.currentFrame);
                time.textContent = `${player.currentFrame + 1} / ${player.frameCount}`;
                play.innerHTML = icon(player.isPlaying ? 'pause' : 'play');
                play.setAttribute('aria-label', player.isPlaying ? 'Pause' : 'Play');
                loop.setAttribute('aria-pressed', String(player.isLooping));
                mute.setAttribute('aria-pressed', String(player.isMuted));
                mute.innerHTML = icon(player.isMuted ? 'muted' : 'sound');
                mute.setAttribute('aria-label', player.isMuted ? 'Unmute' : 'Mute');
            };
            for (const type of ['load', 'play', 'pause', 'frame', 'ended']) {
                player.addEventListener(type, update);
            }
            player.addEventListener('load', () => {
                stereo.hidden = !(player.note?.format === 'kwz' && player.note.meta.is3d);
                if (this.hasAttribute('autoplay'))
                    player.play();
                this.dispatchEvent(new Event('load'));
            });
            player.addEventListener('ended', () => this.dispatchEvent(new Event('ended')));
            play.onclick = () => player.toggle();
            this.query('canvas').onclick = () => player.toggle();
            this.query('.back').onclick = () => player.stepBack();
            this.query('.next').onclick = () => player.stepForward();
            seek.oninput = () => player.seek(Number(seek.value));
            loop.onclick = () => {
                player.isLooping = !player.isLooping;
                update();
            };
            mute.onclick = () => {
                player.isMuted = !player.isMuted;
                update();
            };
            this.query('.volume').oninput = (event) => {
                player.volume = Number(event.target.value);
            };
            stereo.onchange = () => {
                player.setRenderOptions({
                    stereo: (stereo.value || undefined),
                });
            };
            this.query('.full').onclick = () => void frame.requestFullscreen?.();
            this.bindEqualizer(frame);
            this.addEventListener('keydown', (event) => {
                if (event.key === 'Escape')
                    this.showEqualizer(false);
                else if (event.key === ' ')
                    player.toggle();
                else if (event.key === 'ArrowRight')
                    player.stepForward();
                else if (event.key === 'ArrowLeft')
                    player.stepBack();
                else
                    return;
                event.preventDefault();
            });
            frame.addEventListener('dragover', (event) => {
                event.preventDefault();
                frame.classList.add('dragging');
            });
            frame.addEventListener('dragleave', () => frame.classList.remove('dragging'));
            frame.addEventListener('drop', (event) => {
                event.preventDefault();
                frame.classList.remove('dragging');
                const file = event.dataTransfer?.files[0];
                if (file)
                    void player.load(file);
            });
        }
        bindEqualizer(frame) {
            const button = this.query('.equalizer');
            const preset = this.query('.eq-preset');
            const sliders = Array.from(this.root.querySelectorAll('.eq-bands input'));
            button.onclick = () => this.showEqualizer(!frame.classList.contains('eq-open'));
            preset.onchange = () => {
                const name = preset.value;
                EQUALIZER_PRESETS[name].forEach((gain, i) => (sliders[i].value = String(gain)));
                this.player.setEqualizer(name === 'flat' ? null : name);
            };
            for (const slider of sliders) {
                slider.oninput = () => {
                    const gains = sliders.map((input) => Number(input.value));
                    this.player.setEqualizer(gains.some(Boolean) ? gains : null);
                    this.syncEqualizer();
                };
            }
        }
        showEqualizer(isOpen) {
            this.query('.frame').classList.toggle('eq-open', isOpen);
            this.query('.equalizer').setAttribute('aria-expanded', String(isOpen));
        }
        /** Shows the player's current equalizer on the sliders and the preset menu. */
        syncEqualizer() {
            const bands = this.player.equalizer;
            const gains = EQUALIZER_FREQUENCIES.map((frequency) => bands.find((band) => band.frequency === frequency)?.gain ?? 0);
            const sliders = this.root.querySelectorAll('.eq-bands input');
            gains.forEach((gain, i) => (sliders[i].value = String(gain)));
            const match = Object.keys(EQUALIZER_PRESETS).find((name) => EQUALIZER_PRESETS[name].every((gain, i) => gain === gains[i]));
            this.query('.eq-preset').value = match ?? 'custom';
        }
        connectedCallback() {
            if (!this.hasAttribute('tabindex'))
                this.tabIndex = 0;
        }
        attributeChangedCallback(name, _old, value) {
            const { player } = this;
            if (name === 'src' && value) {
                void player.load(value).catch(() => undefined);
            }
            else if (name === 'loop') {
                player.isLooping = value !== null;
            }
            else if (name === 'muted') {
                player.isMuted = value !== null;
            }
            else if (name === 'stereo') {
                player.setRenderOptions({ stereo: (value || undefined) });
            }
            else if (name === 'crop') {
                player.setRenderOptions({ crop: (value || undefined) });
            }
            else if (name === 'palette') {
                player.setRenderOptions({ palette: (value || undefined) });
            }
            else if (name === 'start' || name === 'end') {
                const start = frameAttribute(this.getAttribute('start'));
                player.setRange(start, frameAttribute(this.getAttribute('end')));
            }
            else if (name === 'equalizer') {
                player.setEqualizer(equalizerAttribute(value));
                this.syncEqualizer();
            }
        }
        disconnectedCallback() {
            this.player.pause();
        }
    }
    customElements.define(tagName, FlipnotePlayerElement);
}
