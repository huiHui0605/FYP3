export const $ = (id) => document.getElementById(id);

export function element(tag, content, className) {
  const node = document.createElement(tag);
  if (content !== undefined) node.textContent = content;
  if (className) node.className = className;
  return node;
}

export function icon(name) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const use = document.createElementNS(ns, "use");
  svg.setAttribute("class", "ui-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  use.setAttribute("href", "/static/icons.svg#" + name);
  svg.append(use);
  return svg;
}
