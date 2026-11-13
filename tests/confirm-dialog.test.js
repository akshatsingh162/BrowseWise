// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { confirmDialog } from '../src/dashboard/components/confirm-dialog.js';

const open = (options = {}) =>
  confirmDialog({
    title: 'Remove all?',
    message: 'This cannot be undone.',
    confirmLabel: 'Remove',
    ...options,
  });
const dialog = () => document.querySelector('[role="dialog"]');
const button = (label) =>
  [...document.querySelectorAll('.db-modal button')].find((b) => b.textContent === label);
const press = (key, options = {}) =>
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }),
  );

let opener;
beforeEach(() => {
  document.body.innerHTML = '<button id="opener">Open</button>';
  opener = document.getElementById('opener');
  opener.focus();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('confirmDialog', () => {
  it('is announced as a modal dialog with its title and message', () => {
    open();
    const d = dialog();
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(d.getAttribute('aria-labelledby')).textContent).toBe(
      'Remove all?',
    );
    expect(document.getElementById(d.getAttribute('aria-describedby')).textContent).toBe(
      'This cannot be undone.',
    );
  });

  it('starts focus on the safe choice, Cancel', () => {
    open();
    expect(document.activeElement).toBe(button('Cancel'));
  });

  it('resolves true on confirm and closes', async () => {
    const result = open();
    button('Remove').click();
    expect(await result).toBe(true);
    expect(dialog()).toBeNull();
  });

  it('resolves false on Cancel, Escape, and a click outside', async () => {
    let result = open();
    button('Cancel').click();
    expect(await result).toBe(false);

    result = open();
    press('Escape');
    expect(await result).toBe(false);

    result = open();
    document
      .querySelector('.db-modal-overlay')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(await result).toBe(false);
    expect(dialog()).toBeNull();
  });

  it('does not close when the click is inside the dialog', () => {
    open();
    document
      .querySelector('.db-modal')
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(dialog()).not.toBeNull();
  });

  it('returns focus to the control that opened it', async () => {
    const result = open();
    button('Cancel').click();
    await result;
    expect(document.activeElement).toBe(opener);
  });

  it('keeps Tab focus inside the dialog in both directions', () => {
    open();
    button('Remove').focus();
    press('Tab');
    expect(document.activeElement).toBe(button('Cancel'));

    press('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(button('Remove'));
  });

  it('styles the confirm button as destructive when asked', () => {
    open({ danger: true });
    expect(button('Remove').className).toContain('bw-btn-danger');
  });

  it('stops listening for keys once closed', async () => {
    const result = open();
    button('Cancel').click();
    await result;
    expect(() => press('Escape')).not.toThrow();
  });

  it('never interprets text as HTML', () => {
    open({ title: '<img src=x onerror=alert(1)>', message: '<b>bold</b>' });
    expect(document.querySelectorAll('.db-modal img, .db-modal b')).toHaveLength(0);
  });

  it('gives every dialog unique ids', () => {
    open();
    const first = dialog().getAttribute('aria-labelledby');
    document.body.innerHTML = '';
    open();
    expect(dialog().getAttribute('aria-labelledby')).not.toBe(first);
  });
});
