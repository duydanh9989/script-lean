// filterlist.js — Parse ABP/uBlock filter lists → declarativeNetRequest dynamic rules
// ONLY converts network blocking rules. SKIPS all cosmetic/element-hiding (##, #@#, ##+js)
// because those are post-load garbage that blocks AFTER the ad already loaded.
//
// v2.5.0 — APPLY PIPELINE REWRITE (fixes "Apply Rules does nothing"):
//   CRITICAL BUG (≤v2.4.3): chrome.declarativeNetRequest.getDynamicRules() resolves to
//   a GetRulesResult OBJECT ({ rules: [...] }), NOT an array. The old wipe loop did
//   `existing.length` → undefined → never ran → old dynamic rules were never removed →
//   every subsequent addRules call collided on ids 10000+/90000+ ("Duplicate rule ID")
//   → the batch failed and the per-rule fallback failed too → Apply was a silent no-op
//   after the very first application (and custom filters could never change).
//   Also: every Apply re-FETCHED every subscription over the network (MV3 SW memory
//   cache dies with the worker) — slow, offline-hostile, wipe-before-build risked
//   leaving zero protection on failure.
//   Now: raw list text is cached in chrome.storage.local at add/sync time; Apply and
//   custom-rule changes re-parse from cached text (instant, offline-safe); the new rule
//   set is fully built BEFORE the swap; removal targets only our dynamic id space.
//   Priority ladder: list block 1 < list allow 2 < custom block 3 < custom allow 4
//   (user allow rules always win — keep-site-working guarantee).

const DYNAMIC_RULE_ID_BASE = 10000;
const MAX_DYNAMIC_RULES = 28000; // Chrome limit is 30k, keep 2k headroom

// v2.4.3: user-authored custom filters get their own id range so subscription
// refreshes can never collide with them.
const CUSTOM_RULE_ID_BASE = 90000;
const MAX_CUSTOM_RULES = 5000;

// v2.5.0: raw text cache — the source of truth for offline re-applies.
const SUB_STORAGE_KEY = 'filterListSubscriptions';
const CACHE_STORAGE_KEY = 'filterListCache';
const CUSTOM_FILTERS_KEY = 'customFilterRules';
const MAX_CACHED_TEXT_BYTES = 2.5 * 1024 * 1024; // per list; EasyList ≈ 1.2 MB

// Resource type mapping from ABP $option → Chrome DNR
const TYPE_MAP = {
  script: 'script',
  image: 'image',
  stylesheet: 'stylesheet',
  font: 'font',
  media: 'media',
  xmlhttprequest: 'xmlhttprequest',
  xhr: 'xmlhttprequest',
  'sub_frame': 'sub_frame',
  subdocument: 'sub_frame',
  ping: 'ping',
  websocket: 'websocket',
  other: 'other'
};

const ALL_RESOURCE_TYPES = ['script', 'image', 'stylesheet', 'font', 'media',
  'xmlhttprequest', 'sub_frame', 'ping', 'websocket', 'other', 'main_frame'];

/**
 * Parse a single ABP filter line into a DNR-compatible rule object, or null if not convertible.
 * Returns: { urlFilter, isAllowRule, resourceTypes, domains, excludedDomains } | null
 */
function parseFilterLine(line) {
  line = line.trim();

  // Skip empty, comments, headers
  if (!line || line.startsWith('!') || line.startsWith('[')) return null;

  // SKIP cosmetic rules — these are post-load element hiding garbage
  if (line.includes('##') || line.includes('#@#') || line.includes('#?#')) return null;
  // SKIP scriptlet injection rules
  if (line.includes('##+js(') || line.includes('#@#+js(')) return null;
  // SKIP $csp, $redirect, $removeparam — not simple block/allow
  if (/\$(.*,)?(csp|redirect|removeparam|replace)/i.test(line)) return null;

  // Determine if exception (allow) rule
  let isAllowRule = false;
  let filter = line;
  if (filter.startsWith('@@')) {
    isAllowRule = true;
    filter = filter.slice(2);
  }

  // Split filter and options at last unescaped $
  let options = '';
  const dollarIdx = filter.lastIndexOf('$');
  if (dollarIdx > 0 && !filter.substring(0, dollarIdx).endsWith('\\')) {
    options = filter.slice(dollarIdx + 1);
    filter = filter.slice(0, dollarIdx);
  }

  // Parse options
  let resourceTypes = null;
  let domains = null;
  let excludedDomains = null;
  let thirdParty = null;

  if (options) {
    const opts = options.split(',');
    const includeTypes = [];
    const excludeTypes = [];

    for (const opt of opts) {
      const o = opt.trim().toLowerCase();
      if (o === 'third-party' || o === '3p') { thirdParty = true; continue; }
      if (o === '~third-party' || o === '1p') { thirdParty = false; continue; }
      if (o === 'popup' || o === 'document' || o === 'generichide' || o === 'genericblock'
        || o === 'elemhide' || o === 'ghide' || o === 'ehide') continue;
      if (o.startsWith('domain=')) {
        const domainStr = o.slice(7);
        const parts = domainStr.split('|');
        domains = [];
        excludedDomains = [];
        for (const p of parts) {
          if (p.startsWith('~')) excludedDomains.push(p.slice(1));
          else domains.push(p);
        }
        if (!domains.length) domains = null;
        if (!excludedDomains.length) excludedDomains = null;
        continue;
      }
      if (o.startsWith('~')) {
        const t = TYPE_MAP[o.slice(1)];
        if (t) excludeTypes.push(t);
      } else {
        const t = TYPE_MAP[o];
        if (t) includeTypes.push(t);
      }
    }

    if (includeTypes.length) {
      resourceTypes = includeTypes;
    } else if (excludeTypes.length) {
      resourceTypes = ALL_RESOURCE_TYPES.filter(t => !excludeTypes.includes(t));
    }
  }

  // Support hosts format (0.0.0.0 domain or 127.0.0.1 domain)
  if (/^0\.0\.0\.0\s+/.test(filter)) {
    filter = filter.replace(/^0\.0\.0\.0\s+/, '').trim();
  } else if (/^127\.0\.0\.1\s+/.test(filter)) {
    filter = filter.replace(/^127\.0\.0\.1\s+/, '').trim();
  }

  // Support raw domain names without ABP anchors
  if (!filter.startsWith('||') && !filter.startsWith('|') && !filter.startsWith('http://') && !filter.startsWith('https://')) {
    if (/^[a-zA-Z0-9_.-]+$/.test(filter)) {
      filter = `||${filter}^`;
    }
  }

  // Chrome DNR requires ASCII only
  if (!/^[\x20-\x7E]+$/.test(filter)) return null;

  // Skip regex filters (/.../) — Chrome DNR regexFilter has strict budget
  if (filter.startsWith('/') && filter.endsWith('/')) return null;

  // Chrome DNR urlFilter must not start with '*'
  filter = filter.replace(/^\*+/, '');
  if (filter.endsWith('*')) filter = filter.replace(/\*+$/, '');

  // Convert ABP filter pattern to Chrome urlFilter syntax
  // ABP: || = domain anchor, ^ = separator, * = wildcard
  // Chrome DNR urlFilter uses same syntax mostly
  if (!filter || filter === '*') return null; // too broad

  // Skip very short patterns (likely false positives)
  if (filter.replace(/[|^*]/g, '').length < 4) return null;

  return {
    urlFilter: filter,
    isAllowRule,
    resourceTypes: resourceTypes || ALL_RESOURCE_TYPES.filter(t => t !== 'main_frame'),
    domains: domains,
    excludedDomains: excludedDomains,
    thirdParty
  };
}

/**
 * Parse raw filter list text → array of DNR rule objects
 */
export function parseFilterList(text) {
  const lines = text.split('\n');
  const rules = [];
  let ruleId = DYNAMIC_RULE_ID_BASE;

  for (const line of lines) {
    if (ruleId - DYNAMIC_RULE_ID_BASE >= MAX_DYNAMIC_RULES) break;

    const parsed = parseFilterLine(line);
    if (!parsed) continue;

    const rule = {
      id: ruleId++,
      priority: parsed.isAllowRule ? 2 : 1,
      action: { type: parsed.isAllowRule ? 'allow' : 'block' },
      condition: {
        urlFilter: parsed.urlFilter,
        resourceTypes: parsed.resourceTypes
      }
    };

    if (parsed.thirdParty !== null) {
      rule.condition.domainType = parsed.thirdParty ? 'thirdParty' : 'firstParty';
    }
    if (parsed.domains) {
      rule.condition.initiatorDomains = parsed.domains;
    }
    if (parsed.excludedDomains) {
      rule.condition.excludedInitiatorDomains = parsed.excludedDomains;
    }

    rules.push(rule);
  }

  return rules;
}

function extractTitle(text) {
  const match = text.match(/^!\s*Title:\s*(.+)/mi);
  return match ? match[1].trim() : null;
}

// ── v2.5.0: Raw text cache (survives service-worker restarts) ───────────────

async function cacheGetText(url) {
  try {
    const data = await chrome.storage.local.get(CACHE_STORAGE_KEY);
    const entry = data[CACHE_STORAGE_KEY]?.[url];
    return typeof entry?.text === 'string' ? entry.text : null;
  } catch {
    return null;
  }
}

async function cachePutText(url, text) {
  try {
    if (!text || text.length > MAX_CACHED_TEXT_BYTES) return; // too big — always fetch this list
    const data = await chrome.storage.local.get(CACHE_STORAGE_KEY);
    const cache = data[CACHE_STORAGE_KEY] || {};
    // Dropped subscriptions must not haunt the quota — prune entries with no owner.
    const subs = await getSubscriptions();
    const owned = new Set(Object.keys(subs));
    for (const key of Object.keys(cache)) {
      if (!owned.has(key)) delete cache[key];
    }
    cache[url] = { text, fetchedAt: Date.now() };
    await chrome.storage.local.set({ [CACHE_STORAGE_KEY]: cache });
  } catch {
    // Quota or serialization problems must never break the apply pipeline.
  }
}

/**
 * Fetch a filter list URL, parse it, cache the raw text.
 * v2.5.0 modes:
 *  - { force: true }  — network refresh (Add / Sync / per-list Refresh);
 *                       falls back to the stale cache when the network dies.
 *  - { offline: true } — cache ONLY (Apply / custom-rule edits): instant,
 *                       offline-safe, no fetch at all.
 */
export async function fetchAndParse(url, { force = false, offline = false } = {}) {
  let text = null;
  let fromNetwork = false;

  if (!offline) {
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      text = await response.text();
      fromNetwork = true;
      cachePutText(url, text); // fire-and-forget, best-effort
    } catch (e) {
      text = await cacheGetText(url); // stale cache beats a hard failure
      if (text === null) throw e;
    }
  } else {
    text = await cacheGetText(url);
  }

  if (typeof text !== 'string') {
    throw new Error(`No cached copy available for ${url}`);
  }

  return {
    rules: parseFilterList(text),
    lineCount: text.split('\n').length,
    title: extractTitle(text),
    fromNetwork
  };
}

// ── Subscription Storage ────────────────────────────────────────

export async function getCustomFilterText() {
  const data = await chrome.storage.local.get(CUSTOM_FILTERS_KEY);
  return data[CUSTOM_FILTERS_KEY] || '';
}

export async function setCustomFilterText(text) {
  await chrome.storage.local.set({ [CUSTOM_FILTERS_KEY]: String(text || '') });
  // v2.5.0: pure storage re-parse — no network, instant, offline-safe.
  return applyAllSubscriptions({ network: false });
}

export async function getSubscriptions() {
  const data = await chrome.storage.local.get(SUB_STORAGE_KEY);
  return data[SUB_STORAGE_KEY] || {};
}

export async function addSubscription(url) {
  const subs = await getSubscriptions();
  const id = btoa(url).replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);

  // Network fetch happens ONCE here (and on explicit Sync) — never on Apply.
  const { rules, lineCount, title } = await fetchAndParse(url, { force: true });

  subs[id] = {
    id,
    url,
    title: title || url,
    enabled: true,
    ruleCount: rules.length,
    lineCount,
    lastUpdated: Date.now()
  };

  await chrome.storage.local.set({ [SUB_STORAGE_KEY]: subs });
  await applyAllSubscriptions({ network: false });
  return subs[id];
}

export async function removeSubscription(id) {
  const subs = await getSubscriptions();
  delete subs[id];
  await chrome.storage.local.set({ [SUB_STORAGE_KEY]: subs });
  await applyAllSubscriptions({ network: false });
}

export async function toggleSubscription(id) {
  const subs = await getSubscriptions();
  if (!subs[id]) return;
  subs[id].enabled = !subs[id].enabled;
  await chrome.storage.local.set({ [SUB_STORAGE_KEY]: subs });
  await applyAllSubscriptions({ network: false });
  return subs[id];
}

// ── v2.5.0: dynamic-rule namespace helpers ──────────────────────
// Chrome returns a GetRulesResult OBJECT; only ids >= DYNAMIC_RULE_ID_BASE
// belong to us (static rulesets use ids < 10000).

function ourDynamicRuleIds(existingRules) {
  const ids = [];
  for (const rule of existingRules) {
    if (rule.id >= DYNAMIC_RULE_ID_BASE) ids.push(rule.id);
  }
  return ids;
}

/**
 * Build the full rule list from CACHED text (no network on this path).
 */
async function buildRules({ network }) {
  const subs = await getSubscriptions();
  const enabledSubs = Object.values(subs).filter(s => s.enabled);

  const allRules = [];
  const failed = [];
  let fromNetworkCount = 0;
  let fromCacheCount = 0;

  for (const sub of enabledSubs) {
    try {
      const { rules, fromNetwork } = await fetchAndParse(sub.url,
        network ? { force: true } : { offline: true });
      if (fromNetwork) fromNetworkCount++; else fromCacheCount++;
      for (const rule of rules) {
        if (allRules.length >= MAX_DYNAMIC_RULES) break;
        allRules.push(rule);
      }
    } catch (e) {
      failed.push(sub.url);
      console.error(`[FilterList] No rules available for ${sub.url}:`, e?.message || e);
    }
  }

  // User-authored custom filter rules (same ABP mini-parser).
  // v2.5.0 priority ladder: list block 1 < list allow 2 < custom block 3
  // < custom allow 4 — a user exception beats EVERYTHING (keep sites working).
  let customBlock = 0;
  let customAllow = 0;
  try {
    const customText = await getCustomFilterText();
    if (customText && customText.trim()) {
      let customId = CUSTOM_RULE_ID_BASE;
      for (const rule of parseFilterList(customText)) {
        if (customId - CUSTOM_RULE_ID_BASE >= MAX_CUSTOM_RULES) break;
        const isAllow = rule.action?.type === 'allow';
        if (isAllow) customAllow++; else customBlock++;
        allRules.push({
          ...rule,
          id: customId++,
          priority: isAllow ? 4 : 3
        });
      }
    }
  } catch (e) {
    console.error('[FilterList] Custom rules failed:', e);
  }

  return { allRules, failed, fromNetworkCount, fromCacheCount, customBlock, customAllow };
}

/**
 * Rebuild the dynamic rule set. v2.5.0: build-then-swap — the new rules are
 * fully assembled (from cached text) before the old ones are removed, and the
 * wipe actually works now (GetRulesResult.rules).
 */
export async function applyAllSubscriptions({ network = false } = {}) {
  const { allRules, failed, fromNetworkCount, fromCacheCount, customBlock, customAllow } =
    await buildRules({ network });

  // Remove ONLY our dynamic id space (10000+), chunked — never touch static
  // ruleset ids. This is the line that was broken before v2.5.0.
  // v2.5.1: getDynamicRules() returns a BARE ARRAY on some Chrome builds and
  // the GetRulesResult OBJECT ({rules: [...]}) on 132+ — accept both shapes
  // ("existingRules is not iterable" was surfaced by the new popup error
  // toast on the array-returning build).
  const existingResult = await chrome.declarativeNetRequest.getDynamicRules();
  const existingRules = Array.isArray(existingResult)
    ? existingResult
    : (existingResult?.rules || []);
  const staleIds = ourDynamicRuleIds(existingRules);
  for (let i = 0; i < staleIds.length; i += 5000) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: staleIds.slice(i, i + 5000)
    });
  }

  // Add in batches; a single malformed rule must not kill its 5k batch.
  let added = 0;
  const BATCH_SIZE = 5000;
  for (let i = 0; i < allRules.length; i += BATCH_SIZE) {
    const batch = allRules.slice(i, i + BATCH_SIZE);
    try {
      await chrome.declarativeNetRequest.updateDynamicRules({ addRules: batch });
      added += batch.length;
    } catch (e) {
      console.error(`[FilterList] Batch ${i}-${i + batch.length} failed:`, e);
      for (const rule of batch) {
        try {
          await chrome.declarativeNetRequest.updateDynamicRules({ addRules: [rule] });
          added++;
        } catch { /* skip malformed rule */ }
      }
    }
  }

  // Update subscription metadata (rule counts from this build).
  const subs = await getSubscriptions();
  for (const sub of Object.values(subs)) {
    if (subs[sub.id]) subs[sub.id].lastUpdated = Date.now();
  }
  await chrome.storage.local.set({ [SUB_STORAGE_KEY]: subs });

  const blockCount = allRules.filter(r => r.action?.type === 'block').length;
  const allowCount = allRules.filter(r => r.action?.type === 'allow').length;

  return {
    totalRules: allRules.length,
    added,
    blockRules: blockCount,
    allowRules: allowCount,
    customBlock,
    customAllow,
    subscriptions: Object.values(subs).filter(s => s.enabled).length,
    fromNetworkCount,
    fromCacheCount,
    failed
  };
}

/**
 * Refresh a single subscription (re-fetch + recount + rebuild)
 */
export async function refreshSubscription(id) {
  const subs = await getSubscriptions();
  if (!subs[id]) return null;
  try {
    const { rules, lineCount, title } = await fetchAndParse(subs[id].url, { force: true });
    subs[id].ruleCount = rules.length;
    subs[id].lineCount = lineCount;
    subs[id].lastUpdated = Date.now();
    if (title) subs[id].title = title;
    await chrome.storage.local.set({ [SUB_STORAGE_KEY]: subs });
    if (subs[id].enabled) await applyAllSubscriptions({ network: false });
    return subs[id];
  } catch (e) {
    console.error(`[FilterList] Refresh failed for ${subs[id]?.url}:`, e);
    throw e;
  }
}
