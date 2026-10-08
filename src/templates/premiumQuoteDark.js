import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// Content template: premium_quote_dark
// Square black/gold psychology quote card. Everything is drawn as SVG from the
// post's own data; the reference image in public/templates is never embedded.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const outputDir = path.join(root, 'public', 'generated');
const uploadsDir = path.join(root, 'public', 'uploads');

const SIZE = 1080;
const COLORS = {
  background: '#080706',
  glow: '#1a130c',
  gold: '#d9a766',
  goldLine: '#c8a064',
  ivory: '#f2ece2',
  muted: '#a39b90'
};
const FONTS = {
  serif: "Georgia, 'Times New Roman', Times, serif",
  sans: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  script: "'Segoe Script', 'Brush Script MT', 'Snell Roundhand', 'Apple Chancery', cursive"
};

// Quote box: text is fitted inside this rectangle.
const QUOTE = { x: 100, maxWidth: 830, top: 372, bottom: 856, maxSize: 64, minSize: 26 };
const PORTRAIT = { cx: 190, cy: 250, r: 98 };

export async function renderPremiumQuoteDark(content, options = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const portraitDataUri = await readPortraitDataUri(options.uploadedImagePath);
  const svg = buildPremiumQuoteDarkSvg(content, { ...options, portraitDataUri });
  const filename = `${randomUUID()}-premium.svg`;
  const filePath = path.join(outputDir, filename);
  await fs.writeFile(filePath, svg, 'utf8');
  const publicPath = `/generated/${filename}`;
  const publicUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5177'}${publicPath}`;
  return { filePath, publicPath, publicUrl };
}

export function buildPremiumQuoteDarkSvg(content, options = {}) {
  const creatorName = cleanText(options.creatorName) || 'Creator';
  const category = cleanText(options.category) || 'Daily Quote';
  const handle = normalizeHandle(options.instagramHandle);
  const quote = prepareQuote(content?.quote);
  const layout = layoutQuote(quote);

  const headerSize = 24;
  const headerSpacing = 4;
  const measureHeader = (text) => estimateWidth(text, headerSize, 'sans', headerSpacing);
  const header = headerText(creatorName, category, 760, measureHeader);
  const headerWidth = measureHeader(header);

  const nameSize = fitSingleLineSize(creatorName, 610, 56, 34, 'serif');
  const name = truncateToWidth(creatorName, 610, (text) => estimateWidth(text, nameSize, 'serif'));
  const handleText = truncateToWidth(handle, 610, (text) => estimateWidth(text, 26, 'sans'));
  const signature = truncateToWidth(signatureName(creatorName), 420, (text) => estimateWidth(text, 60, 'script'));

  return `<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="pqdGlow" cx="34%" cy="42%" r="70%">
      <stop offset="0%" stop-color="${COLORS.glow}" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="${COLORS.background}" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="pqdPortraitClip"><circle cx="${PORTRAIT.cx}" cy="${PORTRAIT.cy}" r="${PORTRAIT.r}"/></clipPath>
    <filter id="pqdSparkleGlow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="${COLORS.background}"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#pqdGlow)"/>
  <rect x="20" y="20" width="1040" height="1040" rx="30" fill="none" stroke="${COLORS.goldLine}" stroke-width="2" stroke-opacity="0.9"/>

  <text x="${QUOTE.x}" y="92" font-family="${FONTS.sans}" font-size="${headerSize}" letter-spacing="${headerSpacing}" fill="${COLORS.gold}">${escapeXml(header)}</text>
  <line x1="${QUOTE.x}" y1="110" x2="${Math.round(QUOTE.x + headerWidth)}" y2="110" stroke="${COLORS.goldLine}" stroke-width="1.5"/>
  ${carouselIcon(944, 58)}

  ${portraitBlock(options.portraitDataUri, creatorName)}
  <text x="330" y="248" font-family="${FONTS.serif}" font-size="${nameSize}" fill="${COLORS.ivory}">${escapeXml(name)}</text>
  <text x="332" y="298" font-family="${FONTS.sans}" font-size="26" fill="${COLORS.muted}">${escapeXml(handleText)}</text>

  <g id="pqdQuote" font-family="${FONTS.serif}" font-size="${layout.size}">
${layout.lines.map((line) => `    ${quoteLine(line)}`).join('\n')}
  </g>

  <line x1="${QUOTE.x}" y1="904" x2="${QUOTE.x + 38}" y2="904" stroke="${COLORS.gold}" stroke-width="3" stroke-linecap="round"/>
  <text x="${QUOTE.x + 58}" y="922" font-family="${FONTS.script}" font-size="60" font-style="italic" fill="${COLORS.gold}">${escapeXml(signature)}</text>
  <line x1="${QUOTE.x}" y1="958" x2="372" y2="958" stroke="${COLORS.goldLine}" stroke-width="1.5" stroke-opacity="0.85"/>
  ${sparkle(388, 958, 13, COLORS.gold)}

  ${engagementRow(1004)}
</svg>`;
}

// ---------------------------------------------------------------------------
// Quote layout: choose the largest font size whose wrapped lines fit the box.
// ---------------------------------------------------------------------------

export function layoutQuote(quote) {
  const highlights = pickHighlights(quote);
  const paragraphs = splitParagraphs(quote);
  const available = QUOTE.bottom - QUOTE.top;

  let chosen = null;
  for (let size = QUOTE.maxSize; size >= QUOTE.minSize; size -= 2) {
    const leading = Math.round(size * 1.28);
    const gap = paragraphs.length > 1 ? Math.round(size * 0.5) : 0;
    const wrapped = paragraphs.map((words) => wrapParagraph(words, size, QUOTE.maxWidth));
    const lineCount = wrapped.reduce((sum, lines) => sum + lines.length, 0);
    const height = lineCount * leading + gap * (paragraphs.length - 1);
    chosen = { size, leading, gap, wrapped, height };
    // Very large type only suits short quotes; longer ones read better a little smaller.
    const tooLargeForLength = lineCount > 3 && size > 56;
    if (height <= available && !tooLargeForLength) break;
  }

  // Still too tall at the minimum size: keep what fits and end with an ellipsis.
  let truncated = false;
  if (chosen.height > available) {
    const maxLines = Math.floor(available / chosen.leading);
    const flat = chosen.wrapped.flat().slice(0, maxLines);
    flat[flat.length - 1] = ellipsize(flat[flat.length - 1], chosen.size, QUOTE.maxWidth);
    chosen.wrapped = [flat];
    chosen.gap = 0;
    chosen.height = flat.length * chosen.leading;
    truncated = true;
  }

  // Centre the block in the quote box, nudged slightly upward so short quotes
  // sit close to the header rather than floating mid-card.
  const top = QUOTE.top + Math.max(0, (available - chosen.height) * 0.4);
  let baseline = top + chosen.size * 0.82;
  const lines = [];
  chosen.wrapped.forEach((paragraphLines, paragraphIndex) => {
    if (paragraphIndex > 0) baseline += chosen.gap;
    for (const tokens of paragraphLines) {
      lines.push({ tokens, x: QUOTE.x, y: Math.round(baseline) });
      baseline += chosen.leading;
    }
  });

  for (const line of lines) {
    line.tokens = line.tokens.map((token) => ({ ...token, gold: highlights.has(token.index) }));
  }
  return { size: chosen.size, leading: chosen.leading, lines, truncated };
}

function splitParagraphs(quote) {
  let index = 0;
  const toTokens = (text) => text.split(/\s+/).filter(Boolean).map((text) => ({ text, index: index++ }));
  const sentences = quote.split(/(?<=[.!?…])\s+(?=["“'‘(]?[A-Z0-9])/).filter(Boolean);
  // Two to four sentences read best as separate paragraphs (like the reference);
  // one long sentence or a long run of sentences stays as a single block.
  if (sentences.length >= 2 && sentences.length <= 4) return sentences.map(toTokens);
  return [toTokens(quote)];
}

function wrapParagraph(tokens, size, maxWidth) {
  const pieces = tokens.flatMap((token) => breakLongToken(token, size, maxWidth));
  const lines = greedyWrap(pieces, size, maxWidth);
  // Avoid a lone orphan word on the last line when a slightly narrower measure fixes it.
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
  const withEllipsis = () => [...kept.slice(0, -1), { ...kept[kept.length - 1], text: `${kept[kept.length - 1].text.replace(/[.,;:!?]+$/, '')}…` }];
  while (kept.length > 1 && lineWidth(withEllipsis(), size) > maxWidth) kept.pop();
  return withEllipsis();
}

// ---------------------------------------------------------------------------
// Gold highlights: deterministic, no AI call. A few meaningful words only.
// ---------------------------------------------------------------------------

const HIGHLIGHT_WORDS = new Set(`worth self-worth trust peace healing heal healed boundaries boundary love loved honesty honest truth
light clever power powerful strength strong strongest courage confidence respect self-respect validation growth grow
freedom free calm enough value valued deserve grace faith hope purpose wisdom intelligence ignorance secrecy silence
energy soul heart joy kindness choose choice becoming hidden standards attachment discipline patience resilience
happiness forgiveness integrity clarity alignment authentic protect worthy whole brave fearless gentle`
  .split(/\s+/).filter(Boolean));

const STOP_WORDS = new Set(`about above after again against because before being below between could doesn't during every
people should something someone their there these those through until without would yourself yourselves themselves
another always already really things thing never others`.split(/\s+/));

export function pickHighlights(quote) {
  const words = String(quote).split(/\s+/).filter(Boolean);
  const bare = (word) => word.toLowerCase().replace(/[’]/g, "'").replace(/^[^a-z]+|[^a-z]+$/g, '');
  const limit = words.length < 12 ? 1 : words.length < 28 ? 2 : 3;
  const chosen = new Set();
  const used = new Set();

  words.forEach((word, index) => {
    const key = bare(word);
    if (chosen.size < limit && HIGHLIGHT_WORDS.has(key) && !used.has(key)) {
      chosen.add(index);
      used.add(key);
    }
  });

  if (chosen.size === 0) {
    // Fall back to the longest meaningful words (earliest wins ties).
    words
      .map((word, index) => ({ index, key: bare(word) }))
      .filter(({ key }) => key.length >= 7 && key.length <= 16 && !STOP_WORDS.has(key))
      .sort((a, b) => b.key.length - a.key.length || a.index - b.index)
      .filter(({ key }) => !used.has(key) && used.add(key))
      .slice(0, Math.min(limit, 2))
      .forEach(({ index }) => chosen.add(index));
  }
  return chosen;
}

function quoteLine({ tokens, x, y }) {
  // Consecutive words with the same colour share one tspan; the browser lays
  // out the tspans inline, so no per-word x positions are guessed.
  const runs = [];
  for (const token of tokens) {
    const last = runs[runs.length - 1];
    if (last && last.gold === token.gold) last.words.push(token.text);
    else runs.push({ gold: token.gold, words: [token.text] });
  }
  const spans = runs.map((run, index) => {
    const text = run.words.join(' ') + (index < runs.length - 1 ? ' ' : '');
    return `<tspan fill="${run.gold ? COLORS.gold : COLORS.ivory}">${escapeXml(text)}</tspan>`;
  }).join('');
  return `<text x="${x}" y="${y}" xml:space="preserve">${spans}</text>`;
}

// ---------------------------------------------------------------------------
// Portrait
// ---------------------------------------------------------------------------

function portraitBlock(portraitDataUri, creatorName) {
  const { cx, cy, r } = PORTRAIT;
  const ring = `<circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="none" stroke="${COLORS.goldLine}" stroke-width="2.5"/>`;
  const accent = sparkle(cx - r * 0.72, cy - r * 0.78, 16, '#fff3d6', true);
  if (portraitDataUri) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#15110d"/>
  <image href="${portraitDataUri}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#pqdPortraitClip)"/>
  ${ring}
  ${accent}`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#15110d"/>
  <text x="${cx}" y="${cy + 26}" text-anchor="middle" font-family="${FONTS.serif}" font-size="76" fill="${COLORS.gold}">${escapeXml(initials(creatorName))}</text>
  ${ring}
  ${accent}`;
}

async function readPortraitDataUri(publicPath) {
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
    // Missing or unreadable upload: fall back to the initials placeholder.
    return null;
  }
}

function initials(name) {
  const letters = nameWords(name).map((part) => part.match(/[\p{L}\p{N}]/u)[0]).join('');
  return letters.slice(0, 2).toUpperCase();
}

const TITLES = new Set(['dr', 'mr', 'mrs', 'ms', 'miss', 'prof', 'sir', 'dame', 'rev']);

function nameWords(name) {
  return name.split(/\s+/).filter((part) => /[\p{L}\p{N}]/u.test(part));
}

// Signature uses the first name (skipping titles such as "Dr."), like a handwritten sign-off.
function signatureName(name) {
  const words = nameWords(name);
  const first = words.find((word) => !TITLES.has(word.toLowerCase().replace(/\.$/, '')));
  return first || name;
}

// ---------------------------------------------------------------------------
// Decorations
// ---------------------------------------------------------------------------

function sparkle(cx, cy, r, fill, glow = false) {
  const n = r * 0.22;
  const d = `M${cx} ${cy - r} L${cx + n} ${cy - n} L${cx + r} ${cy} L${cx + n} ${cy + n} L${cx} ${cy + r} L${cx - n} ${cy + n} L${cx - r} ${cy} L${cx - n} ${cy - n} Z`;
  return `<path d="${d}" fill="${fill}"${glow ? ' filter="url(#pqdSparkleGlow)"' : ''}/>`;
}

function carouselIcon(x, y) {
  return `<g fill="none" stroke="${COLORS.goldLine}" stroke-width="2.5">
    <rect x="${x + 12}" y="${y}" width="40" height="40" rx="7"/>
    <rect x="${x}" y="${y + 12}" width="40" height="40" rx="7" fill="${COLORS.background}"/>
  </g>`;
}

function engagementRow(y) {
  const text = (x, label) => `<text x="${x}" y="${y + 9}" font-family="${FONTS.sans}" font-size="27" fill="${COLORS.ivory}">${label}</text>`;
  const bar = (x) => `<line x1="${x}" y1="${y - 24}" x2="${x}" y2="${y + 24}" stroke="${COLORS.goldLine}" stroke-width="2"/>`;
  const stroke = `fill="none" stroke="${COLORS.ivory}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`;
  // Four groups spread evenly between x=100 and x=980, separated by gold bars.
  return `<g>
    <path d="M100 ${y - 20} H126 V${y + 20} L113 ${y + 8} L100 ${y + 20} Z" ${stroke}/>
    ${text(146, 'Save')}
    ${bar(259)}
    <path d="M315 ${y - 2} L357 ${y - 20} L343 ${y + 22} L335 ${y + 4} Z M335 ${y + 4} L357 ${y - 20}" ${stroke}/>
    ${text(375, 'Share')}
    ${bar(503)}
    <path d="M587 ${y + 20} C559 ${y} 563 ${y - 22} 579 ${y - 22} C586 ${y - 22} 587 ${y - 16} 587 ${y - 13} C587 ${y - 16} 588 ${y - 22} 595 ${y - 22} C611 ${y - 22} 615 ${y} 587 ${y + 20} Z" ${stroke}/>
    ${text(631, 'Like')}
    ${bar(737)}
    <text x="980" y="${y + 9}" text-anchor="end" font-family="${FONTS.sans}" font-size="27" fill="${COLORS.ivory}">Follow for more</text>
  </g>`;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

// "CREATOR • CATEGORY". When space runs out the creator part shortens first so
// the category always stays visible.
function headerText(creatorName, category, maxWidth, measure) {
  const name = creatorName.toUpperCase();
  const cat = category.toUpperCase();
  if (name === cat) return truncateToWidth(cat, maxWidth, measure);
  const separator = ' • ';
  const full = `${name}${separator}${cat}`;
  if (measure(full) <= maxWidth) return full;
  const catPart = truncateToWidth(cat, maxWidth * 0.6, measure);
  const namePart = truncateToWidth(name, maxWidth - measure(`${separator}${catPart}`), measure);
  return `${namePart}${separator}${catPart}`;
}

// Straight quotes become typographic ones; a quote that is wrapped in quote
// marks as a whole loses the outer pair, but quoted speech inside is kept intact.
function prepareQuote(value) {
  let text = cleanText(value)
    .replace(/(^|[\s([{—-])"/g, '$1“').replace(/"/g, '”')
    .replace(/(^|[\s([{—-])'/g, '$1‘').replace(/'/g, '’');
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

function fitSingleLineSize(text, maxWidth, maxSize, minSize, family) {
  for (let size = maxSize; size > minSize; size -= 2) {
    if (estimateWidth(text, size, family) <= maxWidth) return size;
  }
  return minSize;
}

function truncateToWidth(text, maxWidth, measure) {
  if (measure(text) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && measure(`${cut}…`) > maxWidth) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

// Approximate advance widths (in em) so layout works without a font engine.
// Slightly generous so real rendering lands inside the box, not outside it.
const NARROW = new Set("iljtf.,;:'!|’‘()[] ");
const WIDE = new Set('mwMW@%&—');
function charWidth(char, family) {
  if (family === 'script') return char === ' ' ? 0.28 : 0.5;
  const sans = family === 'sans';
  if (char === ' ') return sans ? 0.28 : 0.26;
  if (NARROW.has(char)) return sans ? 0.3 : 0.31;
  if (WIDE.has(char)) return sans ? 0.86 : 0.9;
  if (char === 'r') return 0.42;
  if (/[A-Z]/.test(char)) return sans ? 0.7 : 0.72;
  if (/[0-9]/.test(char)) return 0.6;
  return sans ? 0.56 : 0.54;
}

export function estimateWidth(text, size, family = 'serif', letterSpacing = 0) {
  let em = 0;
  for (const char of String(text)) em += charWidth(char, family);
  return em * size + letterSpacing * Math.max(0, [...String(text)].length - 1);
}
