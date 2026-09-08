// ═══════════════════════════════════════════════════════════════════════════
// Aggressive Ad Filter (v2.5.0, optional module — OFF by default)
// Broader cosmetic collapse + ad script neutering for stubborn sites.
//
// CONTRACT (user-approved trade-off):
//  - The SAFE "Ads" chip never touches these generic patterns — it only uses
//    verified ad domains/selectors, so site function is guaranteed there.
//  - This module uses GENERIC patterns (class*=advert, /ads/ iframes, …) that
//    CAN occasionally mismatch ("advertising-policy" link etc. — accepted).
//  - Guards keep it from being suicidal: never touches nav/header/main/form,
//    never collapses containers holding interactive controls or substantial
//    content, never removes nodes (hide + collapse only, site JS keeps its
//    references intact).
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  if (window.__aggressive_filter_active) return;
  window.__aggressive_filter_active = true;

  // v2.5.1: ANTI-BOT CHALLENGE PASS-THROUGH — never touch challenge frames.
  const host0 = (location.hostname || '').toLowerCase();
  if (host0 === 'challenges.cloudflare.com' || host0.endsWith('.challenges.cloudflare.com') ||
      host0.endsWith('.datadome.co') || host0.includes('captcha-delivery.com')) {
    return;
  }

  // ── CLOUDFLARE INTERSTITIAL GUARD — v2.5.2 ──────────────────────
  // Origin-served managed challenges never match the host bail above; the
  // generic cosmetic patterns must never run on a challenge page. Sync bail
  // + watcher (end of file).
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
  let slStopped = false, slObserverRef = null, slIntervalRef = null;

  // 1. Broad ad iframe/script URL patterns (substring match)
  const AD_URL_PATTERNS = [
    '/pagead/', '/adsbygoogle', '/adframe', '/adserver', '/ads.js',
    '/ad.js', '/adbanner', '/ad-sidebar', '/ad-top', '/ad-bottom',
    '/adx.js', '/banners/', '/banner_ad', '/adnxs', '/prebid',
    '/gpt.js', '/pubads_impl', '/apstag', '/criteo', '/taboola',
    '/outbrain', '/zeus_ad', '/adunit', '/ad-unit', '/adtag',
    'ad.doubleclick', 'googlesyndication', 'amazon-adsystem',
    'adservice.google', 'ads.yahoo', 'gemini.yahoo', 'media.net',
    'popads', 'propellerads', 'adsterra', 'adcash', 'mgid',
    'revcontent', 'ad-maven', 'hilltopads', 'galaksion'
  ];

  // 2. Generic class/id patterns (the aggressive part)
  const GENERIC_SELECTORS = [
    '[class*="advert" i]:not(script):not(style)',
    '[id*="advert" i]:not(script):not(style)',
    '[class*="-ads" i]:not(script):not(style)',
    '[class*="ads-" i]:not(script):not(style)',
    '[id*="-ads" i]:not(script):not(style)',
    '[id*="ads-" i]:not(script):not(style)',
    '[class*="ad-slot" i]:not(script):not(style)',
    '[class*="adbox" i]:not(script):not(style)',
    '[class*="ad_banner" i]:not(script):not(style)',
    '[class*="adbanner" i]:not(script):not(style)',
    '[data-ad-width]',
    '[data-adzone]',
    '[data-adunit]',
    '[data-testid*="ad-slot" i]',
    '[data-testid*="advertisement" i]',
    '[aria-label="Advertisement" i]',
    '[aria-label="Advertisement" i] ~ *',
    '.adsbygoogle',
    '.ad-placeholder',
    '.ad-slot-container',
    '.sponsored-slot',
    '.sponsored-widget'
  ];

  // Structural containers that must never be collapsed as a whole.
  const PROTECTED_TAGS = new Set([
    'HTML', 'HEAD', 'BODY', 'NAV', 'HEADER', 'MAIN', 'FORM',
    'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'LABEL', 'A'
  ]);

  function isAdUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.toLowerCase();
    for (let i = 0; i < AD_URL_PATTERNS.length; i++) {
      if (u.includes(AD_URL_PATTERNS[i])) return true;
    }
    return false;
  }

  function hide(el) {
    if (!el || !el.style) return;
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('height', '0', 'important');
    el.style.setProperty('min-height', '0', 'important');
    el.style.setProperty('max-height', '0', 'important');
    el.style.setProperty('overflow', 'hidden', 'important');
    el.style.setProperty('margin', '0', 'important');
    el.style.setProperty('padding', '0', 'important');
    el.style.setProperty('border', '0', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
  }

  // A container qualifies for collapse only when it carries no interactive
  // controls and holds no meaningful text (ads are images/iframes/links).
  function isCollapsibleContainer(el) {
    if (!el || PROTECTED_TAGS.has(el.tagName)) return false;
    if (el.id === 'content' || el.role === 'main') return false;
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
    hide(el);
    for (let i = 0; i < chain.length; i++) {
      if (chain[i].h > 24) hide(chain[i].node);
    }
  }

  function sweep(root) {
    if (!root || slStopped || !root.querySelectorAll) return;
    try {
      // a. Ad iframes/scripts by URL pattern
      const frames = root.tagName === 'IFRAME' ? [root] : root.querySelectorAll('iframe[src]');
      for (let i = 0; i < frames.length; i++) {
        if (isAdUrl(frames[i].src)) {
          hideAndCollapse(frames[i]);
        }
      }
      const scripts = root.tagName === 'SCRIPT' ? [root] : root.querySelectorAll('script[src]');
      for (let i = 0; i < scripts.length; i++) {
        if (isAdUrl(scripts[i].src)) scripts[i].type = 'javascript/blocked';
      }

      // b. Generic cosmetic patterns + orphan collapse
      for (let s = 0; s < GENERIC_SELECTORS.length; s++) {
        const sel = GENERIC_SELECTORS[s];
        let els = null;
        try {
          els = (root.matches && root.matches(sel)) ? [root] : root.querySelectorAll(sel);
        } catch { continue; } // unsupported selector on old browsers
        for (let j = 0; j < els.length; j++) {
          const el = els[j];
          if (PROTECTED_TAGS.has(el.tagName)) continue;
          if (el.closest && el.closest('nav, header, #ybar, .ybar-enabled')) continue;
          hideAndCollapse(el);
        }
      }
    } catch { /* never break the host page */ }
  }

  // Initial pass — document may still be nearly empty at document_start;
  // the DOMContentLoaded pass does the heavy lifting.
  sweep(document);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => sweep(document), { once: true });
  }

  // MutationObserver (debounced, same pattern as ads.js)
  let pending = [];
  let timer = null;
  function process() {
    const nodes = pending;
    pending = [];
    timer = null;
    for (let i = 0; i < nodes.length; i++) sweep(nodes[i]);
  }

  const observer = new MutationObserver(mutations => {
    for (let i = 0; i < mutations.length; i++) {
      const added = mutations[i].addedNodes;
      for (let j = 0; j < added.length; j++) {
        if (added[j].nodeType === 1) pending.push(added[j]);
      }
    }
    if (!timer && pending.length > 0) timer = setTimeout(process, 120);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  slObserverRef = observer;

  // Late lazy-loaded ads: 3 passes then stop (same budget as ads.js)
  let passes = 0;
  const interval = setInterval(() => {
    sweep(document);
    if (++passes >= 3) clearInterval(interval);
  }, 2000);
  slIntervalRef = interval;

  // ── CF INTERSTITIAL WATCHER — v2.5.2 (see slCfInterstitialNow above) ──
  function slUndo() {
    slStopped = true;
    try { if (slObserverRef) slObserverRef.disconnect(); } catch { /* */ }
    try { if (slIntervalRef) clearInterval(slIntervalRef); } catch { /* */ }
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
