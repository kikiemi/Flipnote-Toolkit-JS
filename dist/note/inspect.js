import { measurePcm } from '../audio/pcm.js';
import { timestampToDate } from '../core/time.js';
import { isDsiLibraryNote } from '../kwz/kwz-dsi-library.js';
import { decodeKwzFilename, formatKwzFsid, getKwzFsidRegion } from '../kwz/kwz-filename.js';
import { analyzeKwzLayer, KwzFrameDecoder } from '../kwz/kwz-frame-codec.js';
import { verifyKwzChecksums } from '../kwz/kwz-reader.js';
import { formatPpmFilename, formatPpmStorageFilename, getPpmFsidRegion, } from '../ppm/ppm-filename.js';
import { getPpmFrameData, isPpmKeyFrame, PpmFrameDecoder } from '../ppm/ppm-frame-codec.js';
import { decodeTrack, getTrackNames, hasTrack } from './audio.js';
import { checkNote } from './check.js';
import { getMemoryUsage } from './memory.js';
import { getNoteInfo, readNote } from './note.js';
function countPixels(layer) {
    let count = 0;
    for (let i = 0; i < layer.length; i++)
        if (layer[i])
            count++;
    return count;
}
function trackReport(note, name) {
    const pcm = decodeTrack(note, name);
    const bytes = note.format === 'ppm'
        ? name === 'se4'
            ? 0
            : note.tracks[name].length
        : (note.tracks?.[name].length ?? 0);
    return {
        name,
        bytes,
        samples: pcm.samples.length,
        sampleRate: pcm.sampleRate,
        duration: pcm.samples.length / pcm.sampleRate,
        ...measurePcm(pcm.samples),
    };
}
function inspectPpmFrames(file) {
    const decoder = new PpmFrameDecoder(file);
    const frames = [];
    for (let index = 0; index < decoder.frameCount; index++) {
        const data = getPpmFrameData(file.animation, index);
        const frame = decoder.decode(index);
        const types = (data[0] >> 5) & 3 ? 3 : 1;
        const encodings = [0, 1].map((layer) => {
            const counts = [0, 0, 0, 0];
            for (let y = 0; y < 192; y++) {
                counts[(data[types + layer * 48 + (y >> 2)] >> ((y & 3) << 1)) & 3]++;
            }
            return counts;
        });
        frames.push({
            index,
            bytes: data.length,
            key: isPpmKeyFrame(data),
            paper: frame.paper,
            colors: [...frame.pens],
            pixels: frame.layers.map(countPixels),
            soundFlags: frame.soundFlags,
            encodings,
        });
    }
    return frames;
}
function inspectKwzFrames(file) {
    const decoder = new KwzFrameDecoder(file, { isTolerant: true });
    return file.frames.map((record, index) => {
        const frame = decoder.decode(index);
        return {
            index,
            bytes: record.layerData.reduce((sum, data) => sum + data.length, 0),
            key: record.keyLayers,
            paper: record.paper,
            colors: [...record.colors],
            pixels: frame.layers.map(countPixels),
            soundFlags: record.soundFlags,
            encodings: record.layerData.map((data) => [...analyzeKwzLayer(data).tileTypes]),
            depths: [...record.layerDepths],
        };
    });
}
function describePpm(file) {
    const { meta } = file;
    return {
        ...meta,
        currentFilenameText: formatPpmFilename(meta.currentFilename),
        parentFilenameText: formatPpmFilename(meta.parentFilename),
        storageFilename: formatPpmStorageFilename(meta.currentFilename),
        region: getPpmFsidRegion(meta.currentAuthorId),
        modifiedAt: timestampToDate(meta.timestamp).toISOString(),
    };
}
function describeKwz(file) {
    const { meta } = file;
    return {
        ...meta,
        rootAuthorIdText: formatKwzFsid(meta.rootAuthorId),
        parentAuthorIdText: formatKwzFsid(meta.parentAuthorId),
        currentAuthorIdText: formatKwzFsid(meta.currentAuthorId),
        region: getKwzFsidRegion(meta.currentAuthorId),
        isDsiLibrary: isDsiLibraryNote(file),
        createdAt: timestampToDate(meta.createdTime).toISOString(),
        modifiedAt: timestampToDate(meta.modifiedTime).toISOString(),
        filenameParts: decodeKwzFilename(meta.currentFilename),
    };
}
/** Parses and analyzes a PPM or KWZ file: metadata, statistics, memory use and problems. */
export function inspectNote(bytes, options = {}) {
    const note = readNote(bytes);
    const info = getNoteInfo(note);
    const isDetailed = options.isDetailed ?? true;
    const check = checkNote(bytes, { isCheckingFrames: isDetailed });
    const isPpmNote = note.format === 'ppm';
    const frames = !isDetailed ? [] : isPpmNote ? inspectPpmFrames(note) : inspectKwzFrames(note);
    const keyFrames = isPpmNote
        ? Array.from({ length: info.frameCount }, (_, i) => getPpmFrameData(note.animation, i)).filter(isPpmKeyFrame).length
        : note.frames.filter((frame) => frame.keyLayers === 7).length;
    const encodedBytes = isPpmNote
        ? note.animation.data.length
        : note.frames.reduce((sum, frame) => sum + frame.layerData.reduce((total, data) => total + data.length, 0), 0);
    return {
        format: note.format,
        variant: info.variant,
        fileSize: bytes.length,
        isSigned: check.isSigned,
        checksums: isPpmNote ? {} : verifyKwzChecksums(bytes),
        meta: isPpmNote ? describePpm(note) : describeKwz(note),
        animation: {
            width: info.width,
            height: info.height,
            frameCount: info.frameCount,
            frameRate: info.frameRate,
            bgmFrameRate: info.bgmFrameRate,
            duration: info.duration,
            keyFrames,
            encodedBytes,
        },
        memory: getMemoryUsage(note),
        tracks: getTrackNames(note)
            .filter((name) => hasTrack(note, name))
            .map((name) => trackReport(note, name)),
        frames,
        issues: check.issues,
    };
}
