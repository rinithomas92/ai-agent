import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const outputDir = path.join(root, 'public', 'generated');

export async function generateCartoonStoryboard(input = {}) {
  if (!process.env.OPENAI_API_KEY) return buildDemoStoryboard(input);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const duration = clampNumber(input.duration, 15, 120, 30);
  const sceneCount = Math.max(3, Math.min(6, Math.round(duration / 8)));
  const prompt = [
    'Create a concise storyboard for a short YouTube cartoon.',
    `Theme: ${input.theme}. Audience: ${input.audience}. Style: ${input.style}.`,
    `Target duration: ${duration} seconds. Use exactly ${sceneCount} scenes.`,
    input.prompt ? `Creator direction: ${input.prompt}` : '',
    input.uploadedImagePath ? 'A creator-provided image will be blended into the animation; make the scene descriptions compatible with that visual.' : '',
    'Each scene needs onScreenText, narration, visual, and durationSeconds.',
    'Keep narration age-appropriate, clear, engaging, and practical. Avoid copyrighted characters.',
    'Return strict JSON only.'
  ].filter(Boolean).join('\n');

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    input: prompt,
    text: {
      format: {
        type: 'json_schema',
        name: 'cartoon_storyboard',
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'description', 'scenes'],
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            scenes: {
              type: 'array',
              minItems: sceneCount,
              maxItems: sceneCount,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['onScreenText', 'narration', 'visual', 'durationSeconds'],
                properties: {
                  onScreenText: { type: 'string' },
                  narration: { type: 'string' },
                  visual: { type: 'string' },
                  durationSeconds: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  });

  const storyboard = JSON.parse(response.output_text);
  return normalizeStoryboard(storyboard, input, duration);
}

export async function generateCartoonVoiceover(storyboard, input = {}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for AI voiceover.');
  }

  const narrationText = storyboard.scenes
    .map((scene) => scene.narration)
    .filter(Boolean)
    .join(' ')
    .trim();
  if (!narrationText) throw new Error('Storyboard has no narration to voice.');

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const speech = await client.audio.speech.create({
    model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    voice: process.env.OPENAI_TTS_VOICE || 'alloy',
    input: narrationText
  });

  const buffer = Buffer.from(await speech.arrayBuffer());
  await fs.mkdir(outputDir, { recursive: true });
  const filename = `${randomUUID()}-cartoon-voice.mp3`;
  const filePath = path.join(outputDir, filename);
  await fs.writeFile(filePath, buffer);

  const publicPath = `/generated/${filename}`;
  const publicUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5177'}${publicPath}`;
  return { filePath, publicPath, publicUrl, narrationText };
}

export async function createCartoonVideo(storyboard, options = {}) {
  await fs.mkdir(outputDir, { recursive: true });
  const id = randomUUID();
  const svgFilename = `${id}-cartoon.svg`;
  const htmlFilename = `${id}-cartoon-player.html`;
  const svgPath = path.join(outputDir, svgFilename);
  const htmlPath = path.join(outputDir, htmlFilename);
  const uploadedImageDataUri = await readPublicImageAsDataUri(options.uploadedImagePath);
  const normalized = normalizeStoryboard(storyboard, options, clampNumber(options.duration, 15, 120, 30));
  const totalDuration = normalized.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  const svg = buildAnimatedSvg(normalized, { totalDuration, uploadedImageDataUri });
  await fs.writeFile(svgPath, svg, 'utf8');

  const svgPublicPath = `/generated/${svgFilename}`;
  const playerPublicPath = `/generated/${htmlFilename}`;
  const audioPath = options.audioPath || null;
  const html = buildPlayerHtml(normalized, svgPublicPath, audioPath, totalDuration);
  await fs.writeFile(htmlPath, html, 'utf8');

  const base = process.env.PUBLIC_BASE_URL || 'http://localhost:5177';
  return {
    filePath: svgPath,
    publicPath: svgPublicPath,
    publicUrl: `${base}${svgPublicPath}`,
    playerFilePath: htmlPath,
    playerPublicPath,
    playerPublicUrl: `${base}${playerPublicPath}`,
    totalDuration
  };
}

function buildDemoStoryboard(input) {
  const duration = clampNumber(input.duration, 15, 120, 30);
  const sceneCount = Math.max(3, Math.min(5, Math.round(duration / 8)));
  const perScene = duration / sceneCount;
  const theme = String(input.theme || 'A small act of courage');
  const day = input.dayNumber || 1;
  const sceneTemplates = [
    ['A curious beginning', `Something unexpected happens around ${theme.toLowerCase()}.`, 'Introduce the main character in a bright establishing shot.'],
    ['The challenge appears', 'The easy answer does not quite work, so our character has to think again.', 'Show a playful obstacle with clear facial expressions and motion.'],
    ['Try a better idea', 'A friend asks a better question and they test a new approach together.', 'Shift to a collaborative scene with energetic movement.'],
    ['The lesson clicks', 'They discover that curiosity and kindness can solve more than stubbornness.', 'Use a warm visual payoff and a clear moment of realization.'],
    ['Carry it forward', 'The character uses the lesson again and invites the viewer to try it too.', 'End with an upbeat wide shot and a simple visual call to action.']
  ];

  return {
    title: `${theme} — Day ${day}`,
    description: `A short ${input.style || 'colorful 2D cartoon'} story about ${theme.toLowerCase()} for ${input.audience || 'kids and families'}.`,
    scenes: sceneTemplates.slice(0, sceneCount).map(([onScreenText, narration, visual]) => ({
      onScreenText,
      narration,
      visual,
      durationSeconds: Number(perScene.toFixed(2))
    }))
  };
}

function normalizeStoryboard(storyboard, input, targetDuration) {
  const scenes = Array.isArray(storyboard?.scenes) && storyboard.scenes.length
    ? storyboard.scenes
    : buildDemoStoryboard(input).scenes;
  const rawDurations = scenes.map((scene) => Math.max(2, Number(scene.durationSeconds) || targetDuration / scenes.length));
  const rawTotal = rawDurations.reduce((sum, value) => sum + value, 0) || targetDuration;
  const scale = targetDuration / rawTotal;

  return {
    title: String(storyboard?.title || input.theme || 'Cartoon Story'),
    description: String(storyboard?.description || `A short animated story about ${input.theme || 'today’s theme'}.`),
    scenes: scenes.map((scene, index) => ({
      onScreenText: String(scene.onScreenText || `Scene ${index + 1}`),
      narration: String(scene.narration || ''),
      visual: String(scene.visual || ''),
      durationSeconds: Number(Math.max(2, rawDurations[index] * scale).toFixed(2))
    }))
  };
}

function buildAnimatedSvg(storyboard, { totalDuration, uploadedImageDataUri }) {
  let elapsed = 0;
  const sceneGroups = storyboard.scenes.map((scene, index) => {
    const begin = elapsed;
    const duration = scene.durationSeconds;
    elapsed += duration;
    const hue = (index * 61 + 210) % 360;
    const image = uploadedImageDataUri
      ? `<image href="${uploadedImageDataUri}" x="620" y="210" width="300" height="380" preserveAspectRatio="xMidYMid slice" opacity="0.82"/>`
      : `<circle cx="775" cy="390" r="145" fill="hsla(${(hue + 38) % 360}, 76%, 72%, 0.82)"/><circle cx="720" cy="350" r="18" fill="#1d2440"/><circle cx="830" cy="350" r="18" fill="#1d2440"/><path d="M720 435 Q775 475 830 435" fill="none" stroke="#1d2440" stroke-width="12" stroke-linecap="round"/>`;
    return `
      <g opacity="0">
        <set attributeName="opacity" to="1" begin="${begin}s" dur="${duration}s" repeatCount="indefinite"/>
        <rect width="1280" height="720" fill="hsl(${hue}, 55%, 18%)"/>
        <circle cx="1050" cy="100" r="190" fill="hsla(${(hue + 55) % 360}, 85%, 65%, 0.18)"/>
        <circle cx="104" cy="620" r="230" fill="hsla(${(hue + 110) % 360}, 85%, 65%, 0.13)"/>
        ${image}
        <text x="92" y="160" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" fill="#f2c96d">SCENE ${index + 1}</text>
        ${svgTextBlock(scene.onScreenText, 92, 250, 48, 30, 3)}
        ${svgTextBlock(scene.narration, 92, 470, 27, 48, 4, '#e8ecff')}
        <text x="92" y="650" font-family="Arial, Helvetica, sans-serif" font-size="19" fill="#aeb7dc">${escapeXml(scene.visual).slice(0, 100)}</text>
      </g>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <title>${escapeXml(storyboard.title)}</title>
    <rect width="1280" height="720" fill="#11152a"/>
    ${sceneGroups}
    <text x="1188" y="670" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#ffffff" opacity="0.7">${escapeXml(storyboard.title)}</text>
    <animate attributeName="opacity" values="1;1" dur="${totalDuration}s" repeatCount="indefinite"/>
  </svg>`;
}

function buildPlayerHtml(storyboard, svgPath, audioPath, totalDuration) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeXml(storyboard.title)}</title>
<style>html,body{margin:0;background:#080b14;color:#fff;font-family:Arial,sans-serif}main{max-width:1100px;margin:auto;padding:20px}object{width:100%;aspect-ratio:16/9;border:0;border-radius:18px;background:#11152a}audio{width:100%;margin-top:14px}.meta{opacity:.7}</style>
</head><body><main><object data="${svgPath}" type="image/svg+xml"></object>${audioPath ? `<audio src="${audioPath}" controls autoplay></audio>` : ''}<p class="meta">${totalDuration} second animated storyboard preview.</p></main></body></html>`;
}

async function readPublicImageAsDataUri(publicPath) {
  if (!publicPath || !publicPath.startsWith('/uploads/')) return null;
  try {
    const filePath = path.join(root, 'public', publicPath.replace(/^\//, ''));
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const buffer = await fs.readFile(filePath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
}

function svgTextBlock(text, x, y, size, maxChars, maxLines, fill = '#ffffff') {
  const lines = wrapText(text, maxChars, maxLines);
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="700" fill="${fill}">${lines.map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : Math.round(size * 1.25)}">${escapeXml(line)}</tspan>`).join('')}</text>`;
}

function wrapText(value, maxChars, maxLines) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (words.join(' ').length > lines.join(' ').length && lines.length) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,;:!?]+$/, '')}…`;
  }
  return lines;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function escapeXml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[char]);
}
