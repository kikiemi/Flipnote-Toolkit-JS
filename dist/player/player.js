import { createEqualizerBands, getEqualizerQ, } from '../audio/equalizer.js';
import { hasAudio, mixAudio } from '../note/audio.js';
import { createExportRenderer } from '../note/export.js';
import { loadNote } from '../note/load.js';
import { createFrameCanvas, } from './frame-canvas.js';
/**
 * Plays notes on a canvas with sample-accurate sound: frames follow the audio clock, sound
 * effects play on the frames that trigger them and the BGM follows speed changes like the apps.
 */
export class FlipnotePlayer extends EventTarget {
    canvas;
    note = null;
    screen;
    audioContext;
    options;
    renderer = null;
    audioBuffer = null;
    audioNode = null;
    filters = [];
    gain = null;
    equalizerBands;
    frame = 0;
    playing = false;
    startClock = 0;
    startFrame = 0;
    animation = 0;
    loopOverride;
    isAudioClock = false;
    volumeValue;
    mutedValue = false;
    range;
    constructor(options = {}) {
        super();
        this.options = { ...options };
        this.canvas = options.canvas ?? document.createElement('canvas');
        this.canvas.style.imageRendering = 'pixelated';
        this.screen = createFrameCanvas(this.canvas, options);
        this.audioContext = options.audioContext ?? null;
        this.equalizerBands = options.equalizer ? createEqualizerBands(options.equalizer) : [];
        this.loopOverride = options.isLooping;
        this.volumeValue = options.volume ?? 1;
        this.range = options.range ?? {};
    }
    /** Whether frames are drawn with WebGL or Canvas 2D. */
    get backend() {
        return this.screen.backend;
    }
    get frameCount() {
        return this.renderer?.frameCount ?? 0;
    }
    get frameRate() {
        return this.renderer?.frameRate ?? 1;
    }
    get currentFrame() {
        return this.frame;
    }
    /** First frame of the playback range. */
    get firstFrame() {
        return Math.max(0, Math.min(this.frameCount - 1, this.range.start ?? 0));
    }
    /** Last frame of the playback range. */
    get lastFrame() {
        return Math.max(this.firstFrame, Math.min(this.frameCount, this.range.end ?? this.frameCount) - 1);
    }
    /** Restricts playback to frames `start` to `end` (exclusive); call with no arguments to reset. */
    setRange(start, end) {
        this.range = { start, end };
        if (this.note && (this.frame < this.firstFrame || this.frame > this.lastFrame)) {
            this.seek(this.firstFrame);
        }
    }
    /** Length of the note in seconds. */
    get duration() {
        return this.frameCount / this.frameRate;
    }
    get currentTime() {
        return this.frame / this.frameRate;
    }
    get isPlaying() {
        return this.playing;
    }
    get isLooping() {
        return this.loopOverride ?? this.note?.meta.isLooping ?? false;
    }
    set isLooping(value) {
        this.loopOverride = value;
    }
    get volume() {
        return this.volumeValue;
    }
    set volume(value) {
        this.volumeValue = Math.max(0, Math.min(1, value));
        this.updateGain();
    }
    get isMuted() {
        return this.mutedValue;
    }
    set isMuted(value) {
        this.mutedValue = value;
        this.updateGain();
    }
    /** Filters the sound passes through (empty when the equalizer is off). */
    get equalizer() {
        return this.equalizerBands;
    }
    /** Changes the equalizer, also while playing; null turns it off. */
    setEqualizer(setting) {
        const bands = setting ? createEqualizerBands(setting) : [];
        const previous = this.equalizerBands;
        this.equalizerBands = bands;
        if (!this.audioNode || !this.audioContext)
            return;
        const isSameLayout = bands.length === previous.length &&
            bands.every((band, i) => band.type === previous[i].type && band.frequency === previous[i].frequency);
        if (!isSameLayout) {
            this.connectAudio();
            return;
        }
        const time = this.audioContext.currentTime;
        bands.forEach((band, i) => {
            this.filters[i].gain.setTargetAtTime(band.gain, time, 0.02);
            this.filters[i].Q.setTargetAtTime(getEqualizerQ(band), time, 0.02);
        });
    }
    emit(type, detail) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }
    updateGain() {
        if (this.gain)
            this.gain.gain.value = this.mutedValue ? 0 : this.volumeValue;
    }
    ensureAudio() {
        this.audioContext ??= new AudioContext();
        return this.audioContext;
    }
    /** Loads a note from bytes, a Blob/File, a URL or a parsed note. */
    async load(source) {
        try {
            this.open(await loadNote(source));
        }
        catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    /** Shows a parsed note at its first frame. */
    open(note) {
        this.pause();
        this.note = note;
        this.audioBuffer = null;
        this.setRenderOptions({});
        this.frame = this.firstFrame;
        this.drawFrame(this.frame);
        this.emit('load');
    }
    /** Changes 3D, palette or crop settings and redraws. */
    setRenderOptions(options) {
        Object.assign(this.options, options);
        if (!this.note)
            return;
        this.renderer = createExportRenderer(this.note, { ...this.options, isTransparent: false });
        const { width, height, palette } = this.renderer;
        this.screen.configure(width, height, palette);
        if (this.frame < this.frameCount)
            this.drawFrame(this.frame);
    }
    drawFrame(index) {
        if (!this.renderer)
            return;
        this.screen.draw(this.renderer.render(index));
        this.emit('frame', index);
    }
    prepareAudio() {
        if (!this.note || !hasAudio(this.note))
            return null;
        if (this.audioBuffer)
            return this.audioBuffer;
        const context = this.ensureAudio();
        const method = this.options.isConsoleSound ? 'nearest' : 'sinc';
        const pcm = mixAudio(this.note, { sampleRate: context.sampleRate, method });
        const buffer = context.createBuffer(1, Math.max(1, pcm.samples.length), pcm.sampleRate);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < pcm.samples.length; i++)
            channel[i] = pcm.samples[i] / 32768;
        this.audioBuffer = buffer;
        return buffer;
    }
    /** The audio clock while sound plays (keeps frames in sync), otherwise wall time. */
    now() {
        return this.isAudioClock && this.audioContext
            ? this.audioContext.currentTime
            : performance.now() / 1000;
    }
    startAudio(offset) {
        const buffer = this.prepareAudio();
        if (!buffer || !this.audioContext)
            return;
        this.gain = this.audioContext.createGain();
        this.gain.connect(this.audioContext.destination);
        this.updateGain();
        this.audioNode = this.audioContext.createBufferSource();
        this.audioNode.buffer = buffer;
        this.connectAudio();
        if (offset < buffer.duration)
            this.audioNode.start(0, offset);
    }
    /** Routes the source through one biquad filter per equalizer band into the volume control. */
    connectAudio() {
        const context = this.audioContext;
        this.audioNode.disconnect();
        for (const filter of this.filters)
            filter.disconnect();
        this.filters = this.equalizerBands.map((band) => {
            const filter = context.createBiquadFilter();
            filter.type = band.type;
            filter.frequency.value = band.frequency;
            filter.gain.value = band.gain;
            filter.Q.value = getEqualizerQ(band);
            return filter;
        });
        let node = this.audioNode;
        for (const filter of this.filters)
            node = node.connect(filter);
        node.connect(this.gain);
    }
    stopAudio() {
        this.audioNode?.stop();
        this.audioNode?.disconnect();
        for (const filter of this.filters)
            filter.disconnect();
        this.gain?.disconnect();
        this.audioNode = null;
        this.filters = [];
        this.gain = null;
    }
    play() {
        if (!this.note || this.playing)
            return;
        if (this.frame >= this.lastFrame && !this.isLooping)
            this.frame = this.firstFrame;
        if (hasAudio(this.note))
            void this.ensureAudio().resume();
        this.isAudioClock = this.audioContext?.state === 'running' && hasAudio(this.note);
        this.playing = true;
        this.startFrame = this.frame;
        this.startClock = this.now();
        this.startAudio(this.frame / this.frameRate);
        this.animation = requestAnimationFrame(this.tick);
        this.emit('play');
    }
    pause() {
        if (!this.playing)
            return;
        this.playing = false;
        cancelAnimationFrame(this.animation);
        this.stopAudio();
        this.emit('pause');
    }
    toggle() {
        if (this.playing)
            this.pause();
        else
            this.play();
    }
    tick = () => {
        if (!this.playing)
            return;
        const elapsed = this.now() - this.startClock;
        let index = this.startFrame + Math.floor(elapsed * this.frameRate);
        if (index > this.lastFrame) {
            if (!this.isLooping) {
                this.frame = this.lastFrame;
                this.drawFrame(this.frame);
                this.pause();
                this.emit('ended');
                return;
            }
            this.stopAudio();
            index = this.firstFrame;
            this.startFrame = index;
            this.isAudioClock = this.audioContext?.state === 'running' && hasAudio(this.note);
            this.startClock = this.now();
            this.startAudio(index / this.frameRate);
        }
        if (index !== this.frame) {
            this.frame = index;
            this.drawFrame(index);
        }
        this.animation = requestAnimationFrame(this.tick);
    };
    /** Jumps to a frame; playback continues from there. */
    seek(index) {
        if (!this.note)
            return;
        const target = Math.max(this.firstFrame, Math.min(this.lastFrame, Math.round(index)));
        const wasPlaying = this.playing;
        if (wasPlaying)
            this.pause();
        this.frame = target;
        this.drawFrame(target);
        if (wasPlaying)
            this.play();
    }
    stepForward() {
        this.seek(this.frame < this.lastFrame ? this.frame + 1 : this.firstFrame);
    }
    stepBack() {
        this.seek(this.frame > this.firstFrame ? this.frame - 1 : this.lastFrame);
    }
    /** Releases audio and canvas resources. */
    destroy() {
        this.pause();
        this.screen.destroy();
        if (!this.options.audioContext)
            void this.audioContext?.close();
        this.audioContext = null;
    }
}
