'use strict';
import { state } from './state.js';
import { apiGet, fetchPlatformsFromServer } from './api.js';

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

export function closeModal(modal) {
  modal.setAttribute('aria-hidden', 'true');
  modal.style.display = 'none';
}

export async function populateFilterModal() {
  // Platforms
  const platformsContainer = document.getElementById('filter-platforms');
  if (platformsContainer) {
    platformsContainer.innerHTML = '';
    state.allPlatforms.forEach(p => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = String(p.id);
      input.checked = state.currentFilters.platforms.includes(String(p.id));
      label.appendChild(input);
      label.appendChild(document.createTextNode(p.name));
      platformsContainer.appendChild(label);
    });
  }

  // Tags
  const tagsContainer = document.getElementById('filter-tags');
  if (tagsContainer) {
    tagsContainer.innerHTML = '';
    state.allTags.forEach(tag => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = String(tag);
      input.checked = state.currentFilters.tags.includes(String(tag));
      label.appendChild(input);
      label.appendChild(document.createTextNode(tag));
      tagsContainer.appendChild(label);
    });
  }

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
  const data = await apiGet('/plugins/database_handler/platforms');
  if (!data) return;

  const platformGroup = document.getElementById('platform-radio-group');
  if (!platformGroup) return;

  platformGroup.innerHTML = '';
  const platforms = data.platforms || [];

  platforms.forEach((p, idx) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'platform_id';
    input.value = p.id;
    input.required = true;
    if (idx === 0) input.checked = true;

    label.appendChild(input);
    label.appendChild(document.createTextNode(p.name));
    platformGroup.appendChild(label);

    input.addEventListener('change', () => updateFormatOptions(p));
  });

  if (platforms.length > 0) updateFormatOptions(platforms[0]);
}

export function updateFormatOptions(platform) {
  const formatGroup = document.getElementById('format-checkbox-group');
  if (!formatGroup) return;

  formatGroup.innerHTML = '';

  if (platform.supports_digital && platform.supports_physical) {
    const digitalLabel = document.createElement('label');
    const digitalInput = document.createElement('input');
    digitalInput.type = 'checkbox';
    digitalInput.name = 'format_digital';
    digitalInput.value = 'true';
    digitalInput.checked = true;
    digitalLabel.appendChild(digitalInput);
    digitalLabel.appendChild(document.createTextNode('Digital'));
    formatGroup.appendChild(digitalLabel);

    const physicalLabel = document.createElement('label');
    const physicalInput = document.createElement('input');
    physicalInput.type = 'checkbox';
    physicalInput.name = 'format_physical';
    physicalInput.value = 'true';
    physicalLabel.appendChild(physicalInput);
    physicalLabel.appendChild(document.createTextNode('Physical'));
    formatGroup.appendChild(physicalLabel);
  } else if (platform.supports_digital) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = 'true';
    input.checked = true;
    input.disabled = true;
    label.appendChild(input);
    label.appendChild(document.createTextNode('Digital'));
    formatGroup.appendChild(label);
  } else if (platform.supports_physical) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = 'false';
    input.checked = true;
    input.disabled = true;
    label.appendChild(input);
    label.appendChild(document.createTextNode('Physical'));
    formatGroup.appendChild(label);
  }
}
