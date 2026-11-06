/**
 * URL normalization, validation, and parameter sanitization for Minimal Board Tab.
 * Pure ES module, zero external dependencies.
 */

// Tracking parameters commonly appended by advertising and marketing platforms
const TRACKING_PARAM_PATTERNS = [
  /^utm_/i,
  /^ga_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^gclsrc$/i,
  /^dclid$/i,
  /^msclkid$/i,
  /^mc_eid$/i,
  /^mc_cid$/i,
  /^yclid$/i,
  /^_hsenc$/i,
  /^_hsmi$/i,
  /^mkt_tok$/i,
  /^igshid$/i,
  /^si$/i, // Spotify / YouTube share ID
  /^ref$/i,
  /^ref_/i,
];

/**
 * Validates whether a URL is an allowed HTTP or HTTPS link.
 * Rejects chrome://, chrome-extension://, file:, javascript:, data:, blob:, etc.
 * @param {string} url
 * @returns {boolean}
 */
export function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Extracts a clean hostname, stripping leading 'www.'
 * @param {string} url
 * @returns {string}
 */
export function extractHost(url) {
  try {
    const parsed = new URL(url.trim());
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Normalizes a URL for canonical storage and duplicate detection.
 * Rules applied:
 * 1. Lowercase scheme and hostname
 * 2. Remove 'www.' from hostname
 * 3. Drop port if standard (80 for http, 443 for https)
 * 4. Strip trailing slash from pathname (except for root path '/')
 * 5. Remove URL fragment/hash (#...)
 * 6. Strip tracking query parameters (if stripTracking is true, default true)
 * 7. Sort remaining query parameters for deterministic equivalence
 *
 * @param {string} rawUrl
 * @param {{ stripTracking?: boolean }} [options]
 * @returns {string}
 */
export function normalizeUrl(rawUrl, options = {}) {
  const { stripTracking = true } = options;
  if (!isValidUrl(rawUrl)) {
    throw new Error(`Invalid or unsupported URL scheme: ${rawUrl}`);
  }

  const parsed = new URL(rawUrl.trim());

  // 1 & 2. Scheme & Host
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();

  // 3. Standard ports
  if (
    (parsed.protocol === 'http:' && parsed.port === '80') ||
    (parsed.protocol === 'https:' && parsed.port === '443')
  ) {
    parsed.port = '';
  }

  // 4. Trailing slash on path
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  // 5. Remove fragment
  parsed.hash = '';

  // 6. Filter & sort search parameters
  const params = Array.from(parsed.searchParams.entries());
  const filtered = params.filter(([key]) => {
    if (!stripTracking) return true;
    return !TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(key));
  });

  // Sort keys alphabetically for canonical consistency
  filtered.sort(([a], [b]) => a.localeCompare(b));

  parsed.search = '';
  for (const [k, v] of filtered) {
    parsed.searchParams.append(k, v);
  }

  return parsed.toString();
}
