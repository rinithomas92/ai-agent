// Prompt Library storage. Routes call these functions and never need to know
// which backend is active:
//   - Supabase (table saved_prompts) when SUPABASE_URL and a key are configured
//   - local data/prompts.json (promptStore.js) otherwise
//
// Once Supabase is configured it is the only source of truth: if it fails, the
// call fails with a PromptStorageError. It never falls back to writing local JSON.

import * as localStore from './promptStore.js';
import { normalizeTemplateId } from '../data/contentTemplates.js';

const TABLE = 'saved_prompts';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PromptStorageError extends Error {
  constructor(message, status = 503) {
    super(message);
    this.name = 'PromptStorageError';
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Storage selection
// ---------------------------------------------------------------------------

// Pure function so the selection rules can be tested without touching process.env.
export function resolvePromptStorageConfig(env = process.env) {
  const url = String(env.SUPABASE_URL || '').trim();
  const serviceKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || '').trim();
  const key = serviceKey || anonKey;

  // DEMO_MODE=true promises no external calls at all, so it also keeps prompts local.
  if (url && key && String(env.DEMO_MODE || '').trim().toLowerCase() === 'true') {
    return { mode: 'local', warning: 'DEMO_MODE=true: Supabase settings are ignored; using local data/prompts.json.' };
  }
  if (url && key) {
    // Server-side access prefers the service role key (bypasses RLS); the anon key needs RLS policies.
    return { mode: 'supabase', url, key, keyType: serviceKey ? 'service_role' : 'anon', warning: null };
  }
  if (url || key) {
    const missing = url ? 'SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY' : 'SUPABASE_URL';
    return { mode: 'local', warning: `Supabase is only partly configured (${missing} is missing); using local data/prompts.json.` };
  }
  return { mode: 'local', warning: null };
}

const config = resolvePromptStorageConfig();
if (config.warning) console.warn(`[prompt library] ${config.warning}`);

// Safe to expose in /api/health: no URL, no key.
export function getPromptStorageStatus() {
  return {
    promptStorage: config.mode,
    ...(config.mode === 'supabase' ? { promptStorageKeyType: config.keyType } : {}),
    ...(config.warning ? { promptStorageWarning: config.warning } : {})
  };
}

let clientPromise = null;
function getClient() {
  // Loaded lazily so local mode never imports the Supabase package.
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js')
      .then(({ createClient }) => createClient(config.url, config.key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      }))
      .catch((error) => {
        clientPromise = null;
        throw new PromptStorageError(`Prompt Library database is not available: could not start the Supabase client (${error.message}).`);
      });
  }
  return clientPromise;
}

// ---------------------------------------------------------------------------
// Public API (same functions as promptStore.js, but async)
// ---------------------------------------------------------------------------

export async function getPrompts() {
  if (config.mode === 'local') return localStore.getPrompts();
  const rows = (await run('load saved prompts', (db) => db.from(TABLE).select('*'))) ?? [];
  return rows.map(fromRow).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPromptById(id) {
  if (config.mode === 'local') return localStore.getPromptById(id);
  if (!UUID_PATTERN.test(String(id))) return null;
  const row = await run('load the saved prompt', (db) => db.from(TABLE).select('*').eq('id', id).maybeSingle());
  return row ? fromRow(row) : null;
}

// Case-insensitive and whitespace-trimmed, exactly like the local store.
export async function isPromptNameTaken(name, exceptId = null) {
  if (config.mode === 'local') return localStore.isPromptNameTaken(name, exceptId);
  const normalized = String(name).trim().toLowerCase();
  const rows = (await run('check prompt names', (db) => db.from(TABLE).select('id,name'))) ?? [];
  return rows.some((row) => row.id !== exceptId && String(row.name).trim().toLowerCase() === normalized);
}

export async function createPrompt(input) {
  if (config.mode === 'local') return localStore.createPrompt(input);
  const row = await run('save the prompt', (db) => db.from(TABLE).insert(toRow({
    name: input.name,
    promptText: input.promptText,
    category: input.category || '',
    creativeDirection: input.creativeDirection || '',
    defaultTemplate: normalizeTemplateId(input.defaultTemplate)
  })).select('*').single());
  return fromRow(row);
}

export async function updatePrompt(id, changes) {
  if (config.mode === 'local') return localStore.updatePrompt(id, changes);
  if (!UUID_PATTERN.test(String(id))) return null;

  const { markUsed, ...fields } = changes;
  const patch = toRow(fields);
  const now = new Date().toISOString();
  // Same timestamp rules as the local store: content edits bump updated_at,
  // selecting a prompt (markUsed) only sets last_used_at.
  if (Object.keys(patch).length) patch.updated_at = now;
  if (markUsed) patch.last_used_at = now;
  if (!Object.keys(patch).length) return getPromptById(id);

  const row = await run('update the prompt', (db) => db.from(TABLE).update(patch).eq('id', id).select('*').maybeSingle());
  return row ? fromRow(row) : null;
}

export async function deletePrompt(id) {
  if (config.mode === 'local') return localStore.deletePrompt(id);
  if (!UUID_PATTERN.test(String(id))) return false;
  const rows = (await run('delete the prompt', (db) => db.from(TABLE).delete().eq('id', id).select('id'))) ?? [];
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Field mapping: app camelCase <-> database snake_case
// ---------------------------------------------------------------------------

const FIELD_TO_COLUMN = {
  name: 'name',
  promptText: 'prompt_text',
  category: 'category',
  creativeDirection: 'creative_direction',
  defaultTemplate: 'default_template'
};

// Only editable content fields are written; id and timestamps come from the database.
export function toRow(fields) {
  const row = {};
  for (const [field, column] of Object.entries(FIELD_TO_COLUMN)) {
    if (fields[field] === undefined) continue;
    row[column] = field === 'name' ? String(fields[field]).trim() : fields[field];
  }
  return row;
}

export function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    promptText: row.prompt_text,
    category: row.category ?? '',
    creativeDirection: row.creative_direction ?? '',
    defaultTemplate: normalizeTemplateId(row.default_template),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    lastUsedAt: row.last_used_at ? toIso(row.last_used_at) : null
  };
}

function toIso(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value ?? null : date.toISOString();
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

async function run(action, buildQuery) {
  const db = await getClient();
  let result;
  try {
    result = await buildQuery(db);
  } catch (error) {
    throw new PromptStorageError(`Prompt Library database is not available: could not ${action} (${error.message}).`);
  }
  const { data, error, status } = result;
  if (error) {
    const detail = error.message || error.code || 'unknown error';
    // 23505 = unique violation (the lower(name) index): two saves raced with the same name.
    if (error.code === '23505') throw new PromptStorageError('A prompt with this name already exists.', 409);
    // No HTTP status means the request never reached Supabase (network, DNS, wrong URL).
    if (!status) throw new PromptStorageError(`Prompt Library database is not available: could not ${action} (${detail}).`, 503);
    if (error.code === '42P01' || error.code === 'PGRST205') {
      throw new PromptStorageError(`Prompt Library database error: table "${TABLE}" was not found. Run supabase/schema.sql in the Supabase SQL editor.`, 500);
    }
    if (error.code === '42501') {
      throw new PromptStorageError(`Prompt Library database error: permission denied on "${TABLE}". Use SUPABASE_SERVICE_ROLE_KEY, or add RLS policies for the anon key (see supabase/schema.sql).`, 500);
    }
    throw new PromptStorageError(`Prompt Library database error: could not ${action} (${detail}).`, 500);
  }
  return data;
}
