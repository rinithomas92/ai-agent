import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const outputDir = path.join(root, 'public', 'generated');

export async function generateOpenAIBackgroundImage(prompt, options = {}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for OpenAI image generation.');
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const imagePrompt = [
    'Create a premium vertical 4:5 social-media background image.',
    String(prompt || '').trim(),
    options.uploadedImagePath
      ? 'The final quote-card renderer will place the uploaded creator image separately, so leave natural negative space for a portrait and quote text.'
      : 'Leave intentional negative space for quote text.',
    'Do not render readable words, captions, logos, watermarks, or typography inside the background image.'
  ].filter(Boolean).join('\n');

  const response = await client.images.generate({
    model,
    prompt: imagePrompt,
    size: process.env.OPENAI_IMAGE_SIZE || '1024x1536'
  });

  const image = response.data?.[0];
  if (!image) throw new Error('OpenAI image generation returned no image.');

  let buffer;
  if (image.b64_json) {
    buffer = Buffer.from(image.b64_json, 'base64');
  } else if (image.url) {
    const download = await fetch(image.url);
    if (!download.ok) {
      throw new Error(`Unable to download generated OpenAI image (${download.status}).`);
    }
    buffer = Buffer.from(await download.arrayBuffer());
  } else {
    throw new Error('OpenAI image generation returned neither image data nor a URL.');
  }

  await fs.mkdir(outputDir, { recursive: true });
  const filename = `${randomUUID()}-openai.png`;
  const filePath = path.join(outputDir, filename);
  await fs.writeFile(filePath, buffer);

  const publicPath = `/generated/${filename}`;
  const publicUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5177'}${publicPath}`;
  return { filePath, publicPath, publicUrl };
}
