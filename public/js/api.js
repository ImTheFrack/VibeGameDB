'use strict';
/**
 * Minimal API layer around fetch.
 *
 * Exposes helpers for common GET requests and a few specific endpoints
 * used during app bootstrap (config and seed). Keeping this isolated
 * makes it easier to evolve network code (headers, error handling).
 */

// Generic helper for GET requests and JSON parsing with basic error handling
export async function apiGet(path) {
  try {
    const res = await fetch(path, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('API request failed', path, err);
    return null;
  }
}

export async function fetchGamesFromServer() { return apiGet('/plugins/database_handler/games'); }
export async function fetchPlatformsFromServer() { return apiGet('/plugins/database_handler/platforms'); }
export async function fetchGamePlatformsFromServer() { return apiGet('/plugins/database_handler/game_platforms'); }
export async function fetchConfig() { return apiGet('/plugins/config_handler'); }
export async function checkSeed() { return apiGet('/plugins/seed_handler/check'); }
export async function seedDb() {
  return fetch('/plugins/seed_handler/seed', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
}

// CSV import helpers
export async function postCsvPreview(csvText) {
  try {
    const res = await fetch('/plugins/import_handler/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv_text: csvText })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('CSV preview failed', err);
    return null;
  }
}

export async function postCsvImport(csvText, mapping, options = {}) {
  try {
    const res = await fetch('/plugins/import_handler/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv_text: csvText, mapping: mapping, options: options })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('CSV import failed', err);
    return null;
  }
}

export async function igdbSearch(title) {
  try {
    const res = await fetch('/plugins/import_handler/igdb_search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('IGDB search failed', err);
    return null;
  }
}
