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
  // Use existing state if available, otherwise fetch.
  const platforms = state.allPlatforms.length > 0 ? state.allPlatforms : (await fetchPlatformsFromServer())?.platforms || [];
  if (platforms.length === 0) return;

  const platformGroup = document.getElementById('platform-radio-group');
  if (!platformGroup) return;

  platformGroup.innerHTML = '';

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
    digitalInput.name = 'format';
    digitalInput.value = 'true';
    digitalInput.checked = true;
    digitalLabel.appendChild(digitalInput);
    digitalLabel.appendChild(document.createTextNode('Digital'));
    formatGroup.appendChild(digitalLabel);

    const physicalLabel = document.createElement('label');
    const physicalInput = document.createElement('input');
    physicalInput.type = 'checkbox';
    physicalInput.name = 'format';
    physicalInput.value = 'true';
    physicalLabel.appendChild(physicalInput);
    physicalLabel.appendChild(document.createTextNode('Physical'));
    formatGroup.appendChild(physicalLabel);
  } else if (platform.supports_digital) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'format';
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
    input.name = 'format';
    input.value = 'false';
    input.checked = true;
    input.disabled = true;
    label.appendChild(input);
    label.appendChild(document.createTextNode('Physical'));
    formatGroup.appendChild(label);
  }
}

// --- CSV import modal helpers ---
import { postCsvPreview, postCsvImport, igdbSearch } from './api.js';

function mkSelectForHeader(header, selected, platforms) {
  const fields = ['', 'name', 'description', 'cover_image_url', 'trailer_url', 'is_remake', 'is_remaster', 'tags', 'acquisition_hint'];
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

  // Fetch platforms once for the mapping UI
  let platforms = [];
  try {
    const platformData = await fetchPlatformsFromServer();
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
      const selRow = mkSelectForHeader(h, result.mapping[h] || '', platforms);
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
