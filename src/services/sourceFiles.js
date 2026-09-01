import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const storageDir = path.join(root, 'data', 'source-files');
const maxUploadBytes = 12 * 1024 * 1024;
const maxStoredCharacters = 120000;
const supportedExtensions = new Set(['.txt', '.md', '.csv', '.json', '.docx', '.pdf']);

export async function saveSourceFileUpload({ fileData, filename }) {
  const parsed = parseDataUrl(fileData);
  if (parsed.buffer.length > maxUploadBytes) {
    throw new Error('Source file must be 12MB or smaller.');
  }

  const safeFilename = sanitizeFilename(filename);
  const ext = path.extname(safeFilename).toLowerCase();
  if (!supportedExtensions.has(ext)) {
    throw new Error('Unsupported source file. Use TXT, MD, CSV, JSON, DOCX, or PDF.');
  }

  let extractedText = await extractText(parsed.buffer, ext);
  extractedText = normalizeText(extractedText);
  if (!extractedText) {
    throw new Error('No readable text could be extracted from the uploaded source file.');
  }

  const originalCharacterCount = extractedText.length;
  const truncated = originalCharacterCount > maxStoredCharacters;
  if (truncated) extractedText = extractedText.slice(0, maxStoredCharacters);

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const summary = buildSummary(extractedText);
  const record = {
    id,
    filename: safeFilename,
    mimeType: parsed.mimeType,
    size: parsed.buffer.length,
    characterCount: extractedText.length,
    originalCharacterCount,
    truncated,
    summary,
    text: extractedText,
    createdAt
  };

  await fs.mkdir(storageDir, { recursive: true });
  await fs.writeFile(path.join(storageDir, `${id}${ext}`), parsed.buffer);
  await fs.writeFile(path.join(storageDir, `${id}.json`), JSON.stringify(record, null, 2), 'utf8');

  return publicRecord(record);
}

export async function getSourceFile(id) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(String(id))) return null;
  try {
    const raw = await fs.readFile(path.join(storageDir, `${id}.json`), 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function sourceContextForPrompt(sourceFile) {
  if (!sourceFile?.text) return '';
  return [
    `Source file: ${sourceFile.filename}`,
    sourceFile.summary ? `Summary: ${sourceFile.summary}` : '',
    'Extracted content:',
    sourceFile.text
  ].filter(Boolean).join('\n\n');
}

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/s);
  if (!match) throw new Error('Source file upload must be a base64 data URL.');
  return {
    mimeType: match[1] || 'application/octet-stream',
    buffer: Buffer.from(match[2], 'base64')
  };
}

async function extractText(buffer, ext) {
  if (['.txt', '.md', '.csv'].includes(ext)) return buffer.toString('utf8');

  if (ext === '.json') {
    const raw = buffer.toString('utf8');
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }

  if (ext === '.docx') {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  if (ext === '.pdf') {
    const pdfParse = (await import('pdf-parse')).default;
    const result = await pdfParse(buffer);
    return result.text || '';
  }

  return '';
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function buildSummary(text) {
  const compact = String(text).replace(/\s+/g, ' ').trim();
  if (compact.length <= 360) return compact;
  return `${compact.slice(0, 357).trimEnd()}...`;
}

function sanitizeFilename(value) {
  const base = path.basename(String(value || 'source.txt'));
  return base.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'source.txt';
}

function publicRecord(record) {
  const { text, ...safe } = record;
  return safe;
}
