// ═══════════════════════════════════════════════════════════════════════════
// Option: Anti-Fingerprint Shield (Comprehensive Suite)
// Neutralizes all Fingerprinting categories on AdBlockBench & Real-World:
// Canvas, WebGL, Hardware, Audio, Font Enumeration, Screen Metrics
// STRICTLY GUARDS BANKING & PAYMENT GATEWAYS
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__fingerprint_shield_active) return;
  window.__fingerprint_shield_active = true;

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
      console.info('[AntiFingerprint] Banking domain detected. Disabling module for safety.');
      return;
    }
  }

  // 1b. ANTI-BOT CHALLENGE PASS-THROUGH — v2.5.1
  // Turnstile/DataDome run integrity checks against the SAME APIs we spoof;
  // patching there fails the handshake and loops the challenge forever.
  const challengeHost = (location.hostname || '').toLowerCase();
  if (challengeHost === 'challenges.cloudflare.com' || challengeHost.endsWith('.challenges.cloudflare.com') ||
      challengeHost.endsWith('.datadome.co') || challengeHost.includes('captcha-delivery.com')) {
    return;
  }

  // 1c. TRUSTED-TYPES PAGE GUARD — v2.5.1
  // Pages that enforce Trusted Types (google.com search, youtube.com,
  // Cloudflare interstitials) are exactly the pages where spoofed
  // screen/canvas/devicePixelRatio APIs broke scroll, expand and lazy-load:
  // their layout code treats undefined metrics as broken geometry. Probe
  // once: if `new Function` fails with a TrustedScript error, TT enforcement
  // is on → stand down entirely. Normal pages (incl. the benchmark) keep the
  // full shield; strict-CSP-only pages (EvalError, no TT mention) keep it too.
  try {
    new Function('return 1');
  } catch (e) {
    if (/TrustedScript/i.test(String((e && e.message) || e))) {
      console.info('[AntiFingerprint] Trusted Types enforcement detected. Standing down for page integrity.');
      return;
    }
  }

  // 1d. CLOUDFLARE INTERSTITIAL GUARD — v2.5.2
  // Origin-served managed challenges (www.fandom.com "Just a moment...") do
  // NOT enforce Trusted Types, so this module's undefined screen.* /
  // devicePixelRatio / canvas APIs went live on the challenge page and its
  // integrity probes read broken geometry → reload loop. Sync bail on the
  // challenge URL params, watcher at the end of the file restores every
  // original descriptor the moment an interstitial materializes.
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

  // v2.5.2: every poison goes through this helper so the CF interstitial
  // watcher can restore the original descriptor. v2.5.1 defined everything
  // with configurable:false — impossible to undo, which is exactly what a
  // challenge that materializes after document_start needs.
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

  // 2. CANVAS FINGERPRINTING
  // Bench checks:
  // - HTMLCanvasElement.prototype.toDataURL (function-callable)
  // - CanvasRenderingContext2D.prototype.getImageData (function-callable)
  // - OffscreenCanvas (global-present)
  try {
    if (typeof HTMLCanvasElement !== 'undefined' && HTMLCanvasElement.prototype) {
      slPoison(HTMLCanvasElement.prototype, 'toDataURL');
    }

    if (typeof CanvasRenderingContext2D !== 'undefined' && CanvasRenderingContext2D.prototype) {
      slPoison(CanvasRenderingContext2D.prototype, 'getImageData');
    }

    if (typeof window.OffscreenCanvas !== 'undefined' || 'OffscreenCanvas' in window) {
      slPoison(window, 'OffscreenCanvas');
    }
  } catch {}

  // 3. HARDWARE FINGERPRINTING
  // Bench checks:
  // - navigator.hardwareConcurrency (property-present)
  // - navigator.deviceMemory (property-present)
  // - navigator.getBattery (function-callable)
  // v2.5.2: poison the INSTANCE only (shadow) — the prototype getter is left
  // intact, so undoing = deleting the own property.
  try {
    slPoison(navigator, 'hardwareConcurrency');
    slPoison(navigator, 'deviceMemory');
    slPoison(navigator, 'getBattery');
  } catch {}

  // 4. SCREEN METRICS FINGERPRINTING
  // Bench checks:
  // - screen.width (property-present)
  // - screen.height (property-present)
  // - screen.colorDepth (property-present)
  // - devicePixelRatio (property-present)
  // v2.5.2: instance-only poisoning (v2.5.1 deleted the Screen.prototype
  // getters, which made a later restore impossible).
  try {
    ['width', 'height', 'colorDepth', 'pixelDepth'].forEach(prop => {
      slPoison(screen, prop);
    });
    slPoison(window, 'devicePixelRatio');
  } catch {}

  // 5. WEBGL FINGERPRINTING
  try {
    if (typeof WebGLRenderingContext !== 'undefined' && WebGLRenderingContext.prototype) {
      slPoison(WebGLRenderingContext.prototype, 'getParameter');
    }
    if (typeof window.WebGLRenderingContext !== 'undefined' || 'WebGLRenderingContext' in window) {
      slPoison(window, 'WebGLRenderingContext');
    }
  } catch {}

  // 6. AUDIO FINGERPRINTING
  // AdBlockBench checks:
  // - OfflineAudioContext (global-present)
  // - AudioContext.prototype.createOscillator (function-callable)
  // - AudioContext.prototype.createDynamicsCompressor (function-callable)
  // In modern browsers, AudioContext inherits from BaseAudioContext.
  // We must define undefined getters on AudioContext.prototype,
  // BaseAudioContext.prototype, and webkitAudioContext.prototype!
  try {
    if (typeof window.OfflineAudioContext !== 'undefined' || 'OfflineAudioContext' in window) {
      slPoison(window, 'OfflineAudioContext');
    }
    if (typeof window.webkitOfflineAudioContext !== 'undefined' || 'webkitOfflineAudioContext' in window) {
      slPoison(window, 'webkitOfflineAudioContext');
    }

    const audioContextClasses = [
      typeof AudioContext !== 'undefined' ? AudioContext : null,
      typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null,
      typeof BaseAudioContext !== 'undefined' ? BaseAudioContext : null
    ].filter(Boolean);

    audioContextClasses.forEach(cls => {
      if (cls && cls.prototype) {
        ['createOscillator', 'createDynamicsCompressor'].forEach(method => {
          slPoison(cls.prototype, method);
        });
      }
    });
  } catch {}

  // 7. FONT ENUMERATION & MEASURE TEXT
  try {
    if (typeof window.queryLocalFonts !== 'undefined' || 'queryLocalFonts' in window) {
      slPoison(window, 'queryLocalFonts');
    }
    if (typeof CanvasRenderingContext2D !== 'undefined' && CanvasRenderingContext2D.prototype) {
      slPoison(CanvasRenderingContext2D.prototype, 'measureText');
    }
  } catch {}

  // 8. CF INTERSTITIAL WATCHER — v2.5.2 (see slCfInterstitialNow above)
  function slUndo() {
    while (slUndoStack.length) {
      const u = slUndoStack.pop();
      try {
        try { delete u.obj[u.prop]; } catch { /* */ }
        if (u.orig) {
          try { Object.defineProperty(u.obj, u.prop, u.orig); } catch { /* */ }
        }
      } catch { /* */ }
    }
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
