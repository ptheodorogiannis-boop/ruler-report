import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeHtml } from '../src/lib/util/sanitize';

test('sanitizer: keeps images from our uploads or https, strips other sources and event handlers', () => {
  assert.equal(sanitizeHtml('<p>a</p><img src="/api/media/abc123" alt="a" width="400" height="300">'), '<p>a</p><img src="/api/media/abc123" alt="a" width="400" height="300">');
  assert.equal(sanitizeHtml('<img src="https://cdn.example.com/x.png" alt="x">'), '<img src="https://cdn.example.com/x.png" alt="x">');
  assert.equal(sanitizeHtml('<img src="http://insecure/x.png" alt="x">'), '', 'plain http is dropped');
  assert.equal(sanitizeHtml('<img src="/api/media/abc123" onerror="alert(1)" alt="x">'), '<img src="/api/media/abc123" alt="x">');
  assert.equal(sanitizeHtml('<img src="javascript:alert(1)">'), '');
  assert.equal(sanitizeHtml('<img src="/api/media/abc123" style="position:fixed">'), '<img src="/api/media/abc123">');
});
