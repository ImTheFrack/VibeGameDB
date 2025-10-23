// Centralized application state
/**
 * Centralized application state for the SPA.
 *
 * This module provides a single exported object `state` that stores
 * all frontend data and UI state in one place. Other modules import
 * and mutate this object as needed (e.g., after API calls).
 *
 * Note on thread-safety: the app runs in a single browser thread.
 * Keep mutations predictable and triggered by known actions (form
 * submissions, tab switches, fetch completions).
 */
export const state = {
  /** All games returned by the backend (array of {id, name, ...}) */
  allGames: [],
  /** All platforms returned by the backend (array of {id, name, ...}) */
  allPlatforms: [],
  /** All junction entries game_platforms (array of {id, game_id, platform_id, is_digital, ...}) */
  allGamePlatforms: [],
  /** All unique tags extracted from games (array of strings) */
  allTags: [],
  /** The currently filtered and sorted list of games, before pagination */
  filteredGames: [],
  /** Currently active tab id: 'games' | 'platforms' */
  currentTab: 'games',
  /** Game id used when adding a game to a platform via modal */
  currentGameId: null,
  /** Default platform filter semantics (AND when true, OR when false). May be overridden per-session via modal. */
  platformFilterAnd: null, // server-configured default; can be overridden per-session
  displayOptions: {
    /** Toggle cover image on cards */
    show_cover: true,
    /** Title is always shown; kept for completeness */
    show_title: true,
    /** Toggle description paragraph */
    show_description: true,
    /** Toggle tags pill row */
    show_tags: true,
    /** Toggle platform pills row */
    show_platforms: true
  },
  currentFilters: {
    /** Free-text keyword filter. Supports exact phrase when quoted. */
    keyword: '',
    /** Array of selected platform ids (strings) */
    platforms: [],
    /** Array of selected tag strings */
    tags: [],
    /** Array of selected game types: 'original', 'derived', 'sequel' */
    gameTypes: [],
    /** Array of selected acquisition methods */
    acquisitionMethods: [],
  },
  pagination: {
    currentPage: 1,
    pageSize: 24, // Number of items to load per page/scroll
    totalPages: 1,
  }
};

export function clearAllFilters() {
  state.currentFilters.keyword = '';
  state.currentFilters.platforms = [];
  state.currentFilters.tags = [];
  state.currentFilters.gameTypes = [];
  state.currentFilters.acquisitionMethods = [];
  document.getElementById('search-input').value = '';
}