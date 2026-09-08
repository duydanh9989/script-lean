// ═══════════════════════════════════════════════════════════════════════════
// Ads Blocker — Safe DOM-level ad iframe & script blocker + Container cleaner
// Complete domain and selector list restored across all sites + Yahoo ads blocked
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  if (window.__ads_filter_active) return;
  window.__ads_filter_active = true;

  // v2.5.1: ANTI-BOT CHALLENGE PASS-THROUGH — never touch challenge frames.
  const host0 = (location.hostname || '').toLowerCase();
  if (host0 === 'challenges.cloudflare.com' || host0.endsWith('.challenges.cloudflare.com') ||
      host0.endsWith('.datadome.co') || host0.includes('captcha-delivery.com')) {
    return;
  }

  // ── CLOUDFLARE INTERSTITIAL GUARD — v2.5.2 ──────────────────────
  // Origin-served managed challenges (www.fandom.com "Just a moment...")
  // never match the host bail above. This module only hides DOM nodes, but
  // the challenge page must stay pristine regardless: sync bail + watcher
  // (end of file) that disconnects the observer and stops the sweeps.
  function slCfInterstitialNow() {
    try {
      const q = String(location.search || '') + String(location.hash || '');
      if (q.indexOf('__cf_chl') !== -1) return true;
      if (window._cf_chl_opt) return true;
      const t = document.title || '';
      if (/just a moment|attention required|checking your browser/i.test(t)) return true;
      if (document.querySelector) {
        if (document.querySelector('script[src*="/cdn-cgi/challenge-platform/"]')) return true;
        if (document.querySelector('#challenge-error-text,#challenge-form,#challenge-running,#cf-please-wait,#cf-spinner-please-wait')) return true;
      }
    } catch { /* */ }
    return false;
  }
  if (slCfInterstitialNow()) return;
  let slStopped = false, slObserverRef = null, slCleanupRef = null;

  const AD_SCRIPT_DOMAINS = [
    'pagead2.googlesyndication.com', 'adservice.google.com',
    'doubleclick.net', 'googleadservices.com',
    'googlesyndication.com', 'googleads.g.doubleclick.net',
    'ad.doubleclick.net', 'securepubads.g.doubleclick.net',
    'amazon-adsystem.com', 'aax.amazon-adsystem.com',
    'media.net', 'contextual.media.net',
    'adnxs.com', 'ib.adnxs.com',
    'rubiconproject.com', 'fastlane.rubiconproject.com',
    'pubmatic.com', 'ads.pubmatic.com',
    'openx.net', 'bidder.openx.net',
    'criteo.com', 'bidder.criteo.com', 'static.criteo.net',
    'outbrain.com', 'widgets.outbrain.com',
    'taboola.com', 'cdn.taboola.com',
    'moatads.com', 'z.moatads.com',
    'serving-sys.com', 'adsrvr.org',
    'adroll.com', 's.adroll.com',
    'mgid.com', 'jsc.mgid.com',
    'revcontent.com', 'assets.revcontent.com',
    'popads.net', 'c1.popads.net',
    // Yahoo ad servers
    'beap.gemini.yahoo.com', 'adtech.yahooinc.com', 'ads.yahoo.com'
  ];

  const AD_SELECTORS = [
    'ins.adsbygoogle',
    '[id^="google_ads"]',
    '[id^="div-gpt-ad"]',
    '.gpt-ad',
    '[data-ad-slot]',
    '[data-ad-client]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[id^="google_ads"]',
    'iframe[src*="amazon-adsystem"]',
    'iframe[src*="gemini.yahoo.com"]',
    'iframe[src*="ads.yahoo.com"]',
    '.taboola-container',
    '#taboola-below-article',
    '.outbrain-container',
    '[data-outbrain-widget]',
    '.OUTBRAIN',
    '[id^="rc-widget"]',
    '.mgbox',
    '.criteo-ad',
    '.adbox',
    '.ad-box',
    '.ad-banner',
    '.ad-wrapper',
    '.ad-container',
    '.ad-slot',
    '.ad-unit',
    '.ad-placement',
    '.banner_ads',
    '.adsbox',
    '.textads',
    '.text-ad',
    '.text-ads',
    '.sponsored-ad',
    '.sponsored-content',
    // Yahoo specific ad selectors
    'li[data-ad-type]',
    '[data-gemini-sponsored]',
    '.gemini-item',
    'div[id^="dfp-ad-"]',
    'div[data-wf-ca-type="ad"]',
    'div[id^="YDC-Lead"] [class*="ad-"]',
    'div[id^="YDC-Col2"] [class*="ad-"]',
    'div[id^="YDC-Lead"] div[class*="feedback"]'
  ];

  function isAdUrl(url) {
    if (!url || typeof url !== 'string') return false;
    for (let i = 0; i < AD_SCRIPT_DOMAINS.length; i++) {
      if (url.includes(AD_SCRIPT_DOMAINS[i])) return true;
    }
    return false;
  }

  function hideElementSafely(el) {
    if (!el || !el.style) return;
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('height', '0', 'important');
    el.style.setProperty('min-height', '0', 'important');
    el.style.setProperty('max-height', '0', 'important');
    el.style.setProperty('opacity', '0', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
  }

  // v2.5.0 — ORPHAN COLLAPSE: after an ad iframe/element is hidden, its parent
  // wrapper often keeps reserved space (min-height, paddings, aspect-ratio),
  // leaving the "empty boxes" effect on blocked ads. Collapse the ancestor
  // chain ONLY while the wrapper stays genuinely empty — a real content
  // wrapper always carries text or media, so this can never eat site UI.
  // (Hide, never remove — the site's own JS keeps its node references.)
  function isCollapsibleContainer(el) {
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toUpperCase();
    if (['HTML', 'HEAD', 'BODY', 'NAV', 'HEADER', 'MAIN', 'FORM', 'BUTTON',
      'INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'LABEL', 'A'].includes(tag)) return false;
    try {
      if (el.querySelector('button, input, select, textarea, form, video, audio, canvas')) return false;
      const text = (el.textContent || '').trim();
      return text.length < 60;
    } catch { return false; }
  }

  // v2.5.0: measure-then-hide — the ancestor chain must be measured BEFORE
  // the ad child is hidden (display:none on the child zeroes every ancestor
  // height and would abort the walk after one hop).
  function hideAndCollapse(el) {
    if (!el || !el.style) return;
    const chain = [];
    let node = el.parentElement;
    for (let depth = 0; node && depth < 3; depth++) {
      if (!isCollapsibleContainer(node)) break;
      let h = 0;
      try { h = node.getBoundingClientRect().height; } catch { }
      chain.push({ node, h });
      node = node.parentElement;
    }
    hideElementSafely(el);
    for (let i = 0; i < chain.length; i++) {
      if (chain[i].h > 24) hideElementSafely(chain[i].node);
    }
  }

  function removeAdElements(root) {
    if (!root || slStopped) return;
    try {
      // 1. Hide ad iframes
      const iframes = root.tagName === 'IFRAME' ? [root] : (root.querySelectorAll ? root.querySelectorAll('iframe[src]') : []);
      for (let i = 0; i < iframes.length; i++) {
        if (isAdUrl(iframes[i].src)) {
          hideAndCollapse(iframes[i]);
        }
      }

      // 2. Intercept external ad scripts
      const scripts = root.tagName === 'SCRIPT' ? [root] : (root.querySelectorAll ? root.querySelectorAll('script[src]') : []);
      for (let i = 0; i < scripts.length; i++) {
        if (isAdUrl(scripts[i].src)) {
          scripts[i].type = 'javascript/blocked';
        }
      }

      // 3. Hide ad containers safely without el.remove()
      for (let i = 0; i < AD_SELECTORS.length; i++) {
        const sel = AD_SELECTORS[i];
        try {
          // Never hide navigation bar
          const els = root.matches && root.matches(sel) ? [root] : (root.querySelectorAll ? root.querySelectorAll(sel) : []);
          for (let j = 0; j < els.length; j++) {
            const el = els[j];
            if (el.closest && (el.closest('#ybar') || el.closest('.ybar-enabled'))) continue;
            hideAndCollapse(el);
          }
        } catch { /* ignore partial DOM / selector errors */ }
      }

      // Modern CSS :has selector for Yahoo stream sponsored content
      try {
        const sponsoredItems = root.querySelectorAll ? root.querySelectorAll('li:has([data-module="StreamSponsoredContent"])') : [];
        for (let j = 0; j < sponsoredItems.length; j++) {
          hideElementSafely(sponsoredItems[j]);
        }
      } catch { /* ignore if :has is unsupported */ }
    } catch { /* ignore DOM errors */ }
  }

  // Initial pass
  removeAdElements(document);

  // v2.5.0: DOMContentLoaded re-sweep — at document_start the document has no
  // layout yet (every getBoundingClientRect is 0), so the orphan-collapse
  // pass can't measure reserved space. Re-sweep once the DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => removeAdElements(document), { once: true });
  }

  // Debounced MutationObserver
  let pendingNodes = [];
  let debounceTimer = null;

  function processPending() {
    const nodes = pendingNodes;
    pendingNodes = [];
    debounceTimer = null;
    for (let i = 0; i < nodes.length; i++) {
      removeAdElements(nodes[i]);
    }
  }

  const observer = new MutationObserver(mutations => {
    for (let i = 0; i < mutations.length; i++) {
      const added = mutations[i].addedNodes;
      for (let j = 0; j < added.length; j++) {
        const node = added[j];
        if (node.nodeType === 1) {
          pendingNodes.push(node);
        }
      }
    }
    if (!debounceTimer && pendingNodes.length > 0) {
      debounceTimer = setTimeout(processPending, 100);
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  slObserverRef = observer;

  // Periodic cleanup for lazy-loaded ads (runs 3 times then stops)
  let cleanupCount = 0;
  const cleanupInterval = setInterval(() => {
    removeAdElements(document);
    if (++cleanupCount >= 3) clearInterval(cleanupInterval);
  }, 2000);
  slCleanupRef = cleanupInterval;

  // ── CF INTERSTITIAL WATCHER — v2.5.2 (see slCfInterstitialNow above) ──
  function slUndo() {
    slStopped = true;
    try { if (slObserverRef) slObserverRef.disconnect(); } catch { /* */ }
    try { if (slCleanupRef) clearInterval(slCleanupRef); } catch { /* */ }
    try { window.__sl_cf_undo_fired__ = true; } catch { /* */ }
  }
  (function slCfWatch() {
    let fired = false, iv = 0, mo = null;
    const stop = () => {
      try { if (iv) clearInterval(iv); } catch { /* */ }
      try { if (mo) mo.disconnect(); } catch { /* */ }
    };
    const fire = () => {
      if (fired) return;
      fired = true; stop();
      try { slUndo(); } catch { /* */ }
    };
    try {
      if (typeof MutationObserver !== 'undefined') {
        mo = new MutationObserver(() => { if (!fired && slCfInterstitialNow()) fire(); });
        mo.observe(document.documentElement || document, { childList: true, subtree: true });
      }
    } catch { /* */ }
    const t0 = Date.now();
    iv = setInterval(() => {
      if (fired) return;
      if (slCfInterstitialNow()) return fire();
      if (Date.now() - t0 > 8000) { fired = true; stop(); }
    }, 50);
  })();
})();
