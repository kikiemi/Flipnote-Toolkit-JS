# 🐸 flipnote-tools-js (Flipnote Toolkit JS)

**[English](#english) | [日本語](#japanese) | [Español](#spanish)**

---

<a id="english"></a>

## English

Welcome to **`flipnote-tools-js`**—the Swiss Army Knife for Flipnote Studio (`.ppm`) and Flipnote Studio 3D (`.kwz`, `.kwc`, folder icons). 

Whether you want to rescue corrupted childhood masterpieces from a dusty SD card, turn a modern MP4 meme into a console-ready Flipnote, edit layers with a 100-step undo history, or embed a WebGL-powered player with a 10-band equalizer on your blog, this toolkit does it all. Best of all? The core library has **zero mandatory dependencies**. 

### Features (Why is this thing so huge?)

* **Read & Write Everything:** Full, byte-accurate support for DSi `.ppm` notes and 3DS `.kwz` notes, `.kwc` handwritten comments, `!.ico` 24×24 folder icons, and XOR-encrypted `.pls` / `.lst` playlists. Unmodified sections and padding bytes are preserved so untouched files keep their digital signatures!
* **Lossless-ish Format Conversion (`PPM` ⇄ `KWZ`):**
  * **PPM to KWZ:** Places frames 1:1 just like Nintendo's official DSi Library service, maps frame speeds, and resamples audio.
  * **KWZ to PPM:** Intelligently maps 3 layers and 6 colors down to 2 layers and 2 pen colors (by 3D depth or dominant ink color), or flattens and dithers them if you prefer. Automatically detects DSi Library conversions and reverses them cleanly.
* **Built-in Media Codecs (Zero Dependencies!):**
  * **Export to:** Animated `GIF`, `APNG`, `PNG` (single frame or sequence), `WAV` audio, `MPO` (3D stereo photos viewable on a real 3DS!), and `MP4` (using our bespoke pure-JS Baseline H.264 + AAC-LC encoders).
  * **Extended Video Support:** Want `MOV`, `MKV`, `WebM` (VP9/Opus), or video importing? Install the optional `mediabunny` peer dependency (or use `ffmpeg` in Node.js).
* **Smart Importer (`NoteBuilder`):** Turn images, GIFs, APNGs, or videos into valid `.ppm` or `.kwz` files. Features automatic aspect-ratio fitting, Bayer ordered or Floyd-Steinberg error-diffusion dithering, log-scale speed matching, and **real-time memory meter tracking** (automatically disables dithering or trims/slows down frames before the console's memory limit explodes).
* **Full Editing Suite & Drawing Engine:**
  * **`NoteDocument`:** Non-destructive editing with lazy frame decoding, transactions, 100-step Undo/Redo, paper color swapping (with automatic ink inversion so your black lines don't vanish into black paper), and console-accurate save rules (edit counters, spin-off lineage tracking).
  * **Bitmap Tools:** Draw dots, Bresenham lines, strokes, rectangles, and ellipses; flood-fill areas; flip, shift, copy/paste regions, and resample bitmaps using 8 authentic 4×4 screen-aligned halftone patterns (`solid`, `dark`, `checker`, `medium`, `light`, `horizontal`, `vertical`, `diagonal`).
* **Sample-Accurate Audio & 10-Band Equalizer:**
  * Custom IMA ADPCM codecs for both PPM (8180 Hz) and KWZ (16364 Hz / 16384 Hz mixed 2-bit/4-bit).
  * **DSi Library Audio Healer:** Automatically guesses the initial ADPCM step index and DC offset predictor for botched DSi Library conversions so they don't sound like a haunted blender.
  * Mixes BGM (with frame-speed pitch/tempo scaling) and frame-triggered sound effects (`SE1`–`SE4`) using band-limited `sinc` interpolation or console-accurate `nearest`-neighbor upsampling (32728 Hz).
  * Built-in **10-band graphic equalizer** (31 Hz to 16 kHz) with presets (`flat`, `bass`, `treble`, `voice`, `loudness`, and `soft` to tame harsh DSi highs).
* **Doctor Flipnote (Check, Repair & Carve):**
  * **`checkNote` & `preflightNote`:** Validates magic bytes, section CRC32s, RSA signatures, frame counts, memory meters, and truncated layer streams before a real console rejects them.
  * **`repairNote`:** Salvages corrupted files! Rebuilds missing `KMI` frame tables by walking raw `KMC` tile streams, replaces damaged frames with the previous good picture, fixes out-of-range speeds, regenerates broken thumbnails, and re-signs the file.
  * **`carveNotes`:** Scans raw SD card or NAND binary dumps to extract lost `.ppm` and `.kwz` files.
* **Cryptography & Key Hunter:**
  * Built-in SHA-1, SHA-256, and RSA-1024 / RSA-2048 signing and verification.
  * **`findSigningKeys`:** Point it at an app binary (like `code.bin`), PEM/DER file, or source code, and it will automatically sniff out and extract the private signing keys by matching them against the known public keys.
* ** `<flipnote-player>` Web Component:**
  * Drop-in custom HTML element with Shadow DOM UI, dark mode, drag-and-drop file loading, keyboard shortcuts, fullscreen, 3D viewing modes (`anaglyph` red/cyan glasses, `side-by-side`, `top-bottom`), live 10-band EQ sliders, and **WebGL "sharp bilinear" scaling** for ultra-crisp pixels at any display size.
* **Collection Database & Static Gallery Generator:**
  * Index thousands of notes into JSON (`NoteDatabase`), search by author/tags/dates, detect content duplicates (`contentId` SHA-1 of frame data), trace spin-off family trees, and generate a standalone static HTML/JS web gallery with one command.

---

### Installation

```bash
npm install flipnote-tools-js

# Optional: for WebM/MOV/MKV export and browser/Node video importing
npm install mediabunny
```

*(Requires Node.js >= 20 for CLI and Node file helpers).*

---

### CLI Usage (`flipnote-tools`)

You can run virtually every feature right from your terminal:

```bash
# Inspect metadata, memory meter, audio tracks, and per-frame stats
npx flipnote-tools info note.kwz --frames

# Check if a real DSi / 3DS console will accept the file
npx flipnote-tools check *.ppm *.kwz

# Repair a corrupted note and salvage readable frames
npx flipnote-tools repair broken.kwz fixed.kwz

# Carve lost Flipnotes out of a raw SD card or NAND dump!
npx flipnote-tools carve sd_dump.bin ./recovered_notes

# Edit metadata (speed, bgm-speed, loop, lock, thumbnail, name)
npx flipnote-tools meta note.ppm --set speed=7 --set loop=true --set name="FROG"

# Extract signing keys from app binaries (e.g., code.bin) into ./keys/
npx flipnote-tools keys path/to/code.bin

# Sign and verify files for real console hardware (keys in ./keys are used automatically;
# convert, repair, meta and the library's writers sign their output the same way)
npx flipnote-tools sign note.kwz
npx flipnote-tools verify note.kwz

# Convert between formats (.ppm, .kwz, .gif, .apng, .png, .mpo, .wav, .mp4, .mov, .mkv, .webm)
npx flipnote-tools convert input.ppm output.kwz
npx flipnote-tools convert input.kwz output.mp4 --scale 2 --stereo anaglyph --eq soft
npx flipnote-tools convert input.kwz stereo_photo.mpo --frame 10

# Export all frames as PNGs, or extract thumbnails / audio
npx flipnote-tools frames note.ppm ./frames_out
npx flipnote-tools thumbnail note.kwz preview.gif --animated --width 160
npx flipnote-tools audio note.ppm bgm.wav --track bgm

# Import a video, GIF, APNG, or image sequence into a console-ready Flipnote!
npx flipnote-tools import meme.mp4 result.kwz --fps 12 --dither ordered --start 0 --end 15

# Create a 24x24 Flipnote Studio 3D folder icon (!.ico)
npx flipnote-tools icon avatar.png !.ico --dither none

# Index a folder of notes, search them, and build a static web gallery!
npx flipnote-tools db ./my_flipnotes --db notes.json --thumbnails
npx flipnote-tools find notes.json --text "stickman" --format ppm --sort frames
npx flipnote-tools gallery ./my_flipnotes ./public_gallery --title "My Flipnote Archive" --animated

# Read an encrypted .pls or .lst playlist
npx flipnote-tools playlist favorite.lst --format kwz
```

---

### JavaScript / TypeScript API

The package provides clean modular entry points:
* `flipnote-tools-js` — Core library (reading, writing, editing, converting, codecs, crypto, database; **0 dependencies**).
* `flipnote-tools-js/player` — Browser `FlipnotePlayer` class and `<flipnote-player>` Web Component.
* `flipnote-tools-js/video` — `importVideo` and `exportVideo` powered by `mediabunny`.
* `flipnote-tools-js/node` — Node.js file system scanners, key loaders, `ffmpeg` video importer, and static gallery builder.

#### 1. Read, Inspect, Convert & Export
```ts
import { readNote, getNoteInfo, convertToPpm, exportMp4, exportGif } from 'flipnote-tools-js';

const bytes = new Uint8Array(/* ... */);
const note = readNote(bytes); // Auto-detects PPM, KWZ, KWC, or KIC icon!
console.log(getNoteInfo(note));

// Export to H.264 + AAC MP4 (pure JS, no dependencies!)
const mp4Bytes = exportMp4(note, {
  scale: 2,
  stereo: 'anaglyph', // 'left' | 'right' | 'side-by-side' | 'top-bottom' | 'anaglyph'
  equalizer: 'soft',
});

// Convert 3DS KWZ down to DSi PPM keeping layers editable
const ppmNote = convertToPpm(note, { fit: 'auto', layers: 'keep' });
```

#### 2. Non-Destructive Editing & Drawing (`NoteDocument`)
```ts
import { NoteDocument, drawLine, fillArea } from 'flipnote-tools-js';

const doc = NoteDocument.create('ppm', {
  author: { id: '1000000000123456', name: 'ARTIST' },
});

doc.editFrame(0, (frame) => {
  const layerA = { width: 256, height: 192, pixels: frame.layers[0] };
  drawLine(layerA, 10, 10, 200, 150, { size: 4, shape: 'round', tone: 'checker', value: 1 });
  fillArea(layerA, 100, 100, 1, 'diagonal');
});

doc.undo(); // Oops!
doc.redo(); // Actually, it was art.

const savedBytes = doc.save({ key: myPpmPrivateKey });
```

#### 3. Web Player (`<flipnote-player>`)
```html
<script type="module">
  import { defineFlipnotePlayer } from 'flipnote-tools-js/player';
  defineFlipnotePlayer();
</script>

<!-- Supports drag-and-drop, 3D modes, WebGL sharp scaling, and a 10-band equalizer! -->
<flipnote-player
  src="masterpiece.kwz"
  controls
  autoplay
  loop
  stereo="anaglyph"
  equalizer="soft"
></flipnote-player>
```

---

### License & Legal Notice

#### Public Domain (The Unlicense)
All original source code in this repository is released into the **public domain** under [The Unlicense](LICENSE). You are free to copy, modify, publish, use, compile, sell, or distribute it for any purpose, commercial or non-commercial, with zero strings attached.

#### ⚠️ What is NOT in the Public Domain:
1. **Nintendo's Intellectual Property:**
   * *Flipnote Studio*, *Flipnote Studio 3D*, *Moving Notepad (うごメモ)*, *Nintendo DSi*, and *Nintendo 3DS* are trademarks of **Nintendo Co., Ltd.**
   * The proprietary concepts, console applications, and the RSA keys in `src/ppm/ppm-types.ts` and `src/kwz/kwz-types.ts` belong to Nintendo: the public keys (`PPM_PUBLIC_KEY`, `KWZ_PUBLIC_KEY`) that verify notes and the private keys (`PPM_PRIVATE_KEY`, `KWZ_PRIVATE_KEY`) that sign them.
   * **This package includes Nintendo's private signing keys** so that notes can be signed for real consoles without any setup. They are Nintendo's data, are **not** released under the Unlicense, and are included solely for interoperability with the original apps. Use them at your own risk and responsibility.
   * This project is an independent reverse-engineering and preservation effort and is **not affiliated with, authorized, or endorsed by Nintendo**.
2. **Third-Party Libraries:**
   * When you install optional or development packages (`mediabunny` under MPL-2.0, `@mediabunny/server`, `ffmpeg` under LGPL/GPL, `esbuild` under MIT, `TypeScript` under Apache-2.0, `Prettier` under MIT), each remains under its respective license. None of their source code is bundled in this repository.
3. **User Flipnote Files:**
   * Individual `.ppm`, `.kwz`, and `.kwc` animations belong to their respective creators. Respect the artists!

*(The H.264, AAC, JPEG, and DEFLATE code tables in `src/media/` are data defined by the ITU-T, ISO/IEC, and IETF standards.)*

---
---

<a id="japanese"></a>

## 🇯🇵 日本語 (Japanese)

**`flipnote-tools-js`** へようこそ！これは『うごくメモ帳』（DSi `.ppm`）および『うごくメモ帳 3D』（3DS `.kwz`, `.kwc`, フォルダアイコン）のための、ちょっとやりすぎな万能ツールキットです。

押し入れのSDカードから発掘した黒歴史（あるいは名作）の破損データを修復したい時も、最新のMP4動画をうごメモに変換して実機で再生したい時も、100段階のUndo履歴付きでレイヤー編集したい時も、WebGLと10バンドイコライザーを搭載したプレイヤーをWebサイトに埋め込みたい時も、これ1つで全て完結します。
しかも、コアライブラリの外部依存パッケージはゼロです。

### 主な特徴と使える機能すべて

* **完全な読み書き（Read & Write）:** DSiの `.ppm`、3DSの `.kwz`、手書きコメント `.kwc`、24×24のフォルダアイコン `!.ico`、そしてXOR暗号化されたプレイリスト `.pls` / `.lst` に完全対応。未変更のセクションやパディングバイトをそのまま保持するため、無編集で書き戻せばデジタル署名が壊れません。
* **フォーマット相互変換 (`PPM` ⇄ `KWZ`):**
  * **PPM → KWZ:** 任天堂公式の「DSiシアター（DSi Library）」と同様に1:1で中央配置（または画面フィット）し、速度と音声を正確に変換します。
  * **KWZ → PPM:** 3レイヤー・6色のKWZを、3D奥行き順または使用色に基づいて2レイヤー・2色ペンへと賢くマッピングし、編集可能な状態を維持します（合成＆ディザリングする `flatten` モードも選択可）。DSiシアター経由のメモも自動判定して劣化なしで逆変換します。
* **依存関係ゼロの内蔵メディアコーデック:**
  * **エクスポート:** アニメーション `GIF`、`APNG`、連番または単体 `PNG`、`WAV` 音声、3DS実機で立体視できる3D写真 `MPO`、そして自作のH.264 + AACエンコーダによる `MP4` 出力に標準対応。
  * **拡張動画サポート:** オプションの `mediabunny`（またはNode.jsの `ffmpeg`）を使えば、`MOV` / `MKV` / `WebM` の出力や、あらゆる動画ファイルからのうごメモ生成が可能です。
* **スマートインポート (`NoteBuilder`):** 画像、GIF、APNG、動画を `.ppm` や `.kwz` に変換。アスペクト比調整、ディザリング（Ordered / Error Diffusion）、フレームレート自動計画に加え、**実機のメモリメーターをリアルタイム計算**します（容量オーバーしそうな場合は自動でディザを切るか、速度を落とす・末尾をカットして実機制限内に収めます）。
* **本格的な編集＆描画エンジン:**
  * **`NoteDocument`:** 必要な時だけフレームを展開する遅延デコード、トランザクション、100ステップのUndo/Redo、インクが消えない賢い用紙色変更（`changePaper`）、そして実機準拠の保存ルール（編集回数のカウントアップやスピンオフ作品の親子ID引き継ぎ）を備えています。
  * **描画ツール (`edit/tools`):** 点、直線（ブレゼンハム）、ストローク、矩形、楕円、バケツ塗りつぶし、反転、移動、コピー＆ペースト、細線が消えないリサンプリング、そして原作再現の8種類の4×4トーンパターン（`solid`, `dark`, `checker` など）を完備。
* **サンプル単位で正確な音声処理＆10バンドイコライザー:**
  * PPM（8180 Hz）およびKWZ（16364 Hz / 16384 Hz、2-bit/4-bit可変）のIMA ADPCMエンコード・デコード。
  * **DSiシアター音源の自動修復:** 初期ステップ値やDCオフセットがズレて音割れしがちなDSiシアター変換メモのADPCM初期状態を自動推測し、クリアな音で再生します。
  * BGMの速度変更ピッチ補正、フレームごとの効果音（`SE1`〜`SE4`）ミキシング、高音質な `sinc` 補間と実機特有のジャリジャリ感を再現する `nearest`（32728 Hz）アップサンプリングの切り替え。
  * **10バンド・グラフィックイコライザー**（31 Hz〜16 kHz）と6種のプリセット（DSiの高音ノイズをマイルドにする `soft` など）を搭載。
* **ドクター・うごメモ（検査・修復・データ救出）:**
  * **`checkNote` / `preflightNote`:** 実機がファイルを弾く原因（署名エラー、CRC32不一致、サイズ超過、フレーム破損、他人のロックなど）を保存前に完全診断。
  * **`repairNote`:** 壊れたファイルを救出！`KMI` フレームテーブルが消失していても `KMC` タイルストリームを解析してフレームを再構築し、破損フレームは前の画像で補完、サムネイルやヘッダを直して再署名します。
  * **`carveNotes`:** SDカードやNANDの生のバイナリイメージから、削除・紛失した `.ppm` / `.kwz` ファイルをシグネチャ検索で丸ごと掘り起こします。
* **暗号処理＆秘密鍵ハンター (`findSigningKeys`):**
  * SHA-1 / SHA-256、RSA-1024 / RSA-2048 の署名・検証を自前実装。アプリのバイナリ（`code.bin` 等）やテキストを渡すだけで、公開鍵とペアになるRSA秘密鍵を自動的に探し出して抽出します。
* ** `<flipnote-player>` Webコンポーネント:**
  * HTMLにタグを貼るだけで動くカスタム要素。ダークモード、ドラッグ＆ドロップ再生、フルスクリーン、3D立体視モード（赤青メガネ `anaglyph`、サイドバイサイド等）、リアルタイムEQスライダー、そしてどんな拡大率でもドットが滲まない **WebGL シャープバイリニア拡大**に対応。
* **データベース＆静的Webギャラリー生成:**
  * 大量のメモを高速スキャンしてJSON化（`NoteDatabase`）。作者やタグでの検索、フレームデータのハッシュ（`contentId`）による重複作品検出、派生作品（スピンオフ）の家系図検索、そして1コマンドでプレイヤー付きの静的HTMLギャラリーサイトを生成できます。

---

### CLIの使い方 (`flipnote-tools`)

インストール後、ターミナルからすべての機能を呼び出せます：

```bash
# メモの詳細情報、メモリメーター、音声トラック、フレーム統計を表示
npx flipnote-tools info note.kwz --frames

# 実機（DSi / 3DS）で読み込めるか互換性チェック
npx flipnote-tools check *.ppm *.kwz

# 破損したうごメモを修復して救出
npx flipnote-tools repair broken.kwz fixed.kwz

# SDカードやNANDのダンプイメージからうごメモを発掘！
npx flipnote-tools carve sd_image.bin ./recovered

# メタデータの書き換え（速度、ループ、ロック、作者名など）
npx flipnote-tools meta note.ppm --set speed=7 --set loop=true --set name="カエル"

# アプリのバイナリ等から署名用の秘密鍵を抽出して ./keys/ に保存
npx flipnote-tools keys path/to/code.bin

# 実機向けにファイルへデジタル署名 / 署名の検証（./keys の鍵を自動で使います。
# convert・repair・meta やライブラリの書き込みも同じ鍵で自動的に署名します）
npx flipnote-tools sign note.kwz
npx flipnote-tools verify note.kwz

# フォーマット変換（拡張子で自動判別: .ppm .kwz .gif .apng .png .mpo .wav .mp4 .mov .mkv .webm）
npx flipnote-tools convert input.ppm output.kwz
npx flipnote-tools convert input.kwz output.mp4 --scale 2 --stereo anaglyph --eq soft
npx flipnote-tools convert input.kwz 3d_photo.mpo --frame 0

# MP4動画やGIFアニメから実機で再生できるうごメモを作成！
npx flipnote-tools import video.mp4 output.kwz --fps 12 --dither ordered --start 0 --end 10

# フォルダ内のうごメモをスキャンして、プレイヤー付きの静的Webギャラリーを生成！
npx flipnote-tools gallery ./my_notes ./web_gallery --title "うごメモ保管庫" --animated
```

---

### ライセンスと権利表記 (License)

#### パブリックドメイン (The Unlicense)
本リポジトリに含まれるオリジナルのソースコードはすべて、[The Unlicense](LICENSE) の下で*パブリックドメイン*として公開されています。商用・非商用を問わず、誰でも自由に複製、改変、公開、使用、コンパイル、販売、再配布することができます。

#### ⚠️ パブリックドメインの対象外となるもの（重要）:
1. **任天堂株式会社の著作物・商標:**
   * 『うごくメモ帳 (Flipnote Studio)』、『うごくメモ帳 3D (Flipnote Studio 3D)』、『ニンテンドーDSi』、『ニンテンドー3DS』は**任天堂株式会社の商標または登録商標**です。
   * アプリケーション自体、データフォーマットの仕様、および `src/ppm/ppm-types.ts` と `src/kwz/kwz-types.ts` に含まれる RSA 鍵の権利は任天堂に帰属します。検証用の公開鍵（`PPM_PUBLIC_KEY`、`KWZ_PUBLIC_KEY`）と、署名用の秘密鍵（`PPM_PRIVATE_KEY`、`KWZ_PRIVATE_KEY`）の両方が対象です。
   * **本パッケージには、実機向けの署名に使う任天堂の秘密鍵が含まれています。** 設定なしで実機用の署名ができるように同梱しています。任天堂のデータであり、The Unlicense の対象外です。オリジナルのアプリとの互換のためだけに含めているもので、利用は自己責任でお願いします。
   * 本プロジェクトは非公式の互換・保存ツールであり、**任天堂株式会社とは一切関係ありません**。
2. **外部ライブラリ（サードパーティパッケージ）:**
   * `npm install` 等で導入される外部ライブラリ（`mediabunny` [MPL-2.0]、`@mediabunny/server`、`ffmpeg` [LGPL/GPL]、`esbuild` [MIT]、`TypeScript` [Apache-2.0]、`Prettier` [MIT] など）は、それぞれのライセンスに従います。これらのコードは本リポジトリには同梱されていません。
3. **うごメモ作品ファイル:**
   * `.ppm` や `.kwz` などの各アニメーション作品の著作権は、それを作成した各作者に帰属します。

---
---

<a id="spanish"></a>

## 🇪🇸 Español (Spanish)

¡Bienvenido a **`flipnote-tools-js`**! La navaja suiza definitiva para Flipnote Studio (DSi `.ppm`) y Flipnote Studio 3D (3DS `.kwz`, `.kwc`, iconos de carpetas).

Ya sea que quieras rescatar tus obras maestras de la infancia desde una tarjeta SD dañada, convertir un meme en MP4 en una Flipnote lista para reproducirse en una consola real, editar capas con un historial de 100 pasos para deshacer, o incrustar un reproductor WebGL con ecualizador de 10 bandas en tu página web, esta herramienta lo hace todo. ¿Y lo mejor? La librería principal tiene **cero dependencias obligatorias**. 

### Características Principales

* **Lectura y Escritura Total:** Soporte completo al nivel de bytes para notas `.ppm` de DSi y `.kwz` de 3DS, comentarios `.kwc`, iconos de carpeta `!.ico` (24×24) y listas de reproducción encriptadas `.pls` / `.lst`. ¡Las secciones no modificadas conservan su relleno original para no romper las firmas digitales!
* **Conversión Inteligente (`PPM` ⇄ `KWZ`):**
  * **PPM a KWZ:** Coloca los fotogramas 1:1 igual que el servicio oficial *DSi Library* de Nintendo, mapeando velocidades y audio sin pérdidas.
  * **KWZ a PPM:** Adapta mágicamente 3 capas y 6 colores a las 2 capas y 2 colores de DSi (por profundidad 3D o color predominante) manteniendo las capas editables, o las aplana con tramado (*dithering*).
* **Códecs Multimedia Integrados (¡Sin Dependencias!):**
  * **Exportación directa a:** `GIF` animado, `APNG`, `PNG`, audio `WAV`, fotos estereoscópicas 3D `MPO` (¡visibles en 3D en una Nintendo 3DS real!) y video `MP4` (H.264 + AAC-LC integrados).
  * **Soporte de Video Extendido:** Instala el paquete opcional `mediabunny` (o usa `ffmpeg` en Node.js) para importar cualquier video o exportar a `MOV`, `MKV` y `WebM`.
* **Importador Inteligente (`NoteBuilder`):** Convierte imágenes, GIFs, APNGs o videos en archivos `.ppm` o `.kwz`. Incluye ajuste de proporción, *dithering* (Bayer o difusión de error) y **control del medidor de memoria en tiempo real** (desactiva el *dithering* o ajusta la velocidad automáticamente antes de superar el límite de memoria de la consola).
* **Suite de Edición y Dibujo (`NoteDocument`):**
  * Decodificación perezosa (*lazy*) de fotogramas, transacciones, 100 niveles de Deshacer/Rehacer, cambio inteligente de color de papel (invierte la tinta automáticamente para que tus trazos negros no desaparezcan sobre papel negro) y reglas de guardado fieles a la consola (contador de ediciones y linaje de *spin-offs*).
  * Herramientas de mapa de bits: puntos, líneas Bresenham, trazos, rectángulos, elipses, relleno por inundación (*flood-fill*), volteo, desplazamiento, copiado/pegado y 8 patrones de semitono (*tones*) clásicos de 4×4.
* **Audio de Precisión y Ecualizador de 10 Bandas:**
  * Códecs IMA ADPCM para PPM (8180 Hz) y KWZ (16364 Hz / 16384 Hz).
  * **Reparador de Audio de DSi Library:** Adivina automáticamente el estado inicial ADPCM y elimina el desplazamiento DC en notas convertidas por DSi Library para que no suenen distorsionadas.
  * Mezcla BGM y efectos de sonido (`SE1`–`SE4`) con interpolación `sinc` de alta calidad o muestreo `nearest` estilo consola (32728 Hz), más un **ecualizador gráfico de 10 bandas** (con preajustes como `soft`, `bass`, `treble`, `voice`, `loudness`).
* **Doctor Flipnote (Verificación, Reparación y Rescate):**
  * **`checkNote` y `preflightNote`:** Verifica firmas RSA, sumas CRC32, límites de memoria y datos de fotogramas antes de que tu consola rechace el archivo.
  * **`repairNote`:** ¡Salva archivos corruptos! Reconstruye tablas de fotogramas `KMI` perdidas analizando los flujos `KMC`, reemplaza fotogramas dañados, regenera miniaturas JPEG/tiling y vuelve a firmar el archivo.
  * **`carveNotes`:** Escanea volcados binarios de tarjetas SD o memorias NAND para extraer archivos `.ppm` y `.kwz` ocultos o borrados.
* **Criptografía y Cazador de Claves (`findSigningKeys`):**
  * Implementación propia de SHA-1, SHA-256 y RSA-1024 / RSA-2048. Extrae automáticamente las claves privadas de firma desde binarios (como `code.bin`) o archivos PEM/DER.
* **Web Component `<flipnote-player>` y Galería Estática:**
  * Etiqueta HTML lista para usar con modo oscuro, arrastrar y soltar (*drag & drop*), pantalla completa, modos 3D (`anaglyph` rojo/cian, `side-by-side`), ecualizador en vivo y **escalado WebGL "sharp bilinear"** para píxeles nítidos.
  * Indexa colecciones en JSON (`NoteDatabase`), detecta duplicados, rastrea árboles genealógicos de notas y genera una galería web estática completa desde la CLI.

---

### Uso de la CLI (`flipnote-tools`)

```bash
# Ver información detallada, uso de memoria, pistas de audio y estadísticas por fotograma
npx flipnote-tools info nota.kwz --frames

# Comprobar si la consola aceptará los archivos
npx flipnote-tools check *.ppm *.kwz

# Reparar un archivo dañado
npx flipnote-tools repair rota.kwz reparada.kwz

# Extraer Flipnotes perdidas de una imagen binaria de tarjeta SD o NAND
npx flipnote-tools carve sd_dump.bin ./recuperadas

# Extraer claves de firma desde binarios y firmar notas (las claves de ./keys se usan
# automáticamente; convert, repair, meta y la biblioteca también firman lo que escriben)
npx flipnote-tools keys ruta/a/code.bin
npx flipnote-tools sign nota.kwz

# Convertir entre formatos (.ppm, .kwz, .gif, .apng, .png, .mpo, .wav, .mp4, .mov, .mkv, .webm)
npx flipnote-tools convert entrada.ppm salida.kwz
npx flipnote-tools convert entrada.kwz video.mp4 --scale 2 --stereo anaglyph --eq soft

# Importar un video o GIF para crear una Flipnote lista para la consola
npx flipnote-tools import video.mp4 salida.kwz --fps 12 --dither ordered --start 0 --end 15

# Crear una galería web estática con reproductor integrado a partir de una carpeta
npx flipnote-tools gallery ./mis_notas ./galeria_web --title "Mi Archivo Flipnote" --animated
```

---

### Licencia y Aviso Legal

#### Dominio Público (The Unlicense)
Todo el código fuente original de este repositorio se libera al **dominio público** bajo [The Unlicense](LICENSE). Eres libre de copiar, modificar, publicar, usar, compilar, vender o distribuir este software para cualquier propósito, comercial o no comercial, y por cualquier medio.

#### ⚠️ Exclusiones (Lo que NO está en el dominio público):
1. **Propiedad Intelectual de Nintendo:**
   * *Flipnote Studio*, *Flipnote Studio 3D*, *Nintendo DSi* y *Nintendo 3DS* son marcas registradas de **Nintendo Co., Ltd.**
   * Las aplicaciones originales, sus datos y las claves RSA de `src/ppm/ppm-types.ts` y `src/kwz/kwz-types.ts` pertenecen a Nintendo: las claves públicas (`PPM_PUBLIC_KEY`, `KWZ_PUBLIC_KEY`) que verifican las notas y las claves privadas (`PPM_PRIVATE_KEY`, `KWZ_PRIVATE_KEY`) que las firman.
   * **Este paquete incluye las claves privadas de firma de Nintendo** para poder firmar notas para consolas reales sin ninguna configuración. Son datos de Nintendo, **no** se publican bajo The Unlicense y se incluyen únicamente por compatibilidad con las aplicaciones originales. Úsalas bajo tu propia responsabilidad.
   * Este proyecto no está afiliado, autorizado ni respaldado por Nintendo.
2. **Librerías de Terceros:**
   * Los paquetes externos opcionales o de desarrollo (`mediabunny` bajo MPL-2.0, `@mediabunny/server`, `ffmpeg` bajo LGPL/GPL, `esbuild` bajo MIT, `TypeScript` bajo Apache-2.0, `Prettier` bajo MIT) mantienen sus propias licencias respectivas. Ninguno de sus códigos está incluido aquí.
3. **Archivos de Flipnote:**
   * Los archivos `.ppm`, `.kwz` y `.kwc` pertenecen a sus respectivos autores.
