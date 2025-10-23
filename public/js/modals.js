'use strict';
import { state, clearAllFilters } from './state.js';
import { normalizeName } from './utils.js';
import { fetchPlatforms as fetchPlatformsFromApi, fetchGamePlatforms as fetchGamePlatformsFromApi } from './api.js';

/**
 * Modal helpers and population routines.
 *
 * This module provides simple utilities to open/close modals and to
 * populate specific modal UIs that require state or API data (filter
 * modal and add-to-platform modal).
 */

export function openModal(modal) {
  modal.setAttribute('aria-hidden', 'false');
  modal.style.display = 'flex';
}

export function closeModal(modal, focusReturnEl = null) {
  modal.setAttribute('aria-hidden', 'true');
  modal.style.display = 'none';
  if (focusReturnEl && focusReturnEl instanceof HTMLElement) {
    focusReturnEl.focus();
    focusReturnEl.removeAttribute('data-opens-modal');
  }
}

export async function populateFilterModal() {
  // --- Platforms ---
  const platformsContainer = document.getElementById('filter-platforms');
  const platformSortSelect = document.getElementById('filter-platform-sort-select');
  if (platformsContainer && platformSortSelect) {
    const platformCounts = state.allGamePlatforms.reduce((acc, gp) => {
      acc[gp.platform_id] = (acc[gp.platform_id] || 0) + 1;
      return acc;
    }, {});

    const renderPlatforms = () => {
      platformsContainer.innerHTML = '';
      let sortedPlatforms = [...state.allPlatforms];
      const sortMethod = platformSortSelect.value;

      sortedPlatforms.sort((a, b) => {
        const countA = platformCounts[a.id] || 0;
        const countB = platformCounts[b.id] || 0;
        switch (sortMethod) {
          case 'name_desc': return normalizeName(b.name).localeCompare(normalizeName(a.name));
          case 'count_asc': return countA - countB;
          case 'count_desc': return countB - countA;
          case 'name_asc':
          default: return normalizeName(a.name).localeCompare(normalizeName(b.name));
        }
      });

      sortedPlatforms.forEach(p => {
        const count = platformCounts[p.id] || 0;
        const inputId = `filter-plat-${p.id}`;
        const isChecked = state.currentFilters.platforms.includes(String(p.id));
        platformsContainer.innerHTML += `
          <input type="checkbox" value="${p.id}" id="${inputId}" ${isChecked ? 'checked' : ''}>
          <label for="${inputId}">
            <span class="pill-box">${isChecked ? '✓' : ''}</span> ${p.name} <span class="pill-count">(${count})</span>
          </label>
        `;
      });
      updatePillEventListeners('#filter-platforms');
    };

    platformSortSelect.removeEventListener('change', renderPlatforms);
    platformSortSelect.addEventListener('change', renderPlatforms);
    renderPlatforms();
  }

  // --- Tags ---
  const tagsContainer = document.getElementById('filter-tags');
  const tagSortSelect = document.getElementById('filter-tag-sort-select');
  if (tagsContainer && tagSortSelect) {
    const tagCounts = {};
    state.allGames.forEach(game => {
      if (game.tags && Array.isArray(game.tags)) {
        game.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    const renderTags = () => {
      tagsContainer.innerHTML = '';
      let sortedTags = [...state.allTags];
      const sortMethod = tagSortSelect.value;

      sortedTags.sort((a, b) => {
        const countA = tagCounts[a] || 0;
        const countB = tagCounts[b] || 0;
        switch (sortMethod) {
          case 'name_desc': return b.localeCompare(a);
          case 'count_asc': return countA - countB;
          case 'count_desc': return countB - countA;
          case 'name_asc':
          default: return a.localeCompare(b);
        }
      });

      sortedTags.forEach(tag => {
        const count = tagCounts[tag] || 0;
        const inputId = `filter-tag-${tag.replace(/[^a-zA-Z0-9]/g, '')}`;
        const isChecked = state.currentFilters.tags.includes(String(tag));
        tagsContainer.innerHTML += `
          <input type="checkbox" value="${tag}" id="${inputId}" ${isChecked ? 'checked' : ''}>
          <label for="${inputId}">
            <span class="pill-box">${isChecked ? '✓' : ''}</span> ${tag} <span class="pill-count">(${count})</span>
          </label>
        `;
      });
      updatePillEventListeners('#filter-tags');
    };

    tagSortSelect.removeEventListener('change', renderTags);
    tagSortSelect.addEventListener('change', renderTags);
    renderTags();
  }

  // --- Game Type ---
  const gameTypeContainer = document.getElementById('filter-game-type');
  if (gameTypeContainer) {
    gameTypeContainer.innerHTML = '';
    const statuses = [
      { value: 'original', text: 'Original Game' },
      { value: 'derived', text: 'Remake / Remaster' },
      { value: 'sequel', text: 'Sequel' }
    ];
    statuses.forEach(s => {
      const inputId = `filter-type-${s.value}`;
      const isChecked = state.currentFilters.gameTypes.includes(s.value);
      gameTypeContainer.innerHTML += `
        <input type="checkbox" value="${s.value}" id="${inputId}" ${isChecked ? 'checked' : ''}>
        <label for="${inputId}">
          <span class="pill-box">${isChecked ? '✓' : ''}</span> ${s.text}
        </label>
      `;
    });
    updatePillEventListeners('#filter-game-type');
  }

  // --- Acquisition Method ---
  const acquisitionContainer = document.getElementById('filter-acquisition');
  const acquisitionSortSelect = document.getElementById('filter-acquisition-sort-select');
  if (acquisitionContainer && acquisitionSortSelect) {
    const acquisitionCounts = {};
    const acquisitionMethods = new Set();
    state.allGamePlatforms.forEach(gp => {
      if (gp.acquisition_method) {
        acquisitionMethods.add(gp.acquisition_method);
        acquisitionCounts[gp.acquisition_method] = (acquisitionCounts[gp.acquisition_method] || 0) + 1;
      }
    });

    const renderAcquisitionMethods = () => {
      acquisitionContainer.innerHTML = '';
      let sortedMethods = Array.from(acquisitionMethods);
      const sortMethod = acquisitionSortSelect.value;

      sortedMethods.sort((a, b) => {
        const countA = acquisitionCounts[a] || 0;
        const countB = acquisitionCounts[b] || 0;
        switch (sortMethod) {
          case 'name_desc': return b.localeCompare(a);
          case 'count_asc': return countA - countB;
          case 'count_desc': return countB - countA;
          case 'name_asc':
          default: return a.localeCompare(b);
        }
      });

      sortedMethods.forEach(method => {
        const count = acquisitionCounts[method] || 0;
        const inputId = `filter-acq-${method.replace(/[^a-zA-Z0-9]/g, '')}`;
        const isChecked = state.currentFilters.acquisitionMethods.includes(method);
        acquisitionContainer.innerHTML += `
          <input type="checkbox" value="${method}" id="${inputId}" ${isChecked ? 'checked' : ''}>
          <label for="${inputId}">
            <span class="pill-box">${isChecked ? '✓' : ''}</span> ${method} <span class="pill-count">(${count})</span>
          </label>
        `;
      });
      updatePillEventListeners('#filter-acquisition');
    };

    acquisitionSortSelect.removeEventListener('change', renderAcquisitionMethods);
    acquisitionSortSelect.addEventListener('change', renderAcquisitionMethods);
    renderAcquisitionMethods();
  }

  // --- Helper to wire up pill checkmark logic ---
  function updatePillEventListeners(containerSelector) {
    document.querySelectorAll(`${containerSelector} input[type="checkbox"]`).forEach(checkbox => {
      // This is a bit inefficient as it re-adds listeners, but it's simple and effective for now.
      // A more robust solution would use event delegation.
      checkbox.addEventListener('change', (e) => {
        const box = e.target.nextElementSibling.querySelector('.pill-box');
        if (box) box.textContent = e.target.checked ? '✓' : '';
      });
    });
  }

  // --- Populate other filter fields ---
  const keywordInput = document.getElementById('filter-keyword');
  if (keywordInput) keywordInput.value = state.currentFilters.keyword;

  const modeAnd = document.querySelector('input[name="platform_mode"][value="and"]');
  const modeOr = document.querySelector('input[name="platform_mode"][value="or"]');
  if (modeAnd && modeOr) {
    if (typeof state.currentFilters.platformAnd !== 'undefined') {
      state.currentFilters.platformAnd ? (modeAnd.checked = true) : (modeOr.checked = true);
    } else {
      state.platformFilterAnd ? (modeAnd.checked = true) : (modeOr.checked = true);
    }
  }
}

export async function populateAddToPlatformForm() {
  // Use existing state if available, otherwise fetch.
  let platforms = state.allPlatforms;
  if (platforms.length === 0) {
    const data = await fetchPlatformsFromApi();
    if (data) state.allPlatforms = data.platforms || [];
  }
  if (platforms.length === 0) return;
  // --- Platform Pills ---
  const platformGroup = document.getElementById('platform-radio-group');
  const sortSelect = document.getElementById('platform-sort-select');
  if (!platformGroup || !sortSelect) return;

  // Calculate game counts for each platform
  const gameCounts = state.allGamePlatforms.reduce((acc, gp) => {
    acc[gp.platform_id] = (acc[gp.platform_id] || 0) + 1;
    return acc;
  }, {});

  const renderPlatforms = () => {
    platformGroup.innerHTML = '';
    let sortedPlatforms = [...platforms];
    const sortMethod = sortSelect.value;

    sortedPlatforms.sort((a, b) => {
      const countA = gameCounts[a.id] || 0;
      const countB = gameCounts[b.id] || 0;
      switch (sortMethod) {
        case 'name_desc': return normalizeName(b.name).localeCompare(normalizeName(a.name));
        case 'count_asc': return countA - countB;
        case 'count_desc': return countB - countA;
        case 'name_asc':
        default: return normalizeName(a.name).localeCompare(normalizeName(b.name));
      }
    });

    sortedPlatforms.forEach((p, idx) => {
      const count = gameCounts[p.id] || 0;
      const inputId = `plat-radio-${p.id}`;
      const pill = document.createElement('div');
      pill.innerHTML = `
        <input type="radio" name="platform_id" value="${p.id}" id="${inputId}" required ${idx === 0 ? 'checked' : ''}>
        <label for="${inputId}">
          <span class="pill-box">${idx === 0 ? '✓' : ''}</span>
          ${p.name}
          <span class="pill-count">(${count})</span>
        </label>
      `;
      platformGroup.appendChild(pill.firstElementChild);
      platformGroup.appendChild(pill.lastElementChild);
    });

    // Add event listeners after rendering
    platformGroup.querySelectorAll('input[type="radio"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        // Update checkmark visuals
        platformGroup.querySelectorAll('.pill-box').forEach(box => box.textContent = '');
        e.target.nextElementSibling.querySelector('.pill-box').textContent = '✓';
        // Update format options
        const selectedPlatform = sortedPlatforms.find(p => p.id === e.target.value);
        if (selectedPlatform) updateFormatOptions(selectedPlatform);
      });
    });

    if (sortedPlatforms.length > 0) updateFormatOptions(sortedPlatforms[0]);
  };

  sortSelect.removeEventListener('change', renderPlatforms); // Avoid duplicate listeners
  sortSelect.addEventListener('change', renderPlatforms);
  renderPlatforms();

  // --- Acquisition Method Pills ---
  const acqGroup = document.getElementById('acquisition-method-group');
  if (acqGroup) {
    acqGroup.innerHTML = '';
    const methods = [
      { value: 'bought', emoji: '💰', text: 'Bought' },
      { value: 'free', emoji: '🆓', text: 'Free' },
      { value: 'bundle', emoji: '🎁', text: 'Bundle' },
      { value: 'gift', emoji: '💝', text: 'Gift' },
      { value: 'subscription', emoji: '🔄', text: 'Sub' }
    ];
    methods.forEach((m, idx) => {
      const inputId = `acq-radio-${m.value}`;
      acqGroup.innerHTML += `
        <input type="radio" name="acquisition_method" value="${m.value}" id="${inputId}" ${idx === 0 ? 'checked' : ''}>
        <label for="${inputId}">${m.emoji} ${m.text}</label>
      `;
    });
  }
}

export function updateFormatOptions(platform) {
  const formatGroup = document.getElementById('format-checkbox-group');
  if (!formatGroup) return;
  formatGroup.innerHTML = '';

  if (platform.supports_digital && platform.supports_physical) {
    const digitalLabel = document.createElement('label');
    const digitalInput = document.createElement('input');
    digitalInput.type = 'checkbox';
    digitalInput.name = 'format';
    digitalInput.value = 'digital';
    digitalInput.checked = true;
    digitalInput.id = 'format-digital';
    digitalLabel.htmlFor = 'format-digital';
    digitalLabel.textContent = '📱 Digital';
    formatGroup.append(digitalInput, digitalLabel);

    const physicalLabel = document.createElement('label');
    const physicalInput = document.createElement('input');
    physicalInput.type = 'checkbox';
    physicalInput.name = 'format';
    physicalInput.value = 'physical';
    physicalInput.id = 'format-physical';
    physicalLabel.htmlFor = 'format-physical';
    physicalLabel.textContent = '💿 Physical';
    formatGroup.append(physicalInput, physicalLabel);
  } else if (platform.supports_digital) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'format';
    input.value = 'digital';
    input.checked = true;
    // input.disabled = true; // Don't disable, just make it non-interactive via CSS
    input.id = 'format-digital-only';
    label.htmlFor = 'format-digital-only';
    label.textContent = '📱 Digital';
    label.classList.add('pill-forced');
    formatGroup.append(input, label);
  } else if (platform.supports_physical) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'format';
    input.value = 'physical';
    input.checked = true;
    // input.disabled = true; // Don't disable, just make it non-interactive via CSS
    input.id = 'format-physical-only';
    label.htmlFor = 'format-physical-only';
    label.textContent = '💿 Physical';
    label.classList.add('pill-forced');
    formatGroup.append(input, label);
  }
}

export async function populateGamePlatformsList(gameId) {
  const listEl = document.getElementById('game-platforms-list');
  if (!gameId) {
    listEl.innerHTML = '<li class="muted">Save the game to associate platforms.</li>';
    return;
  }
  // Ensure we have the latest links
  const data = await fetchGamePlatformsFromApi();
  if (data) {
    state.allGamePlatforms = data.game_platforms || [];
  }
  const links = state.allGamePlatforms.filter(gp => String(gp.game_id) === String(gameId));
  listEl.innerHTML = '';
  if (links.length === 0) {
    listEl.innerHTML = '<li class="muted">No platforms associated yet.</li>';
  } else {
    links.forEach(link => {
      const platform = state.allPlatforms.find(p => p.id === link.platform_id);
      const li = document.createElement('li');
      const format = link.is_digital ? '📱' : '💿';
      li.innerHTML = `<span>${format} ${platform?.name || 'Unknown'}</span><span class="remove-item" data-id="${link.id}" title="Remove association">&times;</span>`;
      listEl.appendChild(li);
    });
  }
}

/**
 * Shows the game modal for editing a single game.
 * @param {string} gameId - The ID of the game to edit.
 * @param {boolean} [doOpen=true] - Whether to open the modal after populating.
 * @param {boolean} [isBulkEdit=false] - If true, sets up the modal for bulk editing.
 */
export async function showEditGameModal(gameId, doOpen = true, isBulkEdit = false) {
  let game;
  if (!isBulkEdit) {
    game = state.allGames.find(g => String(g.id) === String(gameId));
    if (!game) {
      alert('Game not found!');
      return;
    }
  } else {
    // For bulk edit, we don't need a specific game, just the context.
    game = {}; // Use an empty object
  }

  const formGame = document.getElementById('form-game');
  const modalGame = document.getElementById('modal-game');

  formGame.reset();
  // Set button text for "Edit" mode
  formGame.querySelector('button[type="submit"]').textContent = 'Save & Close';
  formGame.dataset.gameId = isBulkEdit ? '' : gameId;
  document.getElementById('modal-game-title').textContent = isBulkEdit ? 'Bulk Edit Games' : 'Edit Game';
  formGame.querySelector('input[name="name"]').value = game.name || '';
  formGame.querySelector('textarea[name="description"]').value = game.description || '';
  formGame.querySelector('input[name="release_year"]').value = game.release_year || '';
  formGame.querySelector('input[name="cover_image_url"]').value = game.cover_image_url || '';
  formGame.querySelector('input[name="trailer_url"]').value = game.trailer_url || '';
  formGame.querySelector('input[name="tags"]').value = (game.tags || []).join(', ');

  // --- Cleanup placeholders from bulk edit mode ---
  if (!isBulkEdit) {
    const fieldsToClean = ['description', 'release_year', 'cover_image_url', 'trailer_url', 'tags'];
    fieldsToClean.forEach(field => {
      const input = formGame.querySelector(`[name="${field}"]`);
      if (input) input.placeholder = input.getAttribute('data-original-placeholder') || '';
    });
  }

  const gameType = game.is_derived_work ? 'derived' : (game.is_sequel ? 'sequel' : 'original');
  formGame.querySelector(`input[name="game_type"][value="${gameType}"]`).checked = true;
  const linkSection = document.getElementById('link-game-section');
  linkSection.style.display = gameType !== 'original' ? 'block' : 'none';
  if (game.related_game_id) {
    formGame.querySelector('input[name="related_game_id"]').value = game.related_game_id;
  }

  // Show and populate the new platforms section
  document.getElementById('game-platforms-section').style.display = 'block';
  await populateGamePlatformsList(gameId);
  // Show clone/delete button group for "Edit" mode
  const actionButtons = formGame.querySelector('.btn-clone').parentElement;
  actionButtons.style.display = isBulkEdit ? 'none' : 'flex';
  // Hide/show elements based on mode
  formGame.querySelector('.inline-radios').style.display = isBulkEdit ? 'none' : 'flex';
  document.getElementById('bulk-edit-specific-fields').style.display = isBulkEdit ? 'block' : 'none';
  document.getElementById('game-platforms-section').style.display = isBulkEdit ? 'none' : 'block';

  // Hide the entire "Game Title" container in bulk edit mode
  const nameInputContainer = formGame.querySelector('input[name="name"]').parentElement.parentElement;
  nameInputContainer.style.display = isBulkEdit ? 'none' : 'block';
  formGame.querySelector('input[name="name"]').disabled = isBulkEdit;

  // Add checkboxes for bulk edit mode
  formGame.querySelectorAll('label').forEach(label => {
    const input = label.querySelector('input[type="text"], input[type="number"], textarea, input[type="radio"]');
    if (input && input.name !== 'name') { // Exclude game title
      const existingCheckbox = label.querySelector('.bulk-edit-enabler');
      if (existingCheckbox) existingCheckbox.remove();

      if (isBulkEdit) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'bulk-edit-enabler';
        checkbox.dataset.enables = input.name;
        label.classList.add('bulk-edit-field');

        // Wrap the label's text node in a span for easier styling
        Array.from(label.childNodes).forEach(node => {
          if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
            const span = document.createElement('span');
            span.textContent = node.textContent;
            label.replaceChild(span, node);
          }
        });
        label.prepend(checkbox);
        input.disabled = true;

        checkbox.addEventListener('change', (e) => {
          if (input) input.disabled = !e.target.checked;
        });
      } else {
        // Cleanup for non-bulk mode
        if (existingCheckbox) existingCheckbox.remove();
        label.classList.remove('bulk-edit-field');
        if (input) input.disabled = false;
      }
    }
  });

  if (doOpen) openModal(modalGame);
}

export async function showBulkEditGameModal() {
  const selectedIds = state.selection.selectedGameIds;
  if (selectedIds.size === 0) return;

  // We call showEditGameModal with a null gameId and the bulk edit flag.
  await showEditGameModal(null, true, true);

  const formGame = document.getElementById('form-game');
  const submitBtn = formGame.querySelector('button[type="submit"]');
  document.getElementById('modal-game-title').textContent = `Bulk Edit Game Data (${selectedIds.size})`;
  submitBtn.textContent = `Update ${selectedIds.size} Game(s)`;

  // --- Create and inject bulk-edit specific fields ---
  const specificFieldsContainer = document.getElementById('bulk-edit-specific-fields');
  specificFieldsContainer.innerHTML = `
    <div class="bulk-edit-field">
      <input type="checkbox" class="bulk-edit-enabler" data-enables="is_derived_work">
      <span>Is Remake/Remaster</span>
      <div class="inline-radios" data-radio-group="is_derived_work">
        <label><input type="radio" name="is_derived_work" value="true" disabled> Yes</label>
        <label><input type="radio" name="is_derived_work" value="false" disabled> No</label>
      </div>
    </div>
    <div class="bulk-edit-field">
      <input type="checkbox" class="bulk-edit-enabler" data-enables="is_sequel">
      <span>Is Sequel</span>
      <div class="inline-radios" data-radio-group="is_sequel">
        <label><input type="radio" name="is_sequel" value="true" disabled> Yes</label>
        <label><input type="radio" name="is_sequel" value="false" disabled> No</label>
      </div>
    </div>
  `;
  // Wire up the new fields
  specificFieldsContainer.querySelectorAll('.bulk-edit-enabler').forEach(enabler => {
    enabler.addEventListener('change', (e) => {
      const fieldName = e.target.dataset.enables;
      specificFieldsContainer.querySelectorAll(`input[name="${fieldName}"]`).forEach(radio => radio.disabled = !e.target.checked);
    });
  });
  
  // Set placeholder text for fields
  const games = Array.from(selectedIds).map(id => state.allGames.find(g => String(g.id) === id));
  const fields = ['description', 'release_year', 'cover_image_url', 'trailer_url', 'tags'];

  fields.forEach(field => {
    const input = formGame.querySelector(`[name="${field}"]`);
    const firstValue = games[0]?.[field];
    const allSame = games.every(g => JSON.stringify(g[field]) === JSON.stringify(firstValue));

    if (!allSame) {
      input.placeholder = 'Multiple values - will be overwritten.';
    } else {
      // Store original placeholder before overwriting, if it's not already stored
      if (!input.hasAttribute('data-original-placeholder')) {
        input.setAttribute('data-original-placeholder', input.placeholder);
      }
    }
  });
}


export function showEditPlatformModal(platformId, doOpen = true) {
  const platform = state.allPlatforms.find(p => p.id === platformId);
  if (!platform) {
    alert('Platform not found!');
    return;
  }
  const formPlatform = document.getElementById('form-platform');
  const modalPlatform = document.getElementById('modal-platform');

  formPlatform.reset();
  formPlatform.dataset.platformId = platformId;
  formPlatform.querySelector('button[type="submit"]').textContent = 'Save';
  document.getElementById('modal-platform-title').textContent = 'Edit Platform';
  formPlatform.querySelector('input[name="name"]').value = platform.name || '';
  formPlatform.querySelector('textarea[name="description"]').value = platform.description || '';
  formPlatform.querySelector('input[name="icon_url"]').value = platform.icon_url || '';
  formPlatform.querySelector('input[name="image_url"]').value = platform.image_url || '';
  formPlatform.querySelector('input[name="year_acquired"]').value = platform.year_acquired || '';
  formPlatform.querySelector('input[name="supports_digital"]').checked = !!platform.supports_digital;
  formPlatform.querySelector('input[name="supports_physical"]').checked = !!platform.supports_physical;

  // Show clone/delete buttons for "Edit" mode
  formPlatform.querySelector('.btn-clone').style.display = 'inline-block';
  formPlatform.querySelector('.btn-delete').style.display = 'inline-block';

  if (doOpen) {
    openModal(modalPlatform);
  }
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

export function clearAutocomplete(container = null) {
  const targetContainer = container || document.getElementById('autocomplete-results');
  if (targetContainer) {
    targetContainer.innerHTML = '';
    targetContainer.style.display = 'none';
  }
}


// --- CSV import modal helpers ---
import { postCsvPreview, postCsvImport, igdbSearch, fetchSchema } from './api.js';

function mkSelectForHeader(header, selected, platforms, gameColumns) {
  const fields = ['', ...gameColumns, 'acquisition_hint'];
  const wrap = document.createElement('div');
  wrap.className = 'csv-mapping-row';
  const label = document.createElement('label');
  label.textContent = header;
  const sel = document.createElement('select');
  sel.dataset.header = header;
  
  // Add standard fields
  fields.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f === '' ? '(ignore)' : f;
    if (f === selected) opt.selected = true;
    sel.appendChild(opt);
  });
  
  // Add existing platforms
  if (platforms && Array.isArray(platforms) && platforms.length > 0) {
    const platformGroup = document.createElement('optgroup');
    platformGroup.label = 'Existing Platforms';
    platforms.forEach(p => {
      const opt = document.createElement('option');
      opt.value = `platform:${p.id}`;
      opt.textContent = `📱 ${p.name}`;
      if (selected === `platform:${p.id}`) opt.selected = true;
      platformGroup.appendChild(opt);
    });
    sel.appendChild(platformGroup);
  }
  
  // Add "Create new platform" option
  const newPlatGroup = document.createElement('optgroup');
  newPlatGroup.label = 'Create New Platform';
  const newOpt = document.createElement('option');
  newOpt.value = `platform:NEW:${header}`;
  newOpt.textContent = `➕ Create: ${header}`;
  if (selected === `platform:NEW:${header}`) newOpt.selected = true;
  newPlatGroup.appendChild(newOpt);
  sel.appendChild(newPlatGroup);
  
  wrap.appendChild(label);
  wrap.appendChild(sel);
  return wrap;
}

export async function initImportModal() {
  const fileInput = document.getElementById('csv-file-input');
  const textarea = document.getElementById('csv-textarea');
  const mappingDiv = document.getElementById('csv-mapping');
  const previewTable = document.getElementById('csv-preview-table');
  const btnRun = document.getElementById('btn-run-import');
  const policy = document.getElementById('import-duplicate-policy');

  // Fetch the game schema to dynamically populate the mapping dropdown
  let gameColumns = [];
  try {
    const schemaData = await fetchSchema();
    gameColumns = schemaData?.game_columns || [];
  } catch (e) {
    console.warn('Failed to fetch game schema for import modal', e);
  }
  // Fetch platforms once for the mapping UI
  let platforms = [];
  try {
    const platformData = await fetchPlatformsFromApi();
    platforms = platformData?.platforms || [];
    console.log('Import modal: loaded platforms', platforms);
  } catch (e) {
    console.warn('Failed to fetch platforms for import modal', e);
  }

  async function doPreview(csvText) {
    const result = await postCsvPreview(csvText);
    if (!result) return;
    // populate mapping UI
    mappingDiv.innerHTML = '';
    for (const h of result.headers) {
      const selRow = mkSelectForHeader(h, result.mapping[h] || '', platforms, gameColumns);
      mappingDiv.appendChild(selRow);
    }
    // render preview rows as a simple table
    previewTable.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'csv-preview-table';
    const headerRow = document.createElement('tr');
    result.headers.forEach(h => { const th = document.createElement('th'); th.textContent = h; headerRow.appendChild(th); });
    table.appendChild(headerRow);
    (result.preview || []).forEach(r => {
      const tr = document.createElement('tr');
      result.headers.forEach((h, i) => { const td = document.createElement('td'); td.textContent = r[i] || ''; tr.appendChild(td); });
      table.appendChild(tr);
    });
    previewTable.appendChild(table);
  }

  fileInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      textarea.value = ev.target.result;
      doPreview(textarea.value);
    };
    reader.readAsText(f);
  });

  textarea.addEventListener('input', (e) => {
    // debounce
    if (textarea._t) clearTimeout(textarea._t);
    textarea._t = setTimeout(() => doPreview(textarea.value), 300);
  });

  btnRun.addEventListener('click', async () => {
    const csvText = textarea.value;
    if (!csvText || !csvText.trim()) { alert('Please paste or upload a CSV first'); return; }
    // build mapping object
    const mapping = {};
    mappingDiv.querySelectorAll('select').forEach(sel => { mapping[sel.dataset.header] = sel.value; });
    const options = { on_duplicate: policy.value === 'create_new' ? 'create_new' : policy.value };
    const res = await postCsvImport(csvText, mapping, options);
    if (!res) { alert('Import failed (network)'); return; }
    let message = `Created games: ${res.created_games}\nCreated links: ${res.created_links}`;
    if (res.errors && res.errors.length) message += '\nErrors: ' + JSON.stringify(res.errors.slice(0,3));
    alert(message);
    // close modal if available
    const modal = document.getElementById('modal-import');
    if (modal) {
      modal.setAttribute('aria-hidden', 'true');
      modal.style.display = 'none';
    }
    // attempt to refresh platforms/games in the app by dispatching a custom event
    window.dispatchEvent(new CustomEvent('vgd:import_complete'));
  });
}
