'use strict';
/**
 * API layer and data loaders.
 *
 * Exposes helpers for common GET requests and a few specific endpoints
 * used during app bootstrap (config and seed). Keeping this isolated
 * makes it easier to evolve network code (headers, error handling).
 * These functions do NOT mutate state; they only return data.
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

export async function fetchConfig() { return apiGet('/plugins/config_handler'); }

export async function fetchGames() { return apiGet('/plugins/database_handler/games'); }
export async function fetchPlatforms() { return apiGet('/plugins/database_handler/platforms'); }
export async function fetchGamePlatforms() { return apiGet('/plugins/database_handler/game_platforms'); }
export async function fetchSchema() { return apiGet('/plugins/database_handler/schema'); }

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

/**
 * Fetches autocomplete suggestions from the backend.
 * @param {string} query - The search query.
 * @returns {Promise<Object|null>} A promise that resolves to the suggestions object or null on error.
 */
export async function fetchAutocomplete(query) {
  try {
    const res = await fetch(`/plugins/database_handler/autocomplete?q=${encodeURIComponent(query)}`);
    if (!res.ok) {
      console.error('Autocomplete fetch failed:', res.statusText);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('Network error during autocomplete fetch:', err);
    return null;
  }
}

/**
 * Posts a bulk operation payload to the backend.
 * @param {Object} payload - The bulk operation details.
 * @returns {Promise<Object|null>} A promise that resolves to the server response or null on error.
 */
export async function postBulkOperation(payload) {
  try {
    const res = await fetch('/plugins/database_handler/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    // The backend returns JSON for both success and error cases, so we always parse it.
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    console.error('Bulk operation failed:', err);
    // Return an object with an error property so the caller can display it.
    return { error: err.message || 'An unknown network error occurred.' };
  }
}

/**
 * Posts a bulk edit operation for games.
 * @param {Object} payload - The bulk operation details, including ids and fields to change.
 * @returns {Promise<Object|null>} A promise that resolves to the server response or null on error.
 */
export async function postBulkEditGames(payload) {
  try {
    const res = await fetch('/plugins/database_handler/bulk_edit_games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    console.error('Bulk edit games failed:', err);
    return { error: err.message || 'An unknown network error occurred.' };
  }
}