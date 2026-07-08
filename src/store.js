import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data');
const postsFile = path.join(dataDir, 'posts.json');
const settingsFile = path.join(dataDir, 'settings.json');

function ensureFile(file, fallback) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
}

function readJson(file, fallback) {
  ensureFile(file, fallback);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  ensureFile(file, Array.isArray(value) ? [] : {});
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

export function getPosts() {
  return readJson(postsFile, []);
}

export function savePosts(posts) {
  writeJson(postsFile, posts);
}

export function getSettings() {
  return readJson(settingsFile, {
    category: 'Self Worth',
    days: 30,
    tone: 'Inspirational',
    postTime: process.env.DEFAULT_POST_TIME || '09:00',
    animation: false
  });
}

export function saveSettings(settings) {
  writeJson(settingsFile, settings);
}
