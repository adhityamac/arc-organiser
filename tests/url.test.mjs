import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidUrl, extractHost, normalizeUrl } from '../lib/url.js';

describe('lib/url.js', () => {
  describe('isValidUrl', () => {
    it('accepts valid http and https URLs', () => {
      assert.equal(isValidUrl('https://example.com'), true);
      assert.equal(isValidUrl('http://sub.domain.org/path?q=1'), true);
      assert.equal(isValidUrl('https://localhost:3000/app'), true);
    });

    it('rejects internal and restricted browser schemes', () => {
      assert.equal(isValidUrl('chrome://extensions'), false);
      assert.equal(isValidUrl('chrome-extension://abcdef/newtab.html'), false);
      assert.equal(isValidUrl('about:blank'), false);
      assert.equal(isValidUrl('edge://settings'), false);
      assert.equal(isValidUrl('brave://settings'), false);
      assert.equal(isValidUrl('javascript:alert(1)'), false);
      assert.equal(isValidUrl('data:text/html,<b>hi</b>'), false);
      assert.equal(isValidUrl('blob:https://example.com/uuid'), false);
      assert.equal(isValidUrl('file:///C:/Users/file.txt'), false);
    });

    it('rejects non-strings, null, undefined, empty string', () => {
      assert.equal(isValidUrl(''), false);
      assert.equal(isValidUrl('   '), false);
      assert.equal(isValidUrl(null), false);
      assert.equal(isValidUrl(undefined), false);
      assert.equal(isValidUrl(12345), false);
      assert.equal(isValidUrl('not a url'), false);
    });
  });

  describe('extractHost', () => {
    it('extracts clean hostname without www', () => {
      assert.equal(extractHost('https://www.github.com/torvalds/linux'), 'github.com');
      assert.equal(extractHost('https://github.com/torvalds/linux'), 'github.com');
      assert.equal(extractHost('http://WWW.Sub.Example.CO.UK/'), 'sub.example.co.uk');
    });

    it('returns empty string on invalid URLs', () => {
      assert.equal(extractHost('invalid-string'), '');
      assert.equal(extractHost(null), '');
    });
  });

  describe('normalizeUrl', () => {
    it('lowercases scheme and host, preserves path case', () => {
      const result = normalizeUrl('HTTPS://WWW.Example.COM/Path/To/Resource');
      assert.equal(result, 'https://example.com/Path/To/Resource');
    });

    it('strips www. prefix', () => {
      assert.equal(normalizeUrl('https://www.google.com/'), 'https://google.com/');
    });

    it('drops trailing slash from path (except root /)', () => {
      assert.equal(normalizeUrl('https://example.com/blog/article/'), 'https://example.com/blog/article');
      assert.equal(normalizeUrl('https://example.com/'), 'https://example.com/');
    });

    it('drops fragments/hashes', () => {
      assert.equal(normalizeUrl('https://example.com/docs#heading-2'), 'https://example.com/docs');
    });

    it('strips default tracking parameters', () => {
      const url = 'https://news.ycombinator.com/item?id=12345&utm_source=twitter&utm_medium=social&utm_campaign=launch&fbclid=abcdef&gclid=xyz';
      assert.equal(normalizeUrl(url), 'https://news.ycombinator.com/item?id=12345');
    });

    it('retains non-tracking query parameters and sorts them canonically', () => {
      const url1 = 'https://example.com/search?z=3&a=1&utm_medium=cpc&b=2';
      const url2 = 'https://example.com/search?b=2&a=1&z=3';
      assert.equal(normalizeUrl(url1), 'https://example.com/search?a=1&b=2&z=3');
      assert.equal(normalizeUrl(url2), 'https://example.com/search?a=1&b=2&z=3');
      assert.equal(normalizeUrl(url1), normalizeUrl(url2));
    });

    it('strips standard ports 80 and 443', () => {
      assert.equal(normalizeUrl('http://example.com:80/path'), 'http://example.com/path');
      assert.equal(normalizeUrl('https://example.com:443/path'), 'https://example.com/path');
      assert.equal(normalizeUrl('https://example.com:8443/path'), 'https://example.com:8443/path');
    });

    it('can preserve tracking parameters when stripTracking is false', () => {
      const url = 'https://example.com/page?utm_source=test&id=99';
      assert.equal(
        normalizeUrl(url, { stripTracking: false }),
        'https://example.com/page?id=99&utm_source=test'
      );
    });

    it('throws on invalid URL input', () => {
      assert.throws(() => normalizeUrl('chrome://settings'), /Invalid or unsupported URL scheme/);
    });
  });
});
