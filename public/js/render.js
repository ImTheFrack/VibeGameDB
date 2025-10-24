'use strict';
import { state } from './state.js';
import { wirePaginationEvents } from './events.js';
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
    const { selection, infiniteScroll } = state;

    // If not in infinite scroll mode, clear the grid first.
    if (!infiniteScroll.enabled || state.pagination.currentPage === 1) {
        grid.innerHTML = '';
    }

    if ((!games || games.length === 0) && grid.innerHTML === '') {
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

        // 1. Platforms list
        const platformsHtml = gamePlatformLinks
            .map(gp => {
                const platform = state.allPlatforms.find(p => p.id === gp.platform_id);
                const pid = platform?.id || gp.platform_id;
                const pname = escapeHtml(platform?.name || gp.platform_id);
                return `<span class="plat" data-platform-id="${pid}">${pname}</span>`;
            })
            .join('');

        // 2. Description truncation
        let descHtml = '';
        if (state.displayOptions.show_description && game.description) {
            if (game.description.length > 220) {
                descHtml = `<p class="card-desc">${escapeHtml(game.description.substring(0, 220))}<span class="edit-game truncated-link" data-id="${game.id}">[...]</span></p>`;
            } else {
                descHtml = `<p class="card-desc">${escapeHtml(game.description)}</p>`;
            }
        }

        // 3. Tags list
        let tagsAndGenresHtml = '';
        if (state.displayOptions.show_tags) {
            const gameTags = game.tags || [];
            const gameGenres = game.genre ? game.genre.split(',').map(g => g.trim()) : []; // Already trimmed
            const tagsHtml = gameTags.map(tag => `<span class="tag" data-type="tag" data-value="${escapeHtml(tag.toLowerCase())}">${escapeHtml(tag.toLowerCase())}</span>`).join(' ');
            const genresHtml = gameGenres.map(genre => `<span class="tag" data-type="genre" data-value="${escapeHtml(genre.toLowerCase())}">${escapeHtml(genre.toLowerCase())}</span>`).join(' ');

            // Combine and sort for consistent display order
            if (tagsHtml || genresHtml) {
                tagsAndGenresHtml = [tagsHtml, genresHtml].filter(Boolean).join(' ');
            }
        }
        
        // 4. Release year and rating
        const yearRatingHtml = `
            <div class="card-meta">
                <span class="release-year">${game.release_year || ''}</span>
                <span class="rating">${game.esrb_rating || ''}</span>
            </div>`;

        // 5. Developer/Publisher truncation
        const createTruncatedList = (items, prefix) => {
            if (!items || items.length === 0) return '';
            const displayItems = items.length > 2 ? items.slice(0, 2) : items;
            let html = displayItems.map(escapeHtml).join(', ');
            if (items.length > 2) {
                html += ` <span class="edit-game truncated-link" data-id="${game.id}">[...]</span>`;
            }
            return `<div class="card-people"><span class="people-prefix">${prefix}:</span> ${html}</div>`;
        };

        const devString = (game.developer || '').trim();
        const pubString = (game.publisher || '').trim();
        let devPubHtml;

        if (devString && devString === pubString) {
            const items = devString.split(',').map(d => d.trim());
            devPubHtml = createTruncatedList(items, 'D+P');
        } else {
            const developers = devString ? devString.split(',').map(d => d.trim()) : [];
            const publishers = pubString ? pubString.split(',').map(p => p.trim()) : [];
            devPubHtml = `${createTruncatedList(developers, 'D')}${createTruncatedList(publishers, 'P')}`;
        }


        // 6. Trailer icon
        const trailerIconHtml = game.trailer_url ? `
            <a href="${game.trailer_url}" target="_blank" class="card-icon trailer-icon" title="Watch trailer">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </a>` : '';

        // 7. Platform type icons
        const hasPhysical = gamePlatformLinks.some(gp => {
            const platform = state.allPlatforms.find(p => p.id === gp.platform_id);
            return platform?.supports_physical;
        });
        const hasDigital = gamePlatformLinks.some(gp => {
            const platform = state.allPlatforms.find(p => p.id === gp.platform_id);
            return platform?.supports_digital;
        });
        const platformTypeIconsHtml = `
            <div class="card-icon platform-type-icons">
                ${hasPhysical ? `<svg class="disc-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" title="Physical release"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-12h2v4h-2zm0 6h2v2h-2z"/></svg>` : ''}
                ${hasDigital ? `<svg class="download-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" title="Digital release"><path d="M13 5v6h1.17L12 13.17 9.83 11H11V5h2m2-2H9v6H5l7 7 7-7h-4V3zm4 15H5v2h14v-2z"/></svg>` : ''}
            </div>`;

        const coverHtml = state.displayOptions.show_cover ? `
            <div class="card-cover-container">
                <img class="card-cover" src="${game.cover_image_url || '/img/cover_placeholder.svg'}" alt="${game.name} cover" onerror="this.src='/img/cover_placeholder.svg'">
                ${platformTypeIconsHtml}
                ${trailerIconHtml}
            </div>` : '';
        const titleHtml = `<h3 class="card-title">${escapeHtml(game.name)}</h3>`;
        const platformsBlockHtml = state.displayOptions.show_platforms ? `<div class="platform-icons">${platformsHtml || '<span class="muted" style="font-size:12px;">No platforms</span>'}</div>` : '';
        const tagsBlockHtml = (state.displayOptions.show_tags && tagsAndGenresHtml) ? `<div class="tags-scroll-container"><div class="tags">${tagsAndGenresHtml}</div></div>` : '';

        const metaBlockHtml = `
            <div class="card-meta-block">
                ${yearRatingHtml}
                ${devPubHtml}
            </div>`;
        
        const actionsHtml = `
          <div class="card-actions-inline">
            <button class="btn btn-sm edit-game" data-id="${game.id}">Edit</button>
            <button class="btn btn-sm add-to-platform" data-id="${game.id}">+ Platform</button>
          </div>
        `;

        card.innerHTML = `
          ${selection.enabled ? `<input type="checkbox" class="card-checkbox" data-id="${game.id}" ${selection.selectedGameIds.has(String(game.id)) ? 'checked' : ''}>` : ''}
          ${coverHtml}
          <div class="card-body">
            ${titleHtml}
            ${platformsBlockHtml}
            ${metaBlockHtml}
            ${actionsHtml}
            ${descHtml}
            ${tagsBlockHtml}
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
  const btnSelectPage = document.getElementById('bulk-select-page');

  const selectedCount = state.currentTab === 'games'
    ? state.selection.selectedGameIds.size
    : state.selection.selectedPlatformIds.size;

  btnSelect.classList.toggle('selection-on', state.selection.enabled);

  if (state.selection.enabled) {
    bar.style.display = 'flex';
    countEl.textContent = `${selectedCount} item${selectedCount !== 1 ? 's' : ''} selected`;

    // Hide "Select Page" button if infinite scroll is on, as "pages" don't exist.
    if (btnSelectPage) {
      btnSelectPage.style.display = state.infiniteScroll.enabled ? 'none' : 'inline-block';
    }

    // Disable the edit button if no items are selected or if on the platforms tab.
    const canBulkEdit = state.currentTab === 'games' && selectedCount > 0;
    btnBulkEdit.disabled = !canBulkEdit;

    if (state.currentTab === 'platforms') {
      btnBulkEdit.title = 'Bulk editing for platforms is coming soon.';
    } else if (selectedCount === 0) {
      btnBulkEdit.title = 'Select items to edit.';
    } else {
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
  const { infiniteScroll } = state;
  const topContainer = document.getElementById('pagination-top');
  const bottomContainer = document.getElementById('pagination-bottom');
  const perPageControls = document.getElementById('per-page-controls'); // Get per-page controls here

  if (!topContainer || !bottomContainer || !perPageControls) return; // Ensure all elements exist
  
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

    const window = 2; // Number of pages to show on each side of the current page
    let start = Math.max(2, currentPage - window);
    let end = Math.min(totalPages - 1, currentPage + window);

    // First and Previous buttons
    fragment.appendChild(createPageLink(1, '« First (1)', currentPage === 1));
    fragment.appendChild(createPageLink(currentPage - 1, '‹ Prev', currentPage === 1));

    // Always show page 1
    fragment.appendChild(createPageLink(1, 1, false, currentPage === 1));

    // Ellipsis after page 1 if needed
    if (start > 2) {
      fragment.appendChild(createEllipsis());
    }

    // Page numbers in the sliding window
    for (let i = start; i <= end; i++) {
      fragment.appendChild(createPageLink(i, i, false, i === currentPage));
    }

    // Ellipsis before the last page if needed
    if (end < totalPages - 1) {
      fragment.appendChild(createEllipsis());
    }

    // Always show the last page, if it's not page 1
    if (totalPages > 1) {
      fragment.appendChild(createPageLink(totalPages, totalPages, false, currentPage === totalPages));
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

  // Hide pagination controls and per-page selector if infinite scroll is enabled or only one page exists
  const shouldHide = infiniteScroll.enabled || totalPages <= 1;
  topContainer.classList.toggle('hidden', shouldHide);
  bottomContainer.classList.toggle('hidden', shouldHide);
  perPageControls.classList.toggle('hidden', shouldHide); // Apply to per-page controls too

  // Always re-wire events after re-rendering the DOM for pagination
  wirePaginationEvents();
}

export function renderAutocomplete(suggestions, container = null, footerText = null) {
  const resultsContainer = container || document.getElementById('autocomplete-results');
  if (!suggestions || suggestions.length === 0) {
    clearAutocomplete(resultsContainer);
    return;
  }

  // Find the very first exact match to prioritize it.
  const firstExactMatchIndex = suggestions.findIndex(s => s.match_type?.startsWith('fts_exact'));
  let sortedSuggestions = [...suggestions];

  if (firstExactMatchIndex > 0) {
    // If the first exact match is not already at the top, move it there.
    const [firstExact] = sortedSuggestions.splice(firstExactMatchIndex, 1);
    sortedSuggestions.unshift(firstExact);
  }

  // Now, group the (potentially re-sorted) suggestions.
  const exactMatches = sortedSuggestions.filter(s => s.match_type?.startsWith('fts_exact'));
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
