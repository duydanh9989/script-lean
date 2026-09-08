// Surrogate Stubs — mock all blocked tracker/ads functions to prevent console errors
// Absorbs track(), identify(), page() calls into noop functions
// Run at document_start BEFORE any site code tries to call these

(function () {
  'use strict';
  // File-level idempotence: the same file may be registered twice (manifest
  // static entry + scripting.registerContentScripts fallback). Re-running is
  // harmless but would double-print the console banner; make it exact-once.
  if (window.__sl_surrogates_active__) return;
  window.__sl_surrogates_active__ = true;

  // v2.5.1: ANTI-BOT CHALLENGE PASS-THROUGH — challenge environments must
  // stay pristine (stubbing ga/fbq/etc. there can fail the handshake).
  const host0 = (location.hostname || '').toLowerCase();
  if (host0 === 'challenges.cloudflare.com' || host0.endsWith('.challenges.cloudflare.com') ||
      host0.endsWith('.datadome.co') || host0.includes('captcha-delivery.com')) {
    return;
  }

  // ── CLOUDFLARE INTERSTITIAL GUARD — v2.5.2 ───────────────────────
  // Origin-served managed challenges (www.fandom.com "Just a moment...")
  // never match the host bail above; the beacon guard + tracker stubs go
  // live on the challenge page and its integrity probes flag the tampering
  // → reload loop. Sync bail on challenge URL params; the watcher at the
  // end of the file restores everything if an interstitial materializes.
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

  // v2.5.2: snapshot the stub globals BEFORE stubbing so the CF watcher can
  // restore a pristine window (challenge pages are parsed after us, so on a
  // challenge page every stub below was CREATED by us — undo = delete).
  const SL_STUB_NAMES = ['ga', 'gtag', 'dataLayer', 'google_trackConversion',
    'fbq', '_fbq', 'ttq', 'uetq', 'twq', 'lintrk', '_linkedin_data_partner_ids',
    'pintrk', 'snaptr', 'rdt', 'criteo_q', '_tfa', 'obApi', 'analytics', 'hj',
    '_hjSettings', 'mixpanel', 'amplitude', 'clarity', 'FS', 'heap', 'Sentry',
    'Bugsnag', 'bugsnagClient', 'DD_RUM', '_mfq', '__lo_site_id',
    '__xiaomi_analytics', '__samsung_analytics'];
  const slStubSnapshot = new Map();
  for (let i = 0; i < SL_STUB_NAMES.length; i++) {
    try {
      const n = SL_STUB_NAMES[i];
      if (Object.prototype.hasOwnProperty.call(window, n)) slStubSnapshot.set(n, window[n]);
    } catch { /* */ }
  }

  const noop = function () {};
  const noopReturn = function () { return noop; };
  const noopPromise = function () { return Promise.resolve(); };

  // ── Google Analytics / GTM ────────────────────────────────────
  window.ga = window.ga || function () {};
  window.ga.create = noop;
  window.ga.getByName = noop;
  window.ga.getAll = function () { return []; };
  window.ga.remove = noop;
  window.ga.loaded = true;
  window.gtag = window.gtag || function () {};
  window.dataLayer = window.dataLayer || [];
  window.google_trackConversion = noop;

  // ── SendBeacon Guard v2 (hardened · stealth · idempotent) ────
  // v2.4 rewrite of the v2.3 beacon patch. Decision order:
  //   1. Parse the URL (absolute). Host fragment match → block.
  //   2. Path fragment match (canonical tracker endpoints) → block.
  //   3. Parsed OK + no match → ALLOW (precise, keeps benign beacons alive).
  //   4. Unparsable/relative URL → legacy keyword scan (v2.3 behavior).
  // Stealth: name/length/native toString cloak so the patched function is
  // indistinguishable from navigator.sendBeacon's native implementation.
  // Idempotent: surrogates.js and privacy.js both carry this guard; the
  // window flag makes the second run a no-op (no double-cloak, no drift).
  try {
    (function installBeaconGuard() {
      if (window.__sl_beacon_guard__) return;
      // v2.5.2: the guard ships in BOTH files — the 9gag exemption must hold
      // even when this file wins the install race (privacy.js carries the
      // same check). 9gag reads the patched beacon as an ad-blocker signal.
      const gHost = (location.hostname || '').toLowerCase();
      if (gHost === '9gag.com' || gHost.endsWith('.9gag.com')) return;
      window.__sl_beacon_guard__ = true;

      const TRACKER_HOSTS = [
        'google-analytics.com', 'analytics.google.com', 'googletagmanager.com',
        'googlesyndication.com', 'googleadservices.com', 'googletagservices.com',
        'doubleclick.net', 'adservice.google.com', 'kissmetrics.com', 'kissmetrics.io',
        'scorecardresearch.com', 'quantserve.com', 'adnxs.com', 'adsafeprotected.com',
        'moatads.com', 'matomo.', 'piwik.', 'matomo.cloud', 'hotjar.com', 'clarity.ms',
        'mixpanel.com', 'segment.io', 'segment.com', 'amplitude.com', 'branch.io',
        'appsflyer.com', 'adjust.com', 'chartbeat.com', 'chartbeat.net', 'parsely.com',
        'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'mgid.com',
        'revcontent.com', 'popads.net', 'popcash.net', 'propellerads.com',
        'facebook.net', 'facebook.com', 'ads-twitter.com', 'analytics.twitter.com',
        'licdn.com', 'mc.yandex.ru', 'bat.bing.com', 'analytics.tiktok.com', 'ads.tiktok.com'
      ];
      const TRACKER_PATHS = [
        '/g/collect', '/j/collect', '/collect?', '/collect/', '/mp/collect',
        '/tr?', '/tr/', '/beacon', '/pagead/viewthroughconversion', '/pixel?',
        '/pixel/', '/telemetry', '/matomo.php', '/piwik.php',
        '/v1/track?', '/v1/track/', '/i/adsct', '/adsct', '/v1/events'
      ];
      const LEGACY_KEYWORDS = ['analytics', 'telemetry', 'track', 'beacon', 'collect',
        'metrics', 'matomo', 'piwik', 'stats', 'doubleclick', 'facebook',
        'google-analytics', 'scorecardresearch', 'adnxs', 'quantserve', '/g/collect'];

      // v2.5.1: eTLD+1 approximation for the FIRST-PARTY rule below.
      const MULTI_PART_SUFFIXES = {
        'co.uk': 1, 'org.uk': 1, 'ac.uk': 1, 'gov.uk': 1, 'net.uk': 1,
        'co.jp': 1, 'ne.jp': 1, 'or.jp': 1, 'com.au': 1, 'net.au': 1,
        'org.au': 1, 'com.br': 1, 'com.mx': 1, 'com.tr': 1, 'com.cn': 1,
        'com.tw': 1, 'co.kr': 1, 'co.in': 1, 'co.nz': 1, 'co.za': 1,
        'com.sg': 1, 'com.hk': 1, 'com.vn': 1, 'net.vn': 1, 'org.vn': 1,
        'edu.vn': 1, 'gov.vn': 1, 'com.ar': 1, 'com.co': 1, 'com.pe': 1,
        'com.uy': 1, 'com.ve': 1, 'com.ec': 1, 'com.do': 1, 'com.gt': 1,
        'com.sv': 1, 'com.py': 1, 'com.bo': 1, 'com.pa': 1, 'com.my': 1,
        'com.ph': 1, 'com.th': 1, 'co.id': 1, 'com.ua': 1, 'com.pl': 1
      };
      const rootDomain = (hostname) => {
        const parts = String(hostname || '').toLowerCase().split('.').filter(Boolean);
        if (parts.length <= 2) return parts.join('.');
        const last2 = parts.slice(-2).join('.');
        if (MULTI_PART_SUFFIXES[last2]) return parts.slice(-3).join('.');
        return last2;
      };
      const pageRoot = rootDomain(location.hostname || '');

      const isTrackerBeacon = (url) => {
        if (!url) return false;
        let host = '';
        let path = '';
        try {
          const u = new URL(String(url), location.href);
          if (u.protocol === 'http:' || u.protocol === 'https:') {
            host = u.hostname.toLowerCase();
            path = (u.pathname + u.search).toLowerCase();
          }
        } catch { /* unparsable → legacy scan below */ }
        if (host) {
          // v2.5.1 FIRST-PARTY RULE (parity with privacy.js): beacons to the
          // page's OWN site always pass — same-site /collect|/beacon|/pixel
          // endpoints are first-party telemetry, not trackers, and rejecting
          // them let sites (9gag) flag the blocker + stalled CF challenges.
          if (pageRoot && rootDomain(host) === pageRoot) return false;
          for (let i = 0; i < TRACKER_HOSTS.length; i++) {
            if (host.includes(TRACKER_HOSTS[i])) return true;
          }
          for (let i = 0; i < TRACKER_PATHS.length; i++) {
            if (path.includes(TRACKER_PATHS[i])) return true;
          }
          return false;
        }
        const s = String(url).toLowerCase();
        for (let i = 0; i < LEGACY_KEYWORDS.length; i++) {
          if (s.includes(LEGACY_KEYWORDS[i])) return true;
        }
        return false;
      };

      // Native cloak: Function.prototype.toString returns native-looking
      // strings ONLY for functions registered in the WeakMap below; every
      // other function keeps native behavior (zero site breakage).
      let stealthRegistry = null;
      try {
        if (!window.__sl_fn_tostring_stealth__) {
          window.__sl_fn_tostring_stealth__ = true;
          const registry = new WeakMap();
          const origToString = Function.prototype.toString;
          const stealthToString = function toString() {
            try { if (registry.has(this)) return registry.get(this); } catch { /* */ }
            return origToString.call(this);
          };
          try { Object.defineProperty(stealthToString, 'name', { value: 'toString', configurable: true }); } catch { /* */ }
          try { Object.defineProperty(stealthToString, 'length', { value: 0, configurable: true }); } catch { /* */ }
          try { stealthToString.toString = origToString.bind(origToString); } catch { /* */ }
          Object.defineProperty(Function.prototype, 'toString', {
            value: stealthToString, writable: true, configurable: true
          });
          window.__sl_fn_tostring_registry__ = registry;
        }
        stealthRegistry = window.__sl_fn_tostring_registry__ || null;
      } catch { /* stealth is optional */ }

      const markNative = (fn, name, len) => {
        try { Object.defineProperty(fn, 'name', { value: name, configurable: true }); } catch { /* */ }
        try { Object.defineProperty(fn, 'length', { value: len, configurable: true }); } catch { /* */ }
        const nativeStr = 'function ' + name + '() { [native code] }';
        if (stealthRegistry) {
          try { stealthRegistry.set(fn, nativeStr); } catch { /* */ }
        } else {
          try {
            Object.defineProperty(fn, 'toString', { value: () => nativeStr, configurable: true });
          } catch { /* */ }
        }
      };

      const origSendBeacon = (typeof Navigator !== 'undefined' && Navigator.prototype && Navigator.prototype.sendBeacon)
        ? Navigator.prototype.sendBeacon
        : (typeof navigator !== 'undefined' ? navigator.sendBeacon : null);

      const patchedSendBeacon = function (url, data) {
        if (isTrackerBeacon(url)) {
          return false; // AdBlockBench K1: falsy → Error('beacon-rejected') → Blocked
        }
        return origSendBeacon ? origSendBeacon.apply(this || navigator, arguments) : false;
      };
      markNative(patchedSendBeacon, 'sendBeacon', 1); // native sendBeacon.length === 1

      if (typeof Navigator !== 'undefined' && Navigator.prototype) {
        try {
          Object.defineProperty(Navigator.prototype, 'sendBeacon', {
            value: patchedSendBeacon,
            writable: true,
            enumerable: true,
            configurable: true
          });
        } catch {
          try { Navigator.prototype.sendBeacon = patchedSendBeacon; } catch { /* frozen */ }
        }
      }

      if (typeof navigator !== 'undefined') {
        try {
          Object.defineProperty(navigator, 'sendBeacon', {
            value: patchedSendBeacon,
            writable: true,
            enumerable: true,
            configurable: true
          });
        } catch {
          try { navigator.sendBeacon = patchedSendBeacon; } catch { /* frozen */ }
        }
      }

      // Self-verify (zero network): identity check proves the patch is live,
      // and one synchronous tracker call must return false. Exposed so a
      // broken install is visible instantly via DevTools:
      //   window.__sl_beacon_guard_ok__ === true
      try {
        const identityOK =
          (typeof Navigator !== 'undefined' && !!Navigator.prototype &&
            Navigator.prototype.sendBeacon === patchedSendBeacon) ||
          navigator.sendBeacon === patchedSendBeacon;
        const rejectsTracker = patchedSendBeacon(
          'https://www.google-analytics.com/g/collect?v=2&tid=G-1', '') === false;
        window.__sl_beacon_guard_ok__ = identityOK && rejectsTracker;
      } catch {
        window.__sl_beacon_guard_ok__ = false;
      }

      // v2.5.2: restore bridge for the CF interstitial watcher — only the
      // file that actually installed the guard registers it.
      window.__sl_beacon_guard_undo__ = function () {
        try {
          if (typeof Navigator !== 'undefined' && Navigator.prototype &&
            Navigator.prototype.sendBeacon === patchedSendBeacon) {
            Navigator.prototype.sendBeacon = origSendBeacon;
          }
        } catch { /* */ }
        try {
          if (typeof navigator !== 'undefined' && navigator.sendBeacon === patchedSendBeacon) {
            navigator.sendBeacon = origSendBeacon;
          }
        } catch { /* */ }
        try { window.__sl_beacon_guard_ok__ = false; } catch { /* */ }
      };
    })();
  } catch { /* the guard must never break the page */ }


  // ── Facebook Pixel ────────────────────────────────────────────
  window.fbq = window.fbq || noop;
  window.fbq.callMethod = noop;
  window.fbq.queue = [];
  window.fbq.loaded = true;
  window.fbq.version = '2.0';
  window._fbq = window.fbq;

  // ── TikTok Pixel ──────────────────────────────────────────────
  window.ttq = window.ttq || [];
  window.ttq.methods = ['page', 'track', 'identify', 'instances', 'load'];
  window.ttq.setAndDefer = noop;
  ['page', 'track', 'identify', 'instances', 'load'].forEach(fn => { window.ttq[fn] = noop; });

  // ── Microsoft Ads / Bing UET ──────────────────────────────────
  window.uetq = window.uetq || [];
  window.uetq.push = function () { Array.prototype.push.apply(window.uetq, arguments); };

  // ── Twitter / X Pixel ─────────────────────────────────────────
  window.twq = window.twq || noop;

  // ── LinkedIn Insight ──────────────────────────────────────────
  window.lintrk = window.lintrk || noop;
  window.lintrk.q = [];
  window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];

  // ── Pinterest Tag ─────────────────────────────────────────────
  window.pintrk = window.pintrk || noop;
  window.pintrk.queue = [];

  // ── Snapchat Pixel ────────────────────────────────────────────
  window.snaptr = window.snaptr || noop;

  // ── Reddit Conversion ─────────────────────────────────────────
  window.rdt = window.rdt || noop;

  // ── Criteo (Dynamic Retargeting) ──────────────────────────────
  window.criteo_q = window.criteo_q || [];

  // ── Taboola / Outbrain ────────────────────────────────────────
  window._tfa = window._tfa || [];
  window._tfa.push = noop;
  window.obApi = window.obApi || noop;

  // ── Segment / CDPs ────────────────────────────────────────────
  window.analytics = window.analytics || {
    track: noop, page: noop, identify: noop, group: noop, alias: noop,
    ready: function (cb) { if (typeof cb === 'function') cb(); },
    on: noop, off: noop, once: noop, reset: noop,
    user: function () { return { id: noop, traits: noop, anonymousId: noop }; },
    load: noop, init: noop
  };

  // ── Hotjar ────────────────────────────────────────────────────
  window.hj = window.hj || noop;
  window._hjSettings = window._hjSettings || {};

  // ── Mixpanel ──────────────────────────────────────────────────
  window.mixpanel = window.mixpanel || {
    track: noop, identify: noop, init: noop, reset: noop,
    people: { set: noop, append: noop, increment: noop },
    register: noop, register_once: noop, get_distinct_id: function () { return ''; }
  };

  // ── Amplitude ─────────────────────────────────────────────────
  window.amplitude = window.amplitude || {
    getInstance: function () {
      return {
        init: noop, logEvent: noop, setUserId: noop,
        setUserProperties: noop, identify: noop, revenue: noop
      };
    }
  };

  // ── Clarity ───────────────────────────────────────────────────
  window.clarity = window.clarity || noop;

  // ── FullStory ─────────────────────────────────────────────────
  window.FS = window.FS || { identify: noop, event: noop, setUserVars: noop, shutdown: noop };

  // ── Heap ──────────────────────────────────────────────────────
  window.heap = window.heap || {
    track: noop, identify: noop, addUserProperties: noop,
    addEventProperties: noop, removeEventProperty: noop, clearEventProperties: noop,
    load: noop, appid: 0, config: {}
  };

  // ── Sentry ────────────────────────────────────────────────────
  window.Sentry = window.Sentry || {
    init: noop, captureException: noop, captureMessage: noop,
    configureScope: noop, withScope: noop, setUser: noop, setTag: noop
  };

  // ── Bugsnag ───────────────────────────────────────────────────
  window.Bugsnag = window.Bugsnag || {
    start: noop, notify: noop, leaveBreadcrumb: noop, setUser: noop
  };
  window.bugsnagClient = window.Bugsnag;

  // ── Datadog RUM ───────────────────────────────────────────────
  window.DD_RUM = window.DD_RUM || { init: noop, addAction: noop, addError: noop, setUser: noop };

  // ── MouseFlow ─────────────────────────────────────────────────
  window._mfq = window._mfq || [];

  // ── Lucky Orange ──────────────────────────────────────────────
  window.__lo_site_id = window.__lo_site_id || 0;

  // ── Device OEM telemetry stubs (Xiaomi, Samsung, etc.) ────────
  window.__xiaomi_analytics = window.__xiaomi_analytics || { send: noop, init: noop };
  window.__samsung_analytics = window.__samsung_analytics || { send: noop };

  console.info('[ScriptInjector] Surrogate stubs loaded — all tracker functions neutralized.');

  // ── CF INTERSTITIAL WATCHER — v2.5.2 (see slCfInterstitialNow above) ──
  function slUndo() {
    try { if (window.__sl_beacon_guard_undo__) window.__sl_beacon_guard_undo__(); } catch { /* */ }
    try {
      slStubSnapshot.forEach((orig, n) => {
        try { window[n] = orig; } catch { /* */ }
      });
      for (let i = 0; i < SL_STUB_NAMES.length; i++) {
        const n = SL_STUB_NAMES[i];
        if (!slStubSnapshot.has(n)) {
          try { delete window[n]; } catch { /* */ }
        }
      }
    } catch { /* */ }
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
