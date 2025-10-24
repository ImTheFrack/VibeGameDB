'use strict';
import { state, clearAllFilters } from './state.js';
import { normalizeName } from './utils.js';
import { fetchPlatforms as fetchPlatformsFromApi, fetchGamePlatforms as fetchGamePlatformsFromApi, fetchAutocomplete, fetchFromIgdb } from './api.js';
import { renderAutocomplete } from './render.js';

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
  // Immediately blur the active element to prevent focus from being trapped in a hidden modal.
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }

  modal.setAttribute('aria-hidden', 'true');
  modal.style.display = 'none';

  // Dispatch a custom 'close' event so other parts of the app can react.
  modal.dispatchEvent(new CustomEvent('close'));

  // Now, return focus to the appropriate element.
  if (focusReturnEl && focusReturnEl instanceof HTMLElement) {
    focusReturnEl.focus();
    focusReturnEl.removeAttribute('data-opens-modal');
  } else {
    document.body.focus(); // Fallback focus to the body
  }
}

/**
 * Shows a generic progress modal for long-running tasks.
 * @param {string} title - The title to display in the modal header.
 */
export function showProgressModal(title) {
  const modal = document.getElementById('modal-progress');
  if (!modal) return;
  document.getElementById('progress-title').textContent = title;
  // Reset progress state
  updateProgress(0, 1);
  document.getElementById('progress-details').innerHTML = '';
  openModal(modal);
}

/**
 * Updates the state of the progress modal.
 * @param {number} current - The number of items processed.
 * @param {number} total - The total number of items.
 * @param {Object.<string, number>} [details={}] - Key-value pairs for additional status text (e.g., { Failures: 5, Skipped: 2 }).
 */
export function updateProgress(current, total, details = {}) {
  const bar = document.getElementById('progress-bar');
  const countEl = document.getElementById('progress-count');
  const detailsEl = document.getElementById('progress-details');

  if (bar) bar.style.width = total > 0 ? `${(current / total) * 100}%` : '0%';
  if (countEl) countEl.textContent = `${current} / ${total}`;

  if (detailsEl) {
    const detailParts = Object.entries(details).map(([key, value]) => `${key}: ${value}`);
    detailsEl.innerHTML = detailParts.join(' &nbsp;•&nbsp; ');
  }
}

/**
 * Wires up the checkmark logic for pill-style checkboxes in a given container.
 * @param {string} containerSelector - The CSS selector for the container.
 */
function updatePillEventListeners(containerSelector) {
  // Use event delegation to be more efficient
  document.querySelectorAll(`${containerSelector} input[type="checkbox"]`).forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const box = e.target.nextElementSibling.querySelector('.pill-box');
      if (box) box.textContent = e.target.checked ? '✓' : '';
    });
  });
}

/**
 * Generic helper to populate, sort, and wire up a pill-based filter section.
 * @param {object} config - Configuration for the filter section.
 * @param {string} config.containerId - The ID of the pill container element.
 * @param {string} config.sortSelectId - The ID of the sort dropdown element.
 * @param {string} config.filterKey - The key in `state.currentFilters` (e.g., 'platforms', 'tags').
 * @param {function(): Array<{id: string, name: string, count: number}>} config.dataExtractor - A function that returns the data to be rendered.
 * @param {string} [config.idPrefix='filter'] - A prefix for the generated checkbox IDs.
 */
function setupPillFilter(config) {
  const { containerId, sortSelectId, filterKey, dataExtractor, idPrefix = 'filter' } = config;
  const container = document.getElementById(containerId);
  const sortSelect = document.getElementById(sortSelectId);

  if (!container || !sortSelect) return;

  const allItems = dataExtractor();

  const renderPills = () => {
    container.innerHTML = '';
    let sortedItems = [...allItems];
    const sortMethod = sortSelect.value;

    sortedItems.sort((a, b) => {
      switch (sortMethod) {
        case 'name_desc': return normalizeName(b.name).localeCompare(normalizeName(a.name));
        case 'count_asc': return a.count - b.count;
        case 'count_desc': return b.count - a.count;
        case 'manufacturer_asc':
          // Sort by manufacturer, then by name
          const manuA = a.manufacturer || 'zzz'; // Put items without a manufacturer last
          const manuB = b.manufacturer || 'zzz';
          return manuA.localeCompare(manuB) || normalizeName(a.name).localeCompare(normalizeName(b.name));
        case 'year_acquired_desc': return (b.year_acquired || 0) - (a.year_acquired || 0);
        case 'generation_desc': return (b.generation || 0) - (a.generation || 0);
        case 'name_asc':
        default: return normalizeName(a.name).localeCompare(normalizeName(b.name));
      }
    });

    sortedItems.forEach(item => {
      const inputId = `${idPrefix}-${filterKey}-${item.id.replace(/[^a-zA-Z0-9]/g, '')}`;
      const isChecked = state.currentFilters[filterKey]?.includes(String(item.id));
      container.innerHTML += `
        <input type="checkbox" value="${item.id}" id="${inputId}" ${isChecked ? 'checked' : ''}>
        <label for="${inputId}">
          <span class="pill-box">${isChecked ? '✓' : ''}</span> ${item.name} <span class="pill-count">(${item.count})</span>
        </label>
      `;
    });
    updatePillEventListeners(`#${containerId}`);
  };

  sortSelect.removeEventListener('change', renderPills);
  sortSelect.addEventListener('change', renderPills);
  renderPills();
}


export async function populateFilterModal() {
  // --- Platforms ---
  setupPillFilter({
    containerId: 'filter-platforms',
    sortSelectId: 'filter-platform-sort-select',
    filterKey: 'platforms',
    idPrefix: 'plat',
    dataExtractor: () => {
      const platformCounts = state.allGamePlatforms.reduce((acc, gp) => {
        acc[gp.platform_id] = (acc[gp.platform_id] || 0) + 1;
        return acc;
      }, {});
      return state.allPlatforms.map(p => ({ ...p, count: platformCounts[p.id] || 0 }));
    }
  });

  // --- Tags ---
  setupPillFilter({
    containerId: 'filter-tags',
    sortSelectId: 'filter-tag-sort-select',
    filterKey: 'tags',
    idPrefix: 'tag',
    dataExtractor: () => {
      const tagCounts = {};
      state.allGames.forEach(game => {
        if (game.tags && Array.isArray(game.tags)) {
          game.tags.forEach(tag => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        }
      });
      return state.allTags.map(tag => ({ id: tag, name: tag, count: tagCounts[tag] || 0 }));
    }
  });

  // --- Acquisition Method ---
  setupPillFilter({
    containerId: 'filter-acquisition',
    sortSelectId: 'filter-acquisition-sort-select',
    filterKey: 'acquisitionMethods',
    idPrefix: 'acq',
    dataExtractor: () => {
      const acquisitionCounts = {};
      const acquisitionMethods = new Set();
      state.allGamePlatforms.forEach(gp => {
        if (gp.acquisition_method) {
          acquisitionMethods.add(gp.acquisition_method);
          acquisitionCounts[gp.acquisition_method] = (acquisitionCounts[gp.acquisition_method] || 0) + 1;
        }
      });
      return Array.from(acquisitionMethods).map(method => ({ id: method, name: method, count: acquisitionCounts[method] || 0 }));
    }
  });

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

  // --- Manufacturer ---
  const manufacturerContainer = document.getElementById('filter-manufacturer');
  if (manufacturerContainer) {
    const platformCounts = state.allGamePlatforms.reduce((acc, gp) => {
      acc[gp.platform_id] = (acc[gp.platform_id] || 0) + 1;
      return acc;
    }, {});
    const manufacturers = new Set();
    state.allPlatforms.forEach(p => {
      if (p.manufacturer) manufacturers.add(p.manufacturer);
    });

    manufacturerContainer.innerHTML = '';
    const sortedManufacturers = Array.from(manufacturers).sort((a, b) => a.localeCompare(b));
    // Note: Manufacturer doesn't have a count or sort select in this implementation
    sortedManufacturers.forEach(m => {
      const inputId = `filter-manu-${m.replace(/[^a-zA-Z0-9]/g, '')}`;
      const isChecked = state.currentFilters.manufacturers.includes(m);
      manufacturerContainer.innerHTML += `
        <input type="checkbox" value="${m}" id="${inputId}" ${isChecked ? 'checked' : ''}>
        <label for="${inputId}">
          <span class="pill-box">${isChecked ? '✓' : ''}</span> ${m}
        </label>
      `;
    });
    updatePillEventListeners('#filter-manufacturer');
  }

  /**
   * Helper function to populate a pill-group container for a given game property.
   * @param {string} property - The game property key (e.g., 'genre', 'developer').
   * @param {string} containerId - The ID of the pill container element.
   * @param {string} filterKey - The key in state.currentFilters (e.g., 'genres', 'developers').
   * @param {string} prefix - A prefix for the input ID (e.g., 'genre').
   */
  function populatePillFilterFromProperty(property, containerId, filterKey, prefix) {
    const container = document.getElementById(containerId);
    const sortSelect = document.querySelector(`.filter-sort-select[data-target="${containerId}"]`);

    if (!container) return;

    // If there's a sort select, use the generic helper. Otherwise, do a simple render.
    if (sortSelect) {
      setupPillFilter({
        containerId: containerId,
        sortSelectId: sortSelect.id, // We need an ID for the helper
        filterKey: filterKey,
        idPrefix: prefix,
        dataExtractor: () => {
          const valueCounts = {};
          const allValues = new Set();
          state.allGames.forEach(g => {
            if (g[property]) {
              g[property].split(',').map(val => val.trim()).filter(Boolean).forEach(val => {
                allValues.add(val);
                valueCounts[val] = (valueCounts[val] || 0) + 1;
              });
            }
          });
          return Array.from(allValues).map(val => ({ id: val, name: val, count: valueCounts[val] || 0 }));
        }
      });
    }
  }

  // --- Populate all the new text-based filters ---
  // Assign unique IDs to the new sort selects so the helper can find them
  document.querySelectorAll('.filter-sort-select').forEach((sel, i) => {
    if (!sel.id) sel.id = `filter-sort-select-${i}`;
  });

  populatePillFilterFromProperty('genre', 'filter-genre', 'genres', 'genre');
  populatePillFilterFromProperty('developer', 'filter-developer', 'developers', 'dev');
  populatePillFilterFromProperty('publisher', 'filter-publisher', 'publishers', 'pub');

  // These filters don't have sorting, so we render them manually.
  const renderSimplePillFilter = (property, containerId, filterKey, prefix) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const values = new Set(state.allGames.flatMap(g => g[property] ? g[property].split(',').map(v => v.trim()) : []).filter(Boolean));
    container.innerHTML = '';
    Array.from(values).sort().forEach(val => {
      const inputId = `filter-${prefix}-${val.replace(/[^a-zA-Z0-9]/g, '')}`;
      const isChecked = state.currentFilters[filterKey]?.includes(val);
      container.innerHTML += `
        <input type="checkbox" value="${val}" id="${inputId}" ${isChecked ? 'checked' : ''}>
        <label for="${inputId}">
          <span class="pill-box">${isChecked ? '✓' : ''}</span> ${val}
        </label>
      `;
    });
    updatePillEventListeners(`#${containerId}`);
  };

  renderSimplePillFilter('esrb_rating', 'filter-esrb', 'esrbRatings', 'esrb');
  renderSimplePillFilter('target_audience', 'filter-audience', 'targetAudiences', 'audience');

  // --- Populate other filter fields (keyword, year) ---
  const keywordInput = document.getElementById('filter-keyword');
  if (keywordInput) keywordInput.value = state.currentFilters.keyword;

  // Initialize autocomplete for the filter modal's keyword input
  const filterAutocompleteResults = document.getElementById('filter-autocomplete-results');
  if (keywordInput && filterAutocompleteResults) {
    initAutocomplete(keywordInput, filterAutocompleteResults, {
      onSelect: (item) => {
        keywordInput.value = item.dataset.name;
        clearAutocomplete(filterAutocompleteResults);
      },
      // No onEnter, as enter should submit the filter form.
      footerText: 'Select a suggestion or press Enter to filter.'
    });
  }

  const modeAnd = document.querySelector('input[name="platform_mode"][value="and"]');
  const modeOr = document.querySelector('input[name="platform_mode"][value="or"]');
  if (modeAnd && modeOr) {
    if (typeof state.currentFilters.platformAnd !== 'undefined') {
      state.currentFilters.platformAnd ? (modeAnd.checked = true) : (modeOr.checked = true);
    } else {
      state.platformFilterAnd ? (modeAnd.checked = true) : (modeOr.checked = true);
    }
  }
  const yearMinInput = document.getElementById('filter-year-min');
  const yearMaxInput = document.getElementById('filter-year-max');
  if (yearMinInput) yearMinInput.value = state.currentFilters.releaseYearMin || '';
  if (yearMaxInput) yearMaxInput.value = state.currentFilters.releaseYearMax || '';
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

/**
 * Shows a modal for resolving bulk IGDB pulls that resulted in multiple matches.
 * @param {Array<Object>} multiMatchResults - An array of objects, each containing { gameId, localName, choices }. For single-game mode, this array will contain one item.
 * @param {function(string|null, boolean):void} [onComplete] - Callback when a selection is made (single mode) or modal closes (bulk mode).
 */
export function showBulkMatchModal(multiMatchResults, onComplete) {
  const modal = document.getElementById('modal-bulk-match');
  const container = document.getElementById('bulk-match-table-container');
  const btnMatchAll = document.getElementById('btn-match-all-first');
  const modalTitle = modal.querySelector('h2');
  const modalDescription = modal.querySelector('p');
  if (!modal || !container || !btnMatchAll || !modalTitle || !modalDescription) return;

  // Reset the "Match All" button to its initial state on every open.
  btnMatchAll.disabled = false;
  btnMatchAll.textContent = 'Match All with First Choice';

  // Generalize the modal's text and controls based on the number of items.
  if (multiMatchResults.length === 1) {
    modalTitle.textContent = 'Select a Game from IGDB';
    modalDescription.textContent = 'Multiple matches found. Please select the correct game.';
    btnMatchAll.style.display = 'none'; // Hide "Match All" for a single item
  } else {
    modalTitle.textContent = 'Resolve IGDB Matches';
    modalDescription.textContent = 'Some games had multiple potential matches on IGDB. Please select the correct version for each.';
    btnMatchAll.style.display = 'inline-block';
  }

  // Build the table
  const table = document.createElement('table');
  table.className = 'bulk-match-table';
  const tbody = document.createElement('tbody');

  let activeOptionsContainer = null; // Keep track of the currently open options popup
  let activeTrigger = null; // Keep track of the trigger for the active options popup
  multiMatchResults.forEach(match => {
    const row = document.createElement('tr');
    if (match.gameId) {
      row.dataset.gameId = match.gameId;
    }

    // Sort choices to prioritize an exact match with the local name
    const sortedChoices = [...match.choices];
    const localNormalized = normalizeName(match.localName);
    const exactMatchIndex = sortedChoices.findIndex(c => normalizeName(c.name) === localNormalized);

    if (exactMatchIndex > 0) {
      // Move the exact match to the front of the array
      const [exact] = sortedChoices.splice(exactMatchIndex, 1);
      sortedChoices.unshift(exact);
    }

    const renderOption = (choice) => {
      const year = choice.first_release_date ? new Date(choice.first_release_date * 1000).getFullYear() : 'N/A';
      const description = choice.summary ? choice.summary.substring(0, 80) + '...' : 'No summary available.';
      return `
        <div class="item-text">
          <div class="item-name">${choice.name} (${year})</div>
          <div class="item-context">${description}</div>
        </div>
      `;
    };

    const optionsHtml = sortedChoices.map(choice => `
      <div class="custom-select-option" data-value="${choice.id}">
        ${renderOption(choice)}
      </div>
    `).join('');

    row.innerHTML = `
      <td>${match.localName}</td>
      <td>
        <div class="custom-select-container" data-selected-value="${sortedChoices[0].id}">
          <div class="custom-select-selected-text" tabindex="0">${renderOption(sortedChoices[0])}</div>
          <div class="custom-select-options">${optionsHtml}</div>
        </div>
      </td>
      <td><button class="btn btn-sm btn-apply-match">Apply</button></td>
    `;
    tbody.appendChild(row);

    // --- New Scoped Event Listener Logic ---
    const trigger = row.querySelector('.custom-select-selected-text');
    const optionsContainer = row.querySelector('.custom-select-options');

    trigger.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent the document click listener from firing

        // If another dropdown is open, close it first
        if (activeOptionsContainer && activeOptionsContainer !== optionsContainer) {
            activeOptionsContainer.style.display = 'none';
            // No need to re-append, it's still a child of its original container
        }

        const isOpening = optionsContainer.style.display !== 'block';
        if (isOpening) {
            document.body.appendChild(optionsContainer);
            const rect = trigger.getBoundingClientRect();
            Object.assign(optionsContainer.style, { left: `${rect.left}px`, top: `${rect.bottom + 2}px`, width: `${rect.width}px` });
            optionsContainer.style.display = 'block';
            activeOptionsContainer = optionsContainer;
            activeTrigger = trigger;
        } else {
            optionsContainer.style.display = 'none';
            activeOptionsContainer = null;
        }
    });
  });

  table.appendChild(tbody);
  container.innerHTML = '';
  container.appendChild(table);

  // Event handler for individual "Apply" buttons
  const applyMatch = async (row) => {
    const gameId = row.dataset.gameId;
    const isSingleMode = !gameId; // In single-edit mode, gameId is not set on the row.
    const selectContainer = row.querySelector('.custom-select-container');
    const igdbId = selectContainer.dataset.selectedValue;

    const applyButton = row.querySelector('.btn-apply-match');
    applyButton.textContent = '...';
    applyButton.disabled = true;

    if (isSingleMode) {
      // In single mode, the onComplete callback handles applying the data.
      if (onComplete) onComplete(igdbId, true); // Pass true for didSelect
      closeModal(modal); // Close immediately after selection.
    } else {
      // In bulk mode, we update the game directly.
      const result = await fetchFromIgdb(null, igdbId);
      if (result && result.game_data) {
        await fetch(`/plugins/database_handler/games/${gameId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result.game_data)
        });
        row.style.opacity = '0.5';
        applyButton.textContent = 'Applied';
      } else {
        applyButton.textContent = 'Error';
      }
    }
  };

  // Simplified global handler for closing dropdowns and handling apply/select actions
  const documentClickHandler = (e) => {
    const clickedOption = e.target.closest('.custom-select-option');
    const clickedApplyBtn = e.target.closest('.btn-apply-match');

    if (clickedOption) {
      // When an option is clicked, the activeTrigger holds the context of which dropdown is open.
      // We find the container relative to that trigger.
      const container = activeTrigger ? activeTrigger.closest('.custom-select-container') : null;
      if (!container || !activeOptionsContainer) return;

      const selectedDisplay = container.querySelector('.custom-select-selected-text');
      container.dataset.selectedValue = clickedOption.dataset.value;
      selectedDisplay.innerHTML = clickedOption.innerHTML;

      // Close the dropdown
      const optionsPopup = clickedOption.parentElement; // The .custom-select-options div
      optionsPopup.style.display = 'none';
      // Re-attach the options popup to its original container in the table.
      container.appendChild(optionsPopup);

      activeOptionsContainer = null;
    } else if (clickedApplyBtn) {
      applyMatch(e.target.closest('tr'));
    } else if (activeOptionsContainer && !e.target.closest('.custom-select-options')) {
      // Click was outside of any open dropdown, so close it.
      activeOptionsContainer.style.display = 'none';
      activeOptionsContainer = null;
    }
  };

  // Attach the listener to the document. We'll remove it when the modal closes.
  document.addEventListener('click', documentClickHandler);
  modal.addEventListener('close', () => {
    document.removeEventListener('click', documentClickHandler);
    // Explicitly find and remove any orphaned dropdown from the body on modal close.
    const openOptions = document.body.querySelector('.custom-select-options');
    if (openOptions) {
        // The simplest, most reliable cleanup is to just remove it from the DOM.
        openOptions.remove();
    }
    // Always call onComplete on close, passing null for selectedIgdbId and false for didSelect.
    if (onComplete) onComplete(null, false);
  }, { once: true });

  // Event handler for "Match All with First"
  const matchAllHandler = async () => {
    btnMatchAll.disabled = true;
    btnMatchAll.textContent = 'Applying...';
    for (const row of tbody.querySelectorAll('tr')) {
      await applyMatch(row);
    }
    btnMatchAll.textContent = 'All Applied';
  };
  btnMatchAll.addEventListener('click', matchAllHandler, { once: true });

  openModal(modal);
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
 * Resets the game modal to its default state for adding or editing a single game.
 * This function cleans up any UI modifications left over from bulk edit mode.
 */
export function resetGameModalUI() {
  const formGame = document.getElementById('form-game');

  // Remove ALL bulk-edit enabler checkboxes from labels and re-enable fields.
  formGame.querySelectorAll('label').forEach(label => {
    // Use querySelectorAll to find and remove all stacked checkboxes
    label.querySelectorAll('.bulk-edit-enabler').forEach(cb => cb.remove());
    label.classList.remove('bulk-edit-field');

    const input = label.querySelector('input, textarea');
    if (input) {
      input.disabled = false;
    }
  });

  // Also remove enabler checkboxes from radio group containers.
  formGame.querySelectorAll('.inline-checkboxes').forEach(container => {
    container.querySelectorAll('.bulk-edit-enabler').forEach(cb => cb.remove());
    container.classList.remove('bulk-edit-field');
  });

  formGame.querySelectorAll('.inline-radios input[type="radio"]').forEach(radio => {
    radio.disabled = false;
  });

  // Restore original placeholders if they were changed for bulk edit.
  formGame.querySelectorAll('[data-original-placeholder]').forEach(input => {
    input.placeholder = input.getAttribute('data-original-placeholder');
  });
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

  // Always reset the UI to a clean state before populating
  resetGameModalUI();

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
  // New fields
  formGame.querySelector('input[name="igdb_id"]').value = game.igdb_id || '';
  formGame.querySelector('input[name="esrb_rating"]').value = game.esrb_rating || '';
  formGame.querySelector('input[name="genre"]').value = game.genre || '';
  formGame.querySelector('input[name="target_audience"]').value = game.target_audience || '';
  formGame.querySelector('input[name="developer"]').value = game.developer || '';
  formGame.querySelector('input[name="publisher"]').value = game.publisher || '';
  formGame.querySelector('textarea[name="plot_synopsis"]').value = game.plot_synopsis || '';
  formGame.querySelector('textarea[name="notes"]').value = game.notes || '';

  // Set the checkboxes based on game properties
  formGame.querySelector('input[name="is_derived_work"]').checked = !!game.is_derived_work;
  formGame.querySelector('input[name="is_sequel"]').checked = !!game.is_sequel;
  const linkSection = document.getElementById('link-game-section');
  linkSection.style.display = (game.is_derived_work || game.is_sequel) ? 'block' : 'none';
  if (game.related_game_id) {
    formGame.querySelector('input[name="related_game_id"]').value = game.related_game_id;
  }

  // Show and populate the new platforms section
  document.getElementById('game-platforms-section').style.display = 'block';
  await populateGamePlatformsList(gameId);
  // Show clone/delete button group for "Edit" mode
  const actionButtons = formGame.querySelector('.btn-clone').parentElement;
  actionButtons.style.display = isBulkEdit ? 'none' : 'flex'; // This is the clone/delete group
  // Show/hide the IGDB pull controls
  const igdbPullControls = formGame.querySelector('.igdb-pull-controls');
  if (igdbPullControls) {
    igdbPullControls.style.display = isBulkEdit ? 'none' : 'flex';
  }
  document.getElementById('btn-pull-igdb').style.display = isBulkEdit ? 'none' : 'inline-block';
  // Hide/show elements based on mode
  formGame.querySelector('.inline-checkboxes').style.display = 'flex';
  document.getElementById('bulk-edit-specific-fields').style.display = isBulkEdit ? 'block' : 'none';
  document.getElementById('game-platforms-section').style.display = isBulkEdit ? 'none' : 'block';

  // Hide the entire "Game Title" container in bulk edit mode
  const nameInputContainer = formGame.querySelector('input[name="name"]').parentElement.parentElement;
  nameInputContainer.style.display = isBulkEdit ? 'none' : 'block';
  formGame.querySelector('input[name="name"]').disabled = isBulkEdit;

  // Add checkboxes for bulk edit mode
  formGame.querySelectorAll('label').forEach(label => {
    const input = label.querySelector('input[type="text"], input[type="number"], textarea');
    if (input && input.name !== 'name') { // Exclude game title
      if (isBulkEdit) {
        const checkbox = document.createElement('input');
        // Check if a checkbox already exists to prevent stacking (belt-and-suspenders)
        if (label.querySelector('.bulk-edit-enabler')) return;
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
      }
    }
  });

  // Special handling for radio button groups in bulk edit
  if (isBulkEdit) {
    formGame.querySelectorAll('.inline-checkboxes').forEach(cbContainer => {
      const firstCb = cbContainer.querySelector('input[type="checkbox"]');
      if (!firstCb) return;

      const fieldName = 'game_type_group'; // Use a generic identifier for the group
      const labelSpan = cbContainer.querySelector('span');
      if (!labelSpan) return;

      // Check if a checkbox already exists
      if (cbContainer.querySelector('.bulk-edit-enabler')) return;

      const enablerCheckbox = document.createElement('input');
      enablerCheckbox.type = 'checkbox';
      enablerCheckbox.className = 'bulk-edit-enabler';
      enablerCheckbox.dataset.enables = fieldName;
      cbContainer.classList.add('bulk-edit-field');
      cbContainer.prepend(enablerCheckbox);

      const checkboxesInGroup = cbContainer.querySelectorAll(`input[type="checkbox"]:not(.bulk-edit-enabler)`);
      checkboxesInGroup.forEach(cb => cb.disabled = true);
      enablerCheckbox.addEventListener('change', (e) => {
        checkboxesInGroup.forEach(cb => cb.disabled = !e.target.checked);
      });
    });
  }

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
  document.getElementById('bulk-edit-specific-fields').innerHTML = ''; // Clear this now-unused container
  
  // Set placeholder text for fields
  const games = Array.from(selectedIds).map(id => state.allGames.find(g => String(g.id) === id)).filter(Boolean);
  const fields = [
    'description', 'release_year', 'cover_image_url', 'trailer_url', 'tags',
    'genre', 'esrb_rating', 'target_audience', 'developer', 'publisher',
    'plot_synopsis', 'notes', 'igdb_id'
  ];

  fields.forEach(field => {
    const input = formGame.querySelector(`[name="${field}"]`);
    if (!input) return;

    const firstValue = games[0]?.[field];
    const allSame = games.every(g => JSON.stringify(g[field]) === JSON.stringify(firstValue));

    // Store original placeholder before overwriting, if it's not already stored
    if (!input.hasAttribute('data-original-placeholder')) {
      input.setAttribute('data-original-placeholder', input.placeholder);
    }

    if (!allSame) {
      input.placeholder = 'Multiple values - will be overwritten.';
      input.value = ''; // Clear the input value if values differ
    } else {
      // Pre-populate the field with the common value.
      input.value = (field === 'tags' && Array.isArray(firstValue)) ? firstValue.join(', ') : (firstValue || '');
    }
  });

  // --- Pre-populate boolean radio buttons (is_derived_work, is_sequel) ---
  const firstGame = games[0];
  if (firstGame) {
    const allSameDerived = games.every(g => g.is_derived_work === firstGame.is_derived_work);
    const allSameSequel = games.every(g => g.is_sequel === firstGame.is_sequel);

    // Only pre-populate if the state is consistent across all selected games.
    // If it's a mix (some are sequels, some not), leave the checkboxes blank.
    if (allSameDerived && allSameSequel) { 
      const derivedCb = formGame.querySelector('input[name="is_derived_work"]');
      const sequelCb = formGame.querySelector('input[name="is_sequel"]');

      derivedCb.checked = !!firstGame.is_derived_work;
      sequelCb.checked = !!firstGame.is_sequel;
    }
  }
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
  formPlatform.querySelector('input[name="generation"]').value = platform.generation || '';
  formPlatform.querySelector('input[name="manufacturer"]').value = platform.manufacturer || '';
  formPlatform.querySelector('input[name="supports_digital"]').checked = !!platform.supports_digital;
  formPlatform.querySelector('input[name="supports_physical"]').checked = !!platform.supports_physical;

  // Show clone/delete buttons for "Edit" mode
  formPlatform.querySelector('.btn-clone').style.display = 'inline-block';
  formPlatform.querySelector('.btn-delete').style.display = 'inline-block';

  if (doOpen) {
    openModal(modalPlatform);
  }
}

export function clearAutocomplete(container = null) {
  const targetContainer = container || document.getElementById('autocomplete-results');
  if (targetContainer) {
    targetContainer.innerHTML = '';
    targetContainer.style.display = 'none';
  }
}

/**
 * Initializes autocomplete functionality for a given input element.
 * @param {HTMLInputElement} inputEl - The input element to attach listeners to.
 * @param {HTMLElement} resultsContainer - The element to render results into.
 * @param {object} options - Configuration options.
 * @param {function(HTMLElement):void} options.onSelect - Callback when an item is selected.
 * @param {function(string):void} [options.onEnterWithoutSelection] - Callback for Enter key when no item is selected.
 * @param {function(object):boolean} [options.filter] - Function to filter suggestions.
 * @param {string} [options.footerText] - Custom text for the autocomplete footer.
 */
export function initAutocomplete(inputEl, resultsContainer, options) {
  if (!inputEl || !resultsContainer) return;

  let timer = null;
  let selectedIndex = -1;

  inputEl.addEventListener('input', (e) => {
    clearTimeout(timer);
    const query = e.target.value.trim();

    if (query.length < 2) {
      clearAutocomplete(resultsContainer);
      return;
    }

    timer = setTimeout(async () => {
      const data = await fetchAutocomplete(query);
      if (data && data.suggestions) {
        const suggestions = options.filter ? data.suggestions.filter(options.filter) : data.suggestions;
        renderAutocomplete(suggestions, resultsContainer, options.footerText);
        selectedIndex = -1; // Reset selection on new results
      }
    }, 300);
  });

  // Hide autocomplete when clicking outside its container
  document.addEventListener('click', (e) => {
    if (!e.target.closest(resultsContainer.parentElement.id ? `#${resultsContainer.parentElement.id}` : '.search-container')) {
      clearAutocomplete(resultsContainer);
    }
  });

  // Handle item clicks
  resultsContainer.addEventListener('click', (e) => {
    const item = e.target.closest('.autocomplete-item');
    if (item) options.onSelect(item);
  });

  // Keyboard navigation
  inputEl.addEventListener('keydown', (e) => {
    const items = resultsContainer.querySelectorAll('.autocomplete-item');
    if (items.length === 0) {
      if (e.key === 'Enter' && options.onEnterWithoutSelection) {
        e.preventDefault();
        const query = inputEl.value.trim();
        if (query) options.onEnterWithoutSelection(query);
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
          options.onSelect(items[selectedIndex]);
        } else if (options.onEnterWithoutSelection) {
          const query = inputEl.value.trim();
          if (query) options.onEnterWithoutSelection(query);
        }
        return;
      case 'Tab':
        if (items.length > 0) {
          const targetIndex = selectedIndex > -1 ? selectedIndex : 0;
          const targetItem = items[targetIndex];
          if (targetItem) {
            const completeName = targetItem.dataset.name;
            if (inputEl.value.toLowerCase() !== completeName.toLowerCase()) {
              e.preventDefault();
              inputEl.value = completeName;
              if (selectedIndex === -1) {
                selectedIndex = 0;
                items.forEach((item, index) => item.classList.toggle('selected', index === 0));
              }
            }
          }
        }
        break;
      case 'Escape':
        clearAutocomplete(resultsContainer);
        break;
    }

    items.forEach((item, index) => {
      item.classList.toggle('selected', index === selectedIndex);
    });
  });
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
