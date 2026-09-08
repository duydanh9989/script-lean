// ═══════════════════════════════════════════════════════════════════════════
// Analytics Blocker — Intercepts external tracking scripts safely
// Complete tracker list restored + Safe for all sites (never deletes inline JS)
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';
  if (window.__analytics_filter_active) return;
  window.__analytics_filter_active = true;

  // v2.5.1: ANTI-BOT CHALLENGE PASS-THROUGH — never touch challenge frames.
  const host0 = (location.hostname || '').toLowerCase();
  if (host0 === 'challenges.cloudflare.com' || host0.endsWith('.challenges.cloudflare.com') ||
      host0.endsWith('.datadome.co') || host0.includes('captcha-delivery.com')) {
    return;
  }

  // ── CLOUDFLARE INTERSTITIAL GUARD — v2.5.2 ──────────────────────
  // Origin-served managed challenges never match the host bail above; keep
  // the challenge page pristine: sync bail + watcher (end of file).
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
  let slStopped = false, slObserverRef = null;

  const ANALYTICS_DOMAINS = [
    'google-analytics.com', 'googletagmanager.com', 'analytics.google.com',
    'www.googletagmanager.com',
    'connect.facebook.net', 'pixel.facebook.com', 'facebook.com/tr',
    'static.hotjar.com', 'script.hotjar.com', 'hotjar.com',
    'cdn.mxpnl.com', 'mixpanel.com', 'analytics.s3.amazonaws.com',
    'cdn.segment.com', 'api.segment.io', 'weather-analytics-events.apple.com',
    'cdn.amplitude.com', 'api.amplitude.com',
    'plausible.io', 'analytics.tiktok.com',
    'clarity.ms', 'www.clarity.ms',
    'mc.yandex.ru', 'yandex.ru/metrika',
    'bat.bing.com', 'snap.licdn.com',
    'static.ads-twitter.com', 'analytics.twitter.com',
    'rum.browser-intake', 'datadoghq.com',
    'js.sentry-cdn.com', 'sentry.io',
    'fullstory.com', 'rs.fullstory.com',
    'heap-analytics.com', 'heapanalytics.com',
    'mouseflow.com', 'cdn.mouseflow.com',
    'luckyorange.com', 'cdn.luckyorange.com',
    'crazyegg.com', 'script.crazyegg.com',
    'geo.yahoo.com'
  ];

  function isAnalyticsUrl(url) {
    if (!url || typeof url !== 'string') return false;
    for (let i = 0; i < ANALYTICS_DOMAINS.length; i++) {
      if (url.includes(ANALYTICS_DOMAINS[i])) return true;
    }
    return false;
  }

  function sanitizeScripts(root) {
    if (!root || slStopped) return;
    try {
      const scripts = root.tagName === 'SCRIPT' ? [root] : (root.querySelectorAll ? root.querySelectorAll('script[src]') : []);
      for (let i = 0; i < scripts.length; i++) {
        const s = scripts[i];
        if (s.src && isAnalyticsUrl(s.src)) {
          s.type = 'javascript/blocked';
          s.remove();
        }
      }
    } catch { /* ignore DOM exceptions */ }
  }

  // Initial pass on existing external scripts
  sanitizeScripts(document);

  // Debounced MutationObserver
  let pendingNodes = [];
  let debounceTimer = null;

  function processPending() {
    const nodes = pendingNodes;
    pendingNodes = [];
    debounceTimer = null;
    for (let i = 0; i < nodes.length; i++) {
      sanitizeScripts(nodes[i]);
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

  // Safe global stubs
  window.ga = window.ga || function () {};
  window.gtag = window.gtag || function () {};
  window.dataLayer = window.dataLayer || [];
  window.fbq = window.fbq || function () {};
  window._hjSettings = window._hjSettings || {};
  window.hj = window.hj || function () {};
  window.mixpanel = window.mixpanel || { track: function () {}, identify: function () {}, init: function () {} };

  // ── CF INTERSTITIAL WATCHER — v2.5.2 (see slCfInterstitialNow above) ──
  function slUndo() {
    slStopped = true;
    try { if (slObserverRef) slObserverRef.disconnect(); } catch { /* */ }
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
