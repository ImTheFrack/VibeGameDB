'use strict';
import { state } from './state.js';
import { apiGet } from './api.js';
import { renderPlatforms } from './render.js';
import { applyFilters, extractAllTags, updateActiveFiltersDisplay } from './filters.js';
import { openModal, closeModal, populateFilterModal, populateAddToPlatformForm } from './modals.js';
import { initImportModal } from './modals.js';

/**
 * Event wiring and data loaders.
 *
 * This module centralizes:
 * - Attaching DOM event handlers for buttons, forms, tabs, and dynamic grid
 * - Small data loader helpers used by tab switches and initial load
 *
 * Keeping this isolated ensures rendering and filtering modules remain pure
 * and testable (no direct DOM event concerns there).
 */

export function wireDomEvents() {
  const displayGrid = document.getElementById('display-grid');
  const btnAddGame = document.getElementById('btn-add-game');
  const btnAddPlatform = document.getElementById('btn-add-platform');
  const btnImportCSV = document.getElementById('btn-import-csv');
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const modalGame = document.getElementById('modal-game');
  const modalPlatform = document.getElementById('modal-platform');
  const modalImport = document.getElementById('modal-import');
  const modalAddToPlatform = document.getElementById('modal-add-to-platform');
  const modalFilter = document.getElementById('modal-filter');
  const formGame = document.getElementById('form-game');
  const formPlatform = document.getElementById('form-platform');
  const formAddToPlatform = document.getElementById('form-add-to-platform');
  const formFilter = document.getElementById('form-filter');
  const btnFilter = document.getElementById('btn-filter');
  const gamesControls = document.getElementById('games-controls');
  const headerSearch = document.getElementById('search-input');

  const platformFiltersContainer = document.querySelector('.platform-filters')
    || document.getElementById('filter-platforms')
    || document.createElement('div');

  // Close buttons
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      if (modal) closeModal(modal);
    });
  });

  // Close when clicking outside
  const modalList = [modalGame, modalPlatform, modalImport, modalAddToPlatform, modalFilter];
  const modalDisplay = document.getElementById('modal-display');
  if (modalDisplay) modalList.push(modalDisplay);
  modalList.forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });

  // Add Game
  btnAddGame.addEventListener('click', () => {
    formGame.reset();
    document.getElementById('modal-game-title').textContent = 'Add Game';
    formGame.dataset.gameId = '';
    document.getElementById('link-game-section').style.display = 'none';
    openModal(modalGame);
  });

  // Game type radios
  const gameTypeRadios = document.querySelectorAll('input[name="game_type"]');
  gameTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const linkSection = document.getElementById('link-game-section');
      linkSection.style.display = e.target.value !== 'original' ? 'block' : 'none';
    });
  });

  // Link game button (stub)
  const btnLinkGame = document.getElementById('btn-link-game');
  if (btnLinkGame) {
    btnLinkGame.addEventListener('click', (e) => {
      e.preventDefault();
      alert('Link game feature coming soon! For now, you can manually enter the game ID.');
    });
  }

  // Add Platform
  btnAddPlatform.addEventListener('click', () => {
    formPlatform.reset();
    document.getElementById('modal-platform-title').textContent = 'Add Platform';
    formPlatform.dataset.platformId = '';
    openModal(modalPlatform);
  });

  // Import CSV
  btnImportCSV.addEventListener('click', () => openModal(modalImport));
  // initialize import modal helpers
  try { initImportModal(); } catch (e) { console.warn('Import modal init failed', e); }

  // Refresh data when import completes
  window.addEventListener('vgd:import_complete', async () => {
    await populatePlatformFilters();
    if (state.currentTab === 'games') fetchGames(); else fetchPlatforms();
  });

  // Submit: Game
  formGame.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(formGame);

    const tagsStr = formData.get('tags') || '';
    const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);

    const gameType = formData.get('game_type');
    const gameData = {
      name: formData.get('name'),
      description: formData.get('description'),
      cover_image_url: formData.get('cover_image_url'),
      trailer_url: formData.get('trailer_url'),
      is_remake: gameType === 'remake',
      is_remaster: gameType === 'remaster',
      related_game_id: gameType !== 'original' ? (formData.get('related_game_id') || null) : null,
      tags: tags
    };

    const gameId = formGame.dataset.gameId;
    const endpoint = gameId ? `/plugins/database_handler/games/${gameId}` : '/plugins/database_handler/games';
    const method = gameId ? 'PUT' : 'POST';

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gameData)
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Error: ${err.error || 'Failed to save game'}`);
        return;
      }
      const result = await res.json();
      if (!gameId) {
        state.currentGameId = result.game.id;
        closeModal(modalGame);
        await populateAddToPlatformForm();
        openModal(modalAddToPlatform);
      } else {
        closeModal(modalGame);
        await populatePlatformFilters();
        if (state.currentTab === 'games') fetchGames();
      }
    } catch (err) {
      console.error('Form submission error:', err);
      alert('Network error: ' + err.message);
    }
  });

  // Submit: Platform
  formPlatform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(formPlatform);

    const platformData = {
      name: formData.get('name'),
      supports_digital: formData.get('supports_digital') === 'on',
      supports_physical: formData.get('supports_physical') === 'on',
      description: formData.get('description'),
      icon_url: formData.get('icon_url'),
      image_url: formData.get('image_url'),
      year_acquired: formData.get('year_acquired') ? parseInt(formData.get('year_acquired')) : null
    };

    if (!platformData.supports_digital && !platformData.supports_physical) {
      alert('Platform must support at least one format (Digital or Physical)');
      return;
    }

    const platformId = formPlatform.dataset.platformId;
    const endpoint = platformId ? `/plugins/database_handler/platforms/${platformId}` : '/plugins/database_handler/platforms';
    const method = platformId ? 'PUT' : 'POST';

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(platformData)
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Error: ${err.error || 'Failed to save platform'}`);
        return;
      }
      closeModal(modalPlatform);
      await populatePlatformFilters();
      if (state.currentTab === 'platforms') fetchPlatforms();
    } catch (err) {
      console.error('Form submission error:', err);
      alert('Network error: ' + err.message);
    }
  });

  // Submit: Add to Platform
  formAddToPlatform.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(formAddToPlatform);

    const platformId = formData.get('platform_id');
    const acquisitionMethod = formData.get('acquisition_method') || null;

    const allFormatCheckboxes = document.querySelectorAll('#format-checkbox-group input[type="checkbox"]');
    const selectedFormats = [];
    allFormatCheckboxes.forEach(cb => {
      if (cb.checked) selectedFormats.push(cb.value === 'true');
    });
    if (selectedFormats.length === 0) {
      alert('Please select at least one format (Digital or Physical)');
      return;
    }
    const uniqueFormats = [...new Set(selectedFormats)];

    const requests = uniqueFormats.map(isDigital => {
      const gamePlatformData = {
        game_id: state.currentGameId,
        platform_id: platformId,
        is_digital: isDigital,
        acquisition_method: acquisitionMethod
      };
      return fetch('/plugins/database_handler/game_platforms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gamePlatformData)
      });
    });

    try {
      const responses = await Promise.all(requests);
      const errors = [];
      for (const res of responses) {
        if (!res.ok) {
          const err = await res.json();
          if (!err.error.includes('already exists')) errors.push(err.error || 'Failed to add game to platform');
        }
      }
      if (errors.length > 0) {
        alert(`Error: ${errors[0]}`);
        return;
      }
      closeModal(modalAddToPlatform);
      await populatePlatformFilters();
      if (state.currentTab === 'games') fetchGames();
    } catch (err) {
      console.error('Form submission error:', err);
      alert('Network error: ' + err.message);
    }
  });

  // Tabs
  tabs.forEach(tab => {
    tab.addEventListener('click', async (e) => {
      const target = e.currentTarget.getAttribute('data-tab');
      state.currentTab = target;
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      if (gamesControls) gamesControls.style.display = target === 'games' ? 'flex' : 'none';
      if (target === 'games') await fetchGames(); else await fetchPlatforms();
    });
  });

  // Filter button
  if (btnFilter) {
    btnFilter.addEventListener('click', async () => {
      await populateFilterModal();
      openModal(modalFilter);
      const kw = document.getElementById('filter-keyword');
      if (kw) {
        kw.focus();
        try { kw.selectionStart = kw.selectionEnd = kw.value.length; } catch (e) {}
      }
    });
  }

  // Display modal
  const btnDisplay = document.getElementById('btn-display');
  const modalDisplayEl = document.getElementById('modal-display');
  const formDisplay = document.getElementById('form-display');
  function updateDisplayButton() {
    if (!btnDisplay) return;
    const keys = ['show_cover', 'show_description', 'show_tags', 'show_platforms'];
    const hiddenCount = keys.reduce((acc, k) => acc + (state.displayOptions[k] ? 0 : 1), 0);
    if (hiddenCount > 0) {
      btnDisplay.textContent = `🖼 Display (${hiddenCount})`;
      btnDisplay.classList.add('filters-on');
    } else {
      btnDisplay.textContent = '🖼 Display';
      btnDisplay.classList.remove('filters-on');
    }
  }
  if (btnDisplay && modalDisplayEl && formDisplay) {
    btnDisplay.addEventListener('click', () => {
      formDisplay.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        const name = cb.name;
        cb.checked = !!state.displayOptions[name];
      });
      openModal(modalDisplayEl);
    });

    formDisplay.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(formDisplay);
      state.displayOptions.show_cover = !!formData.get('show_cover');
      state.displayOptions.show_title = true;
      state.displayOptions.show_description = !!formData.get('show_description');
      state.displayOptions.show_tags = !!formData.get('show_tags');
      state.displayOptions.show_platforms = !!formData.get('show_platforms');
      closeModal(modalDisplayEl);
      applyFilters();
      updateDisplayButton();
    });
  }
  updateDisplayButton();

  // Header search
  if (headerSearch) {
    let headerTimer = null;
    headerSearch.addEventListener('input', (e) => {
      clearTimeout(headerTimer);
      headerTimer = setTimeout(() => {
        state.currentFilters.keyword = (e.target.value || '').trim().toLowerCase();
        state.currentFilters.platforms = [];
        state.currentFilters.tags = [];
        applyFilters();
        updateActiveFiltersDisplay();
      }, 250);
    });
  }

  // Help tooltip flip
  document.querySelectorAll('.help-icon').forEach(h => {
    const tip = h.querySelector('.help-tooltip');
    if (!tip) return;
    const computeAndFlip = () => {
      const prevDisplay = tip.style.display;
      tip.style.display = 'block';
      const rect = tip.getBoundingClientRect();
      tip.style.display = prevDisplay || '';
      if (rect.right > (window.innerWidth - 8)) h.classList.add('tooltip-left');
      else h.classList.remove('tooltip-left');
    };
    h.addEventListener('mouseenter', computeAndFlip);
    h.addEventListener('focus', computeAndFlip);
    window.addEventListener('resize', computeAndFlip);
  });

  // Filter form
  if (formFilter) {
    formFilter.addEventListener('submit', (e) => {
      e.preventDefault();
      const keyword = document.getElementById('filter-keyword').value.toLowerCase();
      const platformCheckboxes = document.querySelectorAll('#filter-platforms input[type="checkbox"]:checked');
      const platforms = Array.from(platformCheckboxes).map(cb => cb.value);
      const tagCheckboxes = document.querySelectorAll('#filter-tags input[type="checkbox"]:checked');
      const tags = Array.from(tagCheckboxes).map(cb => cb.value);
      const selMode = document.querySelector('input[name="platform_mode"]:checked');
      const platformAnd = selMode ? (selMode.value === 'and') : undefined;
      state.currentFilters = { keyword, platforms, tags, platformAnd };
      applyFilters();
      closeModal(modalFilter);
      updateActiveFiltersDisplay();
    });
  }

  // Clear filters
  const btnClearFilters = document.getElementById('btn-clear-filters');
  if (btnClearFilters) {
    btnClearFilters.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('filter-keyword').value = '';
      document.querySelectorAll('#filter-platforms input[type="checkbox"]').forEach(cb => cb.checked = false);
      document.querySelectorAll('#filter-tags input[type="checkbox"]').forEach(cb => cb.checked = false);
      state.currentFilters = { keyword: '', platforms: [], tags: [] };
      applyFilters();
      updateActiveFiltersDisplay();
    });
  }

  // Grid click delegations
  displayGrid.addEventListener('click', async (e) => {
    const editGame = e.target.closest('.edit-game');
    const editPlatform = e.target.closest('.edit-platform');
    const addToPlat = e.target.closest('.add-to-platform');
    const platSpan = e.target.closest('.plat');
    const tagSpan = e.target.closest('.tag');

    if (editGame) {
      const gameId = editGame.getAttribute('data-id');
      console.log('Edit game clicked:', gameId);
    }
    if (editPlatform) {
      const platformId = editPlatform.getAttribute('data-id');
      console.log('Edit platform clicked:', platformId);
    }
    if (addToPlat) {
      const gameId = addToPlat.getAttribute('data-id');
      state.currentGameId = gameId;
      await populateAddToPlatformForm();
      openModal(modalAddToPlatform);
    }
    if (platSpan) {
      const pid = platSpan.getAttribute('data-platform-id');
      if (!pid) return;
      const idx = state.currentFilters.platforms.indexOf(pid);
      if (idx === -1) state.currentFilters.platforms.push(pid); else state.currentFilters.platforms.splice(idx, 1);
      document.querySelectorAll('#filter-platforms input[type="checkbox"]').forEach(cb => cb.checked = state.currentFilters.platforms.includes(cb.value));
      applyFilters();
      updateActiveFiltersDisplay();
      return;
    }
    if (tagSpan) {
      const t = tagSpan.getAttribute('data-tag');
      if (!t) return;
      const idx = state.currentFilters.tags.indexOf(t);
      if (idx === -1) state.currentFilters.tags.push(t); else state.currentFilters.tags.splice(idx, 1);
      document.querySelectorAll('#filter-tags input[type="checkbox"]').forEach(cb => cb.checked = state.currentFilters.tags.includes(cb.value));
      applyFilters();
      updateActiveFiltersDisplay();
      return;
    }
  });

  // Platform header helper button (legacy support)
  const allFilterBtn = platformFiltersContainer.querySelector('[data-platform="all"]');
  if (allFilterBtn) {
    allFilterBtn.addEventListener('click', (e) => {
      e.preventDefault();
      // legacy stub kept for compatibility
      state.currentFilters.platforms = [];
      applyFilters();
      updateActiveFiltersDisplay();
    });
  }
}

// Data loaders used by tab switch and initial load
export async function fetchGames() {
  const data = await apiGet('/plugins/database_handler/games');
  if (data) {
    state.allGames = data.games || [];
    await fetchGamePlatforms();
    extractAllTags();
    applyFilters();
    updateActiveFiltersDisplay();
  }
}

export async function fetchGamePlatforms() {
  const data = await apiGet('/plugins/database_handler/game_platforms');
  if (data) state.allGamePlatforms = data.game_platforms || [];
}

export async function fetchPlatforms() {
  const data = await apiGet('/plugins/database_handler/platforms');
  if (data) {
    state.allPlatforms = data.platforms || [];
    renderPlatforms(state.allPlatforms);
  }
}

export async function populatePlatformFilters() {
  const data = await apiGet('/plugins/database_handler/platforms');
  if (data) state.allPlatforms = data.platforms || [];
}
