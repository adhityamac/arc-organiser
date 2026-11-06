import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderMarkdownLite } from '../lib/ui/markdown.js';

describe('lib/ui/markdown.js', () => {
  describe('escapeHtml', () => {
    it('escapes &, <, >, ", and single quotes', () => {
      const input = '<script>alert("XSS & \'attack\'")</script>';
      const expected = '&lt;script&gt;alert(&quot;XSS &amp; &#039;attack&#039;&quot;)&lt;/script&gt;';
      assert.equal(escapeHtml(input), expected);
    });
  });

  describe('renderMarkdownLite', () => {
    it('renders bold, italic, code, and newlines safely', () => {
      const input = 'This is **bold**, *italic*, and `const x = 1;`\nNext line';
      const output = renderMarkdownLite(input);
      assert.ok(output.includes('<strong>bold</strong>'));
      assert.ok(output.includes('<em>italic</em>'));
      assert.ok(output.includes('<code class="md-code">const x = 1;</code>'));
      assert.ok(output.includes('<br>'));
    });

    it('renders valid http/https links with rel=noopener noreferrer', () => {
      const input = 'Visit [Google](https://google.com) today.';
      const output = renderMarkdownLite(input);
      assert.ok(output.includes('<a href="https://google.com" target="_blank" rel="noopener noreferrer" class="md-link">Google</a>'));
    });

    it('defangs javascript: links and unsafe protocols', () => {
      const input = 'Click [here](javascript:alert(1)) to hack.';
      const output = renderMarkdownLite(input);
      assert.ok(!output.includes('<a href='));
      assert.ok(output.includes('Click here to hack.'));
    });

    it('neutralizes embedded script tags and HTML injection attempts', () => {
      const malicious = '<img src=x onerror=alert(1)> **bold text**';
      const output = renderMarkdownLite(malicious);
      assert.ok(!output.includes('<img'));
      assert.ok(output.includes('&lt;img src=x onerror=alert(1)&gt;'));
      assert.ok(output.includes('<strong>bold text</strong>'));
    });
  });
});
