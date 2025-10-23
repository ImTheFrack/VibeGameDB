'use strict';
import { state, clearAllFilters } from './state.js';
import { fetchGames as fetchGamesFromApi, fetchPlatforms as fetchPlatformsFromApi, fetchAutocomplete, postBulkOperation } from './api.js';
import { renderGames, renderPlatforms, renderBulkActionsBar } from './render.js';
import { applyFilters, extractAllTags, updateActiveFiltersDisplay, updateTabCounts } from './filters.js'; 
import { openModal, closeModal, populateFilterModal, populateAddToPlatformForm, showEditGameModal, showBulkEditGameModal, showEditPlatformModal, populateGamePlatformsList, renderAutocomplete, clearAutocomplete } from './modals.js';
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
    state.allPlatforms = data.platforms || [];
    renderPlatforms(state.allPlatforms);
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
  const gamesControls = document.getElementById('games-controls');
  const sortSelect = document.getElementById('sort-select');
  const itemsPerPageSelect = document.getElementById('items-per-page-select');
  const btnSelectMultiple = document.getElementById('btn-select-multiple');
  const headerSearch = document.getElementById('search-input');

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



  // Add Game
  btnAddGame.addEventListener('click', async () => {
    formGame.reset();
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
    document.getElementById('game-platforms-section').style.display = 'block';

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
  if (addGameNameInput && addGameAutocompleteResults) {
    let modalAutocompleteTimer = null;

    addGameNameInput.addEventListener('input', (e) => {
      clearTimeout(modalAutocompleteTimer);
      const query = e.target.value.trim();

      if (query.length < 2) {
        clearAutocomplete(addGameAutocompleteResults);
        return;
      }

      modalAutocompleteTimer = setTimeout(async () => {
        const data = await fetchAutocomplete(query);
        if (data && data.suggestions) {
          // Filter out non-game results for this context
          const gameSuggestions = data.suggestions.filter(s => s.type === 'game');
          renderAutocomplete(gameSuggestions, addGameAutocompleteResults, 'Found existing game:');
        }
      }, 300);
    });

    addGameAutocompleteResults.addEventListener('click', (e) => {
      const item = e.target.closest('.autocomplete-item');
      if (item) {
        const gameId = item.dataset.id;
        // Pre-fill the form with the selected game's data, turning "Add" into "Edit"
        showEditGameModal(gameId, false); // false = don't re-open modal
        clearAutocomplete(addGameAutocompleteResults);
      }
    });

    // Hide autocomplete when clicking elsewhere in the modal
    modalGame.addEventListener('click', (e) => {
      if (!e.target.closest('#add-game-autocomplete-results') && e.target !== addGameNameInput) {
        clearAutocomplete(addGameAutocompleteResults);
      }
    });
  }

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
    // Hide clone/delete buttons for "Add" mode
    formPlatform.querySelector('.btn-clone').style.display = 'none';
    formPlatform.querySelector('.btn-delete').style.display = 'none';

    openModal(modalPlatform);
  });

  // Import CSV
  btnImportCSV.addEventListener('click', () => openModal(modalImport));
  // initialize import modal helpers
  try { initImportModal(); } catch (e) { console.warn('Import modal init failed', e); }

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
          if (input.type === 'radio') {
            const checkedRadio = formGame.querySelector(`input[name="${fieldName}"]:checked`);
            value = checkedRadio ? (checkedRadio.value === 'true') : null; // Convert "true" string to boolean
          } else if (input.type === 'checkbox') {
            value = input.checked;
          } else if (fieldName === 'tags') {
            value = input.value.split(',').map(t => t.trim()).filter(Boolean);
          } else {
            value = input.value;
          }
          payload.params[fieldName] = value;
        }
      });

      const result = await postBulkOperation(payload);
      alert(result.message || 'Bulk edit completed.');
      closeModal(modalGame);
      await fetchGames(); // Refresh data
      return;
    }

    const tagsStr = formData.get('tags') || ''; // This part is for single add/edit
    const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t.length > 0);

    const gameType = formData.get('game_type');
    const gameData = {
      name: formData.get('name'),
      description: formData.get('description'),
      release_year: formData.get('release_year') ? parseInt(formData.get('release_year')) : null,
      cover_image_url: formData.get('cover_image_url'),
      trailer_url: formData.get('trailer_url'),
      is_derived_work: gameType === 'derived',
      is_sequel: gameType === 'sequel',
      related_game_id: gameType !== 'original' ? (formData.get('related_game_id') || null) : null,
      tags: tags
    };

    const endpoint = gameId ? `/plugins/database_handler/games/${gameId}` : '/plugins/database_handler/games';
    const method = gameId ? 'PUT' : 'POST';

    // --- Duplicate Name Check for New Games ---
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
      if (!gameId && result.game) { // This was a new game, transition to edit and prompt for platform
        const newGameId = result.game.id;
        await fetchGames(); // Refresh state to include the new game, which populates state.allGames
        // Transition the "Add" modal to an "Edit" modal for the new game
        await showEditGameModal(newGameId, false); // false = don't open, just populate
        // Now, open the "Add to Platform" modal on top
        state.currentGameId = newGameId;
        await populateAddToPlatformForm();
        openModal(modalAddToPlatform);
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
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      if (gamesControls) gamesControls.style.display = target === 'games' ? 'flex' : 'none';
      if (target === 'games') await fetchGames(); else await fetchPlatforms();
      renderBulkActionsBar();
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
    let headerTimer = null;
    let selectedIndex = -1; // -1 means no selection

    const handleSelection = (item) => {
      if (!item) return;
      const { type, id, name } = item.dataset;

      if (type === 'game') {
        showEditGameModal(id);
      } else if (type === 'platform') {
        showEditPlatformModal(id);
      } else if (type === 'tag') {
        clearAllFilters();
        state.currentFilters.tags = [name];
        applyFilters();
        updateActiveFiltersDisplay();
      }
      headerSearch.value = name;
      clearAutocomplete();
    };

    headerSearch.addEventListener('input', (e) => {
      clearTimeout(headerTimer);
      const query = e.target.value.trim();

      if (query.length < 2) {
        clearAutocomplete();
        return;
      }

      headerTimer = setTimeout(async () => {
        const data = await fetchAutocomplete(query);
        if (data) {
          renderAutocomplete(data.suggestions);
          selectedIndex = -1; // Reset selection on new results
        }
      }, 250);
    });

    // Hide autocomplete when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#search-container')) {
        clearAutocomplete();
      }
    });

    // Handle autocomplete item clicks
    autocompleteResults.addEventListener('click', (e) => {
      const item = e.target.closest('.autocomplete-item');
      handleSelection(item);
    });

    // Keyboard navigation for autocomplete
    headerSearch.addEventListener('keydown', (e) => {
      const items = autocompleteResults.querySelectorAll('.autocomplete-item');
      if (items.length === 0) {
        // Fallback to keyword search on Enter if no suggestions
        if (e.key === 'Enter') {
          e.preventDefault();
          const query = headerSearch.value.trim();
          if (query) {
            clearAllFilters();
            state.currentFilters.keyword = query;
            clearAutocomplete();
            applyFilters();
            updateActiveFiltersDisplay();
          }
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          selectedIndex = (selectedIndex + 1) % items.length;
          break;
        case 'ArrowUp':
          e.preventDefault();
          selectedIndex = (selectedIndex - 1 + items.length) % items.length;
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex > -1) {
            // If an item is selected via arrow keys, handle that selection.
            handleSelection(items[selectedIndex]);
          } else {
            // Otherwise, perform a keyword search for the exact text in the input box.
            const query = headerSearch.value.trim();
            if (query) {
              clearAllFilters();
              state.currentFilters.keyword = query;
              clearAutocomplete();
              applyFilters();
              updateActiveFiltersDisplay();
            }
          }
          return; // Stop further processing
        case 'Tab':
          // If autocomplete is open, Tab should try to complete
          if (items.length > 0) {
            // If an item is selected via arrows, use it. Otherwise, default to the first item.
            const targetIndex = selectedIndex > -1 ? selectedIndex : 0;
            const targetItem = items[targetIndex];

            if (targetItem) {
              const completeName = targetItem.dataset.name;
              // Only prevent default and autocomplete if the input text is not already the full name
              if (headerSearch.value.toLowerCase() !== completeName.toLowerCase()) {
                e.preventDefault();
                headerSearch.value = completeName;
                // Visually select the first item if we just autocompleted to it
                if (selectedIndex === -1) {
                  selectedIndex = 0;
                  items.forEach((item, index) => item.classList.toggle('selected', index === 0));
                }
              }
            }
          }
          break;
        case 'Escape':
          clearAutocomplete();
          break;
      }

      items.forEach((item, index) => {
        item.classList.toggle('selected', index === selectedIndex);
      });
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
      const selMode = document.querySelector('input[name="platform_mode"]:checked');
      const platformAnd = selMode ? (selMode.value === 'and') : undefined;
      state.currentFilters = { keyword, platforms, tags, platformAnd, gameTypes, acquisitionMethods };
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
      const t = tagSpan.getAttribute('data-tag');
      if (!t) return;
      const idx = state.currentFilters.tags.indexOf(t);
      if (idx === -1) state.currentFilters.tags.push(t); else state.currentFilters.tags.splice(idx, 1);
      document.querySelectorAll('#filter-tags input[type="checkbox"]').forEach(cb => cb.checked = state.currentFilters.tags.includes(cb.value));
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
      state.currentFilters = { keyword: '', platforms: [platformId], tags: [], gameTypes: [], acquisitionMethods: [] };
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
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      state.pagination.currentPage = 1; // Reset to first page on sort change
      applyFilters();
    });
  }

  // Items per page
  if (itemsPerPageSelect) {
    itemsPerPageSelect.addEventListener('change', () => {
      state.pagination.pageSize = parseInt(itemsPerPageSelect.value, 10);
      state.pagination.currentPage = 1; // Reset to first page
      applyFilters();
    });
  }

  // --- Pagination via Event Delegation ---
  function handlePaginationClick(e) {
    e.preventDefault();
    const link = e.target.closest('.page-link');
    if (!link || link.classList.contains('disabled') || link.classList.contains('current')) {
      return;
    }
    state.pagination.currentPage = parseInt(link.dataset.page, 10);
    applyFilters();
  }

  const paginationTop = document.getElementById('pagination-top');
  const paginationBottom = document.getElementById('pagination-bottom');
  if (paginationTop) paginationTop.addEventListener('click', handlePaginationClick);
  if (paginationBottom) paginationBottom.addEventListener('click', handlePaginationClick);

  // --- Bulk Action Bar Events ---
  const bulkActionBar = document.getElementById('bulk-actions-bar');
  if (bulkActionBar) {
    bulkActionBar.addEventListener('click', async (e) => {
      const targetId = e.target.id;
      const selectedSet = state.currentTab === 'games' ? state.selection.selectedGameIds : state.selection.selectedPlatformIds;

      if (targetId === 'bulk-select-all-filtered') {
        state.filteredGames.forEach(game => selectedSet.add(String(game.id)));
        applyFilters(); // Re-render to show checked status
        renderBulkActionsBar();
      }

      if (targetId === 'bulk-select-page') {
        const start = (state.pagination.currentPage - 1) * state.pagination.pageSize;
        const end = start + state.pagination.pageSize;
        const pageGames = state.filteredGames.slice(start, end);
        pageGames.forEach(game => selectedSet.add(String(game.id)));
        applyFilters(); // Re-render
        renderBulkActionsBar();
      }

      if (targetId === 'bulk-select-none') {
        selectedSet.clear();
        applyFilters(); // Re-render
        renderBulkActionsBar();
      }

      if (targetId === 'bulk-select-inverse') {
        const allIds = new Set(state.filteredGames.map(g => String(g.id)));
        const currentSelection = new Set(selectedSet); // Make a copy

        allIds.forEach(id => {
          if (currentSelection.has(id)) {
            selectedSet.delete(id);
          } else {
            selectedSet.add(id);
          }
        });
        applyFilters(); // Re-render
        renderBulkActionsBar();
      }

      if (targetId === 'bulk-action-edit') {
        if (selectedSet.size === 0) {
          alert('Please select at least one item to edit.');
          return;
        }
        // Populate and open the bulk edit modal
        const bulkEditCount = document.getElementById('bulk-edit-count');
        bulkEditCount.textContent = selectedSet.size;

        // Populate platform dropdowns
        const assignSelect = modalBulkEdit.querySelector('#bulk-assign-platform-select');
        const removeSelect = modalBulkEdit.querySelector('#bulk-remove-platform-select');
        assignSelect.innerHTML = '';
        removeSelect.innerHTML = '';
        state.allPlatforms.forEach(p => {
          if (assignSelect) assignSelect.add(new Option(p.name, p.id));
          if (removeSelect) removeSelect.add(new Option(p.name, p.id));
        });

        // Show/hide game-specific options
        const platformOptions = modalBulkEdit.querySelectorAll('.bulk-action-button-row');
        platformOptions.forEach(opt => {
          opt.style.display = 'flex'; // Always show for games
        });
        const editFieldsButton = modalBulkEdit.querySelector('#bulk-btn-edit-fields');
        if (editFieldsButton) editFieldsButton.style.display = 'block'; // Always show for games

        openModal(modalBulkEdit);
      }
    });
  }

  // --- Bulk Edit Modal Action Buttons ---
  const bulkActionsContainer = document.getElementById('bulk-actions-container');
  if (bulkActionsContainer) {
    bulkActionsContainer.addEventListener('click', async (e) => {
      const button = e.target.closest('[data-action]');
      if (!button) return;

      const action = button.dataset.action;
      const itemType = state.currentTab === 'games' ? 'game' : 'platform';
      const ids = Array.from(itemType === 'game' ? state.selection.selectedGameIds : state.selection.selectedPlatformIds);

      if (action === 'edit_fields') {
        closeModal(modalBulkEdit);
        await showBulkEditGameModal();
        return;
      }

      if (action === 'delete' && !confirm(`Are you sure you want to delete ${ids.length} item(s)? This cannot be undone.`)) {
        return;
      }

      const payload = {
        action: action,
        item_type: itemType,
        ids: ids,
        params: {}
      };

      if (action === 'assign_platform') payload.params.platform_id = document.getElementById('bulk-assign-platform-select').value;
      if (action === 'remove_platform') payload.params.platform_id = document.getElementById('bulk-remove-platform-select').value;

      const result = await postBulkOperation(payload);
      alert(result.message || 'Bulk operation completed.');
      closeModal(modalBulkEdit);
      state.selection.enabled = false; // Disable selection mode after an action
      // Refresh all data in the background, then re-render the current tab's view
      await Promise.all([fetchGamesFromApi(), fetchPlatformsFromApi()]).then(([gameData, platformData]) => {
        if (gameData) { state.allGames = gameData.games || []; state.allGamePlatforms = gameData.game_platforms || []; }
        if (platformData) { state.allPlatforms = platformData.platforms || []; }
        if (state.currentTab === 'games') applyFilters(); else renderPlatforms(state.allPlatforms);
      });
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
}
