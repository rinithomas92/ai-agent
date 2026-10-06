import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { normalizeTemplateId } from '../data/contentTemplates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const dataDir = path.join(root, 'data');
const promptsFile = path.join(dataDir, 'prompts.json');

// Saved prompts live in their own file so clearing or replacing the schedule
// (which rewrites data/posts.json) never touches them.
function readPrompts() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(promptsFile)) fs.writeFileSync(promptsFile, '[]');
  const parsed = JSON.parse(fs.readFileSync(promptsFile, 'utf8') || '[]');
  // Older prompts stored a Theme value (e.g. "minimalLight") in defaultTemplate;
  // anything that is not a Content Template ID falls back to the default template.
  return Array.isArray(parsed)
    ? parsed.map((prompt) => ({ ...prompt, defaultTemplate: normalizeTemplateId(prompt.defaultTemplate) }))
    : [];
}

function writePrompts(prompts) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(promptsFile, JSON.stringify(prompts, null, 2));
}

export function getPrompts() {
  return readPrompts().sort((a, b) => a.name.localeCompare(b.name));
}

export function getPromptById(id) {
  return readPrompts().find((prompt) => prompt.id === id) || null;
}

export function isPromptNameTaken(name, exceptId = null) {
  const normalized = name.trim().toLowerCase();
  return readPrompts().some((prompt) => prompt.id !== exceptId && prompt.name.trim().toLowerCase() === normalized);
}

export function createPrompt(input) {
  const prompts = readPrompts();
  const now = new Date().toISOString();
  const prompt = {
    id: randomUUID(),
    name: input.name.trim(),
    promptText: input.promptText,
    category: input.category || '',
    creativeDirection: input.creativeDirection || '',
    defaultTemplate: normalizeTemplateId(input.defaultTemplate),
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null
  };
  prompts.push(prompt);
  writePrompts(prompts);
  return prompt;
}

export function updatePrompt(id, changes) {
  const prompts = readPrompts();
  const prompt = prompts.find((item) => item.id === id);
  if (!prompt) return null;

  const { markUsed, ...fields } = changes;
  const contentFields = ['name', 'promptText', 'category', 'creativeDirection', 'defaultTemplate'];
  const hasContentChange = contentFields.some((key) => fields[key] !== undefined);
  for (const key of contentFields) {
    if (fields[key] !== undefined) prompt[key] = key === 'name' ? fields[key].trim() : fields[key];
  }
  if (hasContentChange) prompt.updatedAt = new Date().toISOString();
  if (markUsed) prompt.lastUsedAt = new Date().toISOString();

  writePrompts(prompts);
  return prompt;
}

export function deletePrompt(id) {
  const prompts = readPrompts();
  const nextPrompts = prompts.filter((prompt) => prompt.id !== id);
  if (nextPrompts.length === prompts.length) return false;
  writePrompts(nextPrompts);
  return true;
}
