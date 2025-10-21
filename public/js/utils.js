'use strict';

export function escapeHtml(s){
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

export function on(dom, event, handler, options){
  if (!dom) return;
  dom.addEventListener(event, handler, options);
}
