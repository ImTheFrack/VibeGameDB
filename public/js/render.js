'use strict';
import { state } from './state.js';
import { escapeHtml } from './utils.js';

/**
 * Rendering functions responsible for translating state into DOM.
 *
 * No network or business logic here; these functions read `state` and
 * the provided arrays, and update the `#display-grid` accordingly.
 */

// Render an array of games into the display grid
export function renderGames(games, clear = true) { // The clear parameter was from a previous iteration, let's fix it.
  const grid = document.getElementById('display-grid');
  if (!grid) return;

  if (!Array.isArray(games) || games.length === 0) {
    grid.innerHTML = '<p class="muted">No games found.</p>';
    return;
  }

  if (clear) grid.innerHTML = '';

  const fragment = document.createDocumentFragment();
  games.forEach(game => {
    const card = document.createElement('article');
    card.className = 'card game-card';

    const gamePlatformLinks = state.allGamePlatforms.filter(gp => gp.game_id === game.id);
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

    const coverHtml = state.displayOptions.show_cover ? `<img class="card-cover" src="${game.cover_image_url || '/img/cover_placeholder.svg'}" alt="cover" onerror="this.src='/img/cover_placeholder.svg'">` : '';
    const titleHtml = state.displayOptions.show_title ? `<h3 class="card-title">${escapeHtml(game.name)}</h3>` : '';
    const descHtml = state.displayOptions.show_description ? `<p class="card-desc">${escapeHtml(game.description || '')}</p>` : '';
    const tagsBlockHtml = (state.displayOptions.show_tags && tagsHtml) ? `<div class="tags">${tagsHtml}</div>` : '';
    const platformsBlockHtml = state.displayOptions.show_platforms ? `<div class="platform-icons">${platformsHtml || '<span class="muted">No platforms</span>'}</div>` : '';

    card.innerHTML = `
      ${coverHtml}
      <div class="card-body">
        ${titleHtml}
        ${descHtml}
        ${tagsBlockHtml}
        ${platformsBlockHtml}
        <div class="card-actions">
          <button class="btn btn-sm edit-game" data-id="${game.id}">Edit</button>
          <button class="btn btn-sm add-to-platform" data-id="${game.id}">Add Platform</button>
        </div>
      </div>
    `;

    fragment.appendChild(card);
  });
  grid.append(fragment);
}

export function renderPlatforms(platforms) {
  const grid = document.getElementById('display-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!Array.isArray(platforms) || platforms.length === 0) {
    grid.innerHTML = '<p class="muted">No platforms found.</p>';
    return;
  }

  platforms.forEach(p => {
    const card = document.createElement('article');
    card.className = 'card platform-card';

    const formats = [];
    if (p.supports_digital) formats.push('Digital');
    if (p.supports_physical) formats.push('Physical');
    const formatStr = formats.join(' • ');

    const gameCount = state.allGamePlatforms.filter(gp => gp.platform_id === p.id).length;

    card.innerHTML = `
      <img class="card-cover" src="${p.icon_url || '/img/icon_placeholder.svg'}" alt="icon" onerror="this.src='/img/icon_placeholder.svg'">
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(p.name)}</h3>
        <p class="card-desc">${escapeHtml(formatStr)} • <a href="#" class="filter-by-platform" data-platform-id="${p.id}">${gameCount} games</a></p>
        <div class="card-actions"><button class="btn btn-sm edit-platform" data-id="${p.id}">Edit</button></div>
      </div>
    `;
    grid.appendChild(card);
  });
}

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
