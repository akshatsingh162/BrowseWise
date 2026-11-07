import { describe, expect, it } from 'vitest';
import { getTrackableDomain, isLocalOrIpHost } from '../src/shared/domain.js';

describe('getTrackableDomain', () => {
  it.each([
    ['https://github.com/anthropics', 'github.com'],
    ['https://www.github.com/', 'github.com'],
    ['HTTPS://Example.COM:8080/path?q=1#frag', 'example.com'],
    ['https://mail.google.com/mail/u/0/', 'mail.google.com'],
    ['https://example.com./', 'example.com'],
    ['https://www.com/', 'www.com'],
    ['http://localhost:3000/', 'localhost'],
    ['http://192.168.1.1/admin', '192.168.1.1'],
  ])('normalises %s to %s', (url, expected) => {
    expect(getTrackableDomain(url)).toBe(expected);
  });

  it.each([
    'chrome://extensions',
    'chrome://newtab/',
    'chrome-extension://abcdefghijklmnop/popup.html',
    'about:blank',
    'file:///C:/Users/me/notes.txt',
    'data:text/html,<h1>hi</h1>',
    'view-source:https://example.com',
    'javascript:void(0)',
    'ftp://files.example.com',
    'edge://settings',
    '',
    'not a url',
  ])('returns null for unsupported URL "%s"', (url) => {
    expect(getTrackableDomain(url)).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(getTrackableDomain(undefined)).toBeNull();
    expect(getTrackableDomain(null)).toBeNull();
    expect(getTrackableDomain(42)).toBeNull();
  });
});

describe('isLocalOrIpHost', () => {
  it.each(['localhost', 'app.localhost', 'printer.local', '192.168.1.1', '[::1]'])(
    'treats %s as local',
    (host) => {
      expect(isLocalOrIpHost(host)).toBe(true);
    },
  );

  it.each(['github.com', 'localhost.com', '1.2.3'])('treats %s as a public host', (host) => {
    expect(isLocalOrIpHost(host)).toBe(false);
  });
});
