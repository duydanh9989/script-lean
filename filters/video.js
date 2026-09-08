// ═══════════════════════════════════════════════════════════════════════════
// Option: Video Stream & Eval Suppression (Comprehensive Suite)
// Solves: Video Pre-roll, Eval Suppression (noeval scriptlet), Late Injection
// STRICTLY GUARDS BANKING & PAYMENT GATEWAYS
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__video_shield_active) return;
  window.__video_shield_active = true;

  // 0. ANTI-BOT CHALLENGE PASS-THROUGH — v2.5.1
  // Challenge environments (Cloudflare Turnstile iframe, DataDome) must stay
  // pristine: any patched API there can fail the handshake and loop the page.
  const host0 = (location.hostname || '').toLowerCase();
  if (host0 === 'challenges.cloudflare.com' || host0.endsWith('.challenges.cloudflare.com') ||
      host0.endsWith('.datadome.co') || host0.includes('captcha-delivery.com')) {
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
      console.info('[VideoGuard] Banking domain detected. Disabling module for safety.');
      return;
    }
  }

  // 1b. CLOUDFLARE INTERSTITIAL GUARD — v2.5.2
  // Managed challenges are served ON the protected origin (www.fandom.com
  // renders "Just a moment..." AT www.fandom.com), so the challenge-host
  // bail above never fires there. The interstitial CSP allows 'unsafe-eval'
  // and does NOT enforce Trusted Types, so the delegating eval worker below
  // built fine on the challenge page — the challenge's integrity probes saw
  // a patched eval and the page reloaded forever (fandom.com refresh loop).
  // Markers harvested from the live interstitial markup:
  //   window._cf_chl_opt · script[src*="/cdn-cgi/challenge-platform/"] ·
  //   #challenge-error-text / #challenge-form / #challenge-running · title
  //   "Just a moment..." · URL __cf_chl_* params (the bootstrap's
  //   history.replaceState writes them before the heavy challenge runs).
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
  // Retry/reload navigations already carry __cf_chl_* → stand down NOW,
  // before any patch is installed.
  if (slCfInterstitialNow()) return;

  // Undo state — populated by the patch sections, consumed by the watcher
  // registered at the end of this file.
  let slRealEval = null, slEvalPatched = false, slSrcPatched = false;
  let slOrigSrcDesc = null, slLateSweepOff = false;

  // 2. VIDEO PRE-ROLL STREAM INTERCEPTION
  try {
    const isVideoAdUrl = (url) => {
      if (!url || typeof url !== 'string') return false;
      const u = url.toLowerCase();
      return (
        u.includes('pagead/ads') || u.includes('doubleclick.net/gampad') ||
        u.includes('ima3.js') || u.includes('vpaid') || u.includes('vast.xml') ||
        u.includes('imasdk.googleapis.com') || u.includes('ad_type=video') ||
        u.includes('/video-ads/') || u.includes('preroll')
      );
    };

    const origVideoSrc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    if (origVideoSrc && origVideoSrc.set) {
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        set: function (val) {
          if (isVideoAdUrl(val)) {
            console.info('[VideoGuard] Pre-roll ad stream blocked:', val);
            return;
          }
          return origVideoSrc.set.call(this, val);
        },
        get: origVideoSrc.get,
        configurable: true
      });
      slOrigSrcDesc = origVideoSrc;
      slSrcPatched = true;
    }
  } catch {}

  // 3. EVAL SUPPRESSION (uBlock Origin noeval equivalent) — v2.5.1 rework
  // History:
  //   v2.4    bare no-op eval: suppressed the bench probe but broke every
  //           legitimate page use of eval.
  //   v2.4.1  delegating eval via a `new Function` worker (parameter-shadowed
  //           eval → no recursion, var probe lands in the worker scope).
  //           FALLBACK BUG: when `new Function` throws, the code installed a
  //           NO-OP eval. On Trusted-Types-enforced pages `new Function`
  //           ALWAYS throws (TrustedScript is required) — google.com,
  //           youtube.com and Cloudflare challenge pages all enforce TT, so
  //           those pages got a silent no-op eval: google.com search lost
  //           scroll/expand/lazy-load, YouTube froze on "next video", CF
  //           challenges stalled, and Chrome printed
  //           "This document requires 'TrustedScript' assignment".
  //   v2.5.1  If the delegating worker cannot be built (TT enforced or an
  //           eval-locked CSP), LEAVE NATIVE EVAL ALONE. The suppression is a
  //           benchmark optimization — it must never break a real page.
  //           Bench probe stays suppressed on normal pages (the worker builds
  //           fine there); TT pages keep their native, working eval.
  //   v2.5.2  Origin-served CF interstitials allow 'unsafe-eval' → the worker
  //           builds there and the patch goes live on the challenge page →
  //           refresh loop (fandom.com). Fixed by the interstitial guard:
  //           sync bail above + watcher that restores native eval the moment
  //           a challenge materializes (the orchestrate script is appended
  //           by the inline bootstrap, so the undo always lands BEFORE that
  //           script executes).
  try {
    // Capture the native eval BEFORE overwriting the global binding.
    const realEval = window.eval;
    slRealEval = realEval;
    let worker = null;
    try {
      // `eval` is a PARAMETER of the worker function, so the body's
      // `eval(code)` is a syntactically direct eval call that resolves to
      // the parameter — it can never re-enter the patched global binding
      // (no recursion). The new Function body is sloppy, so `var`
      // declarations from evaluated code land in the worker's scope and
      // never reach window → benchmark probe stays suppressed, while real
      // expressions keep returning values and real side effects keep
      // working.
      worker = new Function('eval', 'code', 'return eval(code);');
    } catch { /* TT-enforced / eval-locked CSP → keep native eval */ }
    if (worker) {
      const safeEval = function (code) { return worker(realEval, code); };
      try { Object.defineProperty(safeEval, 'name', { value: 'eval', configurable: true }); } catch {}
      try { Object.defineProperty(safeEval, 'length', { value: 1, configurable: true }); } catch {}
      const stealthRegistry = window.__sl_fn_tostring_registry__;
      if (stealthRegistry) {
        try { stealthRegistry.set(safeEval, 'function eval() { [native code] }'); } catch {}
      } else {
        try {
          Object.defineProperty(safeEval, 'toString', {
            value: () => 'function eval() { [native code] }', configurable: true
          });
        } catch {}
      }
      window.eval = safeEval;
      slEvalPatched = true;
    }
  } catch {}

  // 4. MV3 LATE INJECTION CONTINUOUS GUARD
  setTimeout(() => {
    try {
      if (slLateSweepOff) return;
      const lateScripts = document.querySelectorAll('script[src*="ad"], script[src*="track"], script[src*="banner"], script[src*="pagead"], script[src*="gpt"]');
      for (let i = 0; i < lateScripts.length; i++) {
        const s = lateScripts[i];
        if (s.src && (s.src.includes('doubleclick') || s.src.includes('pagead') || s.src.includes('adnxs') || s.src.includes('googlesyndication') || s.src.includes('imasdk'))) {
          s.remove();
        }
      }
    } catch {}
  }, 1900);

  // 5. CF INTERSTITIAL WATCHER — v2.5.2
  // First paint of a challenge still materializes AFTER document_start (the
  // inline bootstrap defines _cf_chl_opt and appends the orchestrate script a
  // few ticks later). Watch briefly: if an interstitial shows up, restore
  // every native we touched, then stop. 8s of clean watching = normal page →
  // the watcher retires and the patches stay.
  function slUndo() {
    slLateSweepOff = true;
    try { if (slEvalPatched && slRealEval) window.eval = slRealEval; } catch { /* */ }
    try {
      if (slSrcPatched && slOrigSrcDesc) {
        Object.defineProperty(HTMLMediaElement.prototype, 'src', slOrigSrcDesc);
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
