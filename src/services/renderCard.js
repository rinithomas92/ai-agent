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
    creativePrompt: options.creativePrompt || '',
    openAiPrompt: options.openAiPrompt || ''
  });
  
  await fs.writeFile(filePath, svg, 'utf8');
  const publicPath = `/generated/${filename}`;
  const publicUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5177'}${publicPath}`;
  return { filePath, publicPath, publicUrl };
}

export async function createPhotoQuoteCard(content, options = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const id = randomUUID();
  const filename = `${id}-photo.svg`;
  const filePath = path.join(outputDir, filename);
  const backgroundDataUri = await readPublicImageAsDataUri(options.backgroundImagePath, ['/generated/']);
  const portraitDataUri = await readPublicImageAsDataUri(options.uploadedImagePath);
  const { reference, verse } = splitReferenceQuote(content.quote);
  const quoteText = reference ? verse.replace(/^"+|"+$/g, '') : content.quote;
  const lines = fitLines(quoteText, 18, 7);
  const fontSize = Math.round(fitSize(lines.length, [40, 35, 30]) * 0.96);
  const leading = Math.round(fontSize * 1.36);
  const lineStart = 548 - Math.max(0, lines.length - 4) * 16;
  const signature = escapeHtml(options.creatorName || 'Rini');
  const handle = escapeHtml((options.instagramHandle || '@getholisticallyfitwithrini').startsWith('@')
    ? options.instagramHandle
    : `@${options.instagramHandle}`);
  const accent = '#ead0ad';
  const title = escapeHtml(options.category || 'Daily Quote');
  const isChurchPhoto = /\b(church|cathedral|chapel|stained glass|candle|cross)\b/i
    .test(`${options.backgroundDescription || ''} ${options.creativePrompt || ''} ${options.openAiPrompt || ''} ${options.category || ''}`);

  const portraitLayer = portraitDataUri ? `
    <defs>
      <linearGradient id="photoHumanFade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="white" stop-opacity="1"/>
        <stop offset="72%" stop-color="white" stop-opacity="1"/>
        <stop offset="92%" stop-color="white" stop-opacity="0.46"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="photoPortraitVignette" cx="50%" cy="44%" r="74%">
        <stop offset="0%" stop-color="white" stop-opacity="0.92"/>
        <stop offset="54%" stop-color="white" stop-opacity="0.8"/>
        <stop offset="82%" stop-color="white" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="portraitWarmBlend" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f0c083" stop-opacity="0.14"/>
        <stop offset="58%" stop-color="#2b170d" stop-opacity="0.08"/>
        <stop offset="100%" stop-color="#050302" stop-opacity="0.32"/>
      </linearGradient>
      <mask id="photoHumanMask">
        ${isChurchPhoto
          ? '<ellipse cx="264" cy="742" rx="252" ry="430" fill="url(#photoPortraitVignette)"/>'
          : '<rect x="-80" y="0" width="780" height="1350" fill="url(#photoHumanFade)"/>'}
      </mask>
      <filter id="photoHumanGrade">
        <feColorMatrix type="matrix" values="1.02 0 0 0 0.018  0 0.98 0 0 0.01  0 0 0.88 0 0  0 0 0 1 0"/>
        <feDropShadow dx="0" dy="18" stdDeviation="30" flood-color="#000000" flood-opacity="0.26"/>
      </filter>
    </defs>
    <g mask="url(#photoHumanMask)">
      <image href="${portraitDataUri}" x="${isChurchPhoto ? '6' : '-92'}" y="${isChurchPhoto ? '360' : '0'}" width="${isChurchPhoto ? '520' : '780'}" height="${isChurchPhoto ? '800' : '1350'}" preserveAspectRatio="xMidYMid slice" filter="url(#photoHumanGrade)" opacity="${isChurchPhoto ? '0.72' : '1'}"/>
      <rect x="${isChurchPhoto ? '6' : '-92'}" y="${isChurchPhoto ? '360' : '0'}" width="${isChurchPhoto ? '520' : '780'}" height="${isChurchPhoto ? '800' : '1350'}" fill="url(#portraitWarmBlend)" opacity="${isChurchPhoto ? '0.92' : '0.08'}"/>
    </g>
    ${isChurchPhoto ? '<ellipse cx="264" cy="780" rx="238" ry="392" fill="#d9a55d" opacity="0.035"/>' : ''}
  ` : '';

  const svg = `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="photoShade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#070403" stop-opacity="${portraitDataUri && isChurchPhoto ? '0.04' : portraitDataUri ? '0.05' : '0.24'}"/>
        <stop offset="48%" stop-color="#070403" stop-opacity="${portraitDataUri && isChurchPhoto ? '0.12' : portraitDataUri ? '0.32' : '0.18'}"/>
        <stop offset="100%" stop-color="#070403" stop-opacity="${isChurchPhoto ? '0.64' : '0.76'}"/>
      </linearGradient>
      <linearGradient id="photoTopBottom" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#070403" stop-opacity="${isChurchPhoto ? '0.12' : '0.28'}"/>
        <stop offset="46%" stop-color="#070403" stop-opacity="0.02"/>
        <stop offset="100%" stop-color="#070403" stop-opacity="${isChurchPhoto ? '0.22' : '0.42'}"/>
      </linearGradient>
      <filter id="photoTextShadow">
        <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000000" flood-opacity="0.68"/>
      </filter>
    </defs>
    <rect width="1080" height="1350" fill="#120b08"/>
    ${backgroundDataUri ? `<image href="${backgroundDataUri}" x="0" y="0" width="1080" height="1350" preserveAspectRatio="xMidYMid slice"/>` : renderObviousChurchScene(accent, options)}
    <rect width="1080" height="1350" fill="url(#photoShade)"/>
    <rect width="1080" height="1350" fill="url(#photoTopBottom)"/>
    ${portraitLayer}
    <rect x="64" y="64" width="952" height="1222" fill="none" stroke="${accent}" stroke-opacity="0.42" stroke-width="2"/>
    <text x="820" y="176" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" letter-spacing="4" fill="${accent}" opacity="0.9" filter="url(#photoTextShadow)">${title.toUpperCase()}</text>
    ${reference ? `<text x="820" y="344" text-anchor="middle" font-family="Georgia, serif" font-size="38" fill="#fff5e8" filter="url(#photoTextShadow)">${escapeHtml(reference)}</text>` : ''}
    <line x1="704" y1="400" x2="792" y2="400" stroke="${accent}" stroke-width="2" opacity="0.78"/>
    <text x="820" y="410" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="${accent}" opacity="0.9">+</text>
    <line x1="848" y1="400" x2="936" y2="400" stroke="${accent}" stroke-width="2" opacity="0.78"/>
    <text x="820" y="${lineStart - 34}" text-anchor="middle" font-family="Georgia, serif" font-size="46" fill="#fff7ef" filter="url(#photoTextShadow)">"</text>
    ${textBlock(lines, { x: 820, y: lineStart, size: fontSize, leading, anchor: 'middle', family: 'Georgia, serif', weight: '400', fill: '#fff7ef' })}
    <text x="820" y="${lineStart + lines.length * leading + 18}" text-anchor="middle" font-family="Georgia, serif" font-size="46" fill="#fff7ef" filter="url(#photoTextShadow)">"</text>
    <text x="820" y="1048" text-anchor="middle" font-family="Georgia, serif" font-size="76" font-style="italic" fill="#fff1dc" filter="url(#photoTextShadow)">${signature}</text>
    <line x1="746" y1="1080" x2="804" y2="1080" stroke="${accent}" stroke-width="2" opacity="0.6"/>
    <text x="820" y="1089" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="${accent}" opacity="0.8">v</text>
    <line x1="836" y1="1080" x2="894" y2="1080" stroke="${accent}" stroke-width="2" opacity="0.6"/>
    <text x="820" y="1138" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="21" fill="#f3ddc1" opacity="0.9">${handle}</text>
  </svg>`;

  await fs.writeFile(filePath, svg, 'utf8');
  const publicPath = `/generated/${filename}`;
  const publicUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5177'}${publicPath}`;
  return { filePath, publicPath, publicUrl };
}

async function readPublicImageAsDataUri(publicPath, allowedPrefixes = ['/uploads/']) {
  if (!publicPath || !allowedPrefixes.some((prefix) => publicPath.startsWith(prefix))) return null;
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

function visualTextFromOpenAiPrompt(openAiPrompt = '') {
  const text = String(openAiPrompt || '');
  if (!/\b(background|scene|setting|visual|image|photo|portrait|merge|merged|blend|blended|church|beach|ocean|forest|garden|mountain|city|street|cafe|library|office|gym|temple|palace|hotel|studio|window|candle|gold|rain|moon|waterfall|rinism|psychology|validation|logo|save|share|like|follow)\b/i.test(text)) {
    return '';
  }
  return text;
}

function detectKeywords(creativePrompt = '', category = '', tone = '', backgroundDescription = '', openAiPrompt = '') {
  const text = `${creativePrompt} ${backgroundDescription} ${visualTextFromOpenAiPrompt(openAiPrompt)} ${category} ${tone}`.toLowerCase();
  const keywords = {};
  const list = [
    'dark', 'light', 'luxury', 'calm', 'bold', 'technology', 'nature', 'corporate',
    'colourful', 'colorful', 'minimal', 'sunrise', 'desert', 'ocean', 'sea', 'beach',
    'forest', 'garden', 'mountain', 'city', 'skyline', 'night', 'cafe', 'coffee',
    'library', 'books', 'office', 'classroom', 'school', 'gym', 'fitness', 'temple',
    'church', 'bible', 'biblical', 'scripture', 'verse', 'christian', 'background',
    'palace', 'hotel', 'bedroom', 'kitchen', 'restaurant', 'studio', 'paris', 'london',
    'street', 'rain', 'flowers', 'floral', 'snow', 'waterfall', 'lake', 'river', 'field',
    'meadow', 'moon', 'space', 'galaxy', 'gold', 'candle', 'window', 'cinematic',
    'rinism', 'psychology', 'validation', 'save', 'share', 'like', 'follow', 'logo'
  ];
  for (const kw of list) {
    keywords[kw] = text.includes(kw);
  }
  if (keywords.colorful) keywords.colourful = true;
  return keywords;
}

export function resolveThemeProperties(themeKey = 'minimalLight', creativePrompt = '', category = '', tone = '', backgroundDescription = '', openAiPrompt = '') {
  let resolvedTheme = themeKey;
  if (resolvedTheme === 'random') {
    const keys = Object.keys(themes);
    resolvedTheme = keys[Math.floor(Math.random() * keys.length)];
  }
  
  const base = { ...(themes[resolvedTheme] || themes.minimalLight) };
  const keywords = detectKeywords(creativePrompt, category, tone, backgroundDescription, openAiPrompt);
  const hasVisualPrompt = Boolean(`${backgroundDescription || ''} ${visualTextFromOpenAiPrompt(openAiPrompt)}`.trim());

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
  if (keywords.rinism || keywords.psychology || keywords.validation || (keywords.gold && keywords.logo)) base.svgBackgroundType = "rinism";
  else if (keywords.nature) base.svgBackgroundType = "nature";
  else if (keywords.corporate) base.svgBackgroundType = "corporate";
  else if (keywords.sunrise) base.svgBackgroundType = "sunrise";
  else if (keywords.desert) base.svgBackgroundType = "desert";
  else if (keywords.ocean || keywords.sea || keywords.beach) base.svgBackgroundType = "beach";
  else if (keywords.forest || keywords.garden) base.svgBackgroundType = "forest";
  else if (keywords.mountain) base.svgBackgroundType = "mountain";
  else if (keywords.city || keywords.skyline) base.svgBackgroundType = "city";
  else if (keywords.cafe || keywords.coffee) base.svgBackgroundType = "cafe";
  else if (keywords.library || keywords.books) base.svgBackgroundType = "library";
  else if (keywords.office || keywords.classroom || keywords.school) base.svgBackgroundType = "office";
  else if (keywords.gym || keywords.fitness) base.svgBackgroundType = "gym";
  else if (keywords.church || keywords.bible || keywords.biblical || keywords.scripture || keywords.verse || keywords.christian) base.svgBackgroundType = "church";
  else if (keywords.temple) base.svgBackgroundType = "temple";
  else if (keywords.luxury) base.svgBackgroundType = "luxury";
  else if (keywords.calm) base.svgBackgroundType = "wellness";
  else if (keywords.minimal) base.svgBackgroundType = "minimal";
  else if (keywords.bold) base.svgBackgroundType = "bold";
  else if (keywords.background || hasVisualPrompt) base.svgBackgroundType = "custom";

  if (['church', 'temple', 'library', 'cafe', 'city', 'beach', 'forest', 'mountain', 'office', 'gym', 'custom', 'rinism'].includes(base.svgBackgroundType)) {
    base.bgStart = "#090817";
    base.bgEnd = "#02030a";
    base.text = "#fff7df";
    base.accent = "#d9a55d";
    base.border = "#d9a55d";
    base.fontFamily = "Georgia, serif";
    base.fontSizeMultiplier = Math.max(base.fontSizeMultiplier || 1, 1.0);
  }

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
  } else if (['beach', 'forest', 'mountain', 'city', 'cafe', 'library', 'office', 'gym', 'temple', 'custom'].includes(properties.svgBackgroundType)) {
    shapes += renderSpecifiedBackground(properties.svgBackgroundType, accent, options);
  } else if (properties.svgBackgroundType === 'church') {
    shapes += renderChurchBackground(accent, options);
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
    options.creativePrompt || '',
    options.category,
    options.tone,
    options.backgroundDescription || '',
    options.openAiPrompt || ''
  );
  if (resolved.properties.svgBackgroundType === 'rinism') {
    return buildRinismPsychologyPost(content, options);
  }
  if (resolved.properties.svgBackgroundType === 'church' && options.portraitDataUri) {
    return buildPremiumScripturePortraitV2(content, options, resolved);
  }
  if (resolved.properties.svgBackgroundType === 'church') {
    return buildPremiumChurchPost(content, options, resolved);
  }
  if (options.portraitDataUri && shouldKeepPromptedBackgroundVisible(options, resolved)) {
    return buildPremiumScenePortrait(content, options, resolved);
  }
  const variant = options.styleVariant % 3;
  if (variant === 1) return buildMagazineCover(content, options, resolved);
  if (variant === 2) return buildQuotePortrait(content, options, resolved);
  return buildEditorialSplit(content, options, resolved);
}

function buildRinismPsychologyPost(content, options) {
  const { signature, handle } = brand(options);
  const quote = String(content.quote || '').replace(/^["]+|["]+$/g, '');
  const lines = fitLines(quote, 28, 12);
  const fontSize = lines.length > 9 ? 39 : lines.length > 7 ? 45 : 52;
  const leading = Math.round(fontSize * 1.18);
  const gold = '#c98b3c';
  const ivory = '#fff6ea';
  const muted = '#8f8a83';
  const profile = options.portraitDataUri;
  const displayName = escapeHtml(signature || 'Rinism');
  const brandLine = escapeHtml(`${signature || 'RINISM'}  -  PSYCHOLOGY`.toUpperCase());
  const quoteY = 390;
  const signatureY = Math.min(1050, quoteY + lines.length * leading + 54);

  const profileBlock = profile ? `
    <defs>
      <clipPath id="rinismProfileClip">
        <circle cx="158" cy="218" r="103"/>
      </clipPath>
      <filter id="softGlow">
        <feDropShadow dx="0" dy="0" stdDeviation="7" flood-color="${gold}" flood-opacity="0.45"/>
      </filter>
    </defs>
    <circle cx="158" cy="218" r="112" fill="none" stroke="${gold}" stroke-width="4" filter="url(#softGlow)"/>
    <image href="${profile}" x="55" y="115" width="206" height="206" preserveAspectRatio="xMidYMid slice" clip-path="url(#rinismProfileClip)"/>
    <path d="M248 118 L259 142 L285 145 L264 161 L270 187 L248 173 L226 187 L232 161 L211 145 L237 142 Z" fill="#fff2d0"/>
  ` : `
    <circle cx="158" cy="218" r="112" fill="#17110c" stroke="${gold}" stroke-width="4"/>
    <text x="158" y="242" text-anchor="middle" font-family="Georgia, serif" font-size="88" fill="${gold}">${escapeHtml((signature || 'R').slice(0, 1).toUpperCase())}</text>
  `;

  return `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="rinismShadow">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.75"/>
      </filter>
      <pattern id="grain" width="60" height="60" patternUnits="userSpaceOnUse">
        <rect width="60" height="60" fill="#050505"/>
        <circle cx="9" cy="12" r="1" fill="#1b1712" opacity="0.55"/>
        <circle cx="42" cy="35" r="1.2" fill="#18130f" opacity="0.45"/>
        <circle cx="24" cy="51" r="0.8" fill="#21170f" opacity="0.35"/>
      </pattern>
    </defs>
    <rect width="1080" height="1350" fill="#050505"/>
    <rect width="1080" height="1350" fill="url(#grain)" opacity="0.7"/>
    <rect x="12" y="12" width="1056" height="1326" rx="20" fill="none" stroke="${gold}" stroke-width="2"/>
    <text x="56" y="76" font-family="Georgia, serif" font-size="20" letter-spacing="12" fill="${gold}">${brandLine}</text>
    ${profileBlock}
    <text x="305" y="225" font-family="Georgia, serif" font-size="56" fill="${ivory}" filter="url(#rinismShadow)">${displayName}</text>
    <g transform="translate(466 190)">
      <circle cx="22" cy="22" r="21" fill="#2f80ed"/>
      <path d="M13 22 L19 28 L32 15" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
    <text x="306" y="268" font-family="Georgia, serif" font-size="30" fill="${muted}">${escapeHtml(handle)}</text>
    ${rinismQuoteBlock(lines, { x: 64, y: quoteY, size: fontSize, leading, ivory, gold })}
    <text x="64" y="${signatureY}" font-family="Georgia, serif" font-size="25" fill="${gold}">-- ${escapeHtml(signature || 'Rini')}</text>
    <line x1="64" y1="${signatureY + 42}" x2="198" y2="${signatureY + 42}" stroke="${gold}" stroke-width="2"/>
    <path d="M232 ${signatureY + 42} L240 ${signatureY + 20} L248 ${signatureY + 42} L270 ${signatureY + 50} L248 ${signatureY + 58} L240 ${signatureY + 80} L232 ${signatureY + 58} L210 ${signatureY + 50} Z" fill="${gold}"/>
    <line x1="292" y1="${signatureY + 42}" x2="398" y2="${signatureY + 42}" stroke="${gold}" stroke-width="2"/>
    <text x="112" y="${signatureY + 120}" font-family="Georgia, serif" font-size="64" font-style="italic" fill="${gold}">${escapeHtml(signature || 'Rini')}</text>
    ${rinismActionRow(gold)}
  </svg>`;
}

function rinismQuoteBlock(lines, { x, y, size, leading, ivory, gold }) {
  const highlight = /\b(strongest|win|validation|understand|healing|peace|worth|power|boundaries|confidence|self-respect|respect)\b/i;
  return lines.map((line, index) => {
    const words = line.split(/\s+/);
    let cursor = x;
    const parts = words.map((word) => {
      const clean = word.replace(/[^a-z-]/gi, '');
      const fill = highlight.test(clean) ? gold : ivory;
      const approx = word.length * size * 0.47 + size * 0.28;
      const text = `<text x="${cursor}" y="${y + index * leading}" font-family="Georgia, serif" font-size="${size}" fill="${fill}" filter="url(#rinismShadow)">${escapeHtml(word)}</text>`;
      cursor += approx;
      return text;
    });
    return parts.join('');
  }).join('');
}

function rinismActionRow(gold) {
  const y = 1265;
  return `
    <path d="M72 ${y - 38} H92 V0" opacity="0"/>
    <path d="M70 ${y - 45} H92 V${y - 5} L81 ${y - 16} L70 ${y - 5} Z" fill="none" stroke="${gold}" stroke-width="3"/>
    <text x="112" y="${y - 10}" font-family="Georgia, serif" font-size="17" letter-spacing="6" fill="${gold}">SAVE</text>
    <path d="M260 ${y - 44} L300 ${y - 26} L270 ${y - 4} L274 ${y - 28} Z" fill="none" stroke="${gold}" stroke-width="3"/>
    <text x="332" y="${y - 10}" font-family="Georgia, serif" font-size="17" letter-spacing="6" fill="${gold}">SHARE</text>
    <path d="M506 ${y - 30} C506 ${y - 54} 540 ${y - 56} 540 ${y - 25} C540 ${y - 56} 574 ${y - 54} 574 ${y - 30} C574 ${y - 5} 540 ${y + 10} 540 ${y + 10} C540 ${y + 10} 506 ${y - 5} 506 ${y - 30} Z" fill="none" stroke="${gold}" stroke-width="3"/>
    <text x="615" y="${y - 10}" font-family="Georgia, serif" font-size="17" letter-spacing="6" fill="${gold}">LIKE</text>
    <circle cx="760" cy="${y - 42}" r="14" fill="none" stroke="${gold}" stroke-width="3"/>
    <path d="M730 ${y + 2} C734 ${y - 24} 786 ${y - 24} 790 ${y + 2}" fill="none" stroke="${gold}" stroke-width="3"/>
    <text x="830" y="${y - 10}" font-family="Georgia, serif" font-size="17" letter-spacing="6" fill="${gold}">FOLLOW FOR MORE</text>
  `;
}

function splitReferenceQuote(quote) {
  const text = String(quote || '').trim();
  const match = text.match(/^(([1-3]\s*)?[A-Za-z]+(?:\s+[A-Za-z]+)?\s+\d+:\d+(?:-\d+)?)\s*[-\u2013\u2014]\s*(.+)$/);
  if (!match) return { reference: '', verse: text };
  return { reference: match[1].replace(/\s+/g, ' ').trim(), verse: match[3].trim() };
}

function buildPremiumScripturePortraitV2(content, options, resolved) {
  const { signature, handle } = brand(options);
  const { reference, verse } = splitReferenceQuote(content.quote);
  const lines = fitLines(verse.replace(/^"+|"+$/g, ''), 16, 7);
  const baseFontSize = fitSize(lines.length, [38, 34, 30]);
  const fontSize = Math.round(baseFontSize * 0.94);
  const leading = Math.round(fontSize * 1.36);
  const lineStart = 505 - Math.max(0, lines.length - 4) * 14;
  const closeQuoteY = lineStart + lines.length * leading + 18;
  const signatureY = Math.min(1042, lineStart + lines.length * leading + 136);
  const accent = resolved.properties.accent;

  return `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3b2416"/>
        <stop offset="45%" stop-color="#17100c"/>
        <stop offset="100%" stop-color="#080605"/>
      </linearGradient>
      <linearGradient id="portraitGrade" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffe0a2" stop-opacity="0.16"/>
        <stop offset="52%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#1d0e08" stop-opacity="0.36"/>
      </linearGradient>
      <linearGradient id="humanFade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="white" stop-opacity="1"/>
        <stop offset="66%" stop-color="white" stop-opacity="1"/>
        <stop offset="88%" stop-color="white" stop-opacity="0.34"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </linearGradient>
      <mask id="humanMask">
        <rect x="-120" y="0" width="930" height="1350" fill="url(#humanFade)"/>
      </mask>
      <linearGradient id="rightReadability" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#080605" stop-opacity="0"/>
        <stop offset="45%" stop-color="#080605" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#080605" stop-opacity="0.78"/>
      </linearGradient>
      <radialGradient id="faceGlow" cx="42%" cy="30%" r="48%">
        <stop offset="0%" stop-color="#ffe6bd" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#ffe6bd" stop-opacity="0"/>
      </radialGradient>
      <filter id="portraitWarm">
        <feColorMatrix type="matrix" values="1.08 0 0 0 0.025  0 1.02 0 0 0.014  0 0 0.93 0 0  0 0 0 1 0"/>
      </filter>
      <filter id="bgBlur" x="-8%" y="-8%" width="116%" height="116%">
        <feGaussianBlur stdDeviation="4"/>
      </filter>
      <filter id="scriptShadow">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.55"/>
      </filter>
    </defs>
    <rect width="1080" height="1350" fill="url(#bgGrad)"/>
    ${renderPremiumChurchInterior(accent, options)}
    <g mask="url(#humanMask)">
      <image href="${options.portraitDataUri}" x="-116" y="0" width="840" height="1350" preserveAspectRatio="xMidYMid slice" filter="url(#portraitWarm)"/>
      <rect x="-116" y="0" width="840" height="1350" fill="url(#portraitGrade)"/>
    </g>
    <rect width="1080" height="1350" fill="url(#faceGlow)"/>
    <rect width="1080" height="1350" fill="url(#rightReadability)"/>
    ${reference ? `<text x="842" y="350" text-anchor="middle" font-family="Georgia, serif" font-size="38" fill="#fff3df" filter="url(#scriptShadow)">${escapeHtml(reference)}</text>` : ''}
    <line x1="724" y1="405" x2="812" y2="405" stroke="#ead0ad" stroke-width="2" opacity="0.72"/>
    <text x="842" y="415" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="#ead0ad" opacity="0.88">+</text>
    <line x1="872" y1="405" x2="960" y2="405" stroke="#ead0ad" stroke-width="2" opacity="0.72"/>
    <text x="842" y="${lineStart - 34}" text-anchor="middle" font-family="Georgia, serif" font-size="44" fill="#fff5e8" filter="url(#scriptShadow)">"</text>
    ${textBlock(lines, { x: 842, y: lineStart, size: fontSize, leading, anchor: 'middle', family: 'Georgia, serif', weight: '400', fill: '#fff5e8' })}
    <text x="842" y="${closeQuoteY}" text-anchor="middle" font-family="Georgia, serif" font-size="44" fill="#fff5e8" filter="url(#scriptShadow)">"</text>
    <line x1="772" y1="${signatureY - 90}" x2="912" y2="${signatureY - 90}" stroke="#ead0ad" stroke-width="2" opacity="0.58"/>
    <text x="842" y="${signatureY}" text-anchor="middle" font-family="Georgia, serif" font-size="76" font-style="italic" fill="#fff1dc" filter="url(#scriptShadow)">${escapeHtml(signature)}</text>
    <line x1="768" y1="${signatureY + 30}" x2="826" y2="${signatureY + 30}" stroke="#ead0ad" stroke-width="2" opacity="0.5"/>
    <text x="842" y="${signatureY + 39}" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="#ead0ad" opacity="0.72">v</text>
    <line x1="858" y1="${signatureY + 30}" x2="916" y2="${signatureY + 30}" stroke="#ead0ad" stroke-width="2" opacity="0.5"/>
    <text x="842" y="${signatureY + 88}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="21" fill="#f3ddc1" opacity="0.84">${escapeHtml(handle)}</text>
  </svg>`;
}

function buildPremiumScripturePortrait(content, options, resolved) {
  const { signature, handle } = brand(options);
  const { reference, verse } = splitReferenceQuote(content.quote);
  const lines = fitLines(verse.replace(/^["“”]+|["“”]+$/g, ''), 7, 8);
  const baseFontSize = fitSize(lines.length, [38, 33, 29]);
  const fontSize = Math.round(baseFontSize * 0.96);
  const leading = Math.round(fontSize * 1.42);
  const lineStart = 480 - Math.max(0, lines.length - 4) * 18;
  const accent = resolved.properties.accent;

  return `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#3b2416"/>
        <stop offset="45%" stop-color="#17100c"/>
        <stop offset="100%" stop-color="#080605"/>
      </linearGradient>
      <linearGradient id="portraitGrade" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffe0a2" stop-opacity="0.16"/>
        <stop offset="52%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#1d0e08" stop-opacity="0.34"/>
      </linearGradient>
      <linearGradient id="rightReadability" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#080605" stop-opacity="0"/>
        <stop offset="48%" stop-color="#080605" stop-opacity="0.26"/>
        <stop offset="100%" stop-color="#080605" stop-opacity="0.72"/>
      </linearGradient>
      <radialGradient id="faceGlow" cx="42%" cy="30%" r="48%">
        <stop offset="0%" stop-color="#ffe6bd" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#ffe6bd" stop-opacity="0"/>
      </radialGradient>
      <filter id="portraitWarm">
        <feColorMatrix type="matrix" values="1.08 0 0 0 0.025  0 1.02 0 0 0.014  0 0 0.93 0 0  0 0 0 1 0"/>
      </filter>
      <filter id="bgBlur" x="-8%" y="-8%" width="116%" height="116%">
        <feGaussianBlur stdDeviation="4"/>
      </filter>
      <filter id="scriptShadow">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.55"/>
      </filter>
    </defs>
    <rect width="1080" height="1350" fill="url(#bgGrad)"/>
    ${renderPremiumChurchInterior(accent, options)}
    <image href="${options.portraitDataUri}" x="-34" y="130" width="760" height="1220" preserveAspectRatio="xMidYMid slice" filter="url(#portraitWarm)"/>
    <rect x="-34" y="130" width="760" height="1220" fill="url(#portraitGrade)"/>
    <rect width="1080" height="1350" fill="url(#faceGlow)"/>
    <rect width="1080" height="1350" fill="url(#rightReadability)"/>
    <rect x="714" y="250" width="302" height="720" rx="28" fill="#130d09" opacity="0.12"/>
    ${reference ? `<text x="852" y="358" text-anchor="middle" font-family="Georgia, serif" font-size="38" fill="#fff3df" filter="url(#scriptShadow)">${escapeHtml(reference)}</text>` : ''}
    <line x1="748" y1="408" x2="824" y2="408" stroke="#ead0ad" stroke-width="2" opacity="0.72"/>
    <text x="852" y="418" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="#ead0ad" opacity="0.88">+</text>
    <line x1="880" y1="408" x2="956" y2="408" stroke="#ead0ad" stroke-width="2" opacity="0.72"/>
    <text x="852" y="${lineStart - 34}" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#fff5e8" filter="url(#scriptShadow)">"</text>
    ${textBlock(lines, { x: 852, y: lineStart, size: fontSize, leading, anchor: 'middle', family: 'Georgia, serif', fill: '#fff5e8' })}
    <text x="852" y="${lineStart + lines.length * leading + 20}" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="#fff5e8" filter="url(#scriptShadow)">"</text>
    <line x1="790" y1="930" x2="914" y2="930" stroke="#ead0ad" stroke-width="2" opacity="0.62"/>
    <text x="852" y="1022" text-anchor="middle" font-family="Georgia, serif" font-size="76" font-style="italic" fill="#fff1dc" filter="url(#scriptShadow)">${escapeHtml(signature)}</text>
    <line x1="782" y1="1052" x2="835" y2="1052" stroke="#ead0ad" stroke-width="2" opacity="0.5"/>
    <text x="852" y="1062" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="#ead0ad" opacity="0.72">v</text>
    <line x1="870" y1="1052" x2="922" y2="1052" stroke="#ead0ad" stroke-width="2" opacity="0.5"/>
    <text x="852" y="1112" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#f3ddc1" opacity="0.84">${escapeHtml(handle)}</text>
  </svg>`;
}

function buildPremiumScenePortrait(content, options, resolved) {
  const { category, signature, handle } = brand(options);
  const lines = fitLines(content.quote, 10, 7);
  const baseFontSize = fitSize(lines.length, [40, 35, 30]);
  const fontSize = Math.round(baseFontSize * 0.98);
  const leading = Math.round(fontSize * 1.34);
  const lineStart = 520 - Math.max(0, lines.length - 4) * 16;
  const accent = resolved.properties.accent;
  const textX = 820;

  return `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${resolved.properties.bgStart}"/>
        <stop offset="100%" stop-color="${resolved.properties.bgEnd}"/>
      </linearGradient>
      <linearGradient id="portraitGrade" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fff0cf" stop-opacity="0.13"/>
        <stop offset="50%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#05030a" stop-opacity="0.38"/>
      </linearGradient>
      <linearGradient id="readabilityFade" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${resolved.properties.bgEnd}" stop-opacity="0"/>
        <stop offset="50%" stop-color="${resolved.properties.bgEnd}" stop-opacity="0.26"/>
        <stop offset="100%" stop-color="${resolved.properties.bgEnd}" stop-opacity="0.78"/>
      </linearGradient>
      <radialGradient id="premiumLight" cx="40%" cy="30%" r="52%">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
      </radialGradient>
      <filter id="humanGrade">
        <feColorMatrix type="matrix" values="1.06 0 0 0 0.022  0 1.02 0 0 0.012  0 0 0.94 0 0  0 0 0 1 0"/>
      </filter>
      <filter id="sceneTextShadow">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.55"/>
      </filter>
    </defs>
    <rect width="1080" height="1350" fill="url(#bgGrad)"/>
    ${renderSvgBackground(resolved, options)}
    <image href="${options.portraitDataUri}" x="-44" y="84" width="760" height="1266" preserveAspectRatio="xMidYMid slice" filter="url(#humanGrade)"/>
    <rect x="-44" y="84" width="760" height="1266" fill="url(#portraitGrade)"/>
    <rect width="1080" height="1350" fill="url(#premiumLight)"/>
    <rect width="1080" height="1350" fill="url(#readabilityFade)"/>
    <text x="820" y="176" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" letter-spacing="4" fill="${accent}" opacity="0.9">${escapeHtml(category)}</text>
    <line x1="706" y1="242" x2="934" y2="242" stroke="${accent}" stroke-width="2" opacity="0.56"/>
    <text x="${textX}" y="${lineStart - 40}" text-anchor="middle" font-family="Georgia, serif" font-size="58" fill="${accent}" opacity="0.92">"</text>
    ${textBlock(lines, { x: textX, y: lineStart, size: fontSize, leading, anchor: 'middle', family: 'Georgia, serif', fill: '#fff7df' })}
    <line x1="746" y="${lineStart + lines.length * leading + 52}" x2="894" y="${lineStart + lines.length * leading + 52}" stroke="${accent}" stroke-width="2" opacity="0.52"/>
    <text x="${textX}" y="${lineStart + lines.length * leading + 132}" text-anchor="middle" font-family="Georgia, serif" font-size="74" font-style="italic" fill="#fff1dc" filter="url(#sceneTextShadow)">${escapeHtml(signature)}</text>
    <text x="${textX}" y="${lineStart + lines.length * leading + 180}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="21" fill="#f4dec2" opacity="0.84">${escapeHtml(handle)}</text>
  </svg>`;
}

function buildPremiumChurchPost(content, options, resolved) {
  const { category, signature, handle } = brand(options);
  const { reference, verse } = splitReferenceQuote(content.quote);
  const quoteText = reference ? verse.replace(/^"+|"+$/g, '') : content.quote;
  const lines = fitLines(quoteText, 19, 7);
  const baseFontSize = fitSize(lines.length, [42, 36, 31]);
  const fontSize = Math.round(baseFontSize * 0.96);
  const leading = Math.round(fontSize * 1.34);
  const lineStart = 650 - Math.max(0, lines.length - 4) * 18;
  const accent = resolved.properties.accent;
  const tags = content.hashtags.slice(0, 3).join(' ');

  return `
  <svg width="1080" height="1350" viewBox="0 0 1080 1350" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="churchSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2c1b13"/>
        <stop offset="48%" stop-color="#100b09"/>
        <stop offset="100%" stop-color="#050405"/>
      </linearGradient>
      <radialGradient id="churchSun" cx="30%" cy="28%" r="58%">
        <stop offset="0%" stop-color="#ffd89b" stop-opacity="0.56"/>
        <stop offset="100%" stop-color="#ffd89b" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="glassGold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff1c8" stop-opacity="0.95"/>
        <stop offset="42%" stop-color="#d9a55d" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#5c2e22" stop-opacity="0.5"/>
      </linearGradient>
      <linearGradient id="quotePanel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#130d09" stop-opacity="0.86"/>
        <stop offset="100%" stop-color="#050405" stop-opacity="0.74"/>
      </linearGradient>
      <filter id="churchSoftShadow">
        <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000000" flood-opacity="0.5"/>
      </filter>
      <filter id="churchTextShadow">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000000" flood-opacity="0.55"/>
      </filter>
    </defs>
    <rect width="1080" height="1350" fill="url(#churchSky)"/>
    <circle cx="280" cy="260" r="420" fill="url(#churchSun)"/>
    ${renderObviousChurchScene(accent, options)}
    <rect width="1080" height="1350" fill="#000000" opacity="0.16"/>
    <rect x="76" y="82" width="928" height="1186" fill="none" stroke="${accent}" stroke-opacity="0.56" stroke-width="2"/>
    <text x="540" y="164" text-anchor="middle" font-family="Georgia, serif" font-size="${category.length > 18 ? 52 : 66}" font-weight="700" fill="#fff3df" filter="url(#churchTextShadow)">${escapeHtml(category)}</text>
    <text x="540" y="218" text-anchor="middle" font-family="Georgia, serif" font-size="35" font-style="italic" fill="${accent}">faith in focus</text>
    <g filter="url(#churchSoftShadow)">
      <rect x="160" y="430" width="760" height="550" rx="28" fill="url(#quotePanel)" stroke="${accent}" stroke-opacity="0.42" stroke-width="2"/>
    </g>
    ${reference ? `<text x="540" y="540" text-anchor="middle" font-family="Georgia, serif" font-size="38" fill="#fff3df" filter="url(#churchTextShadow)">${escapeHtml(reference)}</text>` : ''}
    <line x1="410" y1="588" x2="500" y2="588" stroke="${accent}" stroke-width="2" opacity="0.7"/>
    <text x="540" y="598" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="${accent}" opacity="0.88">+</text>
    <line x1="580" y1="588" x2="670" y2="588" stroke="${accent}" stroke-width="2" opacity="0.7"/>
    ${textBlock(lines, { x: 540, y: lineStart, size: fontSize, leading, anchor: 'middle', family: 'Georgia, serif', weight: '400', fill: '#fff7df' })}
    <text x="540" y="1090" text-anchor="middle" font-family="Georgia, serif" font-size="76" font-style="italic" fill="${accent}" filter="url(#churchTextShadow)">${escapeHtml(signature)}</text>
    <text x="540" y="1138" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#f3ddc1" opacity="0.86">${escapeHtml(handle)}</text>
    <text x="540" y="1218" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="${accent}" opacity="0.82">${escapeHtml(tags)}</text>
  </svg>`;
}

function renderObviousChurchScene(accent, options) {
  const variant = Number(options.styleVariant || 0) % 4;
  const steepleShift = variant * 24;
  return `
    <g opacity="0.98">
      <path d="M0 980 C250 890 420 1018 664 920 S950 840 1080 910 L1080 1350 L0 1350 Z" fill="#090606" opacity="0.72"/>
      <path d="M226 910 L226 520 L354 398 L482 520 L482 910 Z" fill="#1b100c" stroke="${accent}" stroke-width="5" opacity="0.92"/>
      <path d="M598 926 L598 420 L762 268 L926 420 L926 926 Z" fill="#1a100c" stroke="${accent}" stroke-width="6" opacity="0.94"/>
      <path d="M672 350 L762 108 L852 350 Z" fill="#120b08" stroke="${accent}" stroke-width="6" opacity="0.96"/>
      <line x1="762" y1="88" x2="762" y2="30" stroke="#fff1bd" stroke-width="9" stroke-linecap="round"/>
      <line x1="734" y1="58" x2="790" y2="58" stroke="#fff1bd" stroke-width="9" stroke-linecap="round"/>
      <path d="M280 892 L280 622 Q280 520 354 520 Q428 520 428 622 L428 892 Z" fill="url(#glassGold)" stroke="#fff1bd" stroke-width="3" opacity="0.64"/>
      <path d="M684 900 L684 552 Q684 430 762 430 Q840 430 840 552 L840 900 Z" fill="url(#glassGold)" stroke="#fff1bd" stroke-width="4" opacity="0.7"/>
      <path d="M726 568 H798 M762 492 V692" stroke="#fff8db" stroke-width="8" stroke-linecap="round" opacity="0.62"/>
      <path d="M332 644 H376 M354 584 V714" stroke="#fff8db" stroke-width="6" stroke-linecap="round" opacity="0.54"/>
      <path d="M88 944 V456 Q88 290 226 290 Q364 290 364 456" fill="none" stroke="#8f643d" stroke-width="34" opacity="0.34"/>
      <path d="M514 964 V370 Q514 176 762 176 Q1010 176 1010 370 V964" fill="none" stroke="#8f643d" stroke-width="42" opacity="0.36"/>
      <circle cx="${214 + steepleShift}" cy="742" r="46" fill="${accent}" opacity="0.22"/>
      <circle cx="${934 - steepleShift}" cy="650" r="58" fill="${accent}" opacity="0.18"/>
      ${Array.from({ length: 8 }, (_, index) => `<rect x="${90 + index * 128}" y="${1030 + (index % 2) * 34}" width="210" height="42" rx="8" fill="#2d1a12" opacity="${0.34 - index * 0.018}"/>`).join('')}
      ${Array.from({ length: 22 }, (_, index) => `<circle cx="${70 + ((index * 137 + variant * 41) % 940)}" cy="${110 + ((index * 83 + variant * 29) % 720)}" r="${index % 4 === 0 ? 3 : 1.6}" fill="#fff1bd" opacity="${0.16 + (index % 5) * 0.05}"/>`).join('')}
    </g>
  `;
}

function renderPremiumChurchInterior(accent, options) {
  const variant = Number(options.styleVariant || 0) % 5;
  const windowX = 106 + variant * 18;
  const archX = 556 + (variant % 2) * 46;
  return `
    <g filter="url(#bgBlur)" opacity="0.96">
      <rect x="0" y="0" width="1080" height="1350" fill="#24150d"/>
      <path d="M${windowX} 650 L${windowX} 270 Q${windowX} 80 ${windowX + 150} 80 Q${windowX + 300} 80 ${windowX + 300} 270 L${windowX + 300} 650 Z" fill="#130c08" stroke="#a87448" stroke-width="10" opacity="0.9"/>
      <path d="M${windowX + 34} 624 L${windowX + 34} 300 Q${windowX + 34} 130 ${windowX + 150} 130 Q${windowX + 266} 130 ${windowX + 266} 300 L${windowX + 266} 624 Z" fill="#f4d6a4" opacity="0.34"/>
      ${Array.from({ length: 6 }, (_, index) => {
        const x = windowX + 58 + index * 35;
        const color = ['#f6d47b', '#b95e45', '#4f7f94', '#e7dfc9', '#7a4a6c', '#d9a55d'][index];
        return `<path d="M${x} 596 L${x} 324 Q${x} 190 ${windowX + 150} 170" fill="none" stroke="${color}" stroke-width="18" opacity="0.44"/>`;
      }).join('')}
      <path d="M${archX} 1010 V360 Q${archX} 116 780 116 Q1004 116 1004 360 V1010" fill="none" stroke="#8b5d3d" stroke-width="44" opacity="0.44"/>
      <path d="M${archX + 112} 1040 V410 Q${archX + 112} 230 784 230 Q936 230 936 410 V1040" fill="none" stroke="#c99b6c" stroke-width="18" opacity="0.23"/>
      <rect x="0" y="720" width="1080" height="630" fill="#100b08" opacity="0.6"/>
      ${Array.from({ length: 5 }, (_, index) => `<rect x="${560 + index * 110}" y="${770 + index * 34}" width="360" height="54" rx="8" fill="#3a2114" opacity="${0.34 - index * 0.035}"/>`).join('')}
      <circle cx="150" cy="772" r="70" fill="${accent}" opacity="0.2"/>
      <circle cx="950" cy="640" r="82" fill="${accent}" opacity="0.18"/>
      <rect x="0" y="0" width="1080" height="1350" fill="#000000" opacity="0.2"/>
    </g>
  `;
}

function renderChurchBackground(accent, options) {
  const variant = Number(options.styleVariant || 0) % 6;
  const glow = `
    <defs>
      <radialGradient id="chapelGlow" cx="50%" cy="68%" r="56%">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.58"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="windowGold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff4c7" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0.38"/>
      </linearGradient>
    </defs>
  `;
  const floor = `
    <circle cx="540" cy="930" r="460" fill="url(#chapelGlow)"/>
    <path d="M96 1168 Q540 1012 984 1168" fill="none" stroke="${accent}" stroke-width="4" opacity="0.26"/>
    <path d="M170 1242 Q540 1130 910 1242" fill="none" stroke="${accent}" stroke-width="2" opacity="0.18"/>
    <path d="M220 1320 L448 840 M860 1320 L632 840" stroke="${accent}" stroke-width="2" opacity="0.18"/>
  `;

  const scenes = [
    `
      <path d="M238 720 L238 384 Q238 154 540 154 Q842 154 842 384 L842 720 Z" fill="#0b1020" stroke="${accent}" stroke-width="8" opacity="0.82"/>
      <path d="M326 710 L326 430 Q326 266 540 266 Q754 266 754 430 L754 710 Z" fill="url(#windowGold)" opacity="0.2" stroke="${accent}" stroke-width="3"/>
      <line x1="540" y1="190" x2="540" y2="710" stroke="#fff1bd" stroke-width="5" opacity="0.34"/>
      <line x1="334" y1="470" x2="746" y2="470" stroke="#fff1bd" stroke-width="4" opacity="0.26"/>
      <path d="M484 318 H596 M540 262 V392" stroke="#fff1bd" stroke-width="10" stroke-linecap="round" opacity="0.52"/>
    `,
    `
      <rect x="0" y="810" width="1080" height="540" fill="#050816" opacity="0.5"/>
      <path d="M156 840 L330 678 L330 510 L540 340 L750 510 L750 678 L924 840 Z" fill="#0b1020" stroke="${accent}" stroke-width="6" opacity="0.84"/>
      <path d="M466 700 L466 560 Q466 490 540 490 Q614 490 614 560 L614 700 Z" fill="url(#windowGold)" opacity="0.32"/>
      <path d="M510 438 H570 M540 378 V496" stroke="#fff1bd" stroke-width="9" stroke-linecap="round" opacity="0.5"/>
      <circle cx="248" cy="726" r="52" fill="url(#windowGold)" opacity="0.2"/>
      <circle cx="832" cy="726" r="52" fill="url(#windowGold)" opacity="0.2"/>
    `,
    `
      <circle cx="540" cy="420" r="246" fill="#0b1020" stroke="${accent}" stroke-width="8" opacity="0.9"/>
      <circle cx="540" cy="420" r="176" fill="none" stroke="#fff1bd" stroke-width="4" opacity="0.26"/>
      ${Array.from({ length: 12 }, (_, index) => {
        const angle = (Math.PI * 2 * index) / 12;
        const x1 = 540 + Math.cos(angle) * 36;
        const y1 = 420 + Math.sin(angle) * 36;
        const x2 = 540 + Math.cos(angle) * 238;
        const y2 = 420 + Math.sin(angle) * 238;
        return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${index % 2 ? accent : '#fff1bd'}" stroke-width="3" opacity="0.28"/>`;
      }).join('')}
      <path d="M500 420 H580 M540 332 V508" stroke="#fff1bd" stroke-width="9" stroke-linecap="round" opacity="0.56"/>
    `,
    `
      <path d="M140 780 C200 490 330 276 540 168 C750 276 880 490 940 780" fill="#0b1020" stroke="${accent}" stroke-width="7" opacity="0.82"/>
      <path d="M228 800 C288 540 392 366 540 276 C688 366 792 540 852 800" fill="none" stroke="#fff1bd" stroke-width="3" opacity="0.28"/>
      <path d="M298 830 H782" stroke="${accent}" stroke-width="5" opacity="0.35"/>
      <path d="M470 610 H610 M540 438 V704" stroke="#fff1bd" stroke-width="10" stroke-linecap="round" opacity="0.5"/>
    `,
    `
      <rect x="126" y="176" width="828" height="620" fill="#0b1020" stroke="${accent}" stroke-width="6" opacity="0.82"/>
      ${Array.from({ length: 5 }, (_, index) => {
        const x = 194 + index * 156;
        return `<path d="M${x} 724 L${x} 406 Q${x} 278 ${x + 78} 278 Q${x + 156} 278 ${x + 156} 406 L${x + 156} 724 Z" fill="url(#windowGold)" opacity="${0.14 + index * 0.025}" stroke="#fff1bd" stroke-width="2"/>`;
      }).join('')}
      <path d="M504 348 H576 M540 286 V430" stroke="#fff1bd" stroke-width="8" stroke-linecap="round" opacity="0.48"/>
    `,
    `
      <path d="M96 760 H984" stroke="${accent}" stroke-width="5" opacity="0.34"/>
      <path d="M188 760 L304 360 H420 L540 760 Z" fill="#0b1020" stroke="${accent}" stroke-width="5" opacity="0.76"/>
      <path d="M540 760 L660 360 H776 L892 760 Z" fill="#0b1020" stroke="${accent}" stroke-width="5" opacity="0.76"/>
      <path d="M310 540 H408 M359 436 V650 M672 540 H770 M721 436 V650" stroke="#fff1bd" stroke-width="8" stroke-linecap="round" opacity="0.44"/>
      <circle cx="540" cy="340" r="82" fill="url(#windowGold)" opacity="0.24" stroke="${accent}" stroke-width="3"/>
    `
  ];

  return `
    ${glow}
    <rect width="1080" height="1350" fill="#080b18" opacity="0.5"/>
    ${floor}
    ${scenes[variant]}
    ${renderSmallStars(accent, variant)}
  `;
}

function renderSpecifiedBackground(type, accent, options) {
  const variant = Number(options.styleVariant || 0) % 6;
  const promptLabel = backgroundNote(options);
  const defs = `
    <defs>
      <radialGradient id="sceneGlow" cx="${variant % 2 ? '32%' : '68%'}" cy="${variant % 3 ? '34%' : '70%'}" r="58%">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
      </radialGradient>
    </defs>
  `;
  const base = `
    ${defs}
    <rect width="1080" height="1350" fill="#080b18" opacity="0.46"/>
    <circle cx="${220 + variant * 90}" cy="${260 + (variant % 3) * 90}" r="360" fill="url(#sceneGlow)"/>
    <text x="940" y="1218" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="20" fill="${accent}" opacity="0.68">${escapeHtml(promptLabel)}</text>
  `;

  const scenes = {
    beach: `
      <circle cx="${820 - variant * 22}" cy="${250 + variant * 12}" r="110" fill="#ffd38a" opacity="0.72"/>
      <path d="M-40 790 C220 700 430 860 690 760 S1030 715 1120 790 L1120 1350 L-40 1350 Z" fill="#17566d" opacity="0.58"/>
      <path d="M-40 910 C240 826 460 982 710 888 S1010 850 1120 924 L1120 1350 L-40 1350 Z" fill="#d6b47a" opacity="0.52"/>
      <path d="M120 930 C260 890 420 930 560 892" fill="none" stroke="#fff7df" stroke-width="5" opacity="0.28"/>
    `,
    forest: `
      ${Array.from({ length: 9 }, (_, index) => {
        const x = 80 + index * 118 + (variant % 2) * 32;
        const h = 350 + ((index + variant) % 4) * 70;
        return `<path d="M${x} ${900 - h} L${x - 88} 980 H${x + 88} Z" fill="#153c2d" stroke="${accent}" stroke-width="2" opacity="${0.42 + index * 0.035}"/>`;
      }).join('')}
      <path d="M0 980 C260 900 460 1040 720 948 S980 900 1080 970 L1080 1350 L0 1350 Z" fill="#0d241d" opacity="0.74"/>
    `,
    mountain: `
      <path d="M-40 930 L260 420 L540 930 Z" fill="#26334b" opacity="0.74"/>
      <path d="M300 940 L620 330 L1100 940 Z" fill="#1c2538" opacity="0.86"/>
      <path d="M620 330 L530 506 L700 506 Z" fill="#fff7df" opacity="0.34"/>
      <circle cx="${760 - variant * 35}" cy="244" r="88" fill="${accent}" opacity="0.34"/>
    `,
    city: `
      ${Array.from({ length: 12 }, (_, index) => {
        const x = 40 + index * 88;
        const h = 230 + ((index * 41 + variant * 37) % 280);
        return `<rect x="${x}" y="${850 - h}" width="66" height="${h}" fill="#11192b" stroke="${accent}" stroke-width="1.5" opacity="0.82"/>`;
      }).join('')}
      ${Array.from({ length: 24 }, (_, index) => `<rect x="${80 + (index * 73) % 920}" y="${430 + (index * 47) % 330}" width="12" height="18" fill="${accent}" opacity="${0.18 + (index % 3) * 0.08}"/>`).join('')}
      <path d="M0 850 H1080 V1350 H0 Z" fill="#050816" opacity="0.52"/>
    `,
    cafe: `
      <rect x="0" y="690" width="1080" height="660" fill="#120d0b" opacity="0.68"/>
      <rect x="140" y="268" width="800" height="416" rx="22" fill="#1a1110" stroke="${accent}" stroke-width="4" opacity="0.72"/>
      <path d="M330 536 C330 448 750 448 750 536 C750 624 330 624 330 536 Z" fill="none" stroke="${accent}" stroke-width="6" opacity="0.34"/>
      <path d="M408 520 C442 470 638 470 672 520" fill="none" stroke="#fff7df" stroke-width="5" opacity="0.28"/>
      <rect x="210" y="770" width="660" height="84" fill="#3a241b" opacity="0.62"/>
    `,
    library: `
      ${Array.from({ length: 5 }, (_, shelf) => `<rect x="112" y="${230 + shelf * 132}" width="856" height="26" fill="${accent}" opacity="0.34"/>`).join('')}
      ${Array.from({ length: 34 }, (_, index) => {
        const x = 132 + (index % 11) * 74;
        const y = 158 + Math.floor(index / 11) * 132;
        const h = 64 + ((index + variant) % 4) * 16;
        return `<rect x="${x}" y="${y}" width="38" height="${h}" fill="${index % 2 ? '#5c3650' : '#26334b'}" stroke="${accent}" stroke-width="1" opacity="0.72"/>`;
      }).join('')}
      <circle cx="${820 - variant * 40}" cy="770" r="128" fill="${accent}" opacity="0.12"/>
    `,
    office: `
      <rect x="116" y="190" width="848" height="520" fill="#101827" stroke="${accent}" stroke-width="3" opacity="0.72"/>
      <path d="M180 322 H900 M180 454 H900 M180 586 H900 M328 190 V710 M508 190 V710 M688 190 V710" stroke="${accent}" stroke-width="2" opacity="0.22"/>
      <rect x="218" y="802" width="644" height="72" fill="${accent}" opacity="0.18"/>
      <rect x="300" y="874" width="480" height="18" fill="#fff7df" opacity="0.16"/>
    `,
    gym: `
      <circle cx="540" cy="486" r="210" fill="none" stroke="${accent}" stroke-width="18" opacity="0.28"/>
      <path d="M230 724 H850" stroke="${accent}" stroke-width="28" stroke-linecap="round" opacity="0.46"/>
      <rect x="160" y="668" width="84" height="112" rx="12" fill="#fff7df" opacity="0.22"/>
      <rect x="836" y="668" width="84" height="112" rx="12" fill="#fff7df" opacity="0.22"/>
      <path d="M0 1000 H1080 V1350 H0 Z" fill="#090b12" opacity="0.72"/>
    `,
    temple: `
      <path d="M150 760 L540 280 L930 760 Z" fill="#12172a" stroke="${accent}" stroke-width="7" opacity="0.86"/>
      <path d="M260 760 V930 M400 760 V930 M540 760 V930 M680 760 V930 M820 760 V930" stroke="${accent}" stroke-width="9" opacity="0.42"/>
      <path d="M210 930 H870 L950 1020 H130 Z" fill="#0b1020" stroke="${accent}" stroke-width="5" opacity="0.84"/>
      <circle cx="540" cy="560" r="78" fill="none" stroke="#fff7df" stroke-width="6" opacity="0.34"/>
    `,
    custom: renderCustomPromptScene(accent, options)
  };

  return `
    ${base}
    ${scenes[type] || scenes.custom}
    ${renderSmallStars(accent, variant)}
  `;
}

function promptHash(value) {
  return Array.from(String(value || '')).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 2166136261);
}

function renderCustomPromptScene(accent, options) {
  const prompt = `${options.backgroundDescription || ''} ${options.creativePrompt || ''}`.toLowerCase();
  const hash = promptHash(prompt);
  const variant = hash % 6;
  const isIndoor = /\b(room|hotel|palace|studio|bedroom|kitchen|restaurant|cafe|library|office|window|interior|hall)\b/.test(prompt);
  const isNature = /\b(flower|floral|garden|forest|meadow|field|lake|river|waterfall|mountain|snow|beach|ocean|sunset|sunrise)\b/.test(prompt);
  const isCity = /\b(city|street|paris|london|new york|skyline|road|rain|urban)\b/.test(prompt);
  const isCosmic = /\b(moon|space|galaxy|stars|night|celestial)\b/.test(prompt);
  const warm = /\b(gold|candle|warm|sunset|luxury|premium)\b/.test(prompt);
  const glowColor = warm ? '#e4a65a' : isNature ? '#84cfa0' : isCosmic ? '#b9a7ff' : '#d9a55d';

  const architecture = `
    <path d="M96 860 V270 Q96 126 226 126 Q356 126 356 270 V860" fill="#120d12" stroke="${accent}" stroke-width="8" opacity="0.58"/>
    <path d="M724 880 V250 Q724 110 868 110 Q1012 110 1012 250 V880" fill="#120d12" stroke="${accent}" stroke-width="10" opacity="0.42"/>
    <rect x="0" y="778" width="1080" height="572" fill="#08070b" opacity="0.64"/>
  `;
  const nature = `
    <circle cx="${760 - variant * 38}" cy="${250 + variant * 24}" r="128" fill="${glowColor}" opacity="0.34"/>
    <path d="M-40 900 C180 748 348 890 540 760 S890 650 1120 830 L1120 1350 L-40 1350 Z" fill="#13251d" opacity="0.66"/>
    <path d="M-40 1018 C260 900 440 1058 710 934 S990 870 1120 970 L1120 1350 L-40 1350 Z" fill="${glowColor}" opacity="0.18"/>
    ${Array.from({ length: 16 }, (_, index) => `<circle cx="${80 + ((index * 79 + hash) % 940)}" cy="${720 + ((index * 53 + hash) % 260)}" r="${12 + (index % 4) * 7}" fill="${index % 2 ? accent : '#fff1dc'}" opacity="${0.12 + (index % 4) * 0.04}"/>`).join('')}
  `;
  const city = `
    <rect x="0" y="0" width="1080" height="1350" fill="#090a13" opacity="0.3"/>
    ${Array.from({ length: 14 }, (_, index) => {
      const x = 24 + index * 82;
      const h = 260 + ((index * 47 + hash) % 430);
      return `<rect x="${x}" y="${850 - h}" width="58" height="${h}" fill="#131827" stroke="${accent}" stroke-width="1.5" opacity="${0.48 + (index % 4) * 0.08}"/>`;
    }).join('')}
    <path d="M-20 930 C250 860 510 1000 760 900 S1010 870 1100 930 L1100 1350 L-20 1350 Z" fill="#070812" opacity="0.76"/>
    <circle cx="${230 + variant * 116}" cy="330" r="170" fill="${glowColor}" opacity="0.14"/>
  `;
  const cosmic = `
    <circle cx="${760 - variant * 68}" cy="${260 + variant * 28}" r="118" fill="#e6ddff" opacity="0.46"/>
    <circle cx="${720 - variant * 68}" cy="${232 + variant * 28}" r="118" fill="#090817" opacity="0.88"/>
    ${Array.from({ length: 42 }, (_, index) => `<circle cx="${50 + ((index * 113 + hash) % 980)}" cy="${70 + ((index * 71 + hash) % 760)}" r="${index % 5 === 0 ? 3 : 1.6}" fill="#fff7df" opacity="${0.18 + (index % 5) * 0.08}"/>`).join('')}
    <path d="M-40 1010 C220 840 460 1060 720 900 S1040 820 1120 940 L1120 1350 L-40 1350 Z" fill="#110d23" opacity="0.72"/>
  `;
  const indoor = `
    <rect x="0" y="0" width="1080" height="1350" fill="#21140f" opacity="0.58"/>
    <path d="M100 820 V220 Q100 92 224 92 Q348 92 348 220 V820" fill="#120b08" stroke="${accent}" stroke-width="8" opacity="0.52"/>
    <path d="M704 850 V202 Q704 82 846 82 Q988 82 988 202 V850" fill="#130c08" stroke="${accent}" stroke-width="10" opacity="0.42"/>
    <circle cx="${220 + variant * 90}" cy="${250 + variant * 40}" r="166" fill="${glowColor}" opacity="0.16"/>
    <rect x="0" y="760" width="1080" height="590" fill="#0d0807" opacity="0.58"/>
    ${Array.from({ length: 5 }, (_, index) => `<rect x="${520 + index * 100}" y="${790 + index * 42}" width="360" height="56" rx="8" fill="#3a2114" opacity="${0.28 - index * 0.025}"/>`).join('')}
  `;

  const chosen = isCosmic ? cosmic : isCity ? city : isNature ? nature : isIndoor ? indoor : architecture;
  return `
    <defs>
      <radialGradient id="customGlow" cx="${variant % 2 ? '30%' : '72%'}" cy="${variant % 3 ? '24%' : '68%'}" r="62%">
        <stop offset="0%" stop-color="${glowColor}" stop-opacity="0.42"/>
        <stop offset="100%" stop-color="${glowColor}" stop-opacity="0"/>
      </radialGradient>
      <filter id="sceneSoftBlur" x="-8%" y="-8%" width="116%" height="116%">
        <feGaussianBlur stdDeviation="3.5"/>
      </filter>
    </defs>
    <g filter="url(#sceneSoftBlur)">
      <rect width="1080" height="1350" fill="#090817" opacity="0.62"/>
      <circle cx="${220 + variant * 92}" cy="${250 + variant * 56}" r="390" fill="url(#customGlow)"/>
      ${chosen}
      <rect width="1080" height="1350" fill="#000000" opacity="0.14"/>
    </g>
  `;
}

function renderSmallStars(accent, variant) {
  return Array.from({ length: 22 }, (_, index) => {
    const x = 90 + ((index * 173 + variant * 41) % 900);
    const y = 96 + ((index * 97 + variant * 67) % 680);
    const opacity = 0.16 + ((index + variant) % 5) * 0.04;
    return `<circle cx="${x}" cy="${y}" r="${index % 3 === 0 ? 3 : 1.7}" fill="${accent}" opacity="${opacity.toFixed(2)}"/>`;
  }).join('');
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
  if (image && shouldKeepPromptedBackgroundVisible(options, resolved)) {
    const background = renderSvgBackground(resolved, options);
    return `
      ${background}
      ${portraitOverlay(image, placement, resolved)}
    `;
  }
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
  return fullBleedPortrait(image, placement, resolved);
}

function portraitOverlay(image, placement, resolved) {
  const accent = resolved.properties.accent;
  const box = {
    right: { x: 626, y: 142, w: 378, h: 560, r: 26, opacity: 0.78 },
    full: { x: 626, y: 132, w: 390, h: 586, r: 28, opacity: 0.76 },
    center: { x: 656, y: 196, w: 316, h: 454, r: 24, opacity: 0.74 }
  }[placement] || { x: 626, y: 142, w: 378, h: 560, r: 26, opacity: 0.78 };
  const id = `portrait${placement}`;
  return `
    <defs>
      <clipPath id="${id}Clip">
        <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${box.r}"/>
      </clipPath>
      <linearGradient id="${id}Fade" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fff7df" stop-opacity="0.08"/>
        <stop offset="48%" stop-color="${accent}" stop-opacity="0"/>
        <stop offset="100%" stop-color="#02030a" stop-opacity="0.34"/>
      </linearGradient>
      <filter id="${id}Soft" x="-18%" y="-18%" width="136%" height="136%">
        <feDropShadow dx="0" dy="22" stdDeviation="28" flood-color="#000000" flood-opacity="0.42"/>
        <feColorMatrix type="matrix" values="1.07 0 0 0 0.03  0 1.02 0 0 0.015  0 0 0.95 0 0  0 0 0 1 0"/>
      </filter>
    </defs>
    <ellipse cx="${box.x + box.w / 2}" cy="${box.y + box.h - 34}" rx="${box.w * 0.44}" ry="58" fill="${accent}" opacity="0.18"/>
    <rect x="${box.x - 12}" y="${box.y - 12}" width="${box.w + 24}" height="${box.h + 24}" rx="${box.r + 10}" fill="#050611" opacity="0.34"/>
    <g clip-path="url(#${id}Clip)" filter="url(#${id}Soft)">
      <image href="${image}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" opacity="${box.opacity}" preserveAspectRatio="xMidYMid slice"/>
      <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${resolved.properties.bgEnd}" opacity="0.12"/>
      <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="url(#${id}Fade)"/>
    </g>
    <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" rx="${box.r}" fill="none" stroke="${accent}" stroke-width="2" stroke-opacity="0.52"/>
  `;
}

function fullBleedPortrait(image, placement, resolved) {
  const accent = resolved?.properties?.accent || '#d9a55d';
  const bgEnd = resolved?.properties?.bgEnd || '#050611';
  const box = {
    right: { x: 360, y: 0, w: 860, h: 1350, opacity: 0.96, fadeX: 360 },
    full: { x: 0, y: 0, w: 1080, h: 1350, opacity: 0.94, fadeX: 0 },
    center: { x: 128, y: 214, w: 824, h: 914, opacity: 0.92, fadeX: 128 }
  }[placement] || { x: 360, y: 0, w: 860, h: 1350, opacity: 0.96, fadeX: 360 };
  const id = `fullPortrait${placement}`;
  return `
    <defs>
      <linearGradient id="${id}Tint" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.12"/>
        <stop offset="54%" stop-color="${bgEnd}" stop-opacity="0.04"/>
        <stop offset="100%" stop-color="${bgEnd}" stop-opacity="0.34"/>
      </linearGradient>
      <linearGradient id="${id}Edge" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${bgEnd}" stop-opacity="${placement === 'full' ? '0.2' : '0.72'}"/>
        <stop offset="24%" stop-color="${bgEnd}" stop-opacity="${placement === 'full' ? '0.04' : '0.24'}"/>
        <stop offset="100%" stop-color="${bgEnd}" stop-opacity="0.18"/>
      </linearGradient>
      <filter id="${id}Grade">
        <feColorMatrix type="matrix" values="1.05 0 0 0 0.025  0 1.01 0 0 0.012  0 0 0.94 0 0  0 0 0 1 0"/>
      </filter>
    </defs>
    <image href="${image}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" opacity="${box.opacity}" preserveAspectRatio="xMidYMid slice" filter="url(#${id}Grade)"/>
    <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="url(#${id}Tint)"/>
    <rect x="${box.fadeX}" y="0" width="${Math.max(1080 - box.fadeX, box.w)}" height="1350" fill="url(#${id}Edge)"/>
  `;
}

function shouldKeepPromptedBackgroundVisible(options, resolved) {
  const type = resolved?.properties?.svgBackgroundType;
  if (!type || ['minimal', 'magazine'].includes(type)) return false;
  if (String(options.backgroundDescription || '').trim()) return true;
  return /\b(background|scene|setting|behind|church|bible|beach|sea|ocean|forest|garden|mountain|city|skyline|cafe|coffee|library|books|office|classroom|school|gym|fitness|temple|desert|sunrise)\b/i
    .test(`${options.creativePrompt || ''} ${options.backgroundDescription || ''}`);
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
