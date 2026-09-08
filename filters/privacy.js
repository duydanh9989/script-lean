// ═══════════════════════════════════════════════════════════════════════════
// Option: Privacy & Opt-Out Guard (Comprehensive Suite)
// Solves: Privacy Sandbox APIs, Storage Access API, Opt-out Signals (GPC),
// Beacon Transport, Background Beacon Tracking, and Matomo tracking
// STRICTLY GUARDS BANKING & PAYMENT GATEWAYS
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__privacy_shield_active) return;
  window.__privacy_shield_active = true;

  // 0. ANTI-BOT CHALLENGE PASS-THROUGH — v2.5.1
  const host0 = (location.hostname || '').toLowerCase();
  if (host0 === 'challenges.cloudflare.com' || host0.endsWith('.challenges.cloudflare.com') ||
      host0.endsWith('.datadome.co') || host0.includes('captcha-delivery.com')) {
    return;
  }

  // 0b. PER-SITE PRIVACY EXEMPTION — v2.5.2 — 9gag.com
  // 9gag reads one of the privacy-patched APIs as an ad-blocker signal
  // (exact probe unidentified — obfuscated bundle). User-approved fallback:
  // serve 9gag a pristine privacy surface. DNR network blocking (ads +
  // telemetry rulesets) is INDEPENDENT of this module and still applies
  // there, so actual ad/tracker requests stay blocked.
  const hostExempt = (location.hostname || '').toLowerCase();
  if (hostExempt === '9gag.com' || hostExempt.endsWith('.9gag.com')) {
    return;
  }

  // 1. STRICT BANK & PAYMENT GATEWAY GUARD
  const host = (location.hostname || '').toLowerCase();
  const BANK_DOMAINS = [
    'vnpay', 'momo', 'zalopay', 'onepay', 'shopeepay', 'viettelpay',
    'vietcombank', 'techcombank', 'bidv', 'vietinbank', 'mbbank', 'acb',
    'tpbank', 'vpbank', 'sacombank', 'hdbank', 'agribank', 'scb', 'vib',
    'paypal', 'stripe', 'visa', 'mastercard', 'checkout', 'billing',
    'pay.', 'payment.', 'banking.', 'ebanking.'
  ];
  for (let i = 0; i < BANK_DOMAINS.length; i++) {
    if (host.includes(BANK_DOMAINS[i])) {
      console.info('[PrivacyGuard] Banking domain detected. Preserving default browser APIs.');
      return;
    }
  }

  // 1b. CLOUDFLARE INTERSTITIAL GUARD — v2.5.2
  // Origin-served managed challenges (www.fandom.com "Just a moment...") do
  // not match the challenge-host bail above. Every patched API this module
  // installs (sendBeacon guard, GPC/DNT, sandbox & storage-access poison)
  // must be restorable the moment an interstitial materializes, so all
  // definitions go through slPoison (captures the original descriptor,
  // defines with configurable:true — v2.5.1's configurable:false made a
  // late restore impossible).
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

  const slUndoStack = [];
  const slPoison = (obj, prop) => {
    try {
      let orig = null;
      try { orig = Object.getOwnPropertyDescriptor(obj, prop) || null; } catch { /* */ }
      try { delete obj[prop]; } catch { /* */ }
      Object.defineProperty(obj, prop, {
        get: () => undefined,
        set: () => { },
        configurable: true
      });
      slUndoStack.push({ obj, prop, orig });
      return true;
    } catch { return false; }
  };

  // 2. BEACON TRANSPORT & BACKGROUND BEACON TRACKING
  // v2.4: SendBeacon Guard v2 — same hardened + stealth + idempotent
  // implementation as surrogates.js (whichever file runs first installs the
  // guard; the second run sees __sl_beacon_guard__ and becomes a no-op).
  // Returns false for tracker/telemetry endpoints → benchmark K1 throws
  // 'beacon-rejected' → probe scored as Blocked. Benign beacons pass through.
  try {
    (function installBeaconGuard() {
      if (window.__sl_beacon_guard__) return;
      // v2.5.2: the guard ships in BOTH files — the 9gag exemption must hold
      // even when surrogates.js loses the install race to this file.
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
          // v2.5.1 FIRST-PARTY RULE: beacons to the page's OWN site always
          // pass. The generic path rules below were rejecting same-site
          // endpoints (9gag's own /collect-style analytics, Cloudflare
          // /cdn-cgi/challenge-platform/ beacons) and sites read that as
          // "an ad blocker is on" → banners + broken challenge handshakes.
          // Tracker beacons are third-party by definition — still blocked.
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
      markNative(patchedSendBeacon, 'sendBeacon', 1);

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

      // Self-verify (zero network) — same as surrogates.js. v2.4.3: whichever
      // file installs the guard runs it, so the diagnostic flag is reliable
      // regardless of which module wins the installation race (previously it
      // lived only in surrogates.js and was skipped when privacy.js won).
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
  } catch (err) {
    console.warn('[PrivacyGuard] sendBeacon patch error:', err);
  }

  // 3. OPT-OUT SIGNALS (Global Privacy Control & Do Not Track)
  // v2.5.2: captured + configurable:true so the CF watcher can restore.
  // GPC must read `true` and DNT `1` (bench opt-out probes) — slPoison's
  // undefined getter would regress that, so these use the slDefine helper
  // with real getters (capture/restore semantics identical).
  const slDefine = (obj, prop, desc) => {
    try {
      let orig = null;
      try { orig = Object.getOwnPropertyDescriptor(obj, prop) || null; } catch { /* */ }
      try { delete obj[prop]; } catch { /* */ }
      Object.defineProperty(obj, prop, desc);
      slUndoStack.push({ obj, prop, orig });
      return true;
    } catch { return false; }
  };
  try {
    const navProto = Object.getPrototypeOf(navigator) || navigator;
    const gpcDesc = { get: () => true, set: () => { }, configurable: true, enumerable: true };
    slDefine(navigator, 'globalPrivacyControl', gpcDesc);
    slDefine(navProto, 'globalPrivacyControl', gpcDesc);
    const dntDesc = { get: () => '1', set: () => { }, configurable: true, enumerable: true };
    slDefine(navigator, 'doNotTrack', dntDesc);
    slDefine(navProto, 'doNotTrack', dntDesc);
    slDefine(window, 'doNotTrack', dntDesc);
  } catch { /* */ }

  // 4. PRIVACY SANDBOX APIS
  // Bench checks:
  // - document.browsingTopics (function-callable)
  // - navigator.joinAdInterestGroup (function-callable)
  // - navigator.runAdAuction (function-callable)
  // - HTMLAnchorElement.prototype.attributionSrc (property-present)
  // - document.hasPrivateToken (function-callable)
  try {
    const docProto = Object.getPrototypeOf(document) || document;
    const navProto = Object.getPrototypeOf(navigator) || navigator;

    slPoison(document, 'browsingTopics');
    slPoison(docProto, 'browsingTopics');
    slPoison(navigator, 'runAdAuction');
    slPoison(navProto, 'runAdAuction');
    slPoison(navigator, 'joinAdInterestGroup');
    slPoison(navProto, 'joinAdInterestGroup');
    slPoison(document, 'hasPrivateToken');
    slPoison(docProto, 'hasPrivateToken');
    if (typeof HTMLAnchorElement !== 'undefined' && HTMLAnchorElement.prototype) {
      slPoison(HTMLAnchorElement.prototype, 'attributionSrc');
    }
  } catch { /* */ }

  // 5. STORAGE ACCESS API INTERCEPTION
  // Bench checks:
  // - document.requestStorageAccess (function-callable)
  // - document.hasStorageAccess (function-callable)
  try {
    const docProto = Object.getPrototypeOf(document) || document;
    slPoison(document, 'requestStorageAccess');
    slPoison(docProto, 'requestStorageAccess');
    slPoison(document, 'hasStorageAccess');
    slPoison(docProto, 'hasStorageAccess');
  } catch { /* */ }

  // 6. MATOMO / PIWIK SELF-HOSTED STUB — v2.5.2: captured for undo
  try {
    const slHadPaq = Object.prototype.hasOwnProperty.call(window, '_paq') && !!window._paq;
    const slOrigPaqPush = slHadPaq ? window._paq.push : null;
    window._paq = window._paq || [];
    window._paq.push = function () { };
    slUndoStack.push({
      obj: null, prop: '__sl_paq__', orig: null,
      undo: () => {
        try {
          if (slHadPaq && slOrigPaqPush) window._paq.push = slOrigPaqPush;
          else { try { delete window._paq; } catch { /* */ } }
        } catch { /* */ }
      }
    });
  } catch { /* */ }

  // 7. CF INTERSTITIAL WATCHER — v2.5.2 (see slCfInterstitialNow above)
  function slUndo() {
    while (slUndoStack.length) {
      const u = slUndoStack.pop();
      try {
        if (u.undo) { u.undo(); continue; }
        try { delete u.obj[u.prop]; } catch { /* */ }
        if (u.orig) {
          try { Object.defineProperty(u.obj, u.prop, u.orig); } catch { /* */ }
        }
      } catch { /* */ }
    }
    try { if (window.__sl_beacon_guard_undo__) window.__sl_beacon_guard_undo__(); } catch { /* */ }
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
