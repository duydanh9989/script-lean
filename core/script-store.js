import { MATCH_TYPES, normalizeMatchValue } from './matcher.js';

export const SCHEMA_VERSION = 2;
export const PAGE_RUN_ATS = Object.freeze(['document_start', 'document_end', 'document_idle']);
export const SCHEDULE_RUN_ATS = Object.freeze(['scheduled', 'interval']);
const ALL_RUN_ATS = new Set([...PAGE_RUN_ATS, ...SCHEDULE_RUN_ATS, 'manual']);
export const SCRIPT_DEFAULTS = Object.freeze({
  name: 'Untitled',
  code: '',
  enabled: true,
  matchType: MATCH_TYPES.DOMAIN,
  matches: [],
  excludes: [],
  runAt: 'document_start',
  scheduleTime: '09:00',
  intervalSeconds: 3600,
  allFrames: false,
  world: 'MAIN',
  order: 0
});

function makeId() {
  if (globalThis.crypto?.randomUUID) return `script-${crypto.randomUUID()}`;
  return `script-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeScript(raw = {}, id, { legacy = false, enabled } = {}) {
  const now = Date.now();
  const resolvedId = id || raw.id || makeId();
  const legacyDomain = raw.domain ? [raw.domain] : [];
  const matches = Array.isArray(raw.matches)
    ? raw.matches.map(String).map(item => item.trim()).filter(Boolean)
    : normalizeMatchValue(raw.matches).concat(legacyDomain);

  const fallbackRunAt = legacy ? 'document_idle' : SCRIPT_DEFAULTS.runAt;
  const runAt = ALL_RUN_ATS.has(raw.runAt) ? raw.runAt : fallbackRunAt;
  const scheduleTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw.scheduleTime || '')) ? String(raw.scheduleTime) : SCRIPT_DEFAULTS.scheduleTime;
  const legacyIntervalSeconds = Number(raw.intervalMinutes) > 0 ? Number(raw.intervalMinutes) * 60 : 0;
  const intervalSeconds = Math.max(30, Math.round(Number(raw.intervalSeconds) || legacyIntervalSeconds || SCRIPT_DEFAULTS.intervalSeconds));

  const normalized = {
    ...SCRIPT_DEFAULTS,
    ...raw,
    id: resolvedId,
    name: String(raw.name || SCRIPT_DEFAULTS.name),
    code: String(raw.code || ''),
    enabled: enabled ?? raw.enabled !== false,
    matchType: raw.matchType || MATCH_TYPES.DOMAIN,
    matches: [...new Set(matches.length ? matches : ['*'])],
    excludes: Array.isArray(raw.excludes) ? raw.excludes.map(String).filter(Boolean) : [],
    runAt,
    scheduleTime,
    intervalSeconds,
    allFrames: raw.allFrames === true,
    world: raw.world === 'USER_SCRIPT' ? 'USER_SCRIPT' : 'MAIN',
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0,
    createdAt: Number(raw.createdAt) || now,
    updatedAt: Number(raw.updatedAt) || now
  };
  delete normalized.intervalMinutes;
  return normalized;
}

export async function migrateStorage() {
  const data = await chrome.storage.local.get([
    'scripts', '_disabledScripts', 'disabled_scripts', 'schemaVersion', 'migrationBackupV1'
  ]);
  const source = data.scripts || {};
  const disabledObject = data._disabledScripts || {};
  const disabledIds = new Set(Array.isArray(data.disabled_scripts) ? data.disabled_scripts : []);
  const scripts = {};
  const needsMigration = data.schemaVersion !== SCHEMA_VERSION || Object.keys(disabledObject).length > 0;

  for (const [id, script] of Object.entries(source)) {
    scripts[id] = normalizeScript(script, id, {
      legacy: data.schemaVersion !== SCHEMA_VERSION,
      enabled: disabledIds.has(id) ? false : undefined
    });
  }
  for (const [id, script] of Object.entries(disabledObject)) {
    scripts[id] = normalizeScript(script, id, { legacy: true, enabled: false });
  }

  if (needsMigration) {
    const update = { scripts, schemaVersion: SCHEMA_VERSION };
    if (!data.migrationBackupV1 && (Object.keys(source).length || Object.keys(disabledObject).length)) {
      update.migrationBackupV1 = { scripts: source, disabledScripts: disabledObject, migratedAt: Date.now() };
    }
    await chrome.storage.local.set(update);
    await chrome.storage.local.remove(['_disabledScripts', 'disabled_scripts']);
  }

  return scripts;
}

export async function getScripts() {
  return migrateStorage();
}

export async function getScript(id) {
  const scripts = await getScripts();
  return scripts[id] || null;
}

export async function saveScript(input) {
  const scripts = await getScripts();
  const now = Date.now();
  const id = input.id || makeId();
  const existing = scripts[id];
  const script = normalizeScript({
    ...existing,
    ...input,
    id,
    createdAt: existing?.createdAt || input.createdAt || now,
    updatedAt: now
  }, id);
  scripts[id] = script;
  await chrome.storage.local.set({ scripts, schemaVersion: SCHEMA_VERSION, lastModifiedAt: now });
  return script;
}

export async function deleteScript(id) {
  const scripts = await getScripts();
  delete scripts[id];
  await chrome.storage.local.set({ scripts, lastModifiedAt: Date.now() });
}

export async function setScriptEnabled(id, enabled) {
  const scripts = await getScripts();
  if (!scripts[id]) return null;
  scripts[id] = { ...scripts[id], enabled, updatedAt: Date.now() };
  await chrome.storage.local.set({ scripts, lastModifiedAt: Date.now() });
  return scripts[id];
}
