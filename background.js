import { scriptMatchesUrl } from './core/matcher.js';
import { getScripts, migrateStorage, PAGE_RUN_ATS } from './core/script-store.js';
import { executeImmediately, getUserScriptsStatus, syncRegisteredScripts } from './core/registry.js';
import { handleScheduledAlarm, syncScheduledScripts } from './core/scheduler.js';
import {
  addSubscription,
  removeSubscription,
  toggleSubscription,
  refreshSubscription,
  getSubscriptions,
  applyAllSubscriptions,
  getCustomFilterText,
  setCustomFilterText
} from './core/filterlist.js';

let syncTimer = null;

// ── v2.4.3: Toggle-aware MAIN-world filter injection ────────────────────────
// History:
//   ≤v2.3 : filters were only reachable through chrome.userScripts, which is
//           gated by the "Allow User Scripts" developer flag — on machines
//           without it nothing was injected (the "beacon still true" bug).
//   v2.4+ : over-corrected — a manifest static content_scripts entry plus
//           active executeScript injected ALL 7 filters unconditionally.
//           The popup toggles kept writing storage but had zero effect, and
//           modules the user had explicitly turned off came back anyway
//           (fingerprint.js poisoning screen/devicePixelRatio broke scroll,
//           expand and lazy-load on google.com search).
//   v2.4.3: per-module dynamic registration (chrome.scripting
//           .registerContentScripts, persistAcrossSessions, world MAIN,
//           document_start — block-before-render preserved) + the field-proven
//           active executeScript fallback. BOTH paths are gated by the popup
//           toggle flags (scripts.__filter_<key>__.enabled, default ON) and by
//           masterEnabled. DNR rulesets follow the ads/analytics chips.
// v2.5.0: per-module `allFrames`. v2.4.3 hard-coded allFrames:true for every
// registration, forcing ALL modules into EVERY subframe. That wasted parse+
// exec time per iframe and widened the breakage surface (fingerprint.js in
// google.com's sub-frames was part of the scroll/expand/lazy-load damage).
// Frames policy now matches what each module actually needs:
//   all frames : surrogates, privacy (beacons fire from iframes), ads
//                (ad iframes ARE subframes), analytics (trackers embed too)
//   top frame  : fingerprint (layout APIs — the google.com breaker), video,
//                bypass, aggressive (cosmetic collapse targets the top DOM)
const FILTER_MODULES = {
  surrogates:  { file: 'filters/surrogates.js',  rulesets: [], allFrames: true },
  fingerprint: { file: 'filters/fingerprint.js', rulesets: [], allFrames: false },
  privacy:     { file: 'filters/privacy.js',     rulesets: [], allFrames: true },
  video:       { file: 'filters/video.js',       rulesets: [], allFrames: false },
  ads:         { file: 'filters/ads.js',         rulesets: ['rules_adnetworks', 'rules_superadblock'], allFrames: true },
  analytics:   { file: 'filters/analytics.js',   rulesets: ['rules_core', 'rules_telemetry'], allFrames: true },
  bypass:      { file: 'filters/bypass.js',      rulesets: [], allFrames: false },
  aggressive:  { file: 'filters/aggressive.js',  rulesets: ['rules_aggressive'], allFrames: false }
};
const FILTER_KEYS = Object.keys(FILTER_MODULES);
const ALL_RULESET_IDS = ['rules_core', 'rules_adnetworks', 'rules_telemetry', 'rules_superadblock', 'rules_aggressive'];
// v2.4.1 registered the guard under this id; v2.4.3 manages per-module ids.
const LEGACY_REGISTRATION_IDS = ['sl-mainworld-guard'];
const COSMETIC_REG_ID = 'sl-cosmetic-css';
// v2.5.0: the Aggressive chip mounts a SECOND, broader cosmetic layer.
const COSMETIC_AGGRESSIVE_REG_ID = 'sl-cosmetic-aggressive-css';
const filterRegId = (key) => `sl-filter-${key}`;

function filterEntryEnabled(scripts, key) {
  const entry = scripts?.[`__filter_${key}__`];
  // Default ON: an absent entry means "running" (matches the v2.4.x behavior
  // the user relies on for adblockbench). An explicitly stored enabled:false
  // means the user turned that module off — honor it on every injection path.
  // v2.5.0 EXCEPTION: 'aggressive' is a new optional module — absent = OFF
  // (popup agrees; both sides must never disagree on the default).
  if (entry) return entry.enabled === true;
  return key !== 'aggressive';
}

async function getFilterToggleStates() {
  const { scripts, masterEnabled } = await chrome.storage.local.get(['scripts', 'masterEnabled']);
  const master = masterEnabled !== false;
  const states = {};
  for (const key of FILTER_KEYS) {
    states[key] = master && filterEntryEnabled(scripts, key);
  }
  return states;
}

// Reconcile the chrome.scripting registration registry with the toggle state.
// Idempotent: one getRegisteredContentScripts IPC, then only the diff.
async function syncFilterRegistrations() {
  try {
    if (!chrome.scripting?.registerContentScripts) return null;
    const states = await getFilterToggleStates();

    const desired = new Map();
    for (const key of FILTER_KEYS) {
      if (!states[key]) continue;
      desired.set(filterRegId(key), {
        id: filterRegId(key),
        matches: ['http://*/*', 'https://*/*'],
        js: [FILTER_MODULES[key].file],
        runAt: 'document_start',
        world: 'MAIN',
        allFrames: FILTER_MODULES[key].allFrames !== false,
        persistAcrossSessions: true
      });
    }
    // Cosmetic element-hiding rides the Ads chip (document_start CSS, every
    // frame) — unregistering the chip also removes the CSS.
    if (states.ads) {
      desired.set(COSMETIC_REG_ID, {
        id: COSMETIC_REG_ID,
        matches: ['http://*/*', 'https://*/*'],
        css: ['cosmetic.css'],
        runAt: 'document_start',
        allFrames: true,
        persistAcrossSessions: true
      });
    }
    // v2.5.0: Aggressive tier CSS — broader generic patterns, rides the
    // Aggressive chip. OFF by default; may over-match by design.
    if (states.aggressive) {
      desired.set(COSMETIC_AGGRESSIVE_REG_ID, {
        id: COSMETIC_AGGRESSIVE_REG_ID,
        matches: ['http://*/*', 'https://*/*'],
        css: ['cosmetic-aggressive.css'],
        runAt: 'document_start',
        allFrames: true,
        persistAcrossSessions: true
      });
    }

    const registered = await chrome.scripting.getRegisteredContentScripts();
    const registeredIds = new Set(registered.map(s => s.id));

    // Retire legacy registrations (v2.4.1 guard id is superseded by sl-filter-surrogates).
    const legacyIds = LEGACY_REGISTRATION_IDS.filter(id => registeredIds.has(id));
    if (legacyIds.length) {
      try { await chrome.scripting.unregisterContentScripts({ ids: legacyIds }); } catch { /* */ }
      legacyIds.forEach(id => registeredIds.delete(id));
    }

    const toRegister = [...desired.values()].filter(r => !registeredIds.has(r.id));
    const toUnregister = [...registeredIds].filter(id => id.startsWith('sl-') && !desired.has(id));

    if (toUnregister.length) {
      try { await chrome.scripting.unregisterContentScripts({ ids: toUnregister }); } catch { /* */ }
    }
    if (toRegister.length) {
      try {
        await chrome.scripting.registerContentScripts(toRegister);
      } catch (e) {
        console.warn('[ScriptInjector] filter registration warning:', e);
      }
    }
    return { registered: desired.size, states };
  } catch (e) {
    console.warn('[ScriptInjector] syncFilterRegistrations warning:', e);
    return null;
  }
}

// DNR rulesets follow the chips: Ads → adnetworks+superadblock,
// Analytics → core+telemetry. Diff-based so cold starts stay O(1).
async function syncEnabledRulesets() {
  try {
    if (!chrome.declarativeNetRequest?.updateEnabledRulesets) return;
    const states = await getFilterToggleStates();
    const wantEnabled = new Set();
    for (const key of FILTER_KEYS) {
      if (!states[key]) continue;
      for (const id of FILTER_MODULES[key].rulesets) wantEnabled.add(id);
    }
    const currently = new Set(await chrome.declarativeNetRequest.getEnabledRulesets());
    const enableRulesetIds = ALL_RULESET_IDS.filter(id => wantEnabled.has(id) && !currently.has(id));
    const disableRulesetIds = ALL_RULESET_IDS.filter(id => !wantEnabled.has(id) && currently.has(id));
    if (enableRulesetIds.length || disableRulesetIds.length) {
      await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds, disableRulesetIds });
    }
  } catch (e) {
    console.warn('[ScriptInjector] ruleset sync warning:', e);
  }
}

async function isMasterEnabled() {
  const { masterEnabled } = await chrome.storage.local.get('masterEnabled');
  return masterEnabled !== false;
}

async function isBadgeEnabled() {
  const { badgeCountEnabled } = await chrome.storage.local.get('badgeCountEnabled');
  return badgeCountEnabled !== false;
}

// v2.5.0: badge = "JS actived on this page" — active filter modules + user
// scripts matching the URL. One storage read, no migrateStorage round-trip
// (the old version ran 3 storage gets + a full normalize on EVERY tab update).
async function computePageCount(url) {
  if (!/^https?:/.test(url || '')) return 0;
  const { scripts, masterEnabled } = await chrome.storage.local.get(['scripts', 'masterEnabled']);
  if (masterEnabled === false) return 0;

  let count = 0;
  for (const key of FILTER_KEYS) {
    if (filterEntryEnabled(scripts, key)) count++;
  }
  for (const s of Object.values(scripts || {})) {
    if (typeof s?.id === 'string' && s.id.startsWith('__filter_')) continue;
    if (s.enabled !== false && scriptMatchesUrl(s, url)) count++;
  }
  return count;
}

async function updateBadge(tabId, url) {
  if (!Number.isInteger(tabId)) return;

  const badgeOn = await isBadgeEnabled();

  if (!badgeOn || !/^https?:/.test(url || '')) {
    await chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  const count = await computePageCount(url);
  await chrome.action.setBadgeText({ tabId, text: count ? String(count) : '' });
  if (count) {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#00E5FF' });
  }
}

let badgeRefreshTimer = null;
function scheduleBadgeRefresh() {
  clearTimeout(badgeRefreshTimer);
  badgeRefreshTimer = setTimeout(() => {
    refreshAllBadges().catch(console.error);
  }, 250);
}

async function refreshAllBadges() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map(tab => updateBadge(tab.id, tab.url)));
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    Promise.all([
      syncRegisteredScripts(),
      syncScheduledScripts(),
      syncFilterRegistrations(),
      syncEnabledRulesets()
    ]).catch(e => console.error('[ScriptInjector] sync failed:', e));
  }, 150);
}

async function initialize() {
  await migrateStorage();
  await syncFilterRegistrations();
  await syncEnabledRulesets();
  await Promise.all([syncRegisteredScripts(), syncScheduledScripts()]);
  await refreshAllBadges();
}

chrome.runtime.onInstalled.addListener(() => initialize().catch(console.error));
chrome.runtime.onStartup.addListener(() => initialize().catch(console.error));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') {
    if (changes.scripts || changes.masterEnabled) {
      // v2.4.3: a toggle flip must take effect on the very next navigation —
      // re-reconcile registrations + rulesets (debounced) and refresh badges.
      scheduleSync();
      scheduleBadgeRefresh();
    }
    // v2.5.0: the badge switch only needs a repaint — skip the full re-sync.
    if (changes.badgeCountEnabled) {
      scheduleBadgeRefresh();
    }
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId)
    .then(tab => updateBadge(tabId, tab.url))
    .catch(console.error);
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.status === 'complete') {
    updateBadge(tabId, info.url || tab.url).catch(console.error);
  }
});

// Fallback injection when userScripts API unavailable
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete' || !/^https?:/.test(tab.url || '')) return;

  const master = await isMasterEnabled();
  if (!master) return;

  const status = await getUserScriptsStatus();
  if (status.available) return;

  const scripts = await getScripts();
  // FIXED: Explicitly require s.enabled === true to prevent injecting disabled scripts!
  const matches = Object.values(scripts)
    .filter(s => s.enabled && PAGE_RUN_ATS.includes(s.runAt) && scriptMatchesUrl(s, tab.url))
    .sort((a, b) => a.order - b.order);

  for (const script of matches) {
    try {
      await executeImmediately({
        tabId,
        code: script.code,
        name: script.name,
        allFrames: script.allFrames,
        world: script.world
      });
    } catch (e) {
      console.error(`[ScriptInjector] ${script.name} failed:`, e);
    }
  }
});

chrome.alarms.onAlarm.addListener(alarm => {
  handleScheduledAlarm(alarm).catch(console.error);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === 'runCode') {
    executeImmediately(msg.payload)
      .then(r => sendResponse({ success: true, result: r }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg?.action === 'syncRegistry') {
    Promise.all([syncRegisteredScripts(), syncScheduledScripts()])
      .then(r => sendResponse({ success: true, result: r }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg?.action === 'getEngineStatus') {
    Promise.all([getUserScriptsStatus(), chrome.storage.local.get(['registryStatus', 'badgeCountEnabled', 'masterEnabled'])])
      .then(([status, data]) => sendResponse({
        success: true,
        status,
        registry: data.registryStatus || null,
        badgeCountEnabled: data.badgeCountEnabled !== false,
        masterEnabled: data.masterEnabled !== false
      }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg?.action === 'updateDNRRulesets') {
    chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: msg.enableRulesetIds || [],
      disableRulesetIds: msg.disableRulesetIds || []
    })
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg?.action === 'refreshBadges') {
    refreshAllBadges()
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  // Filter List subscription handlers
  if (msg?.action === 'addFilterList') {
    addSubscription(msg.url)
      .then(r => sendResponse({ success: true, result: r }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg?.action === 'removeFilterList') {
    removeSubscription(msg.id)
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg?.action === 'toggleFilterList') {
    toggleSubscription(msg.id)
      .then(r => sendResponse({ success: true, result: r }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg?.action === 'refreshFilterList') {
    refreshSubscription(msg.id)
      .then(r => sendResponse({ success: true, result: r }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg?.action === 'getFilterLists') {
    getSubscriptions()
      .then(r => sendResponse({ success: true, result: r }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg?.action === 'syncFilterLists') {
    applyAllSubscriptions()
      .then(r => sendResponse({ success: true, result: r }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  // v2.4.3: user-authored custom filter rules (ABP syntax, one per line)
  if (msg?.action === 'setCustomFilters') {
    setCustomFilterText(String(msg.text || ''))
      .then(r => sendResponse({ success: true, result: r }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (msg?.action === 'getCustomFilters') {
    getCustomFilterText()
      .then(text => sendResponse({ success: true, result: text }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
});

// v2.4.2: ACTIVE fallback injection. Field report (Chrome 152, usatoday):
// DNR blocking worked (ERR_BLOCKED_BY_CLIENT on taboola) while the static
// MAIN-world content scripts never executed on the page — chrome.scripting
// .executeScript({world:'MAIN', injectImmediately:true}) travels the
// extension pipeline and cannot be silently dropped the way a static entry
// can. Injected files are exact-once idempotent (window.__*_active flags in
// every filter), so running behind the registration path is always safe.
// v2.4.3: injects ONLY the enabled filter modules (toggle-aware) and the
// manifest static entry is gone — it ignored the toggles as well.
// v2.5.0: the fallback now respects per-module frames — all-frames modules
// sweep every frame, top-frame modules (fingerprint/video/bypass/aggressive)
// inject only into the main frame. Two executeScript calls instead of one,
// but every subframe no longer parses ~20KB of top-frame-only JS.
async function injectEnabledFilters(tabId, frameIds) {
  try {
    const states = await getFilterToggleStates();
    const enabledKeys = FILTER_KEYS.filter(k => states[k]);
    const sweep = frameIds === undefined;
    const topFiles = [];
    const frameFiles = [];
    for (const key of enabledKeys) {
      (FILTER_MODULES[key].allFrames === false && sweep ? topFiles : frameFiles)
        .push(FILTER_MODULES[key].file);
    }

    const run = (files, target) => {
      if (!files.length) return Promise.resolve();
      return chrome.scripting.executeScript({
        target,
        world: 'MAIN',
        injectImmediately: true,
        files
      });
    };

    await Promise.all([
      run(topFiles, { tabId, ...(frameIds ? { frameIds } : {}) }),
      run(frameFiles, sweep
        ? { tabId, allFrames: true }
        : { tabId, frameIds })
    ]);
    self.__sl_last_inject_files__ = [...topFiles, ...frameFiles];
    self.__sl_last_inject_error__ = null;
    return true;
  } catch (e) {
    // Restricted targets (chrome://, Web Store, discarded tabs, etc.) refuse
    // injection by design — not an error state. Keep a low-noise trace.
    self.__sl_last_inject_error__ = e?.message || String(e);
    console.debug('[ScriptInjector] main-world inject skipped:', e?.message);
    return false;
  }
}

// v2.5.0: dedupe the double-inject — onUpdated('loading') and onCommitted
// both sweep the same tab within milliseconds of every navigation. Files are
// exact-once idempotent, so the overlap was correctness-safe but cost one
// wasted executeScript round-trip per page load. Track successful sweeps;
// only skip when the OTHER path already succeeded for this tab recently.
const recentSweep = new Map(); // tabId → timestamp of last successful sweep
function sweepIsFresh(tabId) {
  const ts = recentSweep.get(tabId);
  return typeof ts === 'number' && (Date.now() - ts) < 1500;
}

// v2.5.0: cold-start race guard. A navigation that commits while the module
// service worker is still importing (or before initialize() applies the
// persisted registrations) can miss BOTH the event listeners and the native
// registration — the exact "static entry silently produced nothing" class of
// field bug from v2.4.2 (usatoday). Registrations persist across sessions and
// cover every later navigation natively; this one-shot re-sweep only closes
// the first-page-after-boot gap. Files are exact-once idempotent.
const SW_BOOT_TS = Date.now();

chrome.webNavigation.onCommitted.addListener(details => {
  if (!/^https?:/.test(details.url || '')) return;
  if (details.frameId === 0) {
    // Top frame + all current subframes. Always attempts — the primary path.
    injectEnabledFilters(details.tabId, undefined).then(ok => {
      if (ok) recentSweep.set(details.tabId, Date.now());
    }).catch(() => { });
    if (Date.now() - SW_BOOT_TS < 3000) {
      setTimeout(() => {
        injectEnabledFilters(details.tabId, undefined).catch(() => { });
      }, 2500);
    }
  } else {
    // v2.4.3: late-created/dynamic iframes commit with their own frameId;
    // cover them too (registration path handles most, this closes the gap).
    injectEnabledFilters(details.tabId, [details.frameId]);
  }
});

// Safety net for navigations that bypass onCommitted (bfcache restore,
// prerender activation): also cover onUpdated transitions to a visible URL.
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  const url = info.url || (info.status === 'loading' ? tab?.url : '');
  if (info.status !== 'loading' || !/^https?:/.test(url || '')) return;
  if (sweepIsFresh(tabId)) return; // v2.5.0: onCommitted already covered this load
  injectEnabledFilters(tabId, undefined).then(ok => {
    if (ok) recentSweep.set(tabId, Date.now());
  }).catch(() => { });
});

// v2.4 PERF FIX: this bottom-of-file call runs on EVERY service-worker cold
// start (MV3 SWs are killed and respawned constantly). Keep it O(1):
// - migrateStorage: needed before any consumer reads `scripts`.
// - syncFilterRegistrations/syncEnabledRulesets: correctness first — one
//   getRegisteredContentScripts + one getEnabledRulesets IPC each, diff-based,
//   re-asserts the toggle state after any registration drift. Persisted
//   registrations usually survive; this is the belt-and-suspenders.
migrateStorage().catch(console.error);
syncFilterRegistrations().catch(console.error);
syncEnabledRulesets().catch(console.error);

// v2.5.2: close the first-page-after-boot gap end-to-end. A navigation that
// commits while this SW is still importing can miss BOTH the event listeners
// and the native registration path (the registration completes milliseconds
// later, too late for that document). The 2.5s onCommitted re-sweep only
// helps when the listener was already registered — sweep every open http(s)
// tab once here instead. Files are exact-once idempotent, so this costs one
// executeScript round-trip per already-open tab per SW cold start and is a
// no-op for tabs that already have the modules.
setTimeout(async () => {
  try {
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    for (const t of tabs || []) {
      try { await injectEnabledFilters(t.id, undefined); } catch { /* */ }
    }
  } catch { /* */ }
}, 1200);
