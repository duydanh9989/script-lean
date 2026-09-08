import { deleteScript, getScripts, saveScript, setScriptEnabled } from './core/script-store.js';
import { scriptMatchesUrl } from './core/matcher.js';

// ── Modular Presets ─────────────────────────────────────────────
const FILTER_PRESETS = {
  ads: {
    name: '⚡ Block Ads',
    matchType: 'domain',
    matches: ['*'],
    runAt: 'document_start',
    world: 'MAIN',
    allFrames: true
  },
  analytics: {
    name: '⚡ Block Analytics',
    matchType: 'domain',
    matches: ['*'],
    runAt: 'document_start',
    world: 'MAIN',
    allFrames: true
  },
  surrogates: {
    name: '🛡️ Surrogate Stubs',
    matchType: 'domain',
    matches: ['*'],
    runAt: 'document_start',
    world: 'MAIN',
    allFrames: true
  },
  bypass: {
    name: '🚀 Bypass Bot & Paywall',
    matchType: 'domain',
    matches: ['*'],
    runAt: 'document_start',
    world: 'MAIN',
    allFrames: false
  },
  fingerprint: {
    name: '🎭 Anti-Fingerprint Shield',
    matchType: 'domain',
    matches: ['*'],
    runAt: 'document_start',
    world: 'MAIN',
    allFrames: false
  },
  privacy: {
    name: '🔒 Privacy & Opt-Out Guard',
    matchType: 'domain',
    matches: ['*'],
    runAt: 'document_start',
    world: 'MAIN',
    allFrames: true
  },
  video: {
    name: '🎬 Video & Eval Guard',
    matchType: 'domain',
    matches: ['*'],
    runAt: 'document_start',
    world: 'MAIN',
    allFrames: false
  },
  aggressive: {
    name: '💥 Aggressive Ads',
    matchType: 'domain',
    matches: ['*'],
    runAt: 'document_start',
    world: 'MAIN',
    allFrames: false
  }
};

// v2.5.0: legacy modules default ON (absent entry = running — matches the
// behavior the user relies on). Aggressive is NEW and optional: absent = OFF.
const FILTER_DEFAULT_OFF = new Set(['aggressive']);

function moduleDefaultOn(key) {
  return !FILTER_DEFAULT_OFF.has(key);
}

let filterScriptCache = {};
let currentTab = null;
let editingScriptId = null;

// ── Init ────────────────────────────────────────────────────────
async function init() {
  currentTab = await getCurrentTab();
  const domainEl = document.getElementById('site-domain');
  if (currentTab?.url && /^https?:/.test(currentTab.url)) {
    try { domainEl.textContent = new URL(currentTab.url).hostname; }
    catch { domainEl.textContent = '—'; }
  }

  await checkEngineStatus();
  await loadFilterCode();
  await renderFilters();
  await loadCustomRules();
  await renderFilterLists();
  await renderScripts();
  bindEvents();

  // v2.5.0: badge counter button state (getEngineStatus already carries it).
  try {
    const status = await chrome.runtime.sendMessage({ action: 'getEngineStatus' });
    paintBadgeButton(status?.badgeCountEnabled !== false);
  } catch {
    paintBadgeButton(true); // storage default
  }
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// v2.5.1: actionable first-run prompt for the "Allow User Scripts" toggle.
// The custom-JS injection (userScripts registration) needs that per-extension
// toggle in Chrome 138+; ad blocking itself does NOT (it rides dynamic
// chrome.scripting registrations + executeScript fallbacks). When the API is
// unavailable we surface a one-click "Open chrome://extensions" button.
async function checkEngineStatus() {
  const banner = document.getElementById('engine-banner');
  if (!banner) return;
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getEngineStatus' });
    if (response?.success && !response.status?.available) {
      const msg = document.getElementById('engine-msg');
      if (msg) {
        msg.textContent = "Custom JS needs 'Allow User Scripts': chrome://extensions → Script Lean → Details. Ad blocking works without it.";
      }
      banner.classList.remove('hidden');
    }
  } catch { /* ignore */ }
}

function openExtensionsDetails() {
  try {
    chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` });
  } catch { /* popup closing — ignore */ }
}

function dismissEngineBanner() {
  document.getElementById('engine-banner')?.classList.add('hidden');
}

// ── Filter Code Loading ─────────────────────────────────────────
async function loadFilterCode() {
  for (const key of Object.keys(FILTER_PRESETS)) {
    try {
      const resp = await fetch(chrome.runtime.getURL(`filters/${key}.js`));
      filterScriptCache[key] = await resp.text();
    } catch (e) {
      console.error(`Failed to load filter ${key}:`, e);
      filterScriptCache[key] = `console.warn('[ScriptInjector] Filter ${key} failed to load');`;
    }
  }
}

// ── Filter Presets ──────────────────────────────────────────────
async function renderFilters() {
  const scripts = await getScripts();
  for (const key of Object.keys(FILTER_PRESETS)) {
    const btn = document.getElementById(`filter-${key}`);
    const statusEl = document.getElementById(`status-${key}`);
    if (!btn || !statusEl) continue;

    const filterId = `__filter_${key}__`;
    const existing = scripts[filterId];
    // v2.4.3 FIX: absent entry = ON for legacy modules (the display matches
    // reality). v2.5.0: Aggressive defaults OFF (new optional module).
    const isActive = existing ? existing.enabled === true : moduleDefaultOn(key);
    btn.classList.toggle('active', isActive);
    statusEl.textContent = isActive ? 'ON' : 'OFF';
  }
}

async function toggleFilter(key) {
  const filterId = `__filter_${key}__`;
  const btn = document.getElementById(`filter-${key}`);
  const statusEl = document.getElementById(`status-${key}`);
  const scripts = await getScripts();
  const existing = scripts[filterId];

  // v2.4.3 FIX: absent entry means "currently ON" (legacy default), so the
  // first click must turn it OFF. v2.5.0: Aggressive defaults OFF.
  const desired = !(existing ? existing.enabled === true : moduleDefaultOn(key));

  // v2.5.0: optimistic flip — persist in the background so the chip reacts
  // instantly (the old round-trip chain made toggles feel dead).
  if (btn && statusEl) {
    btn.classList.toggle('active', desired);
    statusEl.textContent = desired ? 'ON' : 'OFF';
  }

  try {
    if (existing) {
      await setScriptEnabled(filterId, desired);
    } else {
      const preset = FILTER_PRESETS[key];
      await saveScript({
        id: filterId,
        name: preset.name,
        code: filterScriptCache[key] || '',
        enabled: desired,
        matchType: preset.matchType,
        matches: preset.matches,
        runAt: preset.runAt,
        world: preset.world,
        allFrames: preset.allFrames
      });
    }
  } catch (e) {
    // Revert the optimistic flip on failure.
    if (btn && statusEl) {
      btn.classList.toggle('active', !desired);
      statusEl.textContent = desired ? 'OFF' : 'ON';
    }
    showToast('✗ ' + (e.message || 'Toggle failed'), true);
    return;
  }
  await renderScripts();
}

// ── Script List ─────────────────────────────────────────────────
// v2.5.1 FIX — build-then-swap. The old render wiped #script-list with
// innerHTML='' and reused the STATIC #empty-state node via getElementById.
// Whenever the list was non-empty that node stayed DETACHED, so the NEXT
// re-render (chip toggle / save / delete) got getElementById('empty-state')
// === null and threw "Cannot read properties of null (reading 'style')"
// right after the wipe → the whole list went blank until the popup was
// reopened (field report). Now every row is built into a fragment FIRST and
// swapped atomically; the empty state is created fresh on demand. A row
// build failure logs and skips — it can never blank the list again.
async function renderScripts() {
  const listEl = document.getElementById('script-list');
  const scripts = await getScripts();

  // Filter out internal filter presets from the user script list
  const userScripts = Object.entries(scripts)
    .filter(([id]) => !id.startsWith('__filter_'))
    .sort(([, a], [, b]) => a.order - b.order || a.createdAt - b.createdAt);

  const frag = document.createDocumentFragment();

  if (userScripts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.id = 'empty-state';
    empty.textContent = 'No scripts registered. Press ＋ to create.';
    frag.appendChild(empty);
  } else {
    for (const [id, script] of userScripts) {
      try {
        frag.appendChild(buildScriptItem(id, script));
      } catch (e) {
        console.error('[ScriptLean] script row render failed:', e);
      }
    }
  }

  listEl.replaceChildren(frag);
}

function buildScriptItem(id, script) {
  const item = document.createElement('div');
  item.className = `script-item${script.enabled ? '' : ' disabled'}`;
  item.dataset.id = id;

  // v2.4 FIX: was ruleMatchesUrl(script, url) — wrong signature (type,
  // values, rawUrl) → new URL(undefined) threw → the badge never showed.
  // scriptMatchesUrl is the script-aware wrapper (honors enabled + excludes).
  const isMatch = currentTab?.url ? scriptMatchesUrl(script, currentTab.url) : false;

  item.innerHTML = `
    <label class="toggle" title="Enable/Disable">
      <input type="checkbox" ${script.enabled ? 'checked' : ''}>
      <span class="toggle-slider"></span>
    </label>
    <div class="script-info" title="Click to edit">
      <div class="script-name-row">
        <span class="script-name">${escapeHtml(script.name)}</span>
        ${isMatch ? '<span class="match-badge">active</span>' : ''}
      </div>
      <span class="script-meta">${escapeHtml(String(script.runAt || ''))} · ${escapeHtml((script.matches || []).join(', '))}</span>
    </div>
  `;

  // Toggle
  item.querySelector('input[type="checkbox"]').addEventListener('change', async (e) => {
    e.stopPropagation();
    await setScriptEnabled(id, e.target.checked);
    await renderScripts();
  });

  // Click to edit
  item.querySelector('.script-info').addEventListener('click', () => {
    openEditor(id, script);
  });

  return item;
}

// ── Editor ──────────────────────────────────────────────────────
function openEditor(id, script) {
  editingScriptId = id;
  const panel = document.getElementById('editor-panel');
  const nameEl = document.getElementById('editor-name');
  const matchTypeEl = document.getElementById('editor-match-type');
  const matchesEl = document.getElementById('editor-matches');
  const runAtEl = document.getElementById('editor-run-at');
  const allFramesEl = document.getElementById('editor-all-frames');
  const codeEl = document.getElementById('editor-code');
  const deleteBtn = document.getElementById('btn-delete');

  if (script) {
    nameEl.value = script.name || '';
    matchTypeEl.value = script.matchType || 'domain';
    // v2.4 FIX: join with ', ' — the target field is a single-line <input>,
    // so '\n' separators silently merged multiple targets into one broken
    // token ("a.com b.com") that never matched anything.
    matchesEl.value = (script.matches || []).join(', ');
    runAtEl.value = script.runAt || 'document_start';
    allFramesEl.checked = script.allFrames || false;
    codeEl.value = script.code || '';
    deleteBtn.style.display = 'block';
  } else {
    nameEl.value = 'Untitled';
    matchTypeEl.value = 'domain';
    matchesEl.value = currentTab?.url ? (() => {
      try { return new URL(currentTab.url).hostname; } catch { return '*'; }
    })() : '*';
    runAtEl.value = 'document_start';
    allFramesEl.checked = false;
    codeEl.value = '';
    deleteBtn.style.display = 'none';
  }

  panel.classList.remove('hidden');
  codeEl.focus();
}

function closeEditor() {
  document.getElementById('editor-panel').classList.add('hidden');
  editingScriptId = null;
}

async function saveCurrentScript() {
  const nameEl = document.getElementById('editor-name');
  const matchTypeEl = document.getElementById('editor-match-type');
  const matchesEl = document.getElementById('editor-matches');
  const runAtEl = document.getElementById('editor-run-at');
  const allFramesEl = document.getElementById('editor-all-frames');
  const codeEl = document.getElementById('editor-code');

  // v2.4 FIX: accept newline AND comma separators (single-line inputfriendly)
  const matches = matchesEl.value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);

  const scriptData = {
    name: nameEl.value || 'Untitled',
    code: codeEl.value,
    matchType: matchTypeEl.value,
    matches: matches.length ? matches : ['*'],
    runAt: runAtEl.value,
    allFrames: allFramesEl.checked,
    world: 'MAIN'
  };

  if (editingScriptId) {
    scriptData.id = editingScriptId;
  }

  await saveScript(scriptData);
  closeEditor();
  await renderScripts();
  showToast('✓ Saved');
}

async function deleteCurrentScript() {
  if (!editingScriptId) return;
  if (!confirm('Delete this script?')) return;
  await deleteScript(editingScriptId);
  closeEditor();
  await renderScripts();
}

async function runCurrentScript() {
  const codeEl = document.getElementById('editor-code');
  if (!currentTab?.id || !codeEl.value.trim()) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'runCode',
      payload: {
        tabId: currentTab.id,
        code: codeEl.value,
        name: document.getElementById('editor-name').value || 'Inline',
        allFrames: document.getElementById('editor-all-frames').checked,
        world: 'MAIN'
      }
    });
    if (response?.success) {
      showToast('✓ Executed');
    } else {
      showToast('✗ ' + (response?.error || 'Failed'), true);
    }
  } catch (e) {
    showToast('✗ ' + e.message, true);
  }
}

// ── Filter List Subscriptions ───────────────────────────────────
async function loadCustomRules() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getCustomFilters' });
    if (response?.success) {
      const ta = document.getElementById('custom-rules');
      if (ta) ta.value = response.result || '';
    }
  } catch { /* ignore */ }
}

async function saveCustomRules() {
  const ta = document.getElementById('custom-rules');
  const btn = document.getElementById('btn-save-rules');
  if (!ta || !btn) return;
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Applying…';
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'setCustomFilters',
      text: ta.value
    });
    if (response?.success) {
      const r = response.result || {};
      const parts = [`block ${r.blockRules ?? 0}`, `allow ${r.allowRules ?? 0}`];
      if (r.customBlock || r.customAllow) {
        parts.push(`yours: ${r.customBlock || 0}▲ ${r.customAllow || 0}▽`);
      }
      if (r.failed?.length) parts.push(`⚠ ${r.failed.length} list(s) failed`);
      showToast(`✓ ${r.totalRules ?? 0} rules — ${parts.join(' · ')}`);
    } else {
      showToast('✗ ' + (response?.error || 'Failed to apply'), true);
    }
  } catch (e) {
    showToast('✗ ' + e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

// v2.5.1: same build-then-swap treatment as renderScripts — rows are built
// into a fragment (one try/catch per row) and swapped atomically, so a bad
// subscription entry can never blank the section mid-render.
async function renderFilterLists() {
  const container = document.getElementById('filterlist-items');
  const frag = document.createDocumentFragment();

  try {
    const response = await chrome.runtime.sendMessage({ action: 'getFilterLists' });
    if (response?.success) {
      const subs = response.result;

      for (const [id, sub] of Object.entries(subs)) {
        try {
          const item = document.createElement('div');
          item.className = `filterlist-item${sub.enabled ? '' : ' disabled'}`;
          item.innerHTML = `
            <label class="toggle" title="Enable/Disable">
              <input type="checkbox" ${sub.enabled ? 'checked' : ''} data-fl-id="${id}">
              <span class="toggle-slider"></span>
            </label>
            <span class="fl-title" title="${escapeHtml(sub.url)}">${escapeHtml(sub.title)}</span>
            <span class="fl-count">${Number(sub.ruleCount) || 0} rules</span>
            <button class="fl-remove" data-fl-remove="${id}" title="Remove">✕</button>
          `;
          frag.appendChild(item);

          // Toggle
          item.querySelector('input[type="checkbox"]').addEventListener('change', async () => {
            await chrome.runtime.sendMessage({ action: 'toggleFilterList', id });
            await renderFilterLists();
          });

          // Remove
          item.querySelector('.fl-remove').addEventListener('click', async (e) => {
            e.stopPropagation();
            await chrome.runtime.sendMessage({ action: 'removeFilterList', id });
            await renderFilterLists();
          });
        } catch (e) {
          console.error('[ScriptLean] filter list row render failed:', e);
        }
      }
    }
  } catch (e) {
    console.error('Failed to load filter lists:', e);
  }

  container.replaceChildren(frag);
}

async function addFilterList() {
  const input = document.getElementById('filterlist-url');
  const url = input.value.trim();
  if (!url || !url.startsWith('http')) {
    showToast('Enter a valid filter list URL', true);
    return;
  }

  const btn = document.getElementById('btn-add-list');
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'addFilterList', url });
    if (response?.success) {
      input.value = '';
      showToast(`✓ Added: ${response.result.ruleCount} network rules`);
      await renderFilterLists();
    } else {
      showToast('✗ ' + (response?.error || 'Failed to add'), true);
    }
  } catch (e) {
    showToast('✗ ' + e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add';
  }
}

async function syncFilterLists() {
  const btn = document.getElementById('btn-sync-lists');
  btn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ action: 'syncFilterLists' });
    if (response?.success) {
      showToast(`✓ Synced: ${response.result.totalRules} rules from ${response.result.subscriptions} lists`);
      await renderFilterLists();
    } else {
      showToast('✗ Sync failed', true);
    }
  } catch (e) {
    showToast('✗ Sync failed', true);
  } finally {
    btn.disabled = false;
  }
}

// ── Badge Counter Toggle (v2.5.0) ───────────────────────────────
function paintBadgeButton(on) {
  const btn = document.getElementById('btn-badge');
  if (!btn) return;
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.classList.toggle('active', on);
  btn.title = on ? 'JS counter badge: ON (click to hide)' : 'JS counter badge: OFF (click to show)';
}

async function toggleBadgeCounter() {
  const { badgeCountEnabled } = await chrome.storage.local.get('badgeCountEnabled');
  const next = badgeCountEnabled === false; // currently hidden → show
  paintBadgeButton(next);
  try {
    await chrome.storage.local.set({ badgeCountEnabled: next });
    // Repaint existing tabs immediately.
    await chrome.runtime.sendMessage({ action: 'refreshBadges' });
  } catch (e) {
    paintBadgeButton(!next);
    showToast('✗ ' + (e.message || 'Badge toggle failed'), true);
  }
}

// ── Events ──────────────────────────────────────────────────────
function bindEvents() {
  // Modular preset filters
  ['ads', 'analytics', 'surrogates', 'bypass', 'fingerprint', 'privacy', 'video', 'aggressive'].forEach(k => {
    const el = document.getElementById(`filter-${k}`);
    if (el) el.addEventListener('click', () => toggleFilter(k));
  });

  // v2.5.0: JS-counter badge on/off
  document.getElementById('btn-badge')?.addEventListener('click', toggleBadgeCounter);

  // v2.5.1: Allow User Scripts helper banner
  document.getElementById('btn-engine-fix')?.addEventListener('click', openExtensionsDetails);
  document.getElementById('btn-engine-dismiss')?.addEventListener('click', dismissEngineBanner);

  // Filter list subscription
  document.getElementById('btn-add-list').addEventListener('click', addFilterList);
  document.getElementById('btn-sync-lists').addEventListener('click', syncFilterLists);
  document.getElementById('filterlist-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addFilterList();
  });

  // v2.4.3: custom filter rules editor
  const saveRulesBtn = document.getElementById('btn-save-rules');
  if (saveRulesBtn) saveRulesBtn.addEventListener('click', saveCustomRules);

  // Add script
  document.getElementById('btn-add').addEventListener('click', () => openEditor(null, null));

  // Editor actions
  document.getElementById('btn-editor-close').addEventListener('click', closeEditor);
  document.getElementById('btn-save').addEventListener('click', saveCurrentScript);
  document.getElementById('btn-run').addEventListener('click', runCurrentScript);
  document.getElementById('btn-delete').addEventListener('click', deleteCurrentScript);

  // Tab support in textarea
  document.getElementById('editor-code').addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.target;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.value = ta.value.substring(0, start) + '  ' + ta.value.substring(end);
      ta.selectionStart = ta.selectionEnd = start + 2;
    }
    // Ctrl+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveCurrentScript();
    }
    // Ctrl+Enter to run
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runCurrentScript();
    }
  });
}

// ── Utils ───────────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// v2.5.1 FIX: the old version set background via inline cssText using
// var(--danger)/var(--accent) — CSS variables that DO NOT EXIST in
// popup.css (they are --accent-danger/--accent-active) → invalid background
// → a fully TRANSPARENT toast (the user's "thông báo UI lỗi, bị trong suốt")
// and an undefined toast-in keyframe. Styling now lives entirely in
// popup.css (.toast / .toast--error).
function showToast(msg, isError = false) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = isError ? 'toast toast--error' : 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

// v2.5.1: never fail silently again — popup-level render/async errors become
// a visible red toast instead of a mystery blank list.
window.addEventListener('error', (e) => {
  if (e?.message) showToast('✗ ' + e.message, true);
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = e?.reason?.message || String(e?.reason || '');
  if (msg && !/message port closed|Extension context invalidated/i.test(msg)) {
    showToast('✗ ' + msg, true);
  }
});

// ── Boot ────────────────────────────────────────────────────────
init().catch(console.error);
