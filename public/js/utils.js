'use strict';
/**
 * Small utility helpers shared across modules.
 */

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

/**
 * Normalizes a game title for comparison and sorting.
 * - Converts to lowercase.
 * - Removes leading articles (a, an, the, le, la, l').
 * - Removes all punctuation.
 * @param {string} name The game title.
 * @returns {string} The normalized title.
 */
export function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().trim()
    .replace(/^(a|an|the|le|la|l')\s+/i, '') // Remove leading articles
    .replace(/[^\w\s]/gi, ' ') // Replace all punctuation with a space
    .replace(/\s+/g, ' ').trim(); // Collapse multiple spaces and trim again
}

export function on(dom, event, handler, options){
  if (!dom) return;
  dom.addEventListener(event, handler, options);
}
