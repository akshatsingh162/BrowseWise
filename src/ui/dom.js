/**
 * Tiny DOM builder. Text is always set through textContent / text nodes, never
 * innerHTML, so domain names (untrusted input) can never inject markup.
 *
 * Props: `class`, `text`, `onClick`-style handlers, and any other attribute.
 * Attributes with null / undefined / false values are skipped.
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }

  for (const child of [].concat(children)) {
    if (child !== undefined && child !== null && child !== false) node.append(child);
  }
  return node;
}
