// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadTextFile } from '../src/shared/download.js';

function readBytes(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve([...new Uint8Array(reader.result)]);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function setup() {
  let blob;
  const urlApi = {
    createObjectURL: vi.fn((value) => {
      blob = value;
      return 'blob:test-url';
    }),
    revokeObjectURL: vi.fn(),
  };
  const clicked = [];
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    clicked.push({ href: this.href, download: this.download, attached: this.isConnected });
  });
  return { urlApi, clicked, click, getBlob: () => blob };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('downloadTextFile', () => {
  it('clicks a temporary link with the file name, then removes it', () => {
    const { urlApi, clicked } = setup();
    downloadTextFile('data.json', '{"a":1}', 'application/json', { urlApi });

    expect(clicked).toEqual([{ href: 'blob:test-url', download: 'data.json', attached: true }]);
    expect(document.querySelector('a')).toBeNull();
  });

  it('creates a UTF-8 blob of the given type', async () => {
    const { urlApi, getBlob } = setup();
    downloadTextFile('a.csv', 'caf\u00e9', 'text/csv', { urlApi });

    expect(getBlob().type).toBe('text/csv;charset=utf-8');
    expect(await readBytes(getBlob())).toEqual([0x63, 0x61, 0x66, 0xc3, 0xa9]);
  });

  it('writes a UTF-8 byte order mark first only when asked', async () => {
    const withBom = setup();
    downloadTextFile('a.csv', 'x', 'text/csv', { bom: true, urlApi: withBom.urlApi });
    // FileReader.readAsText would hide the mark, so the raw bytes are checked.
    expect(await readBytes(withBom.getBlob())).toEqual([0xef, 0xbb, 0xbf, 0x78]);

    const withoutBom = setup();
    downloadTextFile('a.csv', 'x', 'text/csv', { urlApi: withoutBom.urlApi });
    expect(await readBytes(withoutBom.getBlob())).toEqual([0x78]);
  });

  it('releases the temporary address after a second, not before', () => {
    vi.useFakeTimers(); // only in this test: fake timers freeze jsdom's FileReader
    const { urlApi } = setup();
    downloadTextFile('a.json', '{}', 'application/json', { urlApi });

    vi.advanceTimersByTime(999);
    expect(urlApi.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });
});
