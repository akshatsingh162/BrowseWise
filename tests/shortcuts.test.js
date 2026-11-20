// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROUTES } from '../src/dashboard/router.js';
import { attachNavigationShortcuts } from '../src/dashboard/shortcuts.js';

let detach;
let win;
const press = (key, init = {}, target = document.body) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  document.body.replaceChildren();
  win = { location: { hash: '#overview' } };
  detach = attachNavigationShortcuts({ routes: ROUTES, win });
});
afterEach(() => detach());

describe('navigation shortcuts', () => {
  it.each(ROUTES.map((route, index) => [String(index + 1), route.id]))(
    'key %s goes to %s',
    (key, id) => {
      press(key);
      expect(win.location.hash).toBe(`#${id}`);
    },
  );

  it('uses the same order as the dock, which shows the number on each tooltip', () => {
    expect(ROUTES.map((route) => route.id)).toEqual([
      'overview',
      'analytics',
      'websites',
      'history',
      'focus',
      'goals',
      'settings',
    ]);
  });

  it('stops the key from doing anything else when it is used', () => {
    expect(press('3').defaultPrevented).toBe(true);
  });

  it.each(['0', '8', '9'])('does nothing for %s, which has no page', (key) => {
    const event = press(key);
    expect(win.location.hash).toBe('#overview');
    expect(event.defaultPrevented).toBe(false);
  });

  it.each(['a', 'Enter', 'Tab', ' ', 'ArrowRight', '10'])(
    'ignores other keys such as %j',
    (key) => {
      press(key);
      expect(win.location.hash).toBe('#overview');
    },
  );

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Alt', { altKey: true }],
    ['Cmd', { metaKey: true }],
    ['Shift', { shiftKey: true }],
  ])('leaves %s+number alone, so browser shortcuts keep working', (_name, modifier) => {
    const event = press('2', modifier);
    expect(win.location.hash).toBe('#overview');
    expect(event.defaultPrevented).toBe(false);
  });

  it('does not take numbers typed into a text field, a number field, a select or a text area', () => {
    for (const tag of ['input', 'textarea', 'select']) {
      const field = document.createElement(tag);
      document.body.append(field);
      press('3', {}, field);
      expect(win.location.hash).toBe('#overview');
    }
  });

  it('does not take numbers typed in an editable element or inside a form', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const wrapper = document.createElement('form');
    const inner = document.createElement('input');
    wrapper.append(inner);
    document.body.append(editable, wrapper);
    press('3', {}, editable);
    press('4', {}, inner);
    expect(win.location.hash).toBe('#overview');
  });

  it('does nothing while a dialog is open', () => {
    const overlay = document.createElement('div');
    overlay.className = 'db-modal-overlay';
    document.body.append(overlay);
    press('2');
    expect(win.location.hash).toBe('#overview');
    overlay.remove();
    press('2');
    expect(win.location.hash).toBe('#analytics');
  });

  it('respects a key that something else already handled', () => {
    document.addEventListener('keydown', (event) => event.preventDefault(), { once: true });
    // A handler registered before ours would have run first; here ours runs first, so check the flag directly.
    const event = new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true });
    event.preventDefault();
    document.body.dispatchEvent(event);
    expect(win.location.hash).toBe('#overview');
  });

  it('stops listening when detached', () => {
    detach();
    press('3');
    expect(win.location.hash).toBe('#overview');
    detach = attachNavigationShortcuts({ routes: ROUTES, win }); // so the shared cleanup is harmless
  });
});
