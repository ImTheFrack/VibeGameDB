'use strict';
import { state, clearAllFilters } from './state.js';
import { fetchGames as fetchGamesFromApi, fetchPlatforms as fetchPlatformsFromApi, fetchAutocomplete, postBulkOperation, fetchFromIgdb, fetchGamePlatforms as fetchGamePlatformsFromApi } from './api.js';
import { renderGames, renderPlatforms, renderBulkActionsBar, renderAutocomplete } from './render.js';
import { applyFilters, extractAllTags, updateActiveFiltersDisplay, updateTabCounts } from './filters.js';
import { openModal, closeModal, populateFilterModal, populateAddToPlatformForm, showEditGameModal, showBulkEditGameModal, showEditPlatformModal, populateGamePlatformsList, clearAutocomplete, initAutocomplete, resetGameModalUI, showProgressModal, updateProgress, showBulkMatchModal } from './modals.js';
import { initImportModal } from './modals.js';
import { normalizeName } from './utils.js';

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

const handlePaginationClick = (e) => {
  // alert ("Clicked");
  e.preventDefault();
  const link = e.target.closest('.page-link');
  if (!link || link.classList.contains('disabled') || link.classList.contains('current')) return;
  const newPage = parseInt(link.dataset.page, 10);
  if (isNaN(newPage)) return;
  state.pagination.currentPage = newPage;
  applyFilters();
};

// Data loaders used by tab switch and initial load
async function fetchGames() {
  const data = await fetchGamesFromApi();
  if (data) {
    state.allGames = data.games || [];
    state.allGamePlatforms = data.game_platforms || [];
    extractAllTags();
    applyFilters();
    updateActiveFiltersDisplay();
    renderBulkActionsBar();
  }
}

async function fetchPlatforms() {
  const data = await fetchPlatformsFromApi();
  if (data) {
    let platforms = data.platforms || [];
    const sortSelect = document.getElementById('sort-select-platforms');
    if (sortSelect) {
      const sortMethod = sortSelect.value;
      const gameCounts = state.allGamePlatforms.reduce((acc, gp) => {
        acc[gp.platform_id] = (acc[gp.platform_id] || 0) + 1;
        return acc;
      }, {});

      platforms.sort((a, b) => {
        switch (sortMethod) {
          case 'name_desc': return normalizeName(b.name).localeCompare(normalizeName(a.name));
          case 'game_count_desc': return (gameCounts[b.id] || 0) - (gameCounts[a.id] || 0);
          case 'game_count_asc': return (gameCounts[a.id] || 0) - (gameCounts[b.id] || 0);
          case 'manufacturer_asc': return (a.manufacturer || 'zzz').localeCompare(b.manufacturer || 'zzz') || normalizeName(a.name).localeCompare(normalizeName(b.name));
          case 'year_acquired_desc': return (b.year_acquired || 0) - (a.year_acquired || 0);
          case 'year_acquired_asc': return (a.year_acquired || 9999) - (b.year_acquired || 9999);
          case 'generation_desc': return (b.generation || 0) - (a.generation || 0);
          case 'generation_asc': return (a.generation || 9999) - (b.generation || 9999);
          default: return normalizeName(a.name).localeCompare(normalizeName(b.name));
        }
      });
    }
    state.allPlatforms = platforms;
    renderPlatforms(platforms);
    updateTabCounts();
    renderBulkActionsBar();
  }
}

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
  const modalBulkEdit = document.getElementById('modal-bulk-edit');
  const modalFilter = document.getElementById('modal-filter');
  const modalOrphanHandler = document.getElementById('modal-orphan-handler');
  const formGame = document.getElementById('form-game');
  const formPlatform = document.getElementById('form-platform');
  const formAddToPlatform = document.getElementById('form-add-to-platform');
  const formFilter = document.getElementById('form-filter');
  const btnFilter = document.getElementById('btn-filter');
  // The user's HTML has a single sort-select, so we'll adapt to that.
  const sortSelectGames = document.getElementById('sort-select-games') || document.getElementById('sort-select');
  const sortSelectPlatforms = document.getElementById('sort-select-platforms') || document.getElementById('sort-select');
  const itemsPerPageSelect = document.getElementById('items-per-page-select');
  const btnSelectMultiple = document.getElementById('btn-select-multiple');
  const headerSearch = document.getElementById('search-input');
  const btnInfiniteScroll = document.getElementById('btn-infinite-scroll');
  const bulkActionBar = document.getElementById('bulk-actions-bar');

  const autocompleteResults = document.getElementById('autocomplete-results');
  const platformFiltersContainer = document.querySelector('.platform-filters')
    || document.getElementById('filter-platforms')
    || document.createElement('div');

  // Close buttons
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal');
      if (modal) closeModal(modal, e.target.closest('[data-opens-modal]') || document.querySelector(`[data-opens-modal="${modal.id}"]`));
    });
  });

  // Close when clicking outside
  // NOTE: modalGame and modalPlatform are intentionally excluded to prevent accidental data loss.
  const modalList = [modalImport, modalAddToPlatform, modalFilter, modalOrphanHandler, modalBulkEdit];
  const modalDisplay = document.getElementById('modal-display');
  if (modalDisplay) modalList.push(modalDisplay);
  modalList.forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal(modal, document.querySelector(`[data-opens-modal="${modal.id}"]`));
    });
  });

  // Bulk selection
  btnSelectMultiple.addEventListener('click', () => {
    state.selection.enabled = !state.selection.enabled;
    // When disabling selection, clear selections
    if (!state.selection.enabled) {
      state.selection.selectedGameIds.clear();
      state.selection.selectedPlatformIds.clear();
    }
    // Re-render the current view to show/hide checkboxes
    applyFilters();
    renderBulkActionsBar();
  });

  // --- Infinite Scroll ---
  const perPageControls = document.getElementById('per-page-controls');
  const paginationTop = document.getElementById('pagination-top');
  const paginationBottom = document.getElementById('pagination-bottom');
  const loader = document.getElementById('infinite-scroll-loader');

  const handleScroll = async () => {
    const { infiniteScroll, pagination } = state;
    const buffer = 5; // 5-pixel buffer to reliably trigger loading
    // Check if we should load more content
    if (
      infiniteScroll.enabled &&
      !infiniteScroll.isLoading &&
      pagination.currentPage < pagination.totalPages &&
      (window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight - buffer
    ) {
      infiniteScroll.isLoading = true;
      if (loader) loader.classList.remove('hidden');
      pagination.currentPage++;
      await applyFilters(true); // Pass true to indicate it's an append operation
      infiniteScroll.isLoading = false;
      if (loader) loader.classList.add('hidden');
    }
  };

  btnInfiniteScroll.addEventListener('click', () => {
    state.infiniteScroll.enabled = !state.infiniteScroll.enabled;
    btnInfiniteScroll.classList.toggle('infinite-scroll-on', state.infiniteScroll.enabled);

    if (state.infiniteScroll.enabled) {
      btnInfiniteScroll.textContent = '📜 Scroll On';
      window.addEventListener('scroll', handleScroll);
    } else {
      btnInfiniteScroll.textContent = '📜 Infinite Scroll';
      window.removeEventListener('scroll', handleScroll);
      // When turning off, reset to page 1 to show a predictable view.
      state.pagination.currentPage = 1;
    }
    applyFilters(); // Re-render games and pagination
    renderBulkActionsBar(); // Re-render the bulk bar to show/hide "Select Page"
  });

  // Bulk Actions Bar
  if (bulkActionBar) {
    bulkActionBar.addEventListener('click', async (e) => {
      const button = e.target.closest('button');
      if (!button) return;

      const id = button.id;
      const selectedSet = state.currentTab === 'games' ? state.selection.selectedGameIds : state.selection.selectedPlatformIds;

      if (id === 'bulk-select-page') {
        // Select all visible items on the current page
        document.querySelectorAll('#display-grid .card').forEach(card => {
          const gameId = card.dataset.gameId;
          if (gameId) selectedSet.add(gameId);
        });
      } else if (id === 'bulk-select-all-filtered') {
        // Select all items that match the current filters (across all pages)
        state.filteredGames.forEach(game => selectedSet.add(String(game.id)));
      } else if (id === 'bulk-select-none') {
        // Deselect all
        selectedSet.clear();
      } else if (id === 'bulk-select-inverse') {
        // Invert selection for the current page
        document.querySelectorAll('#display-grid .card').forEach(card => {
          const gameId = card.dataset.gameId;
          if (gameId) {
            if (selectedSet.has(gameId)) {
              selectedSet.delete(gameId);
            } else {
              selectedSet.add(gameId);
            }
          }
        });
      } else if (id === 'bulk-action-edit') {
        // Open the bulk edit modal
        if (state.currentTab === 'games') {
          if (selectedSet.size > 0) {
            await showBulkEditGameModal();
          } else {
            alert('Please select at least one game to edit.');
          }
        } else {
          alert('Bulk editing for platforms is not yet supported.');
        }
      }

      // After any bulk action, re-render the grid and the bar to reflect changes
      applyFilters();
      renderBulkActionsBar();
    });
  }


  // Add Game
  btnAddGame.addEventListener('click', async () => {
    formGame.reset();
    resetGameModalUI(); // Clean up any lingering state from bulk edit mode
    // Populate name from search input if available
    const searchInput = document.getElementById('search-input');
    if (searchInput && searchInput.value) {
      formGame.querySelector('input[name="name"]').value = searchInput.value;
    }

    // Explicitly make the name input visible, in case it was hidden by bulk edit mode.
    const nameInputContainer = formGame.querySelector('input[name="name"]').parentElement.parentElement;
    nameInputContainer.style.display = 'block';
    formGame.querySelector('input[name="name"]').disabled = false;

    populateGamePlatformsList(null); // Clear the list for a new game
    document.getElementById('modal-game-title').textContent = 'Add Game';
    formGame.dataset.gameId = '';
    // Hide clone/delete button group for "Add" mode
    formGame.querySelector('.btn-clone').parentElement.style.display = 'none';
    document.getElementById('btn-pull-igdb').style.display = 'inline-block';
    document.getElementById('game-platforms-section').style.display = 'block';
    // Show the IGDB pull controls
    const igdbPullControls = document.querySelector('.igdb-pull-controls');
    if (igdbPullControls) igdbPullControls.style.display = 'flex';


    document.getElementById('link-game-section').style.display = 'none';
    openModal(modalGame);
    // Set focus on the game name input field
    formGame.querySelector('input[name="name"]').focus();
    // Set button text for "Add" mode
    formGame.querySelector('button[type="submit"]').textContent = 'Save & Add Platform';
  });

  // --- Duplicate Name Check (Live) ---
  const gameNameInput = formGame.querySelector('input[name="name"]');
  const gameSubmitBtn = formGame.querySelector('button[type="submit"]');

  gameNameInput.addEventListener('input', () => {
    // If the button is in an error state, reset it as the user types a new name.
    if (gameSubmitBtn.classList.contains('btn-danger')) {
      const gameId = formGame.dataset.gameId;
      gameSubmitBtn.classList.remove('btn-danger');
      gameSubmitBtn.textContent = gameId ? 'Save & Close' : 'Save & Add Platform';
    }
  });

  // --- Smart Add Game: Autocomplete in Modal ---
  const addGameNameInput = formGame.querySelector('input[name="name"]');
  const addGameAutocompleteResults = document.getElementById('add-game-autocomplete-results');
  initAutocomplete(addGameNameInput, addGameAutocompleteResults, {
    onSelect: (item) => {
      const gameId = item.dataset.id;
      showEditGameModal(gameId, false); // false = don't re-open modal
      clearAutocomplete(addGameAutocompleteResults);
    },
    filter: (suggestion) => suggestion.type === 'game',
    footerText: 'Found existing game:'
  });

  // Game type radios
  const gameTypeContainer = document.getElementById('game-type-checkboxes');
  if (gameTypeContainer) {
    gameTypeContainer.addEventListener('change', (e) => {
    const derivedCb = gameTypeContainer.querySelector('input[name="is_derived_work"]');
    const sequelCb = gameTypeContainer.querySelector('input[name="is_sequel"]');
    const linkSection = document.getElementById('link-game-section');
    linkSection.style.display = derivedCb.checked || sequelCb.checked ? 'block' : 'none';
    });
  }

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
    // Hide clone/delete buttons for "Add" mode
    formPlatform.querySelector('.btn-clone').style.display = 'none';
    formPlatform.querySelector('.btn-delete').style.display = 'none';

    openModal(modalPlatform);
  });

  // Import CSV
  btnImportCSV.addEventListener('click', () => openModal(modalImport));
  // initialize import modal helpers
  try { initImportModal(); } catch (e) { console.warn('Import modal init failed', e); }

  // --- IGDB Pull Button in Game Modal ---
  document.getElementById('btn-pull-igdb').addEventListener('click', async (e) => {
    e.preventDefault();
    const nameInput = formGame.querySelector('input[name="name"]');
    const idInput = formGame.querySelector('input[name="igdb_id"]');
    const pullMethod = formGame.querySelector('input[name="igdb_pull_method"]:checked').value;

    let title = nameInput.value;
    let igdbId = idInput.value;

    // Only show an alert if both fields are empty.
    if (!title.trim() && !igdbId.trim()) {
      alert('Please enter a Name or an IGDB ID to search for.');
      return;
    }

    const button = e.target;
    const originalText = button.textContent;
    button.textContent = 'Fetching...';
    button.disabled = true;

    const populateForm = (data) => {
      Object.keys(data).forEach(key => {
        const input = formGame.querySelector(`[name="${key}"]`);
        if (input) input.value = Array.isArray(data[key]) ? data[key].join(', ') : data[key];
      });
    };

    let result = null;

    if (pullMethod === 'name') {
      // If name is blank, try ID first.
      if (!title.trim()) {
        result = igdbId ? await fetchFromIgdb(null, igdbId) : null;
      } else {
        result = await fetchFromIgdb(title, null);
      }
    } else { // pullMethod is 'id'
      // Try ID first.
      result = igdbId ? await fetchFromIgdb(null, igdbId) : null;
      // If ID search fails (or ID was blank), fall back to name.
      if ((!result || (!result.game_data && !result.game_choices)) && title.trim()) {
        result = await fetchFromIgdb(title, null);
      }
    }

    if (!result || (!result.game_data && !result.game_choices)) {
      alert('No game found on IGDB with the provided Name or ID.');
    }

    /**
     * A less aggressive normalization for comparing titles.
     * It standardizes case and whitespace but preserves punctuation.
     * @param {string} name The title to normalize.
     */
    const normalizeForComparison = (name) => {
      return (name || '').toLowerCase().replace(/\s+/g, ' ').trim();
    };

    if (result) {
      // If we got a single result, but the name doesn't match what the user typed,
      // show the picker modal to let the user confirm their intention.
      // This handles cases where IGDB returns a "best" match that isn't what the user wanted.
      const singleResultNameMismatch = result.game_data && 
                                       title.trim() !== '' &&
                                       normalizeForComparison(result.game_data.name) !== normalizeForComparison(title);

      if (result.game_data && !singleResultNameMismatch) {
        // Single, definitive result
        populateForm(result.game_data);
      } else if (result.game_choices && result.game_choices.length > 0) {
        // Multiple results, show the generalized bulk match modal.
        const matchData = [{
          localName: title,
          choices: result.game_choices
        }];
        showBulkMatchModal(matchData, async (selectedIgdbId, didSelect) => {
          if (didSelect && selectedIgdbId) {
            // This callback is executed when a choice is made in the modal.
            const finalResult = await fetchFromIgdb(null, selectedIgdbId);
            if (finalResult && finalResult.game_data) {
              populateForm(finalResult.game_data);
            }
          } else {
            // If the modal was closed without a selection, refresh the main game list.
            // If a selection was made, the game modal will be populated, and its save action will trigger fetchGames().
            // So, this fetchGames() here is primarily for the "closed without selection" case.
            await fetchGames();
          }
        });
      } else if (singleResultNameMismatch) {
        // The single result was a name mismatch. We must treat it like a choice from a multi-result
        // list. The backend returns the raw data in `game_choices` for multiple results, or just
        // `raw_igdb_data` for a single result. We pass this raw data to the picker, which will
        // then re-fetch the full, properly mapped data upon user selection.
        const choices = result.raw_igdb_data || (result.game_data ? [result.game_data] : []); // Ensure choices is an array
        const matchData = [{ localName: title, choices: choices }];
        showBulkMatchModal(matchData, async (selectedIgdbId, didSelect) => {
            if (didSelect && selectedIgdbId) {
                const finalResult = await fetchFromIgdb(null, selectedIgdbId);
                if (finalResult && finalResult.game_data) {
                    populateForm(finalResult.game_data);
                }
            } else {
                await fetchGames();
            }
        });
      } else {
        alert('No game found on IGDB with that title.');
      }
    }
    button.textContent = originalText;
    button.disabled = false;
  });

  // Refresh data when import completes
  window.addEventListener('vgd:import_complete', async () => {
    await fetchPlatforms(); // This will now re-render the platform list
    if (state.currentTab === 'games') fetchGames(); else fetchPlatforms();
  });

  // --- Modal Form Actions (Clone/Delete) ---

  // Game Form Actions
  modalGame.addEventListener('click', async (e) => {
    const gameId = formGame.dataset.gameId;
    if (!gameId) return;

    // Clone Game
    if (e.target.classList.contains('btn-clone')) {
      formGame.dataset.gameId = ''; // Unset the ID to trigger a create (POST) on save
      document.getElementById('modal-game-title').textContent = 'Add Game (Cloned)';
      formGame.querySelector('input[name="name"]').value += ' (Copy)';
      // Hide clone/delete buttons after cloning
      formGame.querySelector('.btn-clone').style.display = 'none';
      formGame.querySelector('.btn-delete').style.display = 'none';
      document.getElementById('btn-pull-igdb').style.display = 'inline-block';
      alert('Game data cloned. Modify and save to create a new entry.');
    }

    // Delete Game
    if (e.target.classList.contains('btn-delete')) {
      if (confirm('Are you sure you want to delete this game? This cannot be undone.')) {
        try {
          const res = await fetch(`/plugins/database_handler/games/${gameId}`, { method: 'DELETE' });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Server responded with an error.');

          closeModal(modalGame, document.getElementById('btn-add-game')); // Or the card that opened it
          await fetchGames(); // Refresh game list

          // Check if any platforms became empty and offer to delete them
          if (data.empty_platforms && data.empty_platforms.length > 0) {
            const platformNames = data.empty_platforms
              .map(pid => state.allPlatforms.find(p => p.id === pid)?.name)
              .filter(Boolean);

            if (platformNames.length > 0 && confirm(`The following platforms are now empty: ${platformNames.join(', ')}.\n\nWould you like to delete them?`)) {
              for (const pid of data.empty_platforms) {
                await fetch(`/plugins/database_handler/platforms/${pid}`, { method: 'DELETE' });
              }
              await fetchPlatforms(); // Refresh platform list if we deleted some
            }
          }
        } catch (err) {
          alert('Error deleting game: ' + (err.message || 'Unknown error'));
        }
      }
    }
  });

  // Platform Form Actions
  modalPlatform.addEventListener('click', async (e) => {
    const platformId = formPlatform.dataset.platformId;
    if (!platformId) return;

    // Clone Platform
    if (e.target.classList.contains('btn-clone')) {
      formPlatform.dataset.platformId = ''; // Unset ID for creation
      document.getElementById('modal-platform-title').textContent = 'Add Platform (Cloned)';
      formPlatform.querySelector('input[name="name"]').value += ' (Copy)';
      formPlatform.querySelector('.btn-clone').style.display = 'none';
      formPlatform.querySelector('.btn-delete').style.display = 'none';
      alert('Platform data cloned. Modify and save to create a new entry.');
    }

    // Delete Platform
    if (e.target.classList.contains('btn-delete')) {
      const initialConfirm = confirm('Are you sure you want to delete this platform? All associated game links will also be removed.');
      if (initialConfirm) {
        try {
          const res = await fetch(`/plugins/database_handler/platforms/${platformId}`, { method: 'DELETE' });

          if (res.status === 409) { // Conflict - orphaning games
            const data = await res.json();
            // Show the orphan handler modal instead of confirm()
            const orphanForm = document.getElementById('form-orphan-handler');
            orphanForm.dataset.platformId = platformId;
            orphanForm.dataset.orphanedGames = JSON.stringify(data.orphaned_games || []);

            const orphanCount = (data.orphaned_games || []).length;
            document.getElementById('orphan-info-text').textContent = `Deleting this platform will orphan ${orphanCount} game(s). What would you like to do?`;

            // Populate remap dropdown
            const remapSelect = document.getElementById('orphan-remap-select');
            remapSelect.innerHTML = '';
            state.allPlatforms.filter(p => p.id !== platformId).forEach(p => {
              const opt = new Option(p.name, p.id);
              remapSelect.appendChild(opt);
            });

            document.getElementById('orphan-new-name').value = `Orphaned_Games_${Math.random().toString(36).substring(2, 8)}`;
            openModal(modalOrphanHandler);
            return; // Stop further processing, wait for modal interaction
          } else if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Server responded with an error.');
          }

          closeModal(modalPlatform, document.getElementById('btn-add-platform')); // Or the card that opened it
          await fetchPlatforms(); // Refresh platform list and game list (as links are removed)
          await fetchGames();
        } catch (err) {
          alert('Error deleting platform: ' + (err.message || 'Unknown error'));
        }
      }
    }
  });

  // Orphan Handler Modal Logic
  const orphanForm = document.getElementById('form-orphan-handler');
  const orphanRadios = orphanForm.querySelectorAll('input[name="orphan_action"]');
  orphanRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      document.getElementById('orphan-remap-select').disabled = orphanForm.orphan_action.value !== 'remap';
      document.getElementById('orphan-new-name').disabled = orphanForm.orphan_action.value !== 'new';
    });
  });

  orphanForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const action = orphanForm.orphan_action.value;
    const platformIdToDelete = orphanForm.dataset.platformId;
    const orphanedGames = JSON.parse(orphanForm.dataset.orphanedGames);

    try {
      if (action === 'delete') {
        // Action 1: Force delete and orphan games
        const forceRes = await fetch(`/plugins/database_handler/platforms/${platformIdToDelete}?force=true`, { method: 'DELETE' });
        if (!forceRes.ok) throw new Error('Failed to force delete platform.');

      } else if (action === 'remap' || action === 'new') {
        let targetPlatformId;
        if (action === 'new') {
          // Action 2a: Create a new platform first
          const newPlatformName = document.getElementById('orphan-new-name').value;
          const createRes = await fetch('/plugins/database_handler/platforms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newPlatformName, supports_digital: true, supports_physical: true })
          });
          if (!createRes.ok) throw new Error('Failed to create temporary platform.');
          const newPlatformData = await createRes.json();
          targetPlatformId = newPlatformData.platform.id;
        } else {
          // Action 2b: Use existing platform
          targetPlatformId = document.getElementById('orphan-remap-select').value;
        }

        if (!targetPlatformId) throw new Error('No target platform selected for remapping.');

        // Remap each orphaned game to the target platform
        const remapPromises = orphanedGames.map(game => {
          return fetch('/plugins/database_handler/game_platforms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              game_id: game.id,
              platform_id: targetPlatformId,
              is_digital: true, // Default to digital, as we don't know the original format
              acquisition_method: 'migrated'
            })
          });
        });

        const remapResults = await Promise.all(remapPromises);
        const failedRemaps = remapResults.filter(res => !res.ok);
        if (failedRemaps.length > 0) {
          // Not a critical failure, but worth noting. The original platform will still be deleted.
          console.warn(`Failed to remap ${failedRemaps.length} games.`);
        }

        // Finally, delete the original platform (it will no longer cause orphans)
        const finalDeleteRes = await fetch(`/plugins/database_handler/platforms/${platformIdToDelete}`, { method: 'DELETE' });
        if (!finalDeleteRes.ok) throw new Error('Failed to delete original platform after remapping.');
      }

      // Success: close modals and refresh data
      closeModal(modalOrphanHandler);
      closeModal(document.getElementById('modal-platform'), document.getElementById('btn-add-platform'));
      await fetchPlatforms();
      await fetchGames();

    } catch (err) {
      alert('An error occurred: ' + err.message);
    } finally {
      // Clean up form data
      orphanForm.dataset.platformId = '';
      orphanForm.dataset.orphanedGames = '[]';
    }
  });

  /**
   * Handles the UI flow after a new game is successfully created.
   * Transitions the 'Add Game' modal to an 'Edit Game' state for the new game,
   * then opens the 'Add to Platform' modal.
   * @param {number} newGameId - The ID of the newly created game.
   */
  async function handleNewGameCreationSuccess(newGameId) {
    await fetchGames(); // Refresh state to include the new game
    // Transition the "Add" modal to an "Edit" modal for the new game
    await showEditGameModal(newGameId, false); // false = don't open, just populate
    // Now, open the "Add to Platform" modal on top
    state.currentGameId = newGameId;
    await populateAddToPlatformForm();
    openModal(document.getElementById('modal-add-to-platform'));
  }
  // Submit: Game
  formGame.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(formGame);
    const gameId = formGame.dataset.gameId; // This will be "" in bulk mode, or an ID string
    const isBulkEdit = gameId === '' && state.selection.enabled;

    if (isBulkEdit) {
      const selectedIds = Array.from(state.selection.selectedGameIds);
      if (selectedIds.length === 0) {
        alert('No games selected for bulk edit.');
        return;
      }

      const payload = {
        action: 'edit_fields',
        item_type: 'game',
        ids: selectedIds,
        params: {}
      };

      // Collect data only from enabled fields
      formGame.querySelectorAll('.bulk-edit-enabler:checked').forEach(checkbox => {
        const fieldName = checkbox.dataset.enables;
        const input = formGame.querySelector(`[name="${fieldName}"]`);
        if (input) {
          let value;
          if (input.type === 'checkbox') {
            value = input.checked;
          } else if (fieldName === 'tags') {
            value = input.value.split(',').map(t => t.trim()).filter(Boolean);
          } else {
            value = input.value;
          }
          payload.params[fieldName] = value;
        } else {
          // This block is intentionally left to handle the old radio button logic gracefully.
          // The new checkbox logic is handled separately after this loop.
        }
      });

      // Handle the new game type checkboxes for bulk edit
      if (formGame.querySelector('.bulk-edit-enabler[data-enables="game_type_group"]:checked')) {
        payload.params.is_derived_work = formGame.querySelector('input[name="is_derived_work"]').checked;
        payload.params.is_sequel = formGame.querySelector('input[name="is_sequel"]').checked;
      }

      const result = await postBulkOperation(payload);
      alert(result.message || 'Bulk edit completed.');
      closeModal(modalGame);
      await fetchGames(); // Refresh data
      return;
    }

    const tagsStr = formData.get('tags') || ''; // This part is for single add/edit
    const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);

    const gameData = {
      name: formData.get('name'),
      description: formData.get('description'),
      release_year: formData.get('release_year') ? parseInt(formData.get('release_year')) : null,
      cover_image_url: formData.get('cover_image_url'),
      trailer_url: formData.get('trailer_url'),
      is_derived_work: formData.get('is_derived_work') === 'true',
      is_sequel: formData.get('is_sequel') === 'true',
      related_game_id: (formData.get('is_derived_work') || formData.get('is_sequel')) ? (formData.get('related_game_id') || null) : null,
      tags: tags,
      // New fields
      igdb_id: formData.get('igdb_id') ? parseInt(formData.get('igdb_id')) : null,
      esrb_rating: formData.get('esrb_rating'),
      genre: formData.get('genre'),
      target_audience: formData.get('target_audience'),
      developer: formData.get('developer'),
      publisher: formData.get('publisher'),
      plot_synopsis: formData.get('plot_synopsis'),
      notes: formData.get('notes')
    };

    const endpoint = gameId ? `/plugins/database_handler/games/${gameId}` : '/plugins/database_handler/games';
    const method = gameId ? 'PUT' : 'POST';

    if (!gameId) {
      const normalizedNewName = normalizeName(gameData.name);
      const isDuplicate = state.allGames.some(
        existingGame => normalizeName(existingGame.name) === normalizedNewName
      );

      if (isDuplicate) {
        // Show inline error on the button instead of an alert
        gameSubmitBtn.textContent = 'Game Already Exists';
        gameSubmitBtn.classList.add('btn-danger');
        // Re-focus the input field to encourage user to change it
        gameNameInput.focus();
        return;
      }
    }

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
      // After saving, refresh data and close modal.
      // The new workflow handles platform association within the modal.
      if (!gameId && result.game) { // This was a new game
        await handleNewGameCreationSuccess(result.game.id);
      } else {
        closeModal(modalGame, document.querySelector(`.edit-game[data-id="${gameId}"]`) || document.getElementById('btn-add-game'));
        await fetchPlatforms();
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
      year_acquired: formData.get('year_acquired') ? parseInt(formData.get('year_acquired')) : null,
      // New fields
      generation: formData.get('generation') ? parseInt(formData.get('generation')) : null,
      manufacturer: formData.get('manufacturer')
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
      closeModal(modalPlatform, document.querySelector(`.edit-platform[data-id="${platformId}"]`) || document.getElementById('btn-add-platform'));
      await fetchPlatforms();
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

    // Correctly read the selected format pills ('digital' or 'physical')
    const checkedFormatInputs = document.querySelectorAll('#format-checkbox-group input[type="checkbox"]:checked');
    const selectedFormats = [];
    checkedFormatInputs.forEach(input => selectedFormats.push(input.value));

    if (selectedFormats.length === 0) {
      alert('Please select at least one format (Digital or Physical)');
      return;
    }

    const requests = selectedFormats.map(format => {
      const gamePlatformData = {
        game_id: state.currentGameId,
        platform_id: platformId,
        is_digital: format === 'digital',
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
      closeModal(modalAddToPlatform, document.querySelector(`.add-to-platform[data-id="${state.currentGameId}"]`) || document.getElementById('btn-associate-platform'));

      // Refresh the platform list in the underlying game modal
      const gameId = formGame.dataset.gameId;
      if (gameId) {
        await populateGamePlatformsList(gameId);
      }
      await fetchPlatforms(); // This will now re-render the platform list
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
      const isGamesTab = target === 'games';

      tabs.forEach(t => t.classList.toggle('active', t === tab));
      document.getElementById('games-controls').style.display = isGamesTab ? 'flex' : 'none';
      if (sortSelectGames) sortSelectGames.style.display = isGamesTab ? 'inline-block' : 'none';
      if (sortSelectPlatforms) sortSelectPlatforms.style.display = isGamesTab ? 'none' : 'inline-block';
      const sortLabel = document.querySelector('label[for="sort-select-games"]') || document.querySelector('label[for="sort-select"]');
      if (sortLabel) sortLabel.style.display = 'inline'; // Always show the label

      if (isGamesTab) await fetchGames(); else await fetchPlatforms();
      renderBulkActionsBar();
      updateTabCounts();
    });
  });

  // Filter button
  if (btnFilter) {
    btnFilter.addEventListener('click', async () => {
      btnFilter.setAttribute('data-opens-modal', 'modal-filter');
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
      btnDisplay.setAttribute('data-opens-modal', 'modal-display');
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
      closeModal(modalDisplayEl, btnDisplay);
      applyFilters();
      updateDisplayButton();
    });
  }
  updateDisplayButton();

  // Header search
  if (headerSearch) {
    initAutocomplete(headerSearch, autocompleteResults, {
      onSelect: (item) => {
        const { type, id, name } = item.dataset;
        if (type === 'game') showEditGameModal(id);
        else if (type === 'platform') showEditPlatformModal(id);
        else if (type === 'tag') {
          clearAllFilters();
          state.currentFilters.tags = [name];
          applyFilters();
          updateActiveFiltersDisplay();
        }
        headerSearch.value = name;
        clearAutocomplete();
      },
      onEnterWithoutSelection: (query) => {
        clearAllFilters();
        state.currentFilters.keyword = query;
        applyFilters();
        updateActiveFiltersDisplay();
        clearAutocomplete();
      }
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
      const typeCheckboxes = document.querySelectorAll('#filter-game-type input[type="checkbox"]:checked');
      const gameTypes = Array.from(typeCheckboxes).map(cb => cb.value);
      const acqCheckboxes = document.querySelectorAll('#filter-acquisition input[type="checkbox"]:checked');
      const acquisitionMethods = Array.from(acqCheckboxes).map(cb => cb.value);
      const manuCheckboxes = document.querySelectorAll('#filter-manufacturer input[type="checkbox"]:checked');
      const manufacturers = Array.from(manuCheckboxes).map(cb => cb.value);
      const genreCheckboxes = document.querySelectorAll('#filter-genre input[type="checkbox"]:checked');
      const genres = Array.from(genreCheckboxes).map(cb => cb.value);
      const devCheckboxes = document.querySelectorAll('#filter-developer input[type="checkbox"]:checked');
      const developers = Array.from(devCheckboxes).map(cb => cb.value);
      const pubCheckboxes = document.querySelectorAll('#filter-publisher input[type="checkbox"]:checked');
      const publishers = Array.from(pubCheckboxes).map(cb => cb.value);
      const esrbCheckboxes = document.querySelectorAll('#filter-esrb input[type="checkbox"]:checked');
      const esrbRatings = Array.from(esrbCheckboxes).map(cb => cb.value);
      const audienceCheckboxes = document.querySelectorAll('#filter-audience input[type="checkbox"]:checked');
      const targetAudiences = Array.from(audienceCheckboxes).map(cb => cb.value);

      const releaseYearMin = document.getElementById('filter-year-min').value || null;
      const releaseYearMax = document.getElementById('filter-year-max').value || null;

      const selMode = document.querySelector('input[name="platform_mode"]:checked');
      const platformAnd = selMode ? (selMode.value === 'and') : undefined;
      state.currentFilters = { keyword, platforms, tags, platformAnd, gameTypes, acquisitionMethods, manufacturers, genres, developers, publishers, esrbRatings, targetAudiences, releaseYearMin, releaseYearMax };
      state.pagination.currentPage = 1; // Reset to page 1 on new filter application
      applyFilters();
      closeModal(modalFilter, btnFilter);
      renderBulkActionsBar();
      updateActiveFiltersDisplay();
    });
  }

  // Clear filters
  const btnClearFilters = document.getElementById('btn-clear-filters');
  if (btnClearFilters) {
    btnClearFilters.addEventListener('click', (e) => {
      e.preventDefault();
      clearAllFilters();
      state.pagination.currentPage = 1; // Reset to page 1 when clearing filters
      applyFilters();
      updateActiveFiltersDisplay();
      renderBulkActionsBar();
    });
  }

  // Grid click delegations
  displayGrid.addEventListener('click', async (e) => {
    const editGame = e.target.closest('.edit-game');
    const editPlatform = e.target.closest('.edit-platform');
    const addToPlat = e.target.closest('.add-to-platform');
    const platSpan = e.target.closest('.plat');
    const tagSpan = e.target.closest('.tag');
    const filterByPlatform = e.target.closest('.filter-by-platform');
    const cardCheckbox = e.target.closest('.card-checkbox');

    if (cardCheckbox) {
      const id = cardCheckbox.dataset.id;
      const selectedSet = state.currentTab === 'games' ? state.selection.selectedGameIds : state.selection.selectedPlatformIds;

      if (cardCheckbox.checked) {
        selectedSet.add(id);
      } else {
        selectedSet.delete(id);
      }
      e.target.closest('.card').classList.toggle('selected-card', cardCheckbox.checked);
      renderBulkActionsBar();
      return; // Prevent other click actions on the card
    }

    if (editGame) {
      showEditGameModal(editGame.getAttribute('data-id'));
    }
    if (editPlatform) {
      showEditPlatformModal(editPlatform.getAttribute('data-id'));
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
      renderBulkActionsBar();
      return;
    }
    if (tagSpan) {
      const type = tagSpan.dataset.type;
      const value = tagSpan.dataset.value;
      if (!value || !type) return;

      let filterArray, filterCheckboxesSelector;
      if (type === 'genre') {
        filterArray = state.currentFilters.genres;
        filterCheckboxesSelector = '#filter-genre input[type="checkbox"]';
      } else { // Default to 'tag'
        filterArray = state.currentFilters.tags;
        filterCheckboxesSelector = '#filter-tags input[type="checkbox"]';
      }

      const idx = filterArray.indexOf(value);
      if (idx === -1) filterArray.push(value); else filterArray.splice(idx, 1);

      document.querySelectorAll(filterCheckboxesSelector).forEach(cb => cb.checked = filterArray.includes(cb.value));
      applyFilters();
      updateActiveFiltersDisplay();
      renderBulkActionsBar();
      return;
    }
    if (filterByPlatform) {
      e.preventDefault();
      const platformId = filterByPlatform.dataset.platformId;
      if (!platformId) return;

      // Switch to the games tab, which will also fetch the games
      const gamesTab = document.querySelector('.tab[data-tab="games"]');
      if (gamesTab && state.currentTab !== 'games') {
        gamesTab.click(); // This will handle fetching and rendering
      }

      // Clear all filters and apply just this one platform
      clearAllFilters();
      state.currentFilters.platforms = [platformId];
      applyFilters();
      updateActiveFiltersDisplay();
      renderBulkActionsBar();
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
      renderBulkActionsBar();
    });
  }

  // Sorting
  const handleSortChange = () => {
    state.pagination.currentPage = 1; // Reset to first page on sort change
    if (state.currentTab === 'games') applyFilters();
    else fetchPlatforms(); // For platforms, just re-fetch and sort
  };
  if (sortSelectGames) sortSelectGames.addEventListener('change', handleSortChange);
  if (sortSelectPlatforms) sortSelectPlatforms.addEventListener('change', handleSortChange);

  // Items per page
  if (itemsPerPageSelect) {
    itemsPerPageSelect.addEventListener('change', () => {
      state.pagination.pageSize = parseInt(itemsPerPageSelect.value, 10);
      state.pagination.currentPage = 1; // Reset to first page
      applyFilters();
    });
  }

  // --- In-Modal Platform Management ---

  document.getElementById('btn-associate-platform').addEventListener('click', async () => {
    const gameId = formGame.dataset.gameId;
    if (!gameId) {
      alert('Please save the game before associating platforms.');
      return;
    }
    state.currentGameId = gameId;
    await populateAddToPlatformForm();
    openModal(modalAddToPlatform);
  });

  // Handle removing a platform link from the game modal's list
  document.getElementById('game-platforms-list').addEventListener('click', async (e) => {
    if (e.target.classList.contains('remove-item')) {
      const gpId = e.target.dataset.id;
      const gameId = formGame.dataset.gameId;
      if (confirm('Are you sure you want to remove this game from this platform?')) {
        try {
          const res = await fetch(`/plugins/database_handler/game_platforms/${gpId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Failed to remove platform link.');
          // Refresh the list in the modal
          await populateGamePlatformsList(gameId);
          // Also refresh the main game list in the background
          fetchGames();
        } catch (err) {
          alert('Error: ' + err.message);
        }
      }
    }
  });

  // Wire pagination events initially. They will be re-wired on each render.
  wirePaginationEvents();
}

/**
 * Wires up click events for pagination controls using event delegation.
 * This function is called by renderPagination to ensure listeners are always attached.
 */
export function wirePaginationEvents() {
  const paginationTop = document.getElementById('pagination-top');
  const paginationBottom = document.getElementById('pagination-bottom');
  if (paginationTop) { paginationTop.removeEventListener('click', handlePaginationClick); paginationTop.addEventListener('click', handlePaginationClick); }
  if (paginationBottom) { paginationBottom.removeEventListener('click', handlePaginationClick); paginationBottom.addEventListener('click', handlePaginationClick); }
}
