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
