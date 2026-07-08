import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const outputDir = path.join(root, 'public', 'generated');

export async function createQuoteCard(content, options = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const id = randomUUID();
  const filename = `${id}.svg`;
  const filePath = path.join(outputDir, filename);
  const portraitDataUri = await readPublicImageAsDataUri(options.uploadedImagePath);
  const svg = buildSvg(content, {
    category: options.category || 'Daily Quote',
    creatorName: options.creatorName || 'Rini',
    instagramHandle: options.instagramHandle || '@getholisticallyfitwithrini',
    backgroundDescription: options.backgroundDescription || '',
    portraitDataUri,
    styleVariant: Number(options.styleVariant || 0)
  });
  await fs.writeFile(filePath, svg, 'utf8');
  const publicPath = `/generated/${filename}`;
  const publicUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5177'}${publicPath}`;
  return { filePath, publicPath, publicUrl };
}

async function readPublicImageAsDataUri(publicPath) {
  if (!publicPath || !publicPath.startsWith('/uploads/')) return null;
  const filePath = path.join(root, 'public', publicPath.replace(/^\//, ''));
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const buffer = await fs.readFile(filePath);
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function wrapWords(text, maxLength) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 7);
}

function fitLines(text, maxLength, maxLines) {
  const lines = wrapWords(text, maxLength);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = `${kept[maxLines - 1].replace(/[.,;:!?]+$/, '')}...`;
  return kept;
}

function textBlock(lines, { x, y, size, leading, family = 'Georgia, serif', weight = '700', fill = '#fffaf0', anchor = 'start', style = '' }) {
  return lines.map((line, index) => `
    <text x="${x}" y="${y + index * leading}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" font-weight="${weight}" ${style ? `font-style="${style}"` : ''} fill="${fill}">${escapeHtml(line)}</text>
  `).join('');
}

function fitSize(lineCount, sizes) {
  if (lineCount <= 3) return sizes[0];
  if (lineCount <= 5) return sizes[1];
  return sizes[2];
}

function buildSvg(content, options) {
  const variant = options.styleVariant % 3;
  if (variant === 1) return buildMagazineCover(content, options);
  if (variant === 2) return buildQuotePortrait(content, options);
  return buildEditorialSplit(content, options);
}

function brand(options) {
  return {
    category: options.category.toUpperCase(),
    signature: options.creatorName,
    handle: options.instagramHandle.startsWith('@') ? options.instagramHandle : `@${options.instagramHandle}`
  };
}

function backgroundNote(options) {
  const raw = options.backgroundDescription.trim();
  if (!raw) return 'warm editorial wellness background';
  return raw.length > 86 ? `${raw.slice(0, 83).trim()}...` : raw;
}

function imageLayer(options, placement = 'right') {
  const image = options.portraitDataUri;
  if (!image) {
    return `
      <rect width="1080" height="1350" fill="#15100c"/>
      <circle cx="790" cy="430" r="260" fill="#c7a45a" opacity="0.18"/>
      <text x="790" y="502" text-anchor="middle" font-family="Georgia, serif" font-size="128" fill="#f7ead0" opacity="0.34">${escapeHtml(options.creatorName.slice(0, 1).toUpperCase())}</text>
      <text x="790" y="586" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#e7c878" opacity="0.72">${escapeHtml(backgroundNote(options))}</text>
    `;
  }
  const map = {
    right: '<image href="' + image + '" x="360" y="0" width="860" height="1350" preserveAspectRatio="xMidYMid slice"/>',
    full: '<image href="' + image + '" x="0" y="0" width="1080" height="1350" preserveAspectRatio="xMidYMid slice"/>',
    center: '<image href="' + image + '" x="128" y="214" width="824" height="914" preserveAspectRatio="xMidYMid slice"/>'
  };
  return map[placement];
}

function buildEditorialSplit(content, options) {
  const { category, signature, handle } = brand(options);
  const lines = fitLines(content.quote, 17, 6);
  const fontSize = fitSize(lines.length, [57, 49, 42]);
  const leading = Math.round(fontSize * 1.26);
  const lineStart = 510 - lines.length * leading * 0.42;
  const tags = content.hashtags.slice(0, 3).join('  ');
  const categorySize = category.length > 18 ? 48 : 64;

  return `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#050403" stop-opacity="1"/>
        <stop offset="0.50" stop-color="#0b0805" stop-opacity="0.88"/>
        <stop offset="1" stop-color="#0b0805" stop-opacity="0.18"/>
      </linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#f6e4b3"/>
        <stop offset="1" stop-color="#b58a38"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1350" fill="#080605"/>
    ${imageLayer(options, 'right')}
    <rect width="1080" height="1350" fill="url(#shade)"/>
    <rect x="64" y="64" width="952" height="1222" fill="none" stroke="#d9b86a" stroke-opacity="0.64" stroke-width="2"/>
    <text x="112" y="150" font-family="Georgia, serif" font-size="${categorySize}" font-weight="700" fill="#fff9ef">${escapeHtml(category)}</text>
    <text x="114" y="202" font-family="Georgia, serif" font-size="39" font-style="italic" fill="#d9b86a">is important</text>
    <line x1="114" y1="246" x2="352" y2="246" stroke="url(#gold)" stroke-width="4"/>
    <text x="112" y="356" font-family="Georgia, serif" font-size="90" fill="#f6e4b3">"</text>
    ${textBlock(lines, { x: 112, y: lineStart, size: fontSize, leading })}
    <text x="112" y="812" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#eee1cc" opacity="0.92">BEAUTY - BODY - SOUL</text>
    <text x="112" y="914" font-family="Georgia, serif" font-size="74" font-style="italic" fill="#f7e8bd">${escapeHtml(signature)}</text>
    <text x="112" y="962" font-family="Arial, Helvetica, sans-serif" font-size="24" letter-spacing="3" fill="#fff8e8">${escapeHtml(handle.toUpperCase())}</text>
    <text x="112" y="1182" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#d9b86a">${escapeHtml(tags)}</text>
  </svg>`;
}

function buildMagazineCover(content, options) {
  const { category, signature, handle } = brand(options);
  const lines = fitLines(content.quote, 18, 4);
  const fontSize = fitSize(lines.length, [43, 38, 34]);
  const leading = Math.round(fontSize * 1.22);
  const tags = content.hashtags.slice(0, 4).join('  ');
  const categorySize = category.length > 16 ? 70 : 96;

  return `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#060504" stop-opacity="0.72"/>
        <stop offset="0.44" stop-color="#060504" stop-opacity="0.16"/>
        <stop offset="1" stop-color="#060504" stop-opacity="0.84"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1350" fill="#0a0806"/>
    ${imageLayer(options, 'full')}
    <rect width="1080" height="1350" fill="url(#topFade)"/>
    <rect x="54" y="54" width="972" height="1242" fill="none" stroke="#f0d490" stroke-opacity="0.5" stroke-width="2"/>
    <text x="540" y="164" text-anchor="middle" font-family="Georgia, serif" font-size="${categorySize}" font-weight="700" fill="#fffaf0">${escapeHtml(category)}</text>
    <text x="540" y="230" text-anchor="middle" font-family="Georgia, serif" font-size="46" font-style="italic" fill="#ddb45e">with ${escapeHtml(signature)}</text>
    <rect x="94" y="844" width="498" height="290" fill="#080604" fill-opacity="0.66"/>
    <line x1="128" y1="884" x2="254" y2="884" stroke="#e7c878" stroke-width="4"/>
    ${textBlock(lines, { x: 128, y: 946, size: fontSize, leading, fill: '#fff9ef' })}
    <text x="128" y="1190" font-family="Georgia, serif" font-size="60" font-style="italic" fill="#f5dfac">${escapeHtml(signature)}</text>
    <text x="128" y="1235" font-family="Arial, Helvetica, sans-serif" font-size="22" letter-spacing="3" fill="#ffffff">${escapeHtml(handle.toUpperCase())}</text>
    <text x="720" y="1236" font-family="Arial, Helvetica, sans-serif" font-size="22" text-anchor="middle" fill="#f0d490">${escapeHtml(tags)}</text>
  </svg>`;
}

function buildQuotePortrait(content, options) {
  const { category, signature, handle } = brand(options);
  const lines = fitLines(content.quote, 22, 3);
  const fontSize = fitSize(lines.length, [38, 35, 31]);
  const leading = Math.round(fontSize * 1.22);
  const tags = content.hashtags.slice(0, 3).join('  ');
  const categorySize = category.length > 18 ? 42 : 54;

  return `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="#000000" flood-opacity="0.46"/>
      </filter>
      <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#fbf1de"/>
        <stop offset="1" stop-color="#cfaa61"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1350" fill="#0b0805"/>
    <rect x="48" y="48" width="984" height="1254" fill="#130f0b"/>
    <g filter="url(#softShadow)">
      <rect x="128" y="172" width="824" height="892" fill="#211a12"/>
      ${imageLayer(options, 'center')}
      <rect x="128" y="172" width="824" height="892" fill="#0b0805" opacity="0.2"/>
    </g>
    <rect x="78" y="82" width="924" height="1186" fill="none" stroke="#e7c878" stroke-opacity="0.56" stroke-width="2"/>
    <text x="540" y="144" text-anchor="middle" font-family="Georgia, serif" font-size="${categorySize}" fill="#fff9ef">${escapeHtml(category)}</text>
    <rect x="118" y="934" width="844" height="288" fill="url(#paper)" fill-opacity="0.94"/>
    <text x="166" y="1004" font-family="Georgia, serif" font-size="72" fill="#4b321b">"</text>
    ${textBlock(lines, { x: 166, y: 1060, size: fontSize, leading, fill: '#2f2115' })}
    <text x="166" y="1188" font-family="Georgia, serif" font-size="48" font-style="italic" fill="#5b3a1d">${escapeHtml(signature)}</text>
    <text x="790" y="1190" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="19" letter-spacing="2" fill="#4b321b">${escapeHtml(handle.toUpperCase())}</text>
    <text x="540" y="1268" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="23" fill="#e7c878">${escapeHtml(tags)}</text>
  </svg>`;
}
