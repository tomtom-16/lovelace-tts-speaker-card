/* eslint-disable no-undef */
/* global customElements, CustomEvent, document, HTMLElement, localStorage, window */
const DEFAULT_CONFIG = {
  title: '',
  tts_service: 'tts.speak',
  tts_entity_id: '',
  language: '',
  tts_prefix: '',
  speakers: [],
  presets: [],
  presets_only: false,
  history: {
    enabled: false,
    max_items: 20,
    allow_delete: true,
    storage_key: null,
  },
  message_placeholder: 'Saisis ton texte ici…',
  send_label: 'Envoyer',
  clear_label: 'Effacer',
  speaker_label: 'Enceinte',
  history_label: 'Historique',
  presets_label: 'Messages rapides',
  history_checkbox_label: 'Historiser',
  clear_after_send: true,
  auto_select_first_speaker: true,
  service_data: {},
  status_timeout_ms: 5000,
};

/** @typedef {{entity_id: string, label: string}} Speaker */
/** @typedef {{label: string, text: string}} Preset */
/** @typedef {{text: string, ts?: number}} HistoryItem */

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const normalizeString = (value, fallback = '') => typeof value === 'string' ? value.trim() : fallback;
const normalizeBoolean = (value, fallback) => typeof value === 'boolean' ? value : fallback;
const isEntityId = (value, domain) => new RegExp(`^${domain}\\.[a-z0-9_]+$`).test(value);

/**
 * Normalise the public card configuration once, for both the card and editor.
 * Incomplete presets are retained by the editor while being discarded by the card.
 * @param {unknown} config
 * @param {{preserveIncompletePresets?: boolean}} options
 */
const normalizeConfig = (config, { preserveIncompletePresets = false } = {}) => {
  if (!isPlainObject(config)) {
    throw new Error('La configuration de la carte est invalide.');
  }
  const rawHistory = isPlainObject(config.history) ? config.history : {};
  const rawServiceData = isPlainObject(config.service_data) ? config.service_data : {};
  const speakers = Array.isArray(config.speakers) ? config.speakers : [];
  const seenSpeakers = new Set();
  const normalizedSpeakers = speakers.reduce((result, speaker) => {
    const source = typeof speaker === 'string' ? { entity_id: speaker } : isPlainObject(speaker) ? speaker : null;
    const entityId = normalizeString(source?.entity_id);
    if (!isEntityId(entityId, 'media_player') || seenSpeakers.has(entityId)) return result;
    seenSpeakers.add(entityId);
    result.push({
      entity_id: entityId,
      label: normalizeString(source?.label),
    });
    return result;
  }, []);
  const rawPresets = Array.isArray(config.presets) ? config.presets : [];
  const normalizedPresets = rawPresets.reduce((result, preset, index) => {
    if (!isPlainObject(preset)) return result;
    const text = normalizeString(preset.text);
    if (!preserveIncompletePresets && !text) return result;
    result.push({
      label: normalizeString(preset.label) || `Texte ${index + 1}`,
      text,
    });
    return result;
  }, []);
  const maxItems = Number(rawHistory.max_items);
  const historyMaxItems = Number.isFinite(maxItems)
    ? Math.min(100, Math.max(1, Math.trunc(maxItems)))
    : DEFAULT_CONFIG.history.max_items;
  const timeout = Number(config.status_timeout_ms);
  return {
    ...DEFAULT_CONFIG,
    ...config,
    title: normalizeString(config.title),
    tts_service: normalizeString(config.tts_service, DEFAULT_CONFIG.tts_service) || DEFAULT_CONFIG.tts_service,
    tts_entity_id: isEntityId(normalizeString(config.tts_entity_id), 'tts')
      ? normalizeString(config.tts_entity_id)
      : '',
    language: normalizeString(config.language),
    tts_prefix: normalizeString(config.tts_prefix),
    speakers: normalizedSpeakers,
    presets: normalizedPresets,
    presets_only: normalizeBoolean(config.presets_only, DEFAULT_CONFIG.presets_only),
    clear_after_send: normalizeBoolean(config.clear_after_send, DEFAULT_CONFIG.clear_after_send),
    auto_select_first_speaker: normalizeBoolean(config.auto_select_first_speaker, DEFAULT_CONFIG.auto_select_first_speaker),
    message_placeholder: normalizeString(config.message_placeholder, DEFAULT_CONFIG.message_placeholder),
    send_label: normalizeString(config.send_label, DEFAULT_CONFIG.send_label),
    clear_label: normalizeString(config.clear_label, DEFAULT_CONFIG.clear_label),
    speaker_label: normalizeString(config.speaker_label, DEFAULT_CONFIG.speaker_label),
    history_label: normalizeString(config.history_label, DEFAULT_CONFIG.history_label),
    presets_label: normalizeString(config.presets_label, DEFAULT_CONFIG.presets_label),
    history_checkbox_label: normalizeString(config.history_checkbox_label, DEFAULT_CONFIG.history_checkbox_label),
    status_timeout_ms: Number.isFinite(timeout) ? Math.max(0, Math.trunc(timeout)) : DEFAULT_CONFIG.status_timeout_ms,
    history: {
      ...DEFAULT_CONFIG.history,
      ...rawHistory,
      enabled: normalizeBoolean(rawHistory.enabled, DEFAULT_CONFIG.history.enabled),
      max_items: historyMaxItems,
      allow_delete: normalizeBoolean(rawHistory.allow_delete, DEFAULT_CONFIG.history.allow_delete),
      storage_key: normalizeString(rawHistory.storage_key) || null,
    },
    service_data: rawServiceData,
  };
};

class TtsSpeakerCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement('tts-speaker-card-editor');
  }

  static getStubConfig(hass) {
    const firstMediaPlayer = Object.keys(hass?.states || {}).find((entityId) => entityId.startsWith('media_player.'));
    return {
      speakers: firstMediaPlayer ? [{ entity_id: firstMediaPlayer }] : [],
      presets: [],
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
    this._history = [];
    this._draftText = '';
    this._selectedSpeaker = '';
    this._memorizeMessage = true;
    this._status = { text: '', isError: false };
    this._statusTimer = null;
    this._isSending = false;
    this._storageWarning = '';
  }
  setConfig(config) {
    this._config = normalizeConfig(config);
    this._history = this._loadHistory();
    this._forceFullRender = true;
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    // Important : ne pas rerender ici.
    // Sinon Home Assistant réinitialise le champ texte pendant la saisie.
  }
  connectedCallback() {
    if (this._config && !this.shadowRoot.querySelector?.('#cardRoot')) {
      this._render();
    }
  }
  disconnectedCallback() {
    if (this._statusTimer) {
      clearTimeout(this._statusTimer);
      this._statusTimer = null;
    }
  }
  getCardSize() {
    const presetsCount = Array.isArray(this._config?.presets) ? this._config.presets.length : 0;
    if (this._config?.presets_only) {
      return 1 + Math.ceil(Math.max(1, presetsCount) / 2);
    }
    const historyCount = this._config?.history?.enabled ? Math.min(this._history.length, 6) : 0;
    return 4 + Math.ceil(presetsCount / 2) + historyCount;
  }

  _getSpeakers() {
    return this._config?.speakers || [];
  }
  _slugify(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  _escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
  _getStorageKey() {
    const customKey = this._config?.history?.storage_key;
    if (customKey) {
      return `tts-speaker-card.history.${customKey}`;
    }
    const title = this._slugify(this._config?.title);
    const speakers = (this._config?.speakers || []).map((speaker) => speaker.entity_id).sort().join('--');
    const identity = [title, this._slugify(speakers)].filter(Boolean).join('--') || 'default';
    return `tts-speaker-card.history.${identity}`;
  }
  _loadHistory() {
    try {
      const raw = localStorage.getItem(this._getStorageKey());
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => item && typeof item.text === 'string')
        .slice(0, this._getHistoryLimit());
    } catch (_err) {
      this._storageWarning = 'Historique local indisponible dans ce navigateur.';
      return [];
    }
  }
  _saveHistory() {
    try {
      localStorage.setItem(this._getStorageKey(), JSON.stringify(this._history));
    } catch (_err) {
      this._storageWarning = 'Historique local indisponible dans ce navigateur.';
    }
  }
  _addToHistory(text) {
    if (!this._config?.history?.enabled) return;
    const cleaned = String(text || '').trim();
    if (!cleaned) return;
    this._history = [
      { text: cleaned, ts: Date.now() },
      ...this._history.filter((item) => item.text !== cleaned),
    ].slice(0, this._getHistoryLimit());
    this._saveHistory();
  }
  _deleteHistoryEntry(index) {
    if (!this._config?.history?.enabled || !Number.isInteger(index) || index < 0 || index >= this._history.length) return;
    this._history.splice(index, 1);
    this._saveHistory();
    this._updateDynamicDom();
  }
  _getHistoryLimit() {
    return this._config?.history?.max_items || DEFAULT_CONFIG.history.max_items;
  }
  _parseService(fullService) {
    const fullName = String(fullService || DEFAULT_CONFIG.tts_service).trim();
    const match = /^([a-z0-9_]+)\.([a-z0-9_]+)$/.exec(fullName);
    if (!match) {
      throw new Error(`Service TTS invalide : « ${fullName} ». Le format attendu est domaine.service.`);
    }
    return {
      domain: match[1],
      service: match[2],
    };
  }
  _getTtsEntityId() {
    const configuredEntityId = String(this._config?.tts_entity_id || '').trim();
    if (configuredEntityId) return configuredEntityId;
    const candidates = Object.keys(this._hass?.states || {})
      .filter((entityId) => isEntityId(entityId, 'tts'));
    return candidates.find((entityId) => {
      const state = this._hass.states[entityId]?.state;
      return state !== 'unavailable' && state !== 'unknown';
    }) || candidates[0] || '';
  }
  _getSelectedSpeaker() {
    const speakers = this._getSpeakers();
    if (speakers.length === 1) return speakers[0].entity_id;
    const select = this.shadowRoot?.querySelector('#speakerSelect');
    if (select) return select.value || '';
    const selectedButton = this.shadowRoot?.querySelector('.speaker-segment[aria-checked="true"]');
    if (selectedButton) return selectedButton.getAttribute('data-speaker-id') || '';
    return this._selectedSpeaker || '';
  }
  _getTextValue() {
    const textarea = this.shadowRoot?.querySelector('#ttsText');
    if (textarea) return textarea.value || '';
    return this._draftText || '';
  }
  _setTextValue(value) {
    this._draftText = String(value ?? '');
    const textarea = this.shadowRoot?.querySelector('#ttsText');
    if (textarea) textarea.value = this._draftText;
  }
  _setStatus(message, isError = true) {
    if (this._statusTimer) {
      clearTimeout(this._statusTimer);
      this._statusTimer = null;
    }
    const statusText = String(message || '').replace(/\.+\s*$/, '');
    this._status = { text: statusText, isError };
    this._updateDynamicDom();
    const configuredTimeout = Number(this._config?.status_timeout_ms);
    const timeout = isError
      ? 0
      : Number.isFinite(configuredTimeout) ? configuredTimeout : DEFAULT_CONFIG.status_timeout_ms;
    if (timeout > 0 && this.isConnected) {
      this._statusTimer = window.setTimeout(() => {
        this._status = { text: '', isError: false };
        this._statusTimer = null;
        this._updateDynamicDom();
      }, timeout);
    }
  }
  _clearStatus() {
    if (this._statusTimer) {
      clearTimeout(this._statusTimer);
      this._statusTimer = null;
    }
    this._status = { text: '', isError: false };
    this._updateDynamicDom();
  }
  _getStatusMarkup() {
    if (!this._status.text) return '';
    return `<span class="status ${this._status.isError ? 'status-error' : 'status-success'}" role="${this._status.isError ? 'alert' : 'status'}" aria-live="polite">${this._escapeHtml(this._status.text)}</span>`;
  }
  _getHistoryMarkup(allowDelete = Boolean(this._config?.history?.allow_delete)) {
    return this._history.map((item, index) => {
      const short = item.text.length > 70 ? `${item.text.slice(0, 70)}…` : item.text;
      const ts = item.ts ? new Date(item.ts).toLocaleString('fr-FR') : '';
      const accessibleText = this._escapeHtml(short);
      return `
        <div class="history-row">
          <button class="history-item" data-send-action data-history-index="${index}" type="button" title="${this._escapeHtml(ts)}" aria-label="Envoyer à nouveau : ${accessibleText}" ${this._isSending ? 'disabled' : ''}>
            <span class="history-text">${accessibleText}</span>
          </button>
          ${allowDelete ? `<button class="history-delete" data-send-action data-delete-history-index="${index}" type="button" aria-label="Supprimer « ${accessibleText} » de l’historique" ${this._isSending ? 'disabled' : ''}>×</button>` : ''}
        </div>
      `;
    }).join('');
  }
  _updateDynamicDom() {
    if (!this.shadowRoot) return;
    if (!this.shadowRoot.querySelector?.('#cardRoot')) {
      this._forceFullRender = true;
      this._render();
      return;
    }
    const statusContainers = this.shadowRoot.querySelectorAll?.('#statusContainer') || [];
    statusContainers.forEach((container) => {
      container.innerHTML = this._getStatusMarkup();
    });
    const historyList = this.shadowRoot.querySelector?.('#historyList');
    if (historyList) {
      historyList.innerHTML = this._history.length
        ? this._getHistoryMarkup()
        : '<div class="empty">Aucun message enregistré pour le moment.</div>';
      this._bindHistoryActions();
    }
    const busy = Boolean(this._isSending);
    this.shadowRoot.querySelectorAll?.('[data-send-action]').forEach((button) => {
      button.disabled = busy;
      if (busy) button.setAttribute('aria-disabled', 'true');
      else button.removeAttribute('aria-disabled');
    });
    const sendButton = this.shadowRoot.querySelector?.('#sendBtn');
    if (sendButton) {
      sendButton.disabled = busy;
      if (busy) sendButton.setAttribute('aria-busy', 'true');
      else sendButton.removeAttribute('aria-busy');
    }
    const card = this.shadowRoot.querySelector?.('ha-card');
    if (card) card.setAttribute('aria-busy', String(busy));
    const warning = this.shadowRoot.querySelector?.('#storageWarning');
    if (warning) warning.textContent = this._storageWarning;
  }
  _bindHistoryActions() {
    this.shadowRoot.querySelectorAll?.('[data-history-index]').forEach((button) => {
      button.onclick = async (event) => {
        await this._sendHistoryItem(Number(event.currentTarget?.getAttribute('data-history-index')));
      };
    });
    this.shadowRoot.querySelectorAll?.('[data-delete-history-index]').forEach((button) => {
      button.onclick = (event) => {
        this._deleteHistoryEntry(Number(event.currentTarget?.getAttribute('data-delete-history-index')));
      };
    });
  }
  _render() {
    if (!this.shadowRoot || !this._config) return;
    if (!this._forceFullRender && this.shadowRoot.querySelector?.('#cardRoot')) {
      this._updateDynamicDom();
      return;
    }
    this._forceFullRender = false;
    // Sauvegarde de l'état courant avant le rerender
    const existingText = this.shadowRoot.querySelector('#ttsText')?.value ?? this._draftText ?? '';
    const existingSpeaker = this.shadowRoot
      .querySelector('.speaker-segment[aria-checked="true"]')
      ?.getAttribute('data-speaker-id')
      ?? this.shadowRoot.querySelector('#speakerSelect')?.value
      ?? this._selectedSpeaker
      ?? '';
    const existingMemorize = this.shadowRoot.querySelector('#memorizeCheckbox')?.checked ?? this._memorizeMessage ?? true;
    const speakers = this._getSpeakers();
    const presets = Array.isArray(this._config.presets) ? this._config.presets : [];
    const presetsOnly = Boolean(this._config.presets_only);
    const historyEnabled = !presetsOnly && Boolean(this._config.history?.enabled);
    const allowDelete = Boolean(this._config.history?.allow_delete);
    const hasSpeakers = speakers.length > 0;
    const hasPresets = presets.length > 0;
    const hasHistory = historyEnabled && this._history.length > 0;
    const hasSelectedSpeaker = speakers.some((speaker) => speaker.entity_id.trim() === existingSpeaker);
    const useSegmentedControl = speakers.length >= 2 && speakers.length <= 4;
    const speakerOptions = speakers
      .map((speaker, index) => {
        const entityId = speaker.entity_id.trim();
        const label = speaker?.label || entityId || `Enceinte ${index + 1}`;
        const shouldSelect =
          (hasSelectedSpeaker && entityId === existingSpeaker) ||
          (!hasSelectedSpeaker && this._config.auto_select_first_speaker && index === 0);
        const isTabStop = shouldSelect || (!hasSelectedSpeaker && !this._config.auto_select_first_speaker && index === 0);
        return `<button class="speaker-segment" type="button" role="radio" data-speaker-id="${this._escapeHtml(entityId)}" aria-checked="${shouldSelect}" tabindex="${isTabStop ? '0' : '-1'}">${this._escapeHtml(label)}</button>`;
      })
      .join('');
    const speakerSelectOptions = (!this._config.auto_select_first_speaker
      ? '<option value="">Sélectionner une enceinte</option>'
      : '') + speakers
      .map((speaker, index) => {
        const entityId = speaker.entity_id.trim();
        const label = speaker?.label || entityId || `Enceinte ${index + 1}`;
        const shouldSelect =
          (hasSelectedSpeaker && entityId === existingSpeaker) ||
          (!hasSelectedSpeaker && this._config.auto_select_first_speaker && index === 0);
        return `<option value="${this._escapeHtml(entityId)}" ${shouldSelect ? 'selected' : ''}>${this._escapeHtml(label)}</option>`;
      })
      .join('');
    const historyOptions = this._getHistoryMarkup(allowDelete);
    const presetButtons = presets
      .map((preset, index) => {
        const label = preset?.label || `Texte ${index + 1}`;
        const text = preset?.text || '';
        return `
          <button class="preset-btn ${presetsOnly && presets.length === 1 ? 'single-preset' : ''}" type="button" data-send-action data-preset-text="${this._escapeHtml(text)}" ${this._isSending ? 'disabled' : ''}>
            ${this._escapeHtml(label)}
          </button>
        `;
      })
      .join('');
    const statusMarkup = this._getStatusMarkup();
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: var(--ha-font-family, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
        }
        #cardRoot, ha-card {
          display: block;
        }
        ha-card {
          box-sizing: border-box;
          padding: 16px;
        }
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .title {
          font-size: 1.1rem;
          font-weight: 700;
          line-height: 1.2;
        }
        .section {
          margin-top: 14px;
        }
        .split > .section:first-child {
          margin-top: 0;
        }
        .label {
          display: block;
          margin-top: 0;
          margin-bottom: 6px;
          font-size: 0.92rem;
          font-weight: 600;
          opacity: 0.9;
        }
        select, textarea, button, input {
          font: inherit;
        }
        select, textarea {
          width: 100%;
          box-sizing: border-box;
          border-radius: 12px;
          border: 1px solid var(--divider-color, rgba(127,127,127,0.25));
          background: var(--card-background-color, var(--primary-background-color, #fff));
          color: var(--primary-text-color, #111);
          padding: 12px;
        }
        select:focus-visible, textarea:focus-visible, button:focus-visible, input:focus-visible {
          outline: 2px solid var(--primary-color, #0277bd);
          outline-offset: 2px;
        }
        .segmented-control {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 4px;
          padding: 4px;
          border: 1px solid var(--divider-color, rgba(127,127,127,0.25));
          border-radius: 14px;
          background: var(--secondary-background-color, rgba(127,127,127,0.12));
        }
        .speaker-segment {
          min-width: 0;
          min-height: 44px;
          padding: 10px 12px;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: var(--primary-text-color, #111);
          cursor: pointer;
          font-weight: 600;
          overflow-wrap: anywhere;
          transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
        }
        .speaker-segment:hover {
          background: color-mix(in srgb, var(--primary-color, #03a9f4) 12%, transparent);
        }
        .speaker-segment[aria-checked="true"] {
          background: var(--primary-color, #0277bd);
          color: var(--tts-primary-action-text, var(--text-primary-color, #fff));
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
        }
        .speaker-segment:focus-visible {
          outline: 2px solid var(--primary-color, #0277bd);
          outline-offset: 2px;
        }
        textarea {
          resize: vertical;
          min-height: 90px;
        }
        .row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: end;
        }
        .send-btn, .clear-btn, .preset-btn, .history-delete, .history-item {
          border: 0;
          border-radius: 12px;
          cursor: pointer;
          transition: transform 0.04s ease, opacity 0.15s ease;
        }
        .send-btn {
          padding: 12px 16px;
          background: var(--primary-color, #0277bd);
          color: var(--tts-primary-action-text, var(--text-primary-color, #fff));
          font-weight: 700;
          min-width: 0;
          height: 48px;
        }
        .clear-btn {
          padding: 12px 16px;
          background: var(--secondary-background-color, rgba(127,127,127,0.12));
          color: var(--primary-text-color, #111);
          font-weight: 700;
          min-width: 0;
          height: 48px;
          overflow-wrap: anywhere;
        }
        .send-btn:hover, .clear-btn:hover, .preset-btn:hover, .history-delete:hover, .history-item:hover {
          opacity: 0.92;
        }
        .send-btn:active, .clear-btn:active, .preset-btn:active, .history-delete:active, .history-item:active {
          transform: scale(0.99);
        }
        button:disabled {
          cursor: wait;
          opacity: 0.6;
          transform: none;
        }
        .preset-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 10px;
        }
        .preset-btn {
          padding: 11px 12px;
          background: var(--secondary-background-color, rgba(127,127,127,0.12));
          color: var(--primary-text-color, #111);
          text-align: center;
        }
        .preset-btn.single-preset {
          min-height: 48px;
          background: var(--primary-color, #0277bd);
          color: var(--tts-primary-action-text, var(--text-primary-color, #fff));
          font-weight: 700;
          width: 100%;
        }
        .history-list {
          display: grid;
          gap: 8px;
        }
        .history-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          align-items: center;
        }
        .history-item {
          width: 100%;
          text-align: left;
          padding: 10px 12px;
          background: var(--secondary-background-color, rgba(127,127,127,0.12));
          color: var(--primary-text-color, #111);
          min-height: 44px;
        }
        .history-delete {
          width: 44px;
          height: 44px;
          background: transparent;
          color: var(--error-color, #d32f2f);
          font-size: 1.35rem;
          line-height: 1;
        }
        .checkbox-row {
          display: grid;
          grid-template-columns: auto auto minmax(0, 1fr);
          align-items: center;
          gap: 10px;
          margin-top: 10px;
          min-height: 1.4em;
          user-select: none;
        }
        .checkbox-row input {
          width: 18px;
          height: 18px;
          margin: 0;
        }
        .status {
          color: var(--primary-text-color, #111);
          font-size: 0.92rem;
          line-height: 1.4;
        }
        .status-container {
          min-height: 0;
          min-width: 0;
          overflow-wrap: anywhere;
          text-align: right;
        }
        .checkbox-row.has-history .status-container {
          grid-column: 3;
          justify-self: end;
        }
        .checkbox-row.status-only .status-container {
          grid-column: 1 / -1;
          justify-self: end;
        }
        .storage-warning {
          color: var(--warning-color, #8a5700);
        }
        .status-error {
          color: var(--error-color, #d32f2f);
        }
        .status-success {
          color: var(--success-color, #2e7d32);
        }
        .hint, .empty {
          margin-top: 8px;
          font-size: 0.92rem;
          opacity: 0.75;
          line-height: 1.4;
        }
        .error {
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(211, 47, 47, 0.1);
          color: var(--error-color, #d32f2f);
          font-size: 0.92rem;
        }
        .split {
          display: grid;
          gap: 12px;
        }
        @media (max-width: 300px) {
          .row {
            grid-template-columns: 1fr;
          }
          .send-btn {
            width: 100%;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            transition: none !important;
            animation: none !important;
            scroll-behavior: auto !important;
          }
        }
      </style>
      <div id="cardRoot">
      <ha-card aria-busy="${this._isSending}">
        ${this._config.title ? `
          <div class="header">
            <div class="title">${this._escapeHtml(this._config.title)}</div>
          </div>
        ` : ''}
        <div class="split">
          ${!hasSpeakers ? `
            <div class="error" role="alert">Aucune enceinte n’est configurée dans la carte.</div>
          ` : `
          ${speakers.length > 1 ? `<div class="section">
            <div class="label" id="speakerLabel">${this._escapeHtml(this._config.speaker_label || 'Enceinte')}</div>
            ${useSegmentedControl
              ? `<div class="segmented-control" role="radiogroup" aria-labelledby="speakerLabel">
                ${speakerOptions}
              </div>`
              : `<select id="speakerSelect" aria-labelledby="speakerLabel">
                ${speakerSelectOptions}
              </select>`}
          </div>` : ''}
          ${presetsOnly ? '' : `
          <div class="section">
            <label class="label" for="ttsText">Texte</label>
            <textarea id="ttsText" placeholder="${this._escapeHtml(this._config.message_placeholder)}"></textarea>
            <div class="checkbox-row ${historyEnabled ? 'has-history' : 'status-only'}">
              ${historyEnabled ? `<input id="memorizeCheckbox" type="checkbox" ${existingMemorize ? 'checked' : ''} ${this._isSending ? 'disabled' : ''} />
              <label for="memorizeCheckbox">${this._escapeHtml(this._config.history_checkbox_label || 'Historiser')}</label>` : ''}
              <div id="statusContainer" class="status-container">${statusMarkup}</div>
            </div>
          </div>
          <div class="section row">
            <button class="send-btn" id="sendBtn" data-send-action type="button" ${this._isSending ? 'disabled aria-busy="true"' : ''}>${this._escapeHtml(this._config.send_label)}</button>
            <button class="clear-btn" id="clearBtn" data-send-action type="button" ${this._isSending ? 'disabled' : ''}>${this._escapeHtml(this._config.clear_label)}</button>
          </div>
          `}
          ${presetsOnly && !hasPresets ? '<div class="error" role="alert">Aucun preset n’est configuré.</div>' : ''}
          ${hasPresets ? `
            <div class="section">
              ${presetsOnly && presets.length === 1 ? '' : `<h3 class="label">${this._escapeHtml(this._config.presets_label || 'Messages rapides')}</h3>`}
              <div class="preset-grid">
                ${presetButtons}
              </div>
            </div>
          ` : ''}
          ${presetsOnly ? '<div id="statusContainer" class="status-container section">' + statusMarkup + '</div>' : ''}
          ${historyEnabled ? `
            <div class="section">
              <h3 class="label">${this._escapeHtml(this._config.history_label || 'Historique')}</h3>
              <div id="historyList" class="history-list">${hasHistory ? historyOptions : '<div class="empty">Aucun message enregistré pour le moment.</div>'}</div>
              ${this._storageWarning ? `<div id="storageWarning" class="storage-warning" role="status">${this._escapeHtml(this._storageWarning)}</div>` : '<div id="storageWarning" class="storage-warning" role="status"></div>'}
            </div>
          ` : ''}
          `}
        </div>
      </ha-card>
      </div>
    `;
    const speakerSelect = this.shadowRoot.querySelector('#speakerSelect');
    const speakerSegments = [...this.shadowRoot.querySelectorAll('.speaker-segment')];
    const textarea = this.shadowRoot.querySelector('#ttsText');
    const sendBtn = this.shadowRoot.querySelector('#sendBtn');
    const clearBtn = this.shadowRoot.querySelector('#clearBtn');
    const memorizeCheckbox = this.shadowRoot.querySelector('#memorizeCheckbox');
    if (textarea) {
      textarea.value = existingText;
      this._draftText = existingText;
      textarea.oninput = (ev) => {
        this._draftText = ev.target.value;
      };
      textarea.onkeydown = (ev) => {
        // Empêche les raccourcis globaux de Home Assistant (dont Assist) de
        // s'activer pendant la saisie dans la carte.
        ev.stopPropagation();
        if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
          ev.preventDefault();
          this._onSend();
        }
      };
      textarea.onkeyup = (ev) => ev.stopPropagation();
      textarea.onkeypress = (ev) => ev.stopPropagation();
    }
    if (speakerSelect) {
      this._selectedSpeaker = speakerSelect.value || (hasSelectedSpeaker ? existingSpeaker : '');
      speakerSelect.onchange = (ev) => {
        this._selectedSpeaker = ev.target.value || '';
      };
    } else if (speakerSegments.length > 0) {
      const selectedSegment = speakerSegments.find((segment) => segment.getAttribute('aria-checked') === 'true');
      this._selectedSpeaker = selectedSegment?.getAttribute('data-speaker-id') || (hasSelectedSpeaker ? existingSpeaker : '');
      const selectSpeaker = (segment) => {
        const speakerId = segment.getAttribute('data-speaker-id') || '';
        speakerSegments.forEach((item) => {
          const isSelected = item === segment;
          item.setAttribute('aria-checked', String(isSelected));
          item.setAttribute('tabindex', isSelected ? '0' : '-1');
        });
        this._selectedSpeaker = speakerId;
      };
      speakerSegments.forEach((segment, index) => {
        segment.onclick = () => selectSpeaker(segment);
        segment.onkeydown = (ev) => {
          const direction = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1
            : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1
              : ev.key === 'Home' ? -Infinity
                : ev.key === 'End' ? Infinity
                  : 0;
          if (!direction) return;
          ev.preventDefault();
          const nextIndex = direction === -Infinity
            ? 0
            : direction === Infinity
              ? speakerSegments.length - 1
              : (index + direction + speakerSegments.length) % speakerSegments.length;
          const nextSegment = speakerSegments[nextIndex];
          selectSpeaker(nextSegment);
          nextSegment.focus();
        };
      });
    }
    if (memorizeCheckbox) {
      this._memorizeMessage = Boolean(existingMemorize);
      memorizeCheckbox.onchange = (ev) => {
        this._memorizeMessage = Boolean(ev.target.checked);
      };
    }
    if (sendBtn) {
      sendBtn.onclick = () => this._onSend();
    }
    if (clearBtn) {
      clearBtn.onclick = () => {
        this._draftText = '';
        const ta = this.shadowRoot.querySelector('#ttsText');
        if (ta) ta.value = '';
        this._clearStatus();
      };
    }
    this.shadowRoot.querySelectorAll('[data-preset-text]').forEach((btn) => {
      btn.onclick = async (ev) => {
        const text = ev.currentTarget?.getAttribute('data-preset-text') || '';
        this._setTextValue(text);
        await this._sendText(text);
      };
    });
    this._bindHistoryActions();
    if (this.shadowRoot.querySelector?.('#cardRoot')) this._updateDynamicDom();
  }
  async _onSend() {
    const text = this._getTextValue().trim();
    await this._sendText(text);
  }
  async _sendHistoryItem(index) {
    const item = this._history[index];
    if (!item) return;
    this._setTextValue(item.text);
    await this._sendText(item.text);
  }
  async _sendText(text) {
    if (this._isSending) return;
    const cleanedText = String(text || '').trim();
    if (!cleanedText) {
      this._setStatus('Le texte est vide');
      return;
    }
    const speakers = this._getSpeakers();
    if (speakers.length === 0) {
      this._setStatus('Aucune enceinte n’est configurée');
      return;
    }
    const selectedSpeaker = this._getSelectedSpeaker();
    const speaker = speakers.find((item) => item.entity_id.trim() === selectedSpeaker);
    const speakerEntityId = speaker?.entity_id.trim();
    if (!speakerEntityId) {
      this._setStatus('L’enceinte sélectionnée n’est pas valide');
      return;
    }
    if (!this._hass || typeof this._hass.callService !== 'function') {
      this._setStatus('Home Assistant n’est pas encore prêt. Réessaie dans un instant');
      return;
    }
    this._isSending = true;
    this._updateDynamicDom();
    try {
      const { domain, service } = this._parseService(this._config.tts_service);
      const isModernTtsService = domain === 'tts' && service === 'speak';
      const ttsPrefix = typeof this._config.tts_prefix === 'string'
        ? this._config.tts_prefix
        : '';
      const payload = {
        ...this._config.service_data,
        message: `${ttsPrefix}${cleanedText}`,
      };
      let target;
      if (isModernTtsService) {
        const ttsEntityId = this._getTtsEntityId();
        if (!ttsEntityId) {
          throw new Error('Aucune entité TTS n’est configurée ou disponible dans Home Assistant');
        }
        payload.media_player_entity_id = speakerEntityId;
        target = { entity_id: ttsEntityId };
      } else {
        payload.entity_id = speakerEntityId;
      }
      if (this._config.language) {
        payload.language = this._config.language;
      }
      await this._hass.callService(domain, service, payload, target);
      if (!this._config.presets_only && this._memorizeMessage) {
        this._addToHistory(cleanedText);
      }
      if (this._config.clear_after_send) {
        this._setTextValue('');
      }
      this._setStatus(`Envoyé vers ${speaker.label || speakerEntityId}`, false);
    } catch (err) {
      const message = err?.message || String(err) || 'Erreur inconnue';
      this._setStatus(`Erreur lors de l’envoi : ${message}`);
    } finally {
      this._isSending = false;
      this._updateDynamicDom();
    }
  }
}

class TtsSpeakerCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
    this._ttsEntityCount = 0;
  }

  setConfig(config) {
    this._config = normalizeConfig(config, { preserveIncompletePresets: true });
    this._render();
  }

  set hass(hass) {
    const ttsEntityCount = Object.keys(hass?.states || {})
      .filter((entityId) => isEntityId(entityId, 'tts')).length;
    const shouldRender = !this._hass || this._ttsEntityCount !== ttsEntityCount;
    this._hass = hass;
    this._ttsEntityCount = ttsEntityCount;
    if (shouldRender && this._config) this._render();
  }

  _escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  _getSpeakers() {
    return this._config?.speakers || [];
  }

  _emitConfig(config) {
    this._config = normalizeConfig(config, { preserveIncompletePresets: true });
    const event = new CustomEvent('config-changed', {
      bubbles: true,
      composed: true,
      detail: { config: this._config },
    });
    this.dispatchEvent(event);
  }

  _patch(patch, rerender = false) {
    this._emitConfig({ ...this._config, ...patch });
    if (rerender) this._render();
  }

  _friendlyName(entityId) {
    return this._hass?.states?.[entityId]?.attributes?.friendly_name || '';
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;
    const speakers = this._getSpeakers();
    const presets = this._config.presets;
    const presetsOnly = Boolean(this._config.presets_only);
    const ttsEntities = Object.keys(this._hass?.states || {})
      .filter((entityId) => isEntityId(entityId, 'tts'));
    const presetRows = presets.map((preset, index) => `
      <div class="preset-row">
        <label class="field">
          <span>Nom du preset</span>
          <input data-preset-label="${index}" type="text">
        </label>
        <label class="field">
          <span>Texte à envoyer</span>
          <textarea data-preset-text="${index}" rows="2"></textarea>
        </label>
        <button class="icon-btn" data-remove-preset="${index}" type="button" title="Supprimer ce preset" aria-label="Supprimer ce preset">×</button>
      </div>
    `).join('');
    const speakerRows = speakers.map((speaker, index) => `
      <label class="field">
        <span>Nom affiché pour ${this._escapeHtml(this._friendlyName(speaker.entity_id) || speaker.entity_id)}</span>
        <input data-speaker-label="${index}" type="text">
      </label>
    `).join('');

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          color: var(--primary-text-color);
        }
        .editor {
          display: grid;
          gap: 16px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
        }
        .section {
          display: grid;
          gap: 12px;
          padding-top: 4px;
        }
        h3 {
          font-size: 1rem;
          margin: 8px 0 0;
        }
        ha-selector, input, textarea {
          width: 100%;
        }
        input, textarea {
          box-sizing: border-box;
          min-height: 44px;
          padding: 10px 12px;
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          color: var(--primary-text-color);
          background: var(--card-background-color);
          font: inherit;
        }
        input:focus-visible, textarea:focus-visible, button:focus-visible, ha-selector:focus-visible, ha-switch:focus-visible {
          outline: 2px solid var(--primary-color, #0277bd);
          /* Keep the focus indicator inside the card, whose overflow may clip it. */
          outline-offset: -2px;
        }
        textarea {
          resize: vertical;
        }
        .field {
          display: grid;
          gap: 6px;
          min-width: 0;
          font-size: 0.9rem;
        }
        .field > span {
          font-weight: 500;
        }
        .switch-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          min-height: 40px;
        }
        .preset-row {
          display: grid;
          grid-template-columns: minmax(120px, 0.7fr) minmax(180px, 1.3fr) auto;
          align-items: center;
          gap: 8px;
        }
        button {
          border: 0;
          border-radius: 10px;
          padding: 10px 14px;
          color: var(--primary-text-color);
          background: var(--secondary-background-color);
          cursor: pointer;
          font: inherit;
        }
        .add-btn {
          justify-self: start;
          color: var(--text-primary-color, #fff);
          background: var(--primary-color);
        }
        .icon-btn {
          width: 44px;
          height: 44px;
          padding: 0;
          color: var(--error-color);
          font-size: 1.4rem;
        }
        .error {
          padding: 10px 12px;
          border-radius: 8px;
          color: var(--error-color);
          background: color-mix(in srgb, var(--error-color) 10%, transparent);
        }
        .helper {
          margin-top: -8px;
          opacity: 0.7;
          font-size: 0.9rem;
        }
        @media (max-width: 600px) {
          .preset-row {
            grid-template-columns: 1fr auto;
            align-items: start;
          }
          .preset-row .field {
            grid-column: 1;
          }
          .preset-row .icon-btn {
            grid-column: 2;
            grid-row: 1 / span 2;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            transition: none !important;
            animation: none !important;
          }
        }
      </style>
      <div class="editor">
        <label class="field">
          <span>Titre de la carte</span>
          <input id="title" type="text">
        </label>

        <div class="section">
          <h3>Enceintes</h3>
          <ha-selector id="speakersSelector"></ha-selector>
          <div class="helper">La liste contient les entités media_player connues de Home Assistant.</div>
          ${speakers.length === 0 ? '<div class="error" role="alert">Sélectionne au moins une enceinte.</div>' : speakerRows}
        </div>

        <div class="section">
          <h3>Text-to-Speech</h3>
          ${ttsEntities.length > 1 ? `
            <label class="field">
              <span id="ttsEntityLabel">Entité TTS</span>
              <ha-selector id="ttsEntitySelector" aria-labelledby="ttsEntityLabel"></ha-selector>
            </label>
          ` : ''}
          <label class="field">
            <span>Langue (facultatif)</span>
            <input id="language" type="text">
          </label>
        </div>

        <div class="section">
          <h3>Affichage</h3>
          <div class="switch-row">
            <span id="presetsOnlyLabel">Afficher uniquement les presets</span>
            <ha-switch id="presetsOnly" aria-labelledby="presetsOnlyLabel"></ha-switch>
          </div>
          ${presetsOnly ? '' : `
            <div class="switch-row">
              <span id="historyEnabledLabel">Activer l’historique</span>
              <ha-switch id="historyEnabled" aria-labelledby="historyEnabledLabel"></ha-switch>
            </div>
            <div class="switch-row">
              <span id="historyAllowDeleteLabel">Autoriser la suppression dans l’historique</span>
              <ha-switch id="historyAllowDelete" aria-labelledby="historyAllowDeleteLabel"></ha-switch>
            </div>
            <div class="switch-row">
              <span id="clearAfterSendLabel">Effacer le texte après un envoi réussi</span>
              <ha-switch id="clearAfterSend" aria-labelledby="clearAfterSendLabel"></ha-switch>
            </div>
            <div class="switch-row">
              <span id="autoSelectFirstSpeakerLabel">Sélectionner automatiquement la première enceinte</span>
              <ha-switch id="autoSelectFirstSpeaker" aria-labelledby="autoSelectFirstSpeakerLabel"></ha-switch>
            </div>
            <div class="grid">
              <label class="field">
                <span>Nombre maximal d’éléments</span>
                <input id="historyMaxItems" type="number" min="1" max="100">
              </label>
            </div>
          `}
        </div>

        <div class="section">
          <h3>Presets</h3>
          ${presetRows || '<div class="helper">Aucun preset configuré.</div>'}
          <button class="add-btn" id="addPreset" type="button">Ajouter un preset</button>
        </div>
      </div>
    `;

    const setField = (id, configKey, fallback = '') => {
      const field = this.shadowRoot.querySelector(`#${id}`);
      if (!field) return;
      field.value = this._config[configKey] ?? fallback;
      field.addEventListener('input', (ev) => this._patch({ [configKey]: ev.target.value }));
    };
    setField('title', 'title');
    setField('language', 'language');

    const historyMaxItems = this.shadowRoot.querySelector('#historyMaxItems');
    if (historyMaxItems) {
      historyMaxItems.value = this._config.history.max_items;
      historyMaxItems.addEventListener('input', (ev) => {
        const value = Math.min(100, Math.max(1, Number(ev.target.value) || DEFAULT_CONFIG.history.max_items));
        this._patch({ history: { ...this._config.history, max_items: value } });
      });
    }

    const bindSwitch = (id, checked, callback) => {
      const field = this.shadowRoot.querySelector(`#${id}`);
      if (!field) return;
      field.checked = Boolean(checked);
      field.addEventListener('change', (ev) => callback(Boolean(ev.target.checked)));
    };
    bindSwitch('presetsOnly', presetsOnly, (value) => this._patch({ presets_only: value }, true));
    bindSwitch('historyEnabled', this._config.history.enabled, (value) => {
      this._patch({ history: { ...this._config.history, enabled: value } });
    });
    bindSwitch('historyAllowDelete', this._config.history.allow_delete, (value) => {
      this._patch({ history: { ...this._config.history, allow_delete: value } });
    });
    bindSwitch('clearAfterSend', this._config.clear_after_send ?? DEFAULT_CONFIG.clear_after_send, (value) => {
      this._patch({ clear_after_send: value });
    });
    bindSwitch(
      'autoSelectFirstSpeaker',
      this._config.auto_select_first_speaker ?? DEFAULT_CONFIG.auto_select_first_speaker,
      (value) => this._patch({ auto_select_first_speaker: value }),
    );

    const ttsEntitySelector = this.shadowRoot.querySelector('#ttsEntitySelector');
    if (ttsEntitySelector) {
      ttsEntitySelector.hass = this._hass;
      ttsEntitySelector.selector = { entity: { filter: { domain: 'tts' } } };
      ttsEntitySelector.value = this._config.tts_entity_id || ttsEntities[0] || '';
      ttsEntitySelector.addEventListener('value-changed', (ev) => {
        const value = typeof ev.detail?.value === 'string' ? ev.detail.value : '';
        this._patch({ tts_entity_id: value });
      });
    }

    const speakersSelector = this.shadowRoot.querySelector('#speakersSelector');
    if (speakersSelector) {
      speakersSelector.hass = this._hass;
      speakersSelector.selector = {
        entity: {
          multiple: true,
          filter: { domain: 'media_player' },
        },
      };
      speakersSelector.value = speakers.map((speaker) => speaker.entity_id);
      speakersSelector.addEventListener('value-changed', (ev) => {
        const entityIds = Array.isArray(ev.detail?.value) ? ev.detail.value : [];
        const nextSpeakers = entityIds.map((entityId) => {
          const existing = speakers.find((speaker) => speaker.entity_id === entityId);
          return existing || { entity_id: entityId, label: this._friendlyName(entityId) };
        });
        this._patch({ speakers: nextSpeakers }, true);
      });
    }

    this.shadowRoot.querySelectorAll('[data-speaker-label]').forEach((field) => {
      const index = Number(field.getAttribute('data-speaker-label'));
      field.value = speakers[index]?.label || '';
      field.addEventListener('input', (ev) => {
        const nextSpeakers = speakers.map((speaker, speakerIndex) => (
          speakerIndex === index ? { ...speaker, label: ev.target.value } : speaker
        ));
        this._patch({ speakers: nextSpeakers });
      });
    });

    this.shadowRoot.querySelectorAll('[data-preset-label]').forEach((field) => {
      const index = Number(field.getAttribute('data-preset-label'));
      field.value = presets[index]?.label || '';
      field.addEventListener('input', (ev) => {
        const nextPresets = presets.map((preset, presetIndex) => (
          presetIndex === index ? { ...preset, label: ev.target.value } : preset
        ));
        this._patch({ presets: nextPresets });
      });
    });
    this.shadowRoot.querySelectorAll('[data-preset-text]').forEach((field) => {
      const index = Number(field.getAttribute('data-preset-text'));
      field.value = presets[index]?.text || '';
      field.addEventListener('input', (ev) => {
        const nextPresets = presets.map((preset, presetIndex) => (
          presetIndex === index ? { ...preset, text: ev.target.value } : preset
        ));
        this._patch({ presets: nextPresets });
      });
    });
    this.shadowRoot.querySelectorAll('[data-remove-preset]').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.getAttribute('data-remove-preset'));
        this._patch({ presets: presets.filter((_preset, presetIndex) => presetIndex !== index) }, true);
      });
    });
    this.shadowRoot.querySelector('#addPreset')?.addEventListener('click', () => {
      this._patch({ presets: [...presets, { label: '', text: '' }] }, true);
    });
  }
}

if (!customElements.get('tts-speaker-card-editor')) {
  customElements.define('tts-speaker-card-editor', TtsSpeakerCardEditor);
}
if (!customElements.get('tts-speaker-card')) {
  customElements.define('tts-speaker-card', TtsSpeakerCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === 'tts-speaker-card')) {
  window.customCards.push({
    type: 'tts-speaker-card',
    name: 'TTS Speaker Card',
    description: 'Envoie un texte TTS vers une enceinte Home Assistant choisie.',
  });
}

export { TtsSpeakerCard, TtsSpeakerCardEditor };
