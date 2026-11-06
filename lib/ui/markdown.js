/**
 * Minimal Board Tab - Markdown-lite Sanitizer & Whitelist Formatter
 * Pure ES module. Converts markdown-like text to safe HTML nodes or sanitized string.
 * Strictly prevents XSS by escaping all raw HTML before applying formatting.
 */

import { isValidUrl } from '../url.js';

/**
 * Escapes unsafe HTML characters.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Parses markdown-lite text into a safe HTML string.
 * Whitelisted syntax:
 * - **bold** or __bold__
 * - *italic* or _italic_
 * - `inline code`
 * - [link text](url) (http/https only)
 * - Line breaks to <br>
 *
 * @param {string} text
 * @returns {string}
 */
export function renderMarkdownLite(text) {
  if (!text || typeof text !== 'string') return '';

  // 1. Escape all raw HTML first
  let escaped = escapeHtml(text.trim());

  // 2. Inline code: `code`
  escaped = escaped.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>');

  // 3. Bold: **text** or __text__
  escaped = escaped.replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>');

  // 4. Italic: *text* or _text_
  escaped = escaped.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');

  // 5. Links: [text](url) -> only allow valid http/https URLs (handles single-level nested parentheses)
  escaped = escaped.replace(/\[([^\]]+)\]\(((?:[^()]+|\([^()]*\))*)\)/g, (match, linkText, rawUrl) => {
    // Unescape the URL for validation
    const unescapedUrl = rawUrl.replace(/&amp;/g, '&');
    if (isValidUrl(unescapedUrl)) {
      return `<a href="${escapeHtml(unescapedUrl)}" target="_blank" rel="noopener noreferrer" class="md-link">${linkText}</a>`;
    }
    return linkText; // Fallback to link text if URL is invalid or unsafe scheme
  });

  // 6. Convert newlines to <br>
  escaped = escaped.replace(/\n/g, '<br>');

  return escaped;
}
