/**
 * Saves text as a file through the browser's normal download flow: a Blob, a
 * temporary link, one click. It needs no extension permission.
 *
 * @param {string} filename
 * @param {string} text
 * @param {string} mime for example "application/json"
 * @param {object} [options]
 * @param {boolean} [options.bom] put a UTF-8 byte order mark first, which makes Excel
 *        read accents and non-Latin names correctly in a CSV file
 * @param {Document} [options.doc] injectable for tests
 * @param {{createObjectURL: Function, revokeObjectURL: Function}} [options.urlApi]
 */
export function downloadTextFile(
  filename,
  text,
  mime,
  { bom = false, doc = document, urlApi = URL } = {},
) {
  const blob = new Blob(bom ? ['\uFEFF', text] : [text], { type: `${mime};charset=utf-8` });
  const url = urlApi.createObjectURL(blob);

  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  doc.body.append(link);
  link.click();
  link.remove();

  // Give the browser a moment to start the download before the address is released.
  setTimeout(() => urlApi.revokeObjectURL(url), 1000);
}
