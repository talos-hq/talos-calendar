// Tiny DOM helpers: build elements without innerHTML so user data is never parsed as HTML.

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (value === true) el.setAttribute(name, "");
    else el.setAttribute(name, value);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

export function setStatus(el: HTMLElement, message: string, kind: "info" | "error" = "info", action?: HTMLElement): void {
  el.replaceChildren();
  if (!message) {
    el.hidden = true;
    return;
  }
  el.className = `status ${kind}`;
  el.append(h("span", {}, message));
  if (action) el.append(action);
  el.hidden = false;
}
