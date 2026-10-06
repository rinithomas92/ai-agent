import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { estimateWidth } from './premiumQuoteDark.js';

// Content template: vintage_editorial
// Square black-and-white magazine page: quote on the left, a large grayscale
// photograph on the right. Everything is drawn from the post's own data; the
// reference image in public/templates is never embedded.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const outputDir = path.join(root, 'public', 'generated');
const uploadsDir = path.join(root, 'public', 'uploads');

const SIZE = 1080;
const COLORS = {
  background: '#0b0b0b',
  ivory: '#f1ede4',
  soft: '#c9c4ba',
  muted: '#8d8880',
  line: '#e8e2d6'
};
const FONTS = {
  serif: "Georgia, 'Times New Roman', Times, serif",
  sans: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  script: "'Segoe Script', 'Brush Script MT', 'Snell Roundhand', 'Apple Chancery', cursive"
};

// Photo panel covers the right ~60% of the card and fades into black on its left edge.
const PHOTO = { x: 430, width: SIZE - 430 };
// Left text column. The quote box bottom is dynamic: author + metadata sit under the quote.
const COLUMN = { x: 80, width: 470, center: 300 };
const QUOTE = { top: 236, bottom: 690, maxSize: 72, minSize: 26 };

export async function renderVintageEditorial(content, options = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const photoDataUri = await readPhotoDataUri(options.uploadedImagePath);
  const svg = buildVintageEditorialSvg(content, { ...options, photoDataUri });
  const filename = `${randomUUID()}-vintage.svg`;
  const filePath = path.join(outputDir, filename);
  await fs.writeFile(filePath, svg, 'utf8');
  const publicPath = `/generated/${filename}`;
  const publicUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5177'}${publicPath}`;
  return { filePath, publicPath, publicUrl };
}

export function buildVintageEditorialSvg(content, options = {}) {
  const creatorName = cleanText(options.creatorName) || 'Creator';
  const category = cleanText(options.category) || 'Daily Quote';
  const handle = normalizeHandle(options.instagramHandle);
  const quote = prepareQuote(content?.quote);
  const layout = layoutEditorialQuote(quote);

  const brandSize = fitSingleLineSize(creatorName.toUpperCase(), 440, 34, 20, 'serif', 7);
  const brand = truncateToWidth(creatorName.toUpperCase(), 440, (text) => estimateWidth(text, brandSize, 'serif', 7));
  const series = 'A VINTAGE QUOTE SERIES';

  // Author block sits directly beneath the quote.
  const authorY = layout.bottom + 74;
  const authorSize = fitSingleLineSize(creatorName, COLUMN.width - 60, 46, 28, 'serif');
  const author = truncateToWidth(creatorName, COLUMN.width - 60, (text) => estimateWidth(text, authorSize, 'serif'));
  const metaLines = categoryLines(category);

  const note = editorialNote(quote);
  const footer = truncateToWidth(`${category}  |  ${creatorName}  |  ${series}`.toUpperCase(), 880, (text) => estimateWidth(text, 13, 'sans', 3));
  const handleText = truncateToWidth(handle, 700, (text) => estimateWidth(text, 22, 'serif'));

  return `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="vedGray" color-interpolation-filters="sRGB">
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncR type="linear" slope="1.12" intercept="-0.04"/>
        <feFuncG type="linear" slope="1.12" intercept="-0.04"/>
        <feFuncB type="linear" slope="1.12" intercept="-0.04"/>
      </feComponentTransfer>
    </filter>
    <filter id="vedGrain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise"/>
      <feColorMatrix in="noise" type="saturate" values="0"/>
    </filter>
    <linearGradient id="vedFadeLeft" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${COLORS.background}" stop-opacity="1"/>
      <stop offset="18%" stop-color="${COLORS.background}" stop-opacity="0.92"/>
      <stop offset="52%" stop-color="${COLORS.background}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${COLORS.background}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="vedFadeBottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${COLORS.background}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${COLORS.background}" stop-opacity="0.9"/>
    </linearGradient>
    <radialGradient id="vedVignette" cx="55%" cy="45%" r="75%">
      <stop offset="60%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.55"/>
    </radialGradient>
    <linearGradient id="vedPlaceholder" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#3a3a3a"/>
      <stop offset="100%" stop-color="#141414"/>
    </linearGradient>
    <clipPath id="vedCard"><rect width="${SIZE}" height="${SIZE}"/></clipPath>
    <filter id="vedTextShadow"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.7"/></filter>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="${COLORS.background}"/>
  <g clip-path="url(#vedCard)">
    ${photoPanel(options.photoDataUri, creatorName)}
    <rect x="${PHOTO.x}" y="0" width="360" height="${SIZE}" fill="url(#vedFadeLeft)"/>
    <rect x="0" y="780" width="${SIZE}" height="300" fill="url(#vedFadeBottom)"/>
    <rect width="${SIZE}" height="${SIZE}" fill="url(#vedVignette)"/>
    <rect width="${SIZE}" height="${SIZE}" filter="url(#vedGrain)" opacity="0.07"/>
  </g>
  <rect x="16" y="16" width="1048" height="1048" rx="16" fill="none" stroke="${COLORS.line}" stroke-width="1.5" stroke-opacity="0.85"/>

  <text x="${COLUMN.center}" y="100" text-anchor="middle" font-family="${FONTS.serif}" font-size="${brandSize}" letter-spacing="7" fill="${COLORS.ivory}">${escapeXml(brand)}</text>
  <text x="${COLUMN.center}" y="134" text-anchor="middle" font-family="${FONTS.serif}" font-size="15" letter-spacing="4" fill="${COLORS.soft}">${series}</text>
  <line x1="${COLUMN.center - 50}" y1="160" x2="${COLUMN.center + 50}" y2="160" stroke="${COLORS.line}" stroke-width="1.2" stroke-opacity="0.8"/>

  <g id="vedQuote" font-family="${FONTS.serif}" font-size="${layout.size}" fill="${COLORS.ivory}" filter="url(#vedTextShadow)">
${layout.lines.map((line) => `    ${quoteLine(line)}`).join('\n')}
  </g>

  <line x1="${COLUMN.x}" y1="${authorY - 13}" x2="${COLUMN.x + 36}" y2="${authorY - 13}" stroke="${COLORS.ivory}" stroke-width="2"/>
  <text id="vedAuthor" x="${COLUMN.x + 56}" y="${authorY}" font-family="${FONTS.serif}" font-size="${authorSize}" font-style="italic" fill="${COLORS.ivory}" filter="url(#vedTextShadow)">${escapeXml(author)}</text>
${metaLines.map((line, index) => `  <text x="${COLUMN.x + 58}" y="${authorY + 44 + index * 26}" font-family="${FONTS.serif}" font-size="15" letter-spacing="4" fill="${COLORS.soft}">${escapeXml(line)}</text>`).join('\n')}

  <g transform="rotate(-8 900 925)">
    <text x="900" y="925" text-anchor="middle" font-family="${FONTS.script}" font-size="26" fill="${COLORS.ivory}" opacity="0.88">${escapeXml(note)}</text>
    <line x1="${900 - estimateWidth(note, 26, 'script') / 2 + 20}" y1="941" x2="${900 + estimateWidth(note, 26, 'script') / 2 - 10}" y2="941" stroke="${COLORS.ivory}" stroke-width="1.2" opacity="0.6"/>
  </g>

  <line x1="510" y1="962" x2="570" y2="962" stroke="${COLORS.line}" stroke-width="1.2" stroke-opacity="0.7"/>
  <text x="540" y="1000" text-anchor="middle" font-family="${FONTS.serif}" font-size="22" letter-spacing="1" fill="${COLORS.ivory}">${escapeXml(handleText)}</text>
  <text x="540" y="1036" text-anchor="middle" font-family="${FONTS.sans}" font-size="13" letter-spacing="3" fill="${COLORS.soft}">${escapeXml(footer)}</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Quote layout: largest font size whose wrapped lines fit the left column.
// ---------------------------------------------------------------------------

export function layoutEditorialQuote(quote) {
  const tokens = quote.split(/\s+/).filter(Boolean).map((text, index) => ({ text, index }));
  const italicIndex = pickItalicWord(tokens);
  // Typographic quote marks around the whole quote, attached to the first/last word.
  if (tokens.length) {
    tokens[0] = { ...tokens[0], text: `“${tokens[0].text}` };
    tokens[tokens.length - 1] = { ...tokens[tokens.length - 1], text: `${tokens[tokens.length - 1].text}”` };
  }

  const available = QUOTE.bottom - QUOTE.top;
  let chosen = null;
  for (let size = QUOTE.maxSize; size >= QUOTE.minSize; size -= 2) {
    const leading = Math.round(size * 1.16);
    const lines = wrapTokens(tokens, size, COLUMN.width);
    const height = lines.length * leading;
    chosen = { size, leading, lines, height };
    // Dramatic sizes are for short quotes; five or more lines read better a little smaller.
    const tooLargeForLength = lines.length > 4 && size > 58;
    if (height <= available && !tooLargeForLength) break;
  }

  let truncated = false;
  if (chosen.height > available) {
    const maxLines = Math.floor(available / chosen.leading);
    chosen.lines = chosen.lines.slice(0, maxLines);
    chosen.lines[maxLines - 1] = ellipsize(chosen.lines[maxLines - 1], chosen.size, COLUMN.width);
    chosen.height = maxLines * chosen.leading;
    truncated = true;
  }

  // Short quotes sit a little lower so the column feels balanced; long ones start at the top.
  const top = QUOTE.top + Math.max(0, (available - chosen.height) * 0.3);
  const lines = chosen.lines.map((lineTokens, index) => ({
    tokens: lineTokens.map((token) => ({ ...token, italic: token.index === italicIndex })),
    x: COLUMN.x,
    y: Math.round(top + chosen.size * 0.8 + index * chosen.leading)
  }));
  const bottom = lines.length ? lines[lines.length - 1].y + Math.round(chosen.size * 0.25) : QUOTE.top;
  return { size: chosen.size, leading: chosen.leading, lines, bottom, truncated };
}

function wrapTokens(tokens, size, maxWidth) {
  const pieces = tokens.flatMap((token) => breakLongToken(token, size, maxWidth));
  const lines = greedyWrap(pieces, size, maxWidth);
  // Avoid a lone orphan word on the last line when a narrower measure fixes it.
  if (lines.length >= 2 && lines[lines.length - 1].length === 1) {
    for (let width = maxWidth * 0.95; width >= maxWidth * 0.72; width -= maxWidth * 0.03) {
      const candidate = greedyWrap(pieces, size, width);
      if (candidate.length === lines.length && candidate[candidate.length - 1].length > 1) return candidate;
    }
  }
  return lines;
}

function greedyWrap(tokens, size, maxWidth) {
  const lines = [];
  let line = [];
  for (const token of tokens) {
    const next = [...line, token];
    if (line.length && lineWidth(next, size) > maxWidth) {
      lines.push(line);
      line = [token];
    } else {
      line = next;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

function breakLongToken(token, size, maxWidth) {
  if (estimateWidth(token.text, size, 'serif') <= maxWidth) return [token];
  const chunks = [];
  let chunk = '';
  for (const char of token.text) {
    if (chunk && estimateWidth(chunk + char, size, 'serif') > maxWidth) {
      chunks.push(chunk);
      chunk = char;
    } else {
      chunk += char;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks.map((text) => ({ text, index: token.index }));
}

function lineWidth(tokens, size) {
  return estimateWidth(tokens.map((token) => token.text).join(' '), size, 'serif');
}

function ellipsize(tokens, size, maxWidth) {
  const kept = [...tokens];
  const withEllipsis = () => [...kept.slice(0, -1), { ...kept[kept.length - 1], text: `${kept[kept.length - 1].text.replace(/[.,;:!?”]+$/, '')}…”` }];
  while (kept.length > 1 && lineWidth(withEllipsis(), size) > maxWidth) kept.pop();
  return withEllipsis();
}

// ---------------------------------------------------------------------------
// Italic emphasis: one meaningful word, chosen deterministically (no AI call).
// ---------------------------------------------------------------------------

const EMPHASIS_WORDS = new Set(`heroine hero worth self-worth trust peace healing heal boundaries love honesty truth light
power strength courage confidence respect growth freedom calm enough value deserve grace faith hope purpose wisdom
choose choice becoming life story stories brave kinder kindness soul heart joy victim chapter author forgive
forgiveness patience resilience clarity whole free fearless gentle authentic`.split(/\s+/).filter(Boolean));

const FILLER_WORDS = new Set(`about above after again against because before being below between could during every
people should something someone their there these those through until without would yourself always already really
things another others matter`.split(/\s+/));

function pickItalicWord(tokens) {
  const bare = (text) => text.toLowerCase().replace(/[’]/g, "'").replace(/^[^a-z]+|[^a-z]+$/g, '');
  const keyword = tokens.find((token) => EMPHASIS_WORDS.has(bare(token.text)));
  if (keyword) return keyword.index;
  // Fallback: the longest ordinary word, skipping contractions ("doesn't") and filler words.
  const longest = tokens
    .filter((token) => { const word = bare(token.text); return word.length >= 6 && word.length <= 14 && !word.includes("'") && !FILLER_WORDS.has(word); })
    .sort((a, b) => bare(b.text).length - bare(a.text).length || a.index - b.index)[0];
  return longest ? longest.index : -1;
}

function quoteLine({ tokens, x, y }) {
  // Words sharing a style are grouped into one tspan so the browser handles spacing.
  const runs = [];
  for (const token of tokens) {
    const last = runs[runs.length - 1];
    if (last && last.italic === token.italic) last.words.push(token.text);
    else runs.push({ italic: token.italic, words: [token.text] });
  }
  const spans = runs.map((run, index) => {
    const text = run.words.join(' ') + (index < runs.length - 1 ? ' ' : '');
    return run.italic
      ? `<tspan font-style="italic" fill="#ffffff">${escapeXml(text)}</tspan>`
      : `<tspan>${escapeXml(text)}</tspan>`;
  }).join('');
  return `<text x="${x}" y="${y}" xml:space="preserve">${spans}</text>`;
}

// ---------------------------------------------------------------------------
// Photo
// ---------------------------------------------------------------------------

function photoPanel(photoDataUri, creatorName) {
  if (photoDataUri) {
    return `<image href="${photoDataUri}" x="${PHOTO.x}" y="0" width="${PHOTO.width}" height="${SIZE}" preserveAspectRatio="xMidYMid slice" filter="url(#vedGray)"/>`;
  }
  // No photo: a quiet grey studio-backdrop panel with the creator's initials.
  return `<rect x="${PHOTO.x}" y="0" width="${PHOTO.width}" height="${SIZE}" fill="url(#vedPlaceholder)"/>
    <text x="${PHOTO.x + PHOTO.width / 2 + 60}" y="600" text-anchor="middle" font-family="${FONTS.serif}" font-size="220" font-style="italic" fill="${COLORS.ivory}" opacity="0.12">${escapeXml(initials(creatorName))}</text>`;
}

// Same containment rules as premiumQuoteDark: only files inside public/uploads,
// only image extensions, and any read failure falls back to the placeholder.
async function readPhotoDataUri(publicPath) {
  if (!publicPath || typeof publicPath !== 'string' || !publicPath.startsWith('/uploads/')) return null;
  const filePath = path.resolve(root, 'public', publicPath.replace(/^\//, ''));
  if (!filePath.startsWith(uploadsDir + path.sep)) return null;
  const ext = path.extname(filePath).toLowerCase();
  const mime = { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }[ext];
  if (!mime) return null;
  try {
    const buffer = await fs.readFile(filePath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function initials(name) {
  const words = name.split(/\s+/).filter((part) => /[\p{L}\p{N}]/u.test(part));
  return words.map((part) => part.match(/[\p{L}\p{N}]/u)[0]).join('').slice(0, 2).toUpperCase();
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

// Category as small stacked metadata lines under the author (at most three).
function categoryLines(category) {
  const words = category.toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last && `${last} ${word}`.length <= 18) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  const measure = (text) => estimateWidth(text, 15, 'serif', 4);
  const kept = lines.slice(0, 3);
  if (lines.length > 3) kept[2] = `${kept[2]}…`;
  return kept.map((line) => truncateToWidth(line, COLUMN.width - 60, measure));
}

// A small handwritten margin note, picked deterministically from the quote.
const NOTES = ['Read it twice.', 'Keep this one.', 'Worth remembering.', 'Pass it on.', 'Save for later.', 'Underline this.'];
function editorialNote(quote) {
  let hash = 0;
  for (const char of quote) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return NOTES[hash % NOTES.length];
}

function prepareQuote(value) {
  let text = cleanText(value)
    .replace(/(^|[\s([{—-])"/g, '$1“').replace(/"/g, '”')
    .replace(/(^|[\s([{—-])'/g, '$1‘').replace(/'/g, '’');
  // The card adds its own outer quote marks, so drop a pair that wraps the whole quote.
  if (/^“[^“”]*”$/.test(text)) text = text.slice(1, -1).trim();
  return text;
}

function normalizeHandle(value) {
  const handle = cleanText(value).replace(/\s+/g, '');
  if (!handle) return '';
  return handle.startsWith('@') ? handle : `@${handle}`;
}

function cleanText(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\s+/g, ' ').trim();
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function fitSingleLineSize(text, maxWidth, maxSize, minSize, family, letterSpacing = 0) {
  for (let size = maxSize; size > minSize; size -= 2) {
    if (estimateWidth(text, size, family, letterSpacing) <= maxWidth) return size;
  }
  return minSize;
}

function truncateToWidth(text, maxWidth, measure) {
  if (measure(text) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && measure(`${cut}…`) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}
