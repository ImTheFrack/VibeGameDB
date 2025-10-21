'use strict';
import { state } from './state.js';
import { renderGames } from './render.js';

/**
 * Filter subsystem.
 *
 * - extractAllTags: builds a unique, sorted tag list from all games
 * - applyFilters: applies keyword/platform/tag filters to games and renders
 * - updateActiveFiltersDisplay: shows an aggregate count of active filters
 */

export function extractAllTags() {
  const tagSet = new Set();
  state.allGames.forEach(game => {
    if (game.tags && Array.isArray(game.tags)) {
      game.tags.forEach(tag => tagSet.add(tag));
    }
  });
  state.allTags = Array.from(tagSet).sort();
}

export function applyFilters() {
  if (state.currentTab !== 'games') return;

  const { currentFilters } = state;
  let filtered = state.allGames;

  // Keyword
  if (currentFilters.keyword) {
    const raw = currentFilters.keyword.trim().toLowerCase();
    if (raw.length > 0) {
      const phraseMatch = raw.match(/^"(.*)"$/);
      if (phraseMatch) {
        const phrase = phraseMatch[1];
        filtered = filtered.filter(game =>
          (game.name && game.name.toLowerCase().includes(phrase)) ||
          (game.description && game.description.toLowerCase().includes(phrase))
        );
      } else {
        const words = raw.split(/\s+/).filter(Boolean);
        filtered = filtered.filter(game => {
          const hay = ((game.name || '') + ' ' + (game.description || '') + ' ' + ((game.tags || []).join(' '))).toLowerCase();
          return words.every(w => hay.includes(w));
        });
      }
    }
  }

  // Platforms
  if (currentFilters.platforms.length > 0) {
    const useAnd = typeof currentFilters.platformAnd !== 'undefined' ? currentFilters.platformAnd : state.platformFilterAnd;
    if (useAnd) {
      filtered = filtered.filter(game => {
        return currentFilters.platforms.every(platformId => {
          return state.allGamePlatforms.some(gp =>
            String(gp.game_id) === String(game.id) && String(gp.platform_id) === String(platformId)
          );
        });
      });
    } else {
      filtered = filtered.filter(game => {
        return currentFilters.platforms.some(platformId => {
          return state.allGamePlatforms.some(gp =>
            String(gp.game_id) === String(game.id) && String(gp.platform_id) === String(platformId)
          );
        });
      });
    }
  }

  // Tags (AND semantics)
  if (currentFilters.tags.length > 0) {
    filtered = filtered.filter(game => {
      const gameTags = game.tags || [];
      return currentFilters.tags.every(tag => gameTags.includes(tag));
    });
  }

  renderGames(filtered);
  updateTabCounts(filtered.length);
}

/**
 * Updates the count display in the 'Games' and 'Platforms' tabs.
 * @param {number} [gamesCount] - The number of games to display. If not provided, it won't be updated.
 */
export function updateTabCounts(gamesCount) {
  const gamesTabCount = document.querySelector('.tab[data-tab="games"] .tab-count');
  if (gamesTabCount && typeof gamesCount !== 'undefined') {
    gamesTabCount.textContent = `(${gamesCount})`;
  }
  const platformsTabCount = document.querySelector('.tab[data-tab="platforms"] .tab-count');
  if (platformsTabCount) platformsTabCount.textContent = `(${state.allPlatforms.length})`;
}

export function updateActiveFiltersDisplay() {
  const activeFiltersEl = document.getElementById('active-filters');
  const btn = document.getElementById('btn-filter');

  let count = 0;
  if (state.currentFilters.keyword) count += 1;
  if (Array.isArray(state.currentFilters.platforms)) count += state.currentFilters.platforms.length;
  if (Array.isArray(state.currentFilters.tags)) count += state.currentFilters.tags.length;

  if (btn) {
    if (count > 0) {
      btn.textContent = `🔍 Filter (${count})`;
      btn.classList.add('filters-on');
    } else {
      btn.textContent = '🔍 Filter';
      btn.classList.remove('filters-on');
    }
  }

  if (activeFiltersEl) activeFiltersEl.textContent = '';
}
