import { downmixToPcm } from '../audio/pcm.js';
import { check, fail } from '../core/errors.js';
import { KWZ_MAX_BGM_SECONDS } from '../kwz/kwz-types.js';
import { NoteBuilder, planFrameTiming } from '../note/import.js';
import { createSource, loadMediabunny } from './mediabunny.js';
import { sampleToRgba } from './video-frames.js';
async function readAudio(input, start, end) {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode()))
        return null;
    const mb = await loadMediabunny();
    const sink = new mb.AudioSampleSink(track);
    const channels = [];
    let sampleRate = 0;
    let length = 0;
    const limit = Math.min(end, start + KWZ_MAX_BGM_SECONDS);
    for await (const sample of sink.samples(start, limit)) {
        sampleRate = sample.sampleRate;
        const chunk = copyPlanes(sample);
        chunk.forEach((plane, index) => (channels[index] ??= []).push(plane));
        length += sample.numberOfFrames;
        sample.close();
    }
    if (!length)
        return null;
    const merged = channels.map((parts) => {
        const out = new Float32Array(length);
        let offset = 0;
        for (const part of parts) {
            out.set(part.subarray(0, Math.min(part.length, length - offset)), offset);
            offset += part.length;
        }
        return out;
    });
    return downmixToPcm(merged, sampleRate);
}
function copyPlanes(sample) {
    const planes = [];
    for (let channel = 0; channel < sample.numberOfChannels; channel++) {
        const plane = new Float32Array(sample.numberOfFrames);
        sample.copyTo(plane, { planeIndex: channel, format: 'f32-planar' });
        planes.push(plane);
    }
    return planes;
}
/**
 * Turns any video mediabunny can read (MP4, WebM, MOV, MKV, ...) into a note: frames are
 * sampled at a speed the app supports, fitted, quantized and kept within its memory limit,
 * and the soundtrack becomes the BGM. Decoding uses WebCodecs in browsers; in Node,
 * register decoders first (for example with `@mediabunny/server`).
 */
export async function importVideo(media, format, options = {}) {
    const mb = await loadMediabunny();
    const input = new mb.Input({ formats: mb.ALL_FORMATS, source: createSource(mb, media) });
    try {
        const track = await input.getPrimaryVideoTrack();
        check(track, 'INVALID_ARGUMENT', 'The file has no video track');
        if (!(await track.canDecode())) {
            fail('UNSUPPORTED', `No decoder for ${track.codec ?? 'this'} video here; in Node, install and register @mediabunny/server`);
        }
        const duration = await input.computeDuration();
        const start = Math.max(0, options.start ?? 0);
        const end = Math.min(duration, options.end ?? duration);
        check(end > start, 'INVALID_ARGUMENT', 'The selected range is empty');
        const stats = await track.computePacketStats(60);
        const wanted = typeof options.frameRate === 'number' ? options.frameRate : stats.averagePacketRate || 12;
        const plan = planFrameTiming(format, end - start, wanted, options.overflow);
        const builder = new NoteBuilder(format, {
            ...options,
            frameRate: plan.frameRate,
            expectedFrameCount: plan.frameCount,
        });
        const timestamps = Array.from({ length: plan.frameCount }, (_, k) => start + (k + 0.5) / plan.frameRate);
        const sink = new mb.VideoSampleSink(track);
        let done = 0;
        let last = null;
        for await (const sample of sink.samplesAtTimestamps(timestamps)) {
            if (sample) {
                last = await sampleToRgba(sample);
                sample.close();
            }
            if (!last)
                continue;
            if (!builder.addImage(last))
                break;
            options.onProgress?.(++done, plan.frameCount);
        }
        if (options.isAudioIncluded ?? true) {
            const pcm = (await readAudio(input, start, end)) ?? options.bgm ?? null;
            if (pcm)
                builder.setTrack('bgm', pcm);
        }
        else if (options.bgm) {
            builder.setTrack('bgm', options.bgm);
        }
        return builder.finish();
    }
    finally {
        input.dispose();
    }
}
