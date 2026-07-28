/**
 * Tiny element builder — the only DOM abstraction in the app.
 *
 * el("button", { class: "btn", text: "Go", on: { click: handler } })
 *
 * Hyphenated keys and `role` go through setAttribute (ARIA property reflection is too
 * recent to rely on for older iOS Safari); everything else is set as a property.
 */

const ATTRIBUTE_KEYS = new Set(["role"]);

function append(node, children) {
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child);
  }
}

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "on") {
      for (const [type, handler] of Object.entries(value)) node.addEventListener(type, handler);
    } else if (key.includes("-") || ATTRIBUTE_KEYS.has(key)) {
      node.setAttribute(key, value);
    } else {
      node[key] = value;
    }
  }

  append(node, children);
  return node;
}

/** Replaces an element's children in one go. */
export function replaceChildren(node, ...children) {
  node.replaceChildren();
  append(node, children);
  return node;
}

export function fragment(...children) {
  const frag = document.createDocumentFragment();
  append(frag, children);
  return frag;
}
