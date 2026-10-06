import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { estimateWidth } from './premiumQuoteDark.js';
import { buildDemoInfographicData, normalizeInfographicData } from '../services/infographicContent.js';

// Content template: educational_infographic
// Portrait 1080x1350 light, playful comparison infographic. Every panel is
// drawn from post.infographicData; the reference image is never embedded.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const outputDir = path.join(root, 'public', 'generated');
const uploadsDir = path.join(root, 'public', 'uploads');

const WIDTH = 1080;
const HEIGHT = 1350;
const COLORS = {
  background: '#f5f8fc',
  dot: '#dde6f2',
  ink: '#111827',
  body: '#374151',
  muted: '#6b7280',
  pink: '#ffd6e7',
  pinkStrong: '#ec4899',
  yellow: '#fff1a8',
  yellowNote: '#fff4b8',
  blue: '#e4eeff',
  blueStrong: '#3b82f6',
  navy: '#14213d',
  white: '#ffffff',
  line: '#e5e7eb',
  sticky: '#ffc9de'
};
const FONTS = {
  serif: "Georgia, 'Times New Roman', Times, serif",
  sans: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  hand: "'Segoe Print', 'Bradley Hand', 'Marker Felt', 'Comic Sans MS', cursive"
};

// Panel rectangles. Every text element is fitted inside the panel it belongs to.
export const REGIONS = {
  header: { x: 60, y: 40, w: 720, h: 110 },
  headline: { x: 60, y: 184, w: 650, h: 320 },
  photo: { x: 752, y: 196, w: 262, h: 300 },
  left: { x: 60, y: 524, w: 440, h: 376 },
  right: { x: 580, y: 524, w: 440, h: 376 },
  uses: { x: 60, y: 922, w: 960, h: 118 },
  example: { x: 60, y: 1060, w: 500, h: 212 },
  takeaways: { x: 580, y: 1060, w: 440, h: 212 },
  footer: { x: 60, y: 1288, w: 960, h: 48 }
};

export async function renderEducationalInfographic(content, options = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const photoDataUri = await readPhotoDataUri(options.uploadedImagePath);
  const svg = buildEducationalInfographicSvg(content, { ...options, photoDataUri });
  const filename = `${randomUUID()}-infographic.svg`;
  const filePath = path.join(outputDir, filename);
  await fs.writeFile(filePath, svg, 'utf8');
  const publicPath = `/generated/${filename}`;
  const publicUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5177'}${publicPath}`;
  return { filePath, publicPath, publicUrl };
}

export function buildEducationalInfographicSvg(content, options = {}) {
  const creatorName = cleanText(options.creatorName) || 'Creator';
  const handle = normalizeHandle(options.instagramHandle);
  // Always render from normalized data; posts without infographicData get demo data.
  const fallback = buildDemoInfographicData({ category: options.category, quote: content?.quote });
  const data = normalizeInfographicData(content?.infographicData, fallback);

  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="eduDots" width="26" height="26" patternUnits="userSpaceOnUse">
      <circle cx="3" cy="3" r="1.6" fill="${COLORS.dot}"/>
    </pattern>
    <filter id="eduShadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#1f2937" flood-opacity="0.12"/>
    </filter>
    <linearGradient id="eduPlaceholder" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#c7dcff"/>
      <stop offset="100%" stop-color="#ffc9de"/>
    </linearGradient>
    <clipPath id="eduPhotoClip"><rect x="${REGIONS.photo.x}" y="${REGIONS.photo.y}" width="${REGIONS.photo.w}" height="${REGIONS.photo.h}" rx="14"/></clipPath>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="${COLORS.background}"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#eduDots)"/>

  ${headerBlock(creatorName, data)}
  ${stickyNote(data.dayLabel)}
  ${headlineBlock(data)}
  ${photoBlock(options.photoDataUri, creatorName)}
  ${comparisonCard(REGIONS.left, data.leftBlock, 'left')}
  ${comparisonCard(REGIONS.right, data.rightBlock, 'right')}
  ${versusBadge()}
  ${useCasesRow(data)}
  ${exampleBlock(data.example)}
  ${takeawaysBlock(data.takeaways)}
  ${footerBlock(data.closingNote, handle)}
</svg>`;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

function headerBlock(creatorName, data) {
  const { x, y } = REGIONS.header;
  const brand = fitLine(creatorName.toUpperCase(), { font: 'sansBold', maxWidth: 700, sizes: [32, 20], spacing: 2 });
  const series = fitLine(data.seriesLabel, { font: 'sansBold', maxWidth: 640, sizes: [19, 13], spacing: 1.5 });
  const pillWidth = Math.round(measure(series.text, series.size, 'sansBold', 1.5) + 40);
  return `<g>
    ${text(brand.text, { x, y: y + 34, size: brand.size, font: 'sansBold', fill: COLORS.ink, spacing: 2, region: 'header' })}
    <rect x="${x}" y="${y + 56}" width="${pillWidth}" height="40" rx="20" fill="${COLORS.pink}"/>
    ${text(series.text, { x: x + 20, y: y + 83, size: series.size, font: 'sansBold', fill: COLORS.ink, spacing: 1.5, region: 'header' })}
  </g>`;
}

function stickyNote(dayLabel) {
  // e.g. "DAY 3 OF 7" -> "DAY 3" large + "of 7" small; the note is slightly rotated.
  const match = String(dayLabel).match(/^(.*?\d+)\s*(OF\s*\d+)?$/i);
  const main = fitLine(match ? match[1] : dayLabel, { font: 'hand', maxWidth: 150, sizes: [38, 18] });
  const sub = match && match[2] ? match[2].toLowerCase() : '';
  return `<g transform="rotate(4 920 104)" filter="url(#eduShadow)">
    <rect x="836" y="40" width="168" height="128" rx="6" fill="${COLORS.sticky}"/>
    <rect x="886" y="30" width="68" height="20" rx="3" fill="#ffffff" opacity="0.6"/>
    ${text(main.text, { x: 920, y: sub ? 108 : 118, size: main.size, font: 'hand', fill: COLORS.ink, anchor: 'middle', region: 'sticky' })}
    ${sub ? text(sub, { x: 920, y: 146, size: 22, font: 'hand', fill: COLORS.body, anchor: 'middle', region: 'sticky' }) : ''}
  </g>`;
}

function headlineBlock(data) {
  const { x, y, w, h } = REGIONS.headline;
  const headline = fitParagraph(data.headline, { font: 'serifBold', maxWidth: w - 10, maxLines: 3, sizes: [66, 38], lineHeight: 1.12 });
  const headLeading = Math.round(headline.size * 1.12);
  const firstBaseline = y + Math.round(headline.size * 0.94);
  const headBottom = firstBaseline + (headline.lines.length - 1) * headLeading + Math.round(headline.size * 0.28);
  const subTop = headBottom + 22;
  const sub = fitParagraph(data.subheadline, { font: 'serif', maxWidth: w - 10, maxLines: Math.max(1, Math.min(3, Math.floor((y + h - subTop) / 34))), sizes: [30, 20], lineHeight: 1.3 });
  const subLeading = Math.round(sub.size * 1.3);

  // Marker-style highlight strip behind the last headline line.
  const lastIndex = headline.lines.length - 1;
  const lastBaseline = firstBaseline + lastIndex * headLeading;
  const highlightWidth = Math.min(w, measure(headline.lines[lastIndex], headline.size, 'serifBold') + 18);
  const highlight = `<rect x="${x - 8}" y="${Math.round(lastBaseline - headline.size * 0.42)}" width="${Math.round(highlightWidth)}" height="${Math.round(headline.size * 0.52)}" rx="8" fill="${COLORS.yellow}"/>`;

  return `<g>
    ${highlight}
    ${headline.lines.map((line, index) => text(line, { x, y: firstBaseline + index * headLeading, size: headline.size, font: 'serifBold', fill: COLORS.ink, region: 'headline' })).join('\n    ')}
    ${sub.lines.map((line, index) => text(line, { x, y: subTop + Math.round(sub.size * 0.86) + index * subLeading, size: sub.size, font: 'serif', fill: COLORS.body, region: 'headline' })).join('\n    ')}
  </g>`;
}

function photoBlock(photoDataUri, creatorName) {
  const { x, y, w, h } = REGIONS.photo;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const inner = photoDataUri
    ? `<image href="${photoDataUri}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#eduPhotoClip)"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="url(#eduPlaceholder)"/>
      ${text(initials(creatorName), { x: cx, y: cy + 34, size: 96, font: 'serifBold', fill: COLORS.white, anchor: 'middle', region: 'photo' })}`;
  return `<g transform="rotate(2.5 ${cx} ${cy})">
    <rect x="${x - 10}" y="${y - 10}" width="${w + 20}" height="${h + 20}" rx="20" fill="${COLORS.white}" filter="url(#eduShadow)"/>
    ${inner}
  </g>`;
}

function comparisonCard(region, block, side) {
  const { x, y, w, h } = region;
  const isLeft = side === 'left';
  const fill = isLeft ? COLORS.blue : COLORS.pink;
  const strong = isLeft ? COLORS.blueStrong : COLORS.pinkStrong;
  const regionName = isLeft ? 'left' : 'right';
  const pad = 28;
  const titleX = x + pad + 64;
  const title = fitLine(block.title, { font: 'sansBold', maxWidth: w - (titleX - x) - pad, sizes: [32, 20] });
  const subtitle = fitLine(block.subtitle, { font: 'sans', maxWidth: w - (titleX - x) - pad, sizes: [19, 14] });
  const glyph = (block.title.match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase();

  // Bullet points: shared font size, up to 2 lines each, all within the card.
  const pointsTop = y + 136;
  const pointsBottom = y + h - 22;
  const bulletX = x + pad + 12;
  const textX = x + pad + 36;
  const points = fitGroup(block.points, { font: 'sans', maxWidth: x + w - pad - textX, maxLinesEach: 2, sizes: [25, 14], lineHeight: 1.28, gap: 14, maxHeight: pointsBottom - pointsTop });
  // Spread short lists out so the card doesn't end in a large empty area.
  const spare = pointsBottom - pointsTop - points.height;
  const gap = points.gap + Math.min(26, spare / Math.max(1, points.items.length));
  let cursor = pointsTop + Math.min(12, spare / 4);
  const pointMarkup = points.items.map((lines) => {
    const first = cursor + Math.round(points.size * 0.9);
    cursor += lines.length * points.leading + gap;
    return `${checkIcon(bulletX, first - Math.round(points.size * 0.34), strong)}
    ${lines.map((line, index) => text(line, { x: textX, y: first + index * points.leading, size: points.size, font: 'sans', fill: COLORS.ink, region: regionName })).join('\n    ')}`;
  }).join('\n    ');

  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="${fill}" filter="url(#eduShadow)"/>
    <circle cx="${x + pad + 26}" cy="${y + 56}" r="26" fill="${strong}"/>
    ${text(glyph, { x: x + pad + 26, y: y + 66, size: 26, font: 'sansBold', fill: COLORS.white, anchor: 'middle', region: regionName })}
    ${text(title.text, { x: titleX, y: y + 56, size: title.size, font: 'sansBold', fill: COLORS.ink, region: regionName })}
    ${text(subtitle.text, { x: titleX, y: y + 88, size: subtitle.size, font: 'sans', fill: COLORS.body, region: regionName })}
    <line x1="${x + pad}" y1="${y + 112}" x2="${x + w - pad}" y2="${y + 112}" stroke="${strong}" stroke-opacity="0.35" stroke-width="2" stroke-dasharray="6 6"/>
    ${pointMarkup}
  </g>`;
}

function versusBadge() {
  const cx = WIDTH / 2;
  const cy = REGIONS.left.y + REGIONS.left.h / 2;
  // Short "energy" strokes above and below the badge, kept inside the gap between the cards.
  const burst = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
    .map(([dx, dy]) => `<line x1="${cx + dx * 12}" y1="${cy + dy * 50}" x2="${cx + dx * 22}" y2="${cy + dy * 68}" stroke="${COLORS.ink}" stroke-width="4" stroke-linecap="round"/>`)
    .join('');
  return `<g>
    ${burst}
    <circle cx="${cx}" cy="${cy}" r="40" fill="${COLORS.navy}" stroke="${COLORS.white}" stroke-width="5"/>
    ${text('VS', { x: cx, y: cy + 11, size: 30, font: 'sansBold', fill: COLORS.white, anchor: 'middle', style: 'italic', region: 'vs' })}
  </g>`;
}

function useCasesRow(data) {
  const { x, y, w, h } = REGIONS.uses;
  const pad = 24;
  const title = fitLine(`Where ${data.rightBlock.title} helps`, { font: 'sansBold', maxWidth: w - pad * 2, sizes: [24, 16] });
  const items = data.useCases;
  const gap = 12;
  const chipY = y + 52;
  const chipH = h - 52 - 16;
  const chipW = (w - pad * 2 - gap * (items.length - 1)) / items.length;
  const fills = [COLORS.blue, COLORS.pink, COLORS.yellow];
  // One shared size for all chip labels, so the row looks even.
  const labelSize = Math.min(...items.map((item) => fitLine(item, { font: 'sansBold', maxWidth: chipW - 20, sizes: [20, 12] }).size));
  const chips = items.map((item, index) => {
    const cx = x + pad + index * (chipW + gap);
    const label = fitLine(item, { font: 'sansBold', maxWidth: chipW - 20, sizes: [labelSize, labelSize] });
    return `<rect x="${Math.round(cx)}" y="${chipY}" width="${Math.round(chipW)}" height="${chipH}" rx="14" fill="${fills[index % fills.length]}"/>
    ${text(label.text, { x: Math.round(cx + chipW / 2), y: chipY + chipH / 2 + Math.round(label.size * 0.36), size: label.size, font: 'sansBold', fill: COLORS.ink, anchor: 'middle', region: 'uses' })}`;
  }).join('\n    ');
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${COLORS.white}" stroke="${COLORS.line}" stroke-width="2"/>
    ${text(title.text, { x: x + pad, y: y + 36, size: title.size, font: 'sansBold', fill: COLORS.ink, region: 'uses' })}
    ${chips}
  </g>`;
}

function exampleBlock(example) {
  const { x, y, w, h } = REGIONS.example;
  const pad = 24;
  const boxY = y + 62;
  const boxH = h - 62 - pad;
  const inputBox = { x: x + pad, w: 186 };
  const outputBox = { x: x + pad + 186 + 46, w: w - pad * 2 - 186 - 46 };
  const input = fitParagraph(`“${example.input}”`, { font: 'serifItalic', maxWidth: inputBox.w - 28, maxLines: 4, sizes: [19, 13], lineHeight: 1.3 });
  const output = fitParagraph(example.output, { font: 'sansBold', maxWidth: outputBox.w - 28, maxLines: 4, sizes: [20, 13], lineHeight: 1.3 });
  const block = (fitted, box, font, fill) => {
    const leading = Math.round(fitted.size * 1.3);
    const top = boxY + (boxH - fitted.lines.length * leading) / 2;
    return fitted.lines.map((line, index) => text(line, { x: box.x + 14, y: Math.round(top + fitted.size * 0.9 + index * leading), size: fitted.size, font, fill, region: 'example' })).join('\n    ');
  };
  const arrowX = inputBox.x + inputBox.w + 10;
  const arrowY = boxY + boxH / 2;
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${COLORS.navy}" filter="url(#eduShadow)"/>
    <circle cx="${x + pad + 8}" cy="${y + 34}" r="7" fill="${COLORS.pinkStrong}"/>
    ${text('Real example', { x: x + pad + 26, y: y + 42, size: 24, font: 'sansBold', fill: COLORS.white, region: 'example' })}
    <rect x="${inputBox.x}" y="${boxY}" width="${inputBox.w}" height="${boxH}" rx="12" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="7 6"/>
    ${block(input, inputBox, 'serifItalic', '#e5e7eb')}
    <path d="M${arrowX} ${arrowY} H${arrowX + 26} M${arrowX + 16} ${arrowY - 9} L${arrowX + 26} ${arrowY} L${arrowX + 16} ${arrowY + 9}" fill="none" stroke="${COLORS.white}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="${outputBox.x}" y="${boxY}" width="${outputBox.w}" height="${boxH}" rx="12" fill="${COLORS.white}"/>
    ${block(output, outputBox, 'sansBold', COLORS.navy)}
  </g>`;
}

function takeawaysBlock(takeaways) {
  const { x, y, w, h } = REGIONS.takeaways;
  const pad = 24;
  const top = y + 64;
  const textX = x + pad + 36;
  const items = fitGroup(takeaways, { font: 'sans', maxWidth: x + w - pad - textX, maxLinesEach: 2, sizes: [20, 13], lineHeight: 1.28, gap: 10, maxHeight: y + h - 18 - top });
  let cursor = top;
  const markup = items.items.map((lines) => {
    const first = cursor + Math.round(items.size * 0.9);
    cursor += lines.length * items.leading + items.gap;
    return `${checkIcon(x + pad + 12, first - Math.round(items.size * 0.34), COLORS.ink)}
    ${lines.map((line, index) => text(line, { x: textX, y: first + index * items.leading, size: items.size, font: 'sans', fill: COLORS.ink, region: 'takeaways' })).join('\n    ')}`;
  }).join('\n    ');
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${COLORS.yellowNote}" filter="url(#eduShadow)"/>
    <rect x="${x + w / 2 - 40}" y="${y - 10}" width="80" height="22" rx="3" fill="#ffffff" opacity="0.7" transform="rotate(-3 ${x + w / 2} ${y})"/>
    ${text('Key takeaway', { x: x + pad, y: y + 44, size: 24, font: 'sansBold', fill: COLORS.ink, region: 'takeaways' })}
    ${markup}
  </g>`;
}

function footerBlock(closingNote, handle) {
  const { x, y, w } = REGIONS.footer;
  const handleFit = fitLine(handle, { font: 'sansBold', maxWidth: 320, sizes: [20, 14] });
  const handleWidth = measure(handleFit.text, handleFit.size, 'sansBold');
  const note = fitLine(`“${closingNote}”`, { font: 'serifItalic', maxWidth: w - handleWidth - 48, sizes: [22, 14] });
  return `<g>
    ${text(note.text, { x, y: y + 30, size: note.size, font: 'serifItalic', fill: COLORS.ink, region: 'footer' })}
    ${handle ? text(handleFit.text, { x: x + w, y: y + 30, size: handleFit.size, font: 'sansBold', fill: COLORS.pinkStrong, anchor: 'end', region: 'footer' }) : ''}
  </g>`;
}

function checkIcon(cx, cy, color) {
  return `<circle cx="${cx}" cy="${cy}" r="11" fill="${color}"/>
    <path d="M${cx - 5} ${cy} L${cx - 1.5} ${cy + 4} L${cx + 5.5} ${cy - 4}" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// ---------------------------------------------------------------------------
// Text fitting
// ---------------------------------------------------------------------------

// factor widens the shared width estimate for this module's fonts. The serif
// factors are deliberately generous: Georgia capitals (W, M) run wider than the
// estimate, and all-caps headlines must still stay inside their panel.
const FONT_STYLE = {
  serif: { family: 'serif', weight: '400', style: 'normal', factor: 1.06 },
  serifBold: { family: 'serif', weight: '700', style: 'normal', factor: 1.18 },
  serifItalic: { family: 'serif', weight: '400', style: 'italic', factor: 1 },
  sans: { family: 'sans', weight: '400', style: 'normal', factor: 1 },
  sansBold: { family: 'sans', weight: '700', style: 'normal', factor: 1.08 },
  hand: { family: 'sans', weight: '400', style: 'normal', factor: 1.18 }
};

function measure(value, size, font, spacing = 0) {
  const spec = FONT_STYLE[font];
  return estimateWidth(value, size, spec.family, spacing) * spec.factor;
}

function wrap(value, size, font, maxWidth) {
  const words = String(value).split(/\s+/).filter(Boolean).flatMap((word) => splitLongWord(word, size, font, maxWidth));
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, size, font) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function splitLongWord(word, size, font, maxWidth) {
  if (measure(word, size, font) <= maxWidth) return [word];
  const parts = [];
  let part = '';
  for (const char of word) {
    if (part && measure(part + char, size, font) > maxWidth) {
      parts.push(part);
      part = char;
    } else {
      part += char;
    }
  }
  if (part) parts.push(part);
  return parts;
}

function ellipsize(line, size, font, maxWidth) {
  let cut = line.replace(/[\s,;:.”]+$/, '');
  while (cut.length > 1 && measure(`${cut}…`, size, font) > maxWidth) cut = cut.slice(0, -1).trimEnd();
  return `${cut}…`;
}

// Largest size in [max, min] at which the text fits in maxLines; otherwise truncate at min.
function fitParagraph(value, { font, maxWidth, maxLines, sizes: [max, min] }) {
  for (let size = max; size >= min; size -= 1) {
    const lines = wrap(value, size, font, maxWidth);
    if (lines.length <= maxLines) return { size, lines };
  }
  const lines = wrap(value, min, font, maxWidth);
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = ellipsize(kept[maxLines - 1], min, font, maxWidth);
  return { size: min, lines: kept };
}

function fitLine(value, { font, maxWidth, sizes: [max, min], spacing = 0 }) {
  for (let size = max; size >= min; size -= 1) {
    if (measure(value, size, font, spacing) <= maxWidth) return { size, text: value };
  }
  let cut = String(value);
  while (cut.length > 1 && measure(`${cut}…`, min, font, spacing) > maxWidth) cut = cut.slice(0, -1);
  return { size: min, text: `${cut.trimEnd()}…` };
}

// Several short items (bullets) sharing one font size, all fitting maxHeight.
function fitGroup(values, { font, maxWidth, maxLinesEach, sizes: [max, min], lineHeight, gap, maxHeight }) {
  const layout = (size) => {
    const leading = Math.round(size * lineHeight);
    const items = values.map((value) => wrap(value, size, font, maxWidth));
    const height = items.reduce((sum, lines) => sum + Math.min(lines.length, maxLinesEach) * leading, 0) + gap * (values.length - 1);
    return { size, leading, items, height, fitsLines: items.every((lines) => lines.length <= maxLinesEach) };
  };
  let chosen = null;
  for (let size = max; size >= min; size -= 1) {
    chosen = layout(size);
    if (chosen.fitsLines && chosen.height <= maxHeight) break;
  }
  // At the minimum size, cap each item at maxLinesEach with an ellipsis, then drop
  // trailing items if the block is still too tall.
  chosen.items = chosen.items.map((lines) => {
    if (lines.length <= maxLinesEach) return lines;
    const kept = lines.slice(0, maxLinesEach);
    kept[maxLinesEach - 1] = ellipsize(kept[maxLinesEach - 1], chosen.size, font, maxWidth);
    return kept;
  });
  const heightOf = (items) => items.reduce((sum, lines) => sum + lines.length * chosen.leading, 0) + gap * (items.length - 1);
  while (chosen.items.length > 1 && heightOf(chosen.items) > maxHeight) chosen.items.pop();
  return { size: chosen.size, leading: chosen.leading, gap, items: chosen.items, height: heightOf(chosen.items) };
}

function text(value, { x, y, size, font, fill, anchor = 'start', spacing = 0, style, region }) {
  const spec = FONT_STYLE[font];
  const family = font === 'hand' ? FONTS.hand : spec.family === 'serif' ? FONTS.serif : FONTS.sans;
  return `<text x="${round(x)}" y="${round(y)}" font-family="${family}" font-size="${size}" font-weight="${spec.weight}"${(style || spec.style) !== 'normal' ? ` font-style="${style || spec.style}"` : ''}${spacing ? ` letter-spacing="${spacing}"` : ''}${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''} fill="${fill}" data-region="${region}">${escapeXml(value)}</text>`;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

// ---------------------------------------------------------------------------
// Photo loading (same containment rules as the other template modules)
// ---------------------------------------------------------------------------

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
