// ═══════════════════════════════════════════════════════════════════════════
// Option: Bypass Bot & Paywall (Dedicated Module)
// Ensures DataDome / Cloudflare challenge handshakes pass without interference.
// Defuses paywall overlays & unlocks scroll for news sites (NYT, Reuters, etc.)
// Strictly guards bank/payment gateways from being touched.
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  if (window.__bypass_module_active) return;
  window.__bypass_module_active = true;

  // 1. BANK & PAYMENT GATEWAY PROTECTION
  const host = location.hostname.toLowerCase();
  const BANK_DOMAINS = [
    'vnpay', 'momo', 'zalopay', 'onepay', 'shopeepay', 'viettelpay',
    'vietcombank', 'techcombank', 'bidv', 'vietinbank', 'mbbank', 'acb',
    'tpbank', 'vpbank', 'sacombank', 'hdbank', 'agribank', 'scb', 'vib',
    'paypal', 'stripe', 'visa', 'mastercard', 'checkout', 'billing',
    'pay.', 'payment.', 'banking.', 'ebanking.'
  ];
  for (let i = 0; i < BANK_DOMAINS.length; i++) {
    if (host.includes(BANK_DOMAINS[i])) {
      console.info('[BypassModule] Banking/payment domain detected. Disabling bypass module for safety.');
      return;
    }
  }

  // 2. BOT CHALLENGE PASS-THROUGH
  // Allow captcha-delivery (DataDome) & Cloudflare challenge to complete.
  // v2.5.1: also cover the Cloudflare Turnstile iframe host.
  if (host === 'challenges.cloudflare.com' || host.endsWith('.challenges.cloudflare.com') ||
      host.includes('captcha-delivery.com') || host.endsWith('.datadome.co')) {
    return;
  }

  // 2b. CLOUDFLARE INTERSTITIAL GUARD — v2.5.2
  // Origin-served managed challenges (www.fandom.com "Just a moment...")
  // never match the host bail above; the paywall defusers would run there.
  // Sync bail + watcher (end of file) keeps the challenge page pristine.
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

  // 3. TARGETED NEWS & ARTICLE PAYWALL DEFUSERS
  function defusePaywalls() {
    if (slStopped) return;
    try {
      // The New York Times
      if (host.includes('nytimes.com')) {
        const gateway = document.getElementById('gateway-content');
        if (gateway) gateway.style.setProperty('display', 'none', 'important');

        const paywallBackdrop = document.querySelector('.css-mcm29f, [data-testid="gateway-content"]');
        if (paywallBackdrop) paywallBackdrop.style.setProperty('display', 'none', 'important');

        // Restore gradient / faded text
        const faded = document.querySelectorAll('[class*="truncated-content"], [class*="css-1bd5w79"]');
        for (let i = 0; i < faded.length; i++) {
          faded[i].style.setProperty('max-height', 'none', 'important');
          faded[i].style.setProperty('overflow', 'visible', 'important');
        }
      }

      // Reuters
      if (host.includes('reuters.com')) {
        const rPaywall = document.querySelector('[class*="paywall-overlay"], [id*="fusion-paywall"]');
        if (rPaywall) rPaywall.style.setProperty('display', 'none', 'important');
      }

      // General soft paywalls & anti-scroll locks
      const lockedBody = document.querySelector('body.adblock-active, body[class*="paywall-active"]');
      if (lockedBody) {
        lockedBody.style.setProperty('overflow', 'auto', 'important');
        lockedBody.style.setProperty('position', 'static', 'important');
      }
    } catch { /* ignore DOM exceptions */ }
  }

  defusePaywalls();
  if (document.readyState !== 'complete') {
    window.addEventListener('DOMContentLoaded', defusePaywalls, { once: true });
    window.addEventListener('load', defusePaywalls, { once: true });
  }

  // MutationObserver with tight scope
  let timer = null;
  const observer = new MutationObserver(() => {
    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        defusePaywalls();
      }, 250);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  slObserverRef = observer;

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
