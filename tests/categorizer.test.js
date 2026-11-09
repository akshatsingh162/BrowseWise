import { describe, expect, it } from 'vitest';
import {
  categorize,
  categorizeAutomatically,
  categoryLabel,
  getCategoryId,
  isCategoryId,
} from '../src/shared/categorizer.js';

const auto = (domain) => categorizeAutomatically(domain).categoryId;

describe('categorizeAutomatically: domain list', () => {
  it.each([
    ['wikipedia.org', 'education'],
    ['reddit.com', 'social'],
    ['netflix.com', 'entertainment'],
    ['github.com', 'development'],
    ['notion.so', 'productivity'],
    ['flipkart.com', 'shopping'],
    ['bbc.co.uk', 'news'],
    ['slack.com', 'communication'],
  ])('puts %s in %s', (domain, expected) => {
    expect(auto(domain)).toBe(expected);
  });

  it('covers subdomains through their parent domain', () => {
    expect(auto('gist.github.com')).toBe('development');
    expect(auto('a.b.c.github.com')).toBe('development');
    expect(auto('en.wikipedia.org')).toBe('education');
    expect(auto('smile.amazon.in')).toBe('shopping');
  });

  it('lets a more specific entry beat a general one', () => {
    expect(auto('docs.google.com')).toBe('productivity');
    expect(auto('mail.google.com')).toBe('communication');
    expect(auto('meet.google.com')).toBe('communication');
    expect(auto('news.google.com')).toBe('news');
    expect(auto('scholar.google.com')).toBe('education');
    expect(auto('google.com')).toBe('other');
    expect(auto('aws.amazon.com')).toBe('development');
    expect(auto('console.aws.amazon.com')).toBe('development');
    expect(auto('amazon.com')).toBe('shopping');
    expect(auto('outlook.office.com')).toBe('communication');
    expect(auto('word.office.com')).toBe('productivity');
  });

  it('matches whole labels only, never partial names', () => {
    expect(auto('notgithub.com')).toBe('other');
    expect(auto('fakex.com')).toBe('other');
    expect(auto('box.com')).toBe('productivity');
    expect(auto('x.com')).toBe('social');
    expect(auto('github.com.evil.example')).toBe('other');
  });
});

describe('categorizeAutomatically: suffix rules, local hosts, defaults', () => {
  it.each(['mit.edu', 'ocw.mit.edu', 'iitb.ac.in', 'cam.ac.uk', 'unimelb.edu.au', 'a.edu.in'])(
    'treats %s as education',
    (domain) => {
      expect(auto(domain)).toBe('education');
    },
  );

  it('does not treat government or commercial domains as education', () => {
    expect(auto('example.gov.in')).toBe('other');
    expect(auto('example.com')).toBe('other');
  });

  it.each(['localhost', 'app.localhost', 'printer.local', '192.168.1.20', '10.0.0.1', '[::1]'])(
    'treats %s as development',
    (domain) => {
      expect(auto(domain)).toBe('development');
    },
  );

  it('reports where the answer came from', () => {
    expect(categorizeAutomatically('github.com').source).toBe('rule');
    expect(categorizeAutomatically('mit.edu').source).toBe('rule');
    expect(categorizeAutomatically('localhost').source).toBe('rule');
    expect(categorizeAutomatically('example.com').source).toBe('default');
  });

  it('falls back to "other" for empty and non-string input', () => {
    for (const bad of ['', undefined, null, 42, {}]) {
      expect(categorizeAutomatically(bad)).toEqual({ categoryId: 'other', source: 'default' });
    }
  });

  it('is not fooled by names that look like object internals', () => {
    for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'a.__proto__']) {
      expect(() => categorizeAutomatically(name)).not.toThrow();
      expect(auto(name)).toBe('other');
    }
  });
});

describe('categorize: user overrides', () => {
  it('lets an override beat the automatic category', () => {
    expect(categorize('youtube.com', { 'youtube.com': 'education' })).toEqual({
      categoryId: 'education',
      source: 'override',
    });
  });

  it('applies to the exact domain only, not to its subdomains', () => {
    const overrides = { 'github.com': 'entertainment' };
    expect(getCategoryId('github.com', overrides)).toBe('entertainment');
    expect(getCategoryId('gist.github.com', overrides)).toBe('development');
  });

  it('ignores an override that names an unknown category', () => {
    expect(categorize('github.com', { 'github.com': 'not-a-category' })).toEqual({
      categoryId: 'development',
      source: 'rule',
    });
  });

  it('works with no overrides, null overrides, and hostile override names', () => {
    expect(getCategoryId('github.com')).toBe('development');
    expect(getCategoryId('github.com', null)).toBe('development');

    const hostile = {};
    Object.defineProperty(hostile, '__proto__', { value: 'shopping', enumerable: true });
    expect(getCategoryId('__proto__', hostile)).toBe('shopping');
    expect(getCategoryId('constructor', hostile)).toBe('other');
  });
});

describe('helpers', () => {
  it('recognises category ids', () => {
    expect(isCategoryId('news')).toBe(true);
    expect(isCategoryId('News')).toBe(false);
    expect(isCategoryId('__proto__')).toBe(false);
    expect(isCategoryId(undefined)).toBe(false);
  });

  it('turns ids into labels', () => {
    expect(categoryLabel('development')).toBe('Development & Programming');
    expect(categoryLabel('social')).toBe('Social Media');
    expect(categoryLabel('mystery')).toBe('mystery');
  });
});
