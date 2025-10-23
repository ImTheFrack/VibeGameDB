'use strict';
import { state } from './state.js';
import { escapeHtml, normalizeName } from './utils.js';

/**
 * Rendering functions responsible for translating state into DOM.
 *
 * No network or business logic here; these functions read `state` and
 * the provided arrays, and update the `#display-grid` accordingly.
 * - renderGames: builds and injects game cards
 * - renderPlatforms: builds and injects platform cards
 * - renderBulkActionsBar: shows/hides the bulk action bar and updates its count
 * - renderPagination: builds and injects pagination controls
 */

/**
 * Renders a grid of game cards.
 * @param {Array<object>} games - The array of game objects to render.
 */
export function renderGames(games) {
  const grid = document.getElementById('display-grid');
  grid.innerHTML = '';
  const { selection } = state;

  if (!games || games.length === 0) {
    grid.innerHTML = '<p class="muted">No games found. Try adjusting your filters or adding a new game.</p>';
    return;
  }

  games.forEach(game => {
    const gamePlatformLinks = state.allGamePlatforms.filter(gp => String(gp.game_id) === String(game.id));
    const card = document.createElement('div');
    card.className = 'card';
    if (selection.selectedGameIds.has(String(game.id))) {
      card.classList.add('selected-card');
    }
    card.dataset.gameId = game.id;
    const platformsHtml = gamePlatformLinks
      .map(gp => {
        const platform = state.allPlatforms.find(p => p.id === gp.platform_id);
        const format = gp.is_digital ? '📱' : '💿';
        const pid = platform?.id || gp.platform_id;
        const pname = escapeHtml(platform?.name || gp.platform_id);
        return `<span class="plat" data-platform-id="${pid}">${format} ${pname}</span>`;
      })
      .join('');

    const tagsHtml = (game.tags || [])
      .map(tag => `<span class="tag" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`)
      .join(' ');

    const coverHtml = state.displayOptions.show_cover ? `<img class="card-cover" src="${game.cover_image_url || '/img/cover_placeholder.svg'}" alt="${game.name} cover" onerror="this.src='/img/cover_placeholder.svg'">` : '';
    const titleHtml = `<h3 class="card-title">${escapeHtml(game.name)}</h3>`;
    const descHtml = (state.displayOptions.show_description && game.description) ? `<p class="card-desc">${escapeHtml(game.description)}</p>` : '';
    const tagsBlockHtml = (state.displayOptions.show_tags && tagsHtml) ? `<div class="tags">${tagsHtml}</div>` : '';
    const platformsBlockHtml = state.displayOptions.show_platforms ? `<div class="platform-icons">${platformsHtml || '<span class="muted" style="font-size:12px;">No platforms</span>'}</div>` : '';

    card.innerHTML = `
      ${selection.enabled
        ? `<input type="checkbox"
                  class="card-checkbox"
                  data-id="${game.id}"
                  ${selection.selectedGameIds.has(String(game.id)) ? 'checked' : ''}>` : ''}
      ${coverHtml}
      <div class="card-body">
        ${titleHtml}
        ${descHtml}
        ${tagsBlockHtml}
        ${platformsBlockHtml}
      </div>
      <div class="card-actions">
        <button class="btn btn-sm edit-game" data-id="${game.id}">Edit</button>
        <button class="btn btn-sm add-to-platform" data-id="${game.id}">+ Platform</button>
      </div>
    `;

    grid.appendChild(card);
  });
}

export function renderPlatforms(platforms) {
  const grid = document.getElementById('display-grid');
  grid.innerHTML = '';
  const { selection } = state;

  if (!platforms || platforms.length === 0) {
    grid.innerHTML = '<p class="muted">No platforms found. Try adding one.</p>';
    return;
  }
  platforms.forEach(platform => {
    const card = document.createElement('div');
    card.className = 'card';
    if (selection.selectedPlatformIds.has(platform.id)) {
      card.classList.add('selected-card');
    }
    card.dataset.platformId = platform.id;
    const gameCount = state.allGamePlatforms.filter(gp => gp.platform_id === platform.id).length;

    const formats = [];
    if (platform.supports_digital) formats.push('Digital');
    if (platform.supports_physical) formats.push('Physical');
    const format = formats.join(' & ');

    card.innerHTML = `
      ${selection.enabled
        ? `<input type="checkbox"
                  class="card-checkbox"
                  data-id="${platform.id}"
                  ${selection.selectedPlatformIds.has(platform.id) ? 'checked' : ''}>` : ''}
      <img src="${platform.image_url || platform.icon_url || '/img/icon_placeholder.svg'}" alt="${platform.name}" class="card-cover" onerror="this.src='/img/icon_placeholder.svg'">
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(platform.name)}</h3>
        <p class="card-desc">${escapeHtml(format)} • <a href="#" class="filter-by-platform" data-platform-id="${platform.id}">${gameCount} games</a></p>
      </div>
      <div class="card-actions">
        <button class="btn btn-sm edit-platform" data-id="${platform.id}">Edit</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

export function renderBulkActionsBar() {
  const bar = document.getElementById('bulk-actions-bar');
  const countEl = document.getElementById('bulk-actions-count');
  const btnSelect = document.getElementById('btn-select-multiple');
  const btnBulkEdit = document.getElementById('bulk-action-edit');

  const selectedCount = state.currentTab === 'games'
    ? state.selection.selectedGameIds.size
    : state.selection.selectedPlatformIds.size;

  btnSelect.classList.toggle('selection-on', state.selection.enabled);

  if (state.selection.enabled) {
    bar.style.display = 'flex';
    countEl.textContent = `${selectedCount} item${selectedCount !== 1 ? 's' : ''} selected`;

    // Per user request, disable bulk editing for platforms for now.
    if (state.currentTab === 'platforms') {
      btnBulkEdit.disabled = true;
      btnBulkEdit.title = 'Coming soon.';
    } else {
      btnBulkEdit.disabled = false;
      btnBulkEdit.title = 'Edit selected items';
    }
  } else {
    bar.style.display = 'none';
  }
}

/**
 * Renders pagination controls.
 * @param {number} currentPage - The current active page.
 * @param {number} totalPages - The total number of pages.
 */
export function renderPagination() {
  const { currentPage, totalPages } = state.pagination;
  const topContainer = document.getElementById('pagination-top');
  const bottomContainer = document.getElementById('pagination-bottom');

  if (!topContainer || !bottomContainer) return;

  if (totalPages <= 1) {
    topContainer.innerHTML = '';
    bottomContainer.innerHTML = '';
    return;
  }

  const createPageLink = (page, text, isDisabled = false, isCurrent = false) => {
    // Use a span for disabled/current links to avoid href="#" issues, and 'a' for clickable ones.
    const el = document.createElement(isDisabled || isCurrent ? 'span' : 'a');
    if (el.tagName === 'A') el.href = '#';
    el.dataset.page = page;
    el.textContent = text;
    el.classList.add('page-link');
    if (isDisabled) el.classList.add('disabled');
    if (isCurrent) el.classList.add('current');
    return el;
  };

  const createEllipsis = () => {
    const span = document.createElement('span');
    span.textContent = '  ';
    span.classList.add('page-ellipsis');
    return span;
  };

  const buildPagination = () => {
    const fragment = document.createDocumentFragment();

    const windowSize = 2; // Number of page links to show on each side of the current page

    // First and Previous buttons
    fragment.appendChild(createPageLink(1, '« First (1)', currentPage === 1));
    fragment.appendChild(createPageLink(currentPage - 1, '‹ Prev', currentPage === 1));

    // Render a fixed number of page links, using placeholders for out-of-bounds pages
    for (let i = -windowSize; i <= windowSize; i++) {
      const page = currentPage + i;
      if (page >= 1 && page <= totalPages) {
        fragment.appendChild(createPageLink(page, page, false, page === currentPage));
      } else {
        fragment.appendChild(createEllipsis());
      }
    }

    // Next and Last buttons
    fragment.appendChild(createPageLink(currentPage + 1, 'Next ›', currentPage === totalPages));
    fragment.appendChild(createPageLink(totalPages, 'Last ('+totalPages.toString()+') »', currentPage === totalPages));
    return fragment;
  };

  topContainer.innerHTML = '';
  bottomContainer.innerHTML = '';
  topContainer.appendChild(buildPagination());
  bottomContainer.appendChild(buildPagination());
}

export function renderAutocomplete(suggestions, container = null, footerText = null) {
  const resultsContainer = container || document.getElementById('autocomplete-results');
  if (!suggestions || suggestions.length === 0) {
    clearAutocomplete(resultsContainer);
    return;
  }

  // Filter suggestions into groups. Use startsWith for flexibility.
  // 'fts_exact_prefix' will be treated as an exact match.
  // 'fts_word_fuzzy' and 'char_fuzzy' will be treated as fuzzy matches.
  const exactMatches = suggestions.filter(s => s.match_type?.startsWith('fts_exact'));
  const fuzzyMatches = suggestions.filter(s => s.match_type?.includes('fuzzy'));

  let html = '';

  const renderItems = (items) => {
    return items.map(item => {
    let context = item.context || '';
    if (context.length > 80) context = context.substring(0, 80) + '...';
    // Show a fuzzy indicator for any non-exact match type
    const isFuzzy = item.match_type && !item.match_type.startsWith('fts_exact');
    const fuzzyIndicator = isFuzzy ? '<span class="fuzzy-match-indicator" title="Fuzzy match">~</span>' : '';

    return `
      <div class="autocomplete-item" data-type="${item.type}" data-id="${item.id}" data-name="${item.name}" data-match-type="${item.match_type || 'exact'}">
        <div class="item-type-icon"></div>
        <div class="item-text">
          <div class="item-name">${item.name} ${fuzzyIndicator}</div>
          <div class="item-context">${context}</div>
        </div>
      </div>
    `;
    }).join('');
  };

  if (exactMatches.length > 0) {
    html += '<div class="autocomplete-group-header">Exact Matches</div>';
    html += renderItems(exactMatches);
  }

  if (fuzzyMatches.length > 0) {
    html += `<div class="autocomplete-group-header">Fuzzy Matches</div>`;
    html += renderItems(fuzzyMatches);
  }

  resultsContainer.innerHTML = html;

  const defaultFooter = `↑↓ to navigate, ↩ to select, ⇥ to complete`;
  resultsContainer.innerHTML += `<div class="autocomplete-footer">${footerText || defaultFooter}</div>`;
  resultsContainer.style.display = 'block';
}

function clearAutocomplete(container) {
  container.innerHTML = '';
  container.style.display = 'none';
}
