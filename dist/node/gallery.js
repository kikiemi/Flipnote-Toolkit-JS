import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createThumbnail } from '../library/thumbnails.js';
import { readNote } from '../note/note.js';
const PLAYER_BUNDLE = fileURLToPath(new URL('../web/flipnote-player.js', import.meta.url));
function escapeHtml(text) {
    return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}
function card(record, file, thumbnail) {
    const date = record.modifiedAt.slice(0, 10);
    const flags = [
        record.isLocked ? 'locked' : '',
        record.is3d ? '3D' : '',
        record.hasAudio ? 'sound' : '',
        record.isSigned ? '' : 'unsigned',
    ]
        .filter(Boolean)
        .join(' · ');
    return `<li><button data-src="notes/${escapeHtml(file)}" aria-label="Play ${escapeHtml(record.filename)}">
<img src="thumbs/${escapeHtml(thumbnail)}" alt="" loading="lazy">
<span class="author">${escapeHtml(record.current.name || '—')}</span>
<span class="meta">${date} · ${record.frameCount} frames · ${record.frameRate} fps${flags ? ' · ' + flags : ''}</span>
</button></li>`;
}
function page(title, cards) {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<script src="flipnote-player.js"></script>
<style>
:root { --bg: #f4f1ea; --card: #fffdf8; --line: #ddd5c7; --text: #2b2723; --muted: #7d7469; --accent: #e8682a; }
@media (prefers-color-scheme: dark) { :root { --bg: #1b1a18; --card: #252321; --line: #3a3733; --text: #ece7df; --muted: #a39a8f; } }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--text); font: 14px/1.4 system-ui, sans-serif; }
h1 { font-size: 20px; margin: 0 0 4px; } p { color: var(--muted); margin: 0 0 16px; }
ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
button { all: unset; display: grid; gap: 4px; width: 100%; box-sizing: border-box; padding: 8px; background: var(--card); border: 1px solid var(--line); border-radius: 8px; cursor: pointer; }
button:hover, button:focus-visible { border-color: var(--accent); }
img { width: 100%; image-rendering: pixelated; border-radius: 4px; background: #fff; }
.author { font-weight: 600; } .meta { color: var(--muted); font-size: 12px; }
dialog { border: 0; border-radius: 10px; padding: 0; max-width: min(96vw, 720px); width: 100%; background: var(--card); }
dialog::backdrop { background: #000a; } flipnote-player { width: 100%; }
</style></head>
<body><h1>${escapeHtml(title)}</h1><p>${cards.length} notes</p><ul>
${cards.join('\n')}
</ul>
<dialog><flipnote-player controls autoplay></flipnote-player></dialog>
<script>
const dialog = document.querySelector('dialog');
const player = dialog.querySelector('flipnote-player');
document.querySelector('ul').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-src]');
  if (!button) return;
  player.setAttribute('src', button.dataset.src);
  dialog.showModal();
});
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => player.player.pause());
</script></body></html>
`;
}
/**
 * Writes a static web gallery of the notes in `database` (paths relative to `root`):
 * thumbnails, copies of the notes and a page that plays them with the bundled player.
 */
export async function writeGallery(database, root, outDirectory, options = {}) {
    const records = database
        .query(options.query ?? {})
        .filter((record) => record.path && record.variant !== 'icon');
    await mkdir(join(outDirectory, 'notes'), { recursive: true });
    await mkdir(join(outDirectory, 'thumbs'), { recursive: true });
    await copyFile(options.playerScript ?? PLAYER_BUNDLE, join(outDirectory, 'flipnote-player.js'));
    const cards = [];
    for (const record of records) {
        const bytes = new Uint8Array(await readFile(join(root, record.path)));
        const note = readNote(bytes);
        const file = `${record.id}-${basename(record.path).replace(/[^\w.-]/g, '_')}`;
        const thumbnail = `${record.id}.${options.isAnimated ? 'gif' : 'png'}`;
        await writeFile(join(outDirectory, 'notes', file), bytes);
        await writeFile(join(outDirectory, 'thumbs', thumbnail), createThumbnail(note, { kind: options.isAnimated ? 'animated' : 'frame', width: 192 }));
        cards.push(card(record, file, thumbnail));
    }
    await writeFile(join(outDirectory, 'index.html'), page(options.title ?? 'Flipnote Gallery', cards));
    return cards.length;
}
