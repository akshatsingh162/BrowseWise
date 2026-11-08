import { describe, expect, it } from 'vitest';
import { faviconUrl } from '../src/shared/favicon.js';

const getURL = (path) => `chrome-extension://abc123${path}`;

describe('faviconUrl', () => {
  it('points at the extension _favicon endpoint with the page URL and size', () => {
    const url = new URL(faviconUrl('github.com', 32, getURL));
    expect(url.protocol).toBe('chrome-extension:');
    expect(url.host).toBe('abc123');
    expect(url.pathname).toBe('/_favicon/');
    expect(url.searchParams.get('pageUrl')).toBe('https://github.com/');
    expect(url.searchParams.get('size')).toBe('32');
  });

  it('keeps subdomains and encodes the page URL', () => {
    const url = faviconUrl('mail.google.com', 16, getURL);
    expect(url).toContain('pageUrl=https%3A%2F%2Fmail.google.com%2F');
    expect(url).toContain('size=16');
  });
});
