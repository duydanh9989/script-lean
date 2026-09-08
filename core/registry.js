import { buildUrlGuard, toChromeMatchPatterns } from './matcher.js';
import { getScripts, PAGE_RUN_ATS } from './script-store.js';

const REGISTRY_PREFIX = 'injectjs-';

function registryId(id) {
  return `${REGISTRY_PREFIX}${id}`.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
}

function wrapCode(script, { includeGuard = true } = {}) {
  const guard = includeGuard ? buildUrlGuard(script) : '';
  const name = JSON.stringify(script.name || 'Untitled');
  return `(() => {
    try {
      ${guard}
      ${script.code}
    } catch (error) {
      console.error('[ScriptInjector] ' + ${name} + ' failed:', error);
      throw error;
    }
  })();`;
}

export async function getUserScriptsStatus() {
  if (!chrome.userScripts?.getScripts) {
    return { available: false, reason: 'disabled' };
  }
  try {
    await chrome.userScripts.getScripts();
    return { available: true, reason: '' };
  } catch (error) {
    return { available: false, reason: error.message || 'unavailable' };
  }
}

export async function syncRegisteredScripts() {
  const status = await getUserScriptsStatus();
  if (!status.available) {
    await chrome.storage.local.set({ registryStatus: { ...status, updatedAt: Date.now(), errors: [] } });
    return status;
  }

  const registered = await chrome.userScripts.getScripts();
  const ownedIds = registered.filter(item => item.id.startsWith(REGISTRY_PREFIX)).map(item => item.id);
  if (ownedIds.length) await chrome.userScripts.unregister({ ids: ownedIds });

  const scripts = await getScripts();
  const errors = [];
  let registeredCount = 0;

  for (const script of Object.values(scripts).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id))) {
    // v2.4.3: filter presets (__filter_*__) are managed exclusively by the
    // toggle-aware chrome.scripting registrations + active injection in
    // background.js. Registering them here too would triple-inject and would
    // require the "Allow User Scripts" flag for something that no longer
    // needs it.
    if (script.id.startsWith('__filter_')) continue;
    if (!script.enabled || !PAGE_RUN_ATS.includes(script.runAt)) continue;
    try {
      const registration = {
        id: registryId(script.id),
        matches: toChromeMatchPatterns(script),
        js: [{ code: wrapCode(script) }],
        runAt: script.runAt,
        allFrames: script.allFrames,
        world: script.world
      };

      if (script.excludes?.length && script.matchType !== 'regex') {
        registration.excludeMatches = toChromeMatchPatterns({ ...script, matches: script.excludes });
      }
      await chrome.userScripts.register([registration]);
      registeredCount += 1;
    } catch (error) {
      errors.push({ id: script.id, name: script.name, error: error.message });
    }
  }

  const result = { available: true, registeredCount, errors, updatedAt: Date.now() };
  await chrome.storage.local.set({ registryStatus: result });
  return result;
}

export async function executeImmediately({ tabId, code, allFrames = false, world = 'MAIN', name = 'Inline Run' }) {
  const status = await getUserScriptsStatus();
  if (status.available && chrome.userScripts.execute) {
    const result = await chrome.userScripts.execute({
      target: { tabId, allFrames },
      js: [{ code: wrapCode({ code, name }, { includeGuard: false }) }],
      world
    });
    return { method: 'userScripts', frames: result.length, results: result };
  }

  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames },
    // scripting.executeScript doesn't support USER_SCRIPT world; fallback uses MAIN.
    world: 'MAIN',
    func: (source, scriptName) => {
      try {
        (new Function(source))();
        return { success: true };
      } catch (error) {
        console.error(`[ScriptInjector] ${scriptName} failed:`, error);
        return { success: false, error: error.message };
      }
    },
    args: [code, name]
  });
  const failed = results.find(item => item.result?.success === false);
  if (failed) throw new Error(failed.result.error);
  return { method: 'scripting-fallback', frames: results.length, results };
}
