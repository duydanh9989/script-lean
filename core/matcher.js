export const MATCH_TYPES = Object.freeze({
  DOMAIN: 'domain',
  PATTERN: 'pattern',
  REGEX: 'regex'
});

export function normalizeMatchValue(value) {
  return String(value || '')
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);
}

export function validateMatchRule(type, value) {
  const values = Array.isArray(value) ? value : normalizeMatchValue(value);
  if (!values.length) return { valid: false, error: 'At least one match rule required' };

  try {
    if (type === MATCH_TYPES.REGEX) {
      values.forEach(pattern => new RegExp(pattern));
    } else if (type === MATCH_TYPES.DOMAIN) {
      const invalid = values.find(domain => !/^(\*\.)?[a-z0-9.-]+$/i.test(domain));
      if (invalid) return { valid: false, error: `Invalid domain: ${invalid}` };
    } else if (type === MATCH_TYPES.PATTERN) {
      const invalid = values.find(pattern => !/^(\*|http|https|file|ftp):\/\//.test(pattern));
      if (invalid) return { valid: false, error: `Invalid URL pattern: ${invalid}` };
    } else {
      return { valid: false, error: 'Unknown match type' };
    }
  } catch (error) {
    return { valid: false, error: `Regex error: ${error.message}` };
  }

  return { valid: true, error: '' };
}

function domainMatches(hostname, rule) {
  // v2.5.0 FIX: a bare '*' domain must mean "all sites". The old regex class
  // [a-z0-9.-] never matched '*', so domain-typed entries saved with the
  // default target '*' (filter presets, editor default) failed every
  // scriptMatchesUrl() check — the popup "active" badge and the extension
  // badge count silently skipped them.
  const normalizedHost = hostname.toLowerCase();
  const normalizedRule = rule.toLowerCase();
  if (normalizedRule === '*') return true;
  if (normalizedRule.startsWith('*.')) {
    const root = normalizedRule.slice(2);
    return normalizedHost === root || normalizedHost.endsWith(`.${root}`);
  }
  return normalizedHost === normalizedRule;
}

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
}

function matchPatternToRegExp(pattern) {
  if (pattern === '<all_urls>') return /^(https?|file|ftp):\/\//;
  const match = pattern.match(/^(\*|http|https|file|ftp):\/\/([^/]*)(\/.*)$/);
  if (!match) return null;
  const [, scheme, host, path] = match;
  const schemeSource = scheme === '*' ? 'https?' : scheme;
  let hostSource;
  if (host === '*') hostSource = '[^/]*';
  else if (host.startsWith('*.')) {
    const root = host.slice(2).replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    hostSource = `(?:[^/]+\\.)?${root}`;
  } else hostSource = host.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const pathSource = path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${schemeSource}:\\/\\/${hostSource}${pathSource}$`);
}

export function ruleMatchesUrl(type, values, rawUrl) {
  const rules = Array.isArray(values) ? values : normalizeMatchValue(values);
  if (!rules.length) return false;

  try {
    const url = new URL(rawUrl);
    if (type === MATCH_TYPES.DOMAIN) {
      return rules.some(rule => domainMatches(url.hostname, rule));
    }
    if (type === MATCH_TYPES.REGEX) {
      return rules.some(rule => new RegExp(rule).test(rawUrl));
    }
    return rules.some(rule => (matchPatternToRegExp(rule) || globToRegExp(rule)).test(rawUrl));
  } catch {
    return false;
  }
}

export function scriptMatchesUrl(script, url) {
  if (!script || script.enabled === false) return false;
  if (!ruleMatchesUrl(script.matchType, script.matches, url)) return false;
  if (script.excludes?.length && ruleMatchesUrl(script.matchType, script.excludes, url)) return false;
  return true;
}

export function toChromeMatchPatterns(script) {
  if (script.matchType === MATCH_TYPES.REGEX) return ['<all_urls>'];
  if (script.matchType === MATCH_TYPES.PATTERN) return script.matches;

  return script.matches.flatMap(domain => {
    const host = domain.startsWith('*.') ? `*.${domain.slice(2)}` : domain;
    return [`http://${host}/*`, `https://${host}/*`];
  });
}

export function buildUrlGuard(script) {
  if (script.matchType !== MATCH_TYPES.REGEX) return '';
  const matches = JSON.stringify(script.matches || []);
  const excludes = JSON.stringify(script.excludes || []);
  return `
    const __injectJsMatches = ${matches};
    const __injectJsExcludes = ${excludes};
    const __injectJsUrl = location.href;
    const __injectJsTest = rules => rules.some(rule => new RegExp(rule).test(__injectJsUrl));
    if (!__injectJsTest(__injectJsMatches) || (__injectJsExcludes.length && __injectJsTest(__injectJsExcludes))) return;
  `;
}
