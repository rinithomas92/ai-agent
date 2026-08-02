import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { themes } from '../data/themes.js';

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
    styleVariant: Number(options.styleVariant || 0),
    theme: options.theme || 'minimalLight',
    creativePrompt: options.creativePrompt || ''
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

function detectKeywords(creativePrompt = '', category = '', tone = '') {
  const text = `${creativePrompt} ${category} ${tone}`.toLowerCase();
  const keywords = {};
  const list = ['dark', 'light', 'luxury', 'calm', 'bold', 'technology', 'nature', 'corporate', 'colourful', 'colorful', 'minimal', 'sunrise', 'desert', 'ocean', 'church', 'bible', 'biblical', 'scripture', 'verse', 'christian'];
  for (const kw of list) {
    keywords[kw] = text.includes(kw);
  }
  if (keywords.colorful) keywords.colourful = true;
  return keywords;
}

export function resolveThemeProperties(themeKey = 'minimalLight', creativePrompt = '', category = '', tone = '') {
  let resolvedTheme = themeKey;
  if (resolvedTheme === 'random') {
    const keys = Object.keys(themes);
    resolvedTheme = keys[Math.floor(Math.random() * keys.length)];
  }
  
  const base = { ...(themes[resolvedTheme] || themes.minimalLight) };
  const keywords = detectKeywords(creativePrompt, category, tone);

  // Apply overrides based on keywords
  if (keywords.dark) {
    base.bgStart = "#121212";
    base.bgEnd = "#050505";
    base.text = "#ffffff";
    if (base.border === "#cccccc" || base.border === "#000000") base.border = "#333333";
  }
  if (keywords.light) {
    base.bgStart = "#ffffff";
    base.bgEnd = "#f5f5f5";
    base.text = "#111111";
    if (base.border === "#333333") base.border = "#e0e0e0";
  }
  if (keywords.luxury) {
    base.accent = "#d4af37";
    base.border = "#d4af37";
  }
  if (keywords.bold) {
    base.fontFamily = "Impact, sans-serif";
  }

  // Set the background type
  if (keywords.technology) base.svgBackgroundType = "technology";
  else if (keywords.nature) base.svgBackgroundType = "nature";
  else if (keywords.corporate) base.svgBackgroundType = "corporate";
  else if (keywords.sunrise) base.svgBackgroundType = "sunrise";
  else if (keywords.desert) base.svgBackgroundType = "desert";
  else if (keywords.ocean) base.svgBackgroundType = "ocean";
  else if (keywords.church || keywords.bible || keywords.biblical || keywords.scripture || keywords.verse || keywords.christian) base.svgBackgroundType = "church";
  else if (keywords.luxury) base.svgBackgroundType = "luxury";
  else if (keywords.calm) base.svgBackgroundType = "wellness";
  else if (keywords.minimal) base.svgBackgroundType = "minimal";
  else if (keywords.bold) base.svgBackgroundType = "bold";

  return { properties: base, keywords };
}

function renderSvgBackground(resolved, options) {
  const { properties } = resolved;
  const accent = properties.accent;
  
  let shapes = '';
  
  if (properties.svgBackgroundType === 'technology') {
    shapes += `
      <!-- Grid pattern and glowing circles -->
      <defs>
        <pattern id="techGrid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="${accent}" stroke-width="0.5" opacity="0.12"/>
        </pattern>
      </defs>
      <rect width="1080" height="1350" fill="url(#techGrid)"/>
      <circle cx="800" cy="400" r="300" fill="${accent}" opacity="0.12" filter="blur(80px)"/>
      <circle cx="200" cy="1000" r="200" fill="${accent}" opacity="0.08" filter="blur(60px)"/>
      <line x1="100" y1="100" x2="300" y2="100" stroke="${accent}" stroke-width="1.5" opacity="0.3"/>
      <line x1="100" y1="100" x2="100" y2="300" stroke="${accent}" stroke-width="1.5" opacity="0.3"/>
    `;
  } else if (properties.svgBackgroundType === 'nature') {
    shapes += `
      <!-- Wave and leaf shapes -->
      <path d="M-100,1100 Q 200,900 600,1200 T 1180,1050 L 1180,1400 L -100,1400 Z" fill="${accent}" opacity="0.15"/>
      <path d="M-100,1200 Q 400,1100 800,1280 T 1180,1200 L 1180,1400 L -100,1400 Z" fill="${accent}" opacity="0.2"/>
      <path d="M 900,150 Q 800,250 900,350 Q 1000,250 900,150 Z" fill="none" stroke="${accent}" stroke-width="2" opacity="0.3"/>
      <line x1="900" y1="150" x2="900" y2="350" stroke="${accent}" stroke-width="1" opacity="0.2"/>
    `;
  } else if (properties.svgBackgroundType === 'corporate') {
    shapes += `
      <!-- Clean layout and professional lines -->
      <rect x="100" y="100" width="880" height="1150" fill="none" stroke="${accent}" stroke-width="1" opacity="0.1"/>
      <line x1="540" y1="100" x2="540" y2="1250" stroke="${accent}" stroke-width="0.5" opacity="0.15"/>
      <line x1="100" y1="675" x2="980" y2="675" stroke="${accent}" stroke-width="0.5" opacity="0.15"/>
      <circle cx="540" cy="675" r="8" fill="${accent}" opacity="0.4"/>
    `;
  } else if (properties.svgBackgroundType === 'sunrise') {
    shapes += `
      <!-- Sun circle and ray representations -->
      <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#fffb00" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="#ff7e5f" stop-opacity="0"/>
      </radialGradient>
      <circle cx="540" cy="450" r="300" fill="url(#sunGlow)"/>
      <circle cx="540" cy="450" r="150" fill="#fff9e6" opacity="0.2"/>
      <line x1="100" y1="750" x2="980" y2="750" stroke="${properties.text}" stroke-width="1" opacity="0.2"/>
      <line x1="200" y1="780" x2="880" y2="780" stroke="${properties.text}" stroke-width="1" opacity="0.15"/>
    `;
  } else if (properties.svgBackgroundType === 'desert') {
    shapes += `
      <!-- Dunes and sunset -->
      <circle cx="800" cy="250" r="80" fill="#ff7e5f" opacity="0.25"/>
      <path d="M-100,1200 Q 300,1050 700,1250 T 1180,1150 L 1180,1400 L -100,1400 Z" fill="${accent}" opacity="0.18"/>
      <path d="M-100,1260 Q 400,1180 800,1320 T 1180,1250 L 1180,1400 L -100,1400 Z" fill="${accent}" opacity="0.25"/>
    `;
  } else if (properties.svgBackgroundType === 'ocean') {
    shapes += `
      <!-- Ocean ripples and colors -->
      <path d="M-100,1150 C 200,1050 500,1250 800,1100 T 1180,1200 L 1180,1400 L -100,1400 Z" fill="${accent}" opacity="0.2"/>
      <path d="M-100,1220 C 300,1150 600,1300 900,1200 T 1180,1280 L 1180,1400 L -100,1400 Z" fill="${accent}" opacity="0.3"/>
      <circle cx="540" cy="-100" r="600" fill="none" stroke="${accent}" stroke-width="1" opacity="0.1"/>
      <circle cx="540" cy="-100" r="800" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.08"/>
    `;
  } else if (properties.svgBackgroundType === 'church') {
    shapes += `
      <!-- Church window, altar glow, and chapel arches -->
      <radialGradient id="chapelGlow" cx="50%" cy="72%" r="50%">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.38"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
      </radialGradient>
      <rect width="1080" height="1350" fill="#090b16" opacity="0.42"/>
      <circle cx="540" cy="940" r="420" fill="url(#chapelGlow)"/>
      <path d="M250 690 L250 370 Q250 180 540 180 Q830 180 830 370 L830 690 Z" fill="none" stroke="${accent}" stroke-width="5" opacity="0.34"/>
      <path d="M330 682 L330 410 Q330 260 540 260 Q750 260 750 410 L750 682 Z" fill="none" stroke="${accent}" stroke-width="2.5" opacity="0.28"/>
      <line x1="540" y1="202" x2="540" y2="682" stroke="${accent}" stroke-width="2" opacity="0.22"/>
      <line x1="316" y1="438" x2="764" y2="438" stroke="${accent}" stroke-width="2" opacity="0.2"/>
      <line x1="412" y1="690" x2="480" y2="890" stroke="${accent}" stroke-width="1.5" opacity="0.2"/>
      <line x1="668" y1="690" x2="600" y2="890" stroke="${accent}" stroke-width="1.5" opacity="0.2"/>
      <path d="M120 1140 Q540 1008 960 1140" fill="none" stroke="${accent}" stroke-width="2" opacity="0.22"/>
      <path d="M180 1210 Q540 1108 900 1210" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.16"/>
    `;
  } else if (properties.svgBackgroundType === 'luxury') {
    shapes += `
      <!-- Elegant gold borders -->
      <rect x="80" y="80" width="920" height="1190" fill="none" stroke="${accent}" stroke-width="1" opacity="0.2"/>
      <rect x="90" y="90" width="900" height="1170" fill="none" stroke="${accent}" stroke-width="1" opacity="0.1"/>
      <circle cx="80" cy="80" r="30" fill="none" stroke="${accent}" stroke-width="1" opacity="0.3"/>
      <circle cx="1000" cy="80" r="30" fill="none" stroke="${accent}" stroke-width="1" opacity="0.3"/>
      <circle cx="80" cy="1270" r="30" fill="none" stroke="${accent}" stroke-width="1" opacity="0.3"/>
      <circle cx="1000" cy="1270" r="30" fill="none" stroke="${accent}" stroke-width="1" opacity="0.3"/>
    `;
  } else if (properties.svgBackgroundType === 'wellness') {
    shapes += `
      <!-- Smooth zen shapes -->
      <circle cx="540" cy="675" r="450" fill="none" stroke="${accent}" stroke-width="1" opacity="0.15"/>
      <circle cx="540" cy="675" r="350" fill="none" stroke="${accent}" stroke-width="1" stroke-dasharray="8 8" opacity="0.2"/>
      <path d="M 150 150 A 100 100 0 0 1 350 150 Z" fill="${accent}" opacity="0.1" transform="rotate(-15 250 150)"/>
    `;
  } else if (properties.svgBackgroundType === 'bold') {
    shapes += `
      <!-- Bold dynamic lines -->
      <polygon points="0,0 350,0 0,700" fill="${accent}" opacity="0.18"/>
      <polygon points="1080,1350 730,1350 1080,650" fill="${accent}" opacity="0.18"/>
      <line x1="-100" y1="200" x2="1180" y2="1000" stroke="${accent}" stroke-width="4" opacity="0.15"/>
    `;
  } else {
    // minimal
    shapes += `
      <circle cx="790" cy="430" r="260" fill="${accent}" opacity="0.12"/>
      <line x1="120" y1="120" x2="220" y2="120" stroke="${accent}" stroke-width="2" opacity="0.4"/>
    `;
  }
  
  return `
    <rect width="1080" height="1350" fill="url(#bgGrad)"/>
    ${shapes}
  `;
}

function buildSvg(content, options) {
  const resolved = resolveThemeProperties(
    options.theme,
    `${options.creativePrompt || ''} ${options.backgroundDescription || ''}`,
    options.category,
    options.tone
  );
  const variant = options.styleVariant % 3;
  if (variant === 1) return buildMagazineCover(content, options, resolved);
  if (variant === 2) return buildQuotePortrait(content, options, resolved);
  return buildEditorialSplit(content, options, resolved);
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

function imageLayer(options, placement = 'right', resolved = null) {
  const image = options.portraitDataUri;
  if (!image) {
    if (resolved) {
      return renderSvgBackground(resolved, options);
    }
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

function buildEditorialSplit(content, options, resolved) {
  const { category, signature, handle } = brand(options);
  const lines = fitLines(content.quote, 17, 6);
  const baseFontSize = fitSize(lines.length, [57, 49, 42]);
  const fontSize = Math.round(baseFontSize * (resolved.properties.fontSizeMultiplier || 1.0));
  const leading = Math.round(fontSize * 1.26);
  const lineStart = (510 - lines.length * leading * 0.42) + (resolved.properties.quotePosOffset || 0);
  const tags = content.hashtags.slice(0, 3).join('  ');
  const categorySize = category.length > 18 ? 48 : 64;

  return `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${resolved.properties.bgStart}"/>
        <stop offset="100%" stop-color="${resolved.properties.bgEnd}"/>
      </linearGradient>
      <linearGradient id="shade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${resolved.properties.bgStart}" stop-opacity="1"/>
        <stop offset="50%" stop-color="${resolved.properties.bgEnd}" stop-opacity="0.88"/>
        <stop offset="100%" stop-color="${resolved.properties.bgEnd}" stop-opacity="0.18"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1350" fill="url(#bgGrad)"/>
    ${imageLayer(options, 'right', resolved)}
    <rect width="1080" height="1350" fill="url(#shade)"/>
    <rect x="64" y="64" width="952" height="1222" fill="none" stroke="${resolved.properties.border}" stroke-opacity="0.64" stroke-width="2"/>
    <text x="112" y="150" font-family="${resolved.properties.fontFamily}" font-size="${categorySize}" font-weight="700" fill="${resolved.properties.text}">${escapeHtml(category)}</text>
    <text x="114" y="202" font-family="${resolved.properties.fontFamily}" font-size="39" font-style="italic" fill="${resolved.properties.accent}">is important</text>
    <line x1="114" y1="246" x2="352" y2="246" stroke="${resolved.properties.accent}" stroke-width="4"/>
    <text x="112" y="356" font-family="${resolved.properties.fontFamily}" font-size="90" fill="${resolved.properties.accent}">"</text>
    ${textBlock(lines, { x: 112, y: lineStart, size: fontSize, leading, family: resolved.properties.fontFamily, fill: resolved.properties.text })}
    <text x="112" y="812" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="${resolved.properties.text}" opacity="0.8">BEAUTY - BODY - SOUL</text>
    <text x="112" y="914" font-family="${resolved.properties.fontFamily}" font-size="74" font-style="italic" fill="${resolved.properties.accent}">${escapeHtml(signature)}</text>
    <text x="112" y="962" font-family="Arial, Helvetica, sans-serif" font-size="24" letter-spacing="3" fill="${resolved.properties.text}">${escapeHtml(handle.toUpperCase())}</text>
    <text x="112" y="1182" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="${resolved.properties.accent}">${escapeHtml(tags)}</text>
  </svg>`;
}

function buildMagazineCover(content, options, resolved) {
  const { category, signature, handle } = brand(options);
  const lines = fitLines(content.quote, 18, 4);
  const baseFontSize = fitSize(lines.length, [43, 38, 34]);
  const fontSize = Math.round(baseFontSize * (resolved.properties.fontSizeMultiplier || 1.0));
  const leading = Math.round(fontSize * 1.22);
  const tags = content.hashtags.slice(0, 4).join('  ');
  const categorySize = category.length > 16 ? 70 : 96;
  const lineStart = 946 + (resolved.properties.quotePosOffset || 0);

  return `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${resolved.properties.bgStart}"/>
        <stop offset="100%" stop-color="${resolved.properties.bgEnd}"/>
      </linearGradient>
      <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${resolved.properties.bgEnd}" stop-opacity="0.72"/>
        <stop offset="44%" stop-color="${resolved.properties.bgEnd}" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="${resolved.properties.bgEnd}" stop-opacity="0.84"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1350" fill="url(#bgGrad)"/>
    ${imageLayer(options, 'full', resolved)}
    <rect width="1080" height="1350" fill="url(#topFade)"/>
    <rect x="54" y="54" width="972" height="1242" fill="none" stroke="${resolved.properties.border}" stroke-opacity="0.5" stroke-width="2"/>
    <text x="540" y="164" text-anchor="middle" font-family="${resolved.properties.fontFamily}" font-size="${categorySize}" font-weight="700" fill="${resolved.properties.text}">${escapeHtml(category)}</text>
    <text x="540" y="230" text-anchor="middle" font-family="${resolved.properties.fontFamily}" font-size="46" font-style="italic" fill="${resolved.properties.accent}">with ${escapeHtml(signature)}</text>
    <rect x="94" y="844" width="498" height="290" fill="${resolved.properties.bgStart}" fill-opacity="0.8"/>
    <line x1="128" y1="884" x2="254" y2="884" stroke="${resolved.properties.accent}" stroke-width="4"/>
    ${textBlock(lines, { x: 128, y: lineStart, size: fontSize, leading, family: resolved.properties.fontFamily, fill: resolved.properties.text })}
    <text x="128" y="1190" font-family="${resolved.properties.fontFamily}" font-size="60" font-style="italic" fill="${resolved.properties.accent}">${escapeHtml(signature)}</text>
    <text x="128" y="1235" font-family="Arial, Helvetica, sans-serif" font-size="22" letter-spacing="3" fill="${resolved.properties.text}">${escapeHtml(handle.toUpperCase())}</text>
    <text x="720" y="1236" font-family="Arial, Helvetica, sans-serif" font-size="22" text-anchor="middle" fill="${resolved.properties.accent}">${escapeHtml(tags)}</text>
  </svg>`;
}

function buildQuotePortrait(content, options, resolved) {
  const { category, signature, handle } = brand(options);
  const lines = fitLines(content.quote, 22, 3);
  const baseFontSize = fitSize(lines.length, [38, 35, 31]);
  const fontSize = Math.round(baseFontSize * (resolved.properties.fontSizeMultiplier || 1.0));
  const leading = Math.round(fontSize * 1.22);
  const tags = content.hashtags.slice(0, 3).join('  ');
  const categorySize = category.length > 18 ? 42 : 54;
  const lineStart = 1060 + (resolved.properties.quotePosOffset || 0);

  return `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${resolved.properties.bgStart}"/>
        <stop offset="100%" stop-color="${resolved.properties.bgEnd}"/>
      </linearGradient>
      <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="#000000" flood-opacity="0.46"/>
      </filter>
      <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${resolved.properties.bgStart}"/>
        <stop offset="100%" stop-color="${resolved.properties.bgEnd}"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="1350" fill="url(#bgGrad)"/>
    <rect x="48" y="48" width="984" height="1254" fill="${resolved.properties.bgEnd}" opacity="0.3"/>
    <g filter="url(#softShadow)">
      <rect x="128" y="172" width="824" height="892" fill="${resolved.properties.bgStart}"/>
      ${imageLayer(options, 'center', resolved)}
      <rect x="128" y="172" width="824" height="892" fill="${resolved.properties.bgEnd}" opacity="0.2"/>
    </g>
    <rect x="78" y="82" width="924" height="1186" fill="none" stroke="${resolved.properties.border}" stroke-opacity="0.56" stroke-width="2"/>
    <text x="540" y="144" text-anchor="middle" font-family="${resolved.properties.fontFamily}" font-size="${categorySize}" fill="${resolved.properties.text}">${escapeHtml(category)}</text>
    <rect x="118" y="934" width="844" height="288" fill="url(#paper)" fill-opacity="0.94"/>
    <text x="166" y="1004" font-family="${resolved.properties.fontFamily}" font-size="72" fill="${resolved.properties.accent}">"</text>
    ${textBlock(lines, { x: 166, y: lineStart, size: fontSize, leading, family: resolved.properties.fontFamily, fill: resolved.properties.text })}
    <text x="166" y="1188" font-family="${resolved.properties.fontFamily}" font-size="48" font-style="italic" fill="${resolved.properties.accent}">${escapeHtml(signature)}</text>
    <text x="790" y="1190" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="19" letter-spacing="2" fill="${resolved.properties.text}">${escapeHtml(handle.toUpperCase())}</text>
    <text x="540" y="1268" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="23" fill="${resolved.properties.accent}">${escapeHtml(tags)}</text>
  </svg>`;
}
