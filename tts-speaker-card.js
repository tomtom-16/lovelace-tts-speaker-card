/* eslint-disable no-undef */
/* global customElements, CustomEvent, document, HTMLElement, window */
const DEFAULT_CONFIG = {
  title: '',
  tts_service: 'tts.speak',
  tts_entity_id: '',
  language: '',
  speakers: [],
  presets: [],
  presets_only: false,
  history: {
    enabled: true,
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
  history_checkbox_label: 'Mémoriser le message',
  clear_after_send: true,
  auto_select_first_speaker: true,
  service_data: {},
  status_timeout_ms: 5000,
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
  }
  setConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('La configuration de la carte est invalide.');
    }
    this._config = {
      ...DEFAULT_CONFIG,
      ...config,
      history: {
        ...DEFAULT_CONFIG.history,
        ...(config.history || {}),
      },
      service_data: {
        ...DEFAULT_CONFIG.service_data,
        ...(config.service_data || {}),
      },
    };
    this._history = this._loadHistory();
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    // Important : ne pas rerender ici.
    // Sinon Home Assistant réinitialise le champ texte pendant la saisie.
  }
  connectedCallback() {
    if (this._config && !this.shadowRoot.innerHTML) {
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
    if (!Array.isArray(this._config?.speakers)) return [];
    return this._config.speakers
      .map((speaker) => {
        if (typeof speaker === 'string') {
          return { entity_id: speaker.trim(), label: '' };
        }
        return {
          ...speaker,
          entity_id: typeof speaker?.entity_id === 'string' ? speaker.entity_id.trim() : '',
        };
      })
      .filter((speaker) => speaker.entity_id);
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
    const title = this._config?.title || 'tts-speaker-card';
    return `tts-speaker-card.history.${this._slugify(title) || 'default'}`;
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
      return [];
    }
  }
  _saveHistory() {
    try {
      localStorage.setItem(this._getStorageKey(), JSON.stringify(this._history));
    } catch (_err) {
      // localStorage indisponible : on ignore sans casser la carte
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
    this._render();
  }
  _getHistoryLimit() {
    const configuredLimit = Number(this._config?.history?.max_items);
    if (!Number.isFinite(configuredLimit)) return DEFAULT_CONFIG.history.max_items;
    return Math.min(100, Math.max(1, Math.trunc(configuredLimit)));
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
      .filter((entityId) => entityId.startsWith('tts.'));
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
    this._status = { text: String(message || ''), isError };
    this._render();
    const configuredTimeout = Number(this._config?.status_timeout_ms);
    const timeout = Number.isFinite(configuredTimeout) ? configuredTimeout : DEFAULT_CONFIG.status_timeout_ms;
    if (timeout > 0 && this.isConnected) {
      this._statusTimer = window.setTimeout(() => {
        this._status = { text: '', isError: false };
        this._statusTimer = null;
        this._render();
      }, timeout);
    }
  }
  _clearStatus() {
    if (this._statusTimer) {
      clearTimeout(this._statusTimer);
      this._statusTimer = null;
    }
    this._status = { text: '', isError: false };
    this._render();
  }
  _render() {
    if (!this.shadowRoot || !this._config) return;
    // Sauvegarde de l'état courant avant le rerender
    const existingText = this.shadowRoot.querySelector('#ttsText')?.value ?? this._draftText ?? '';
    const existingSpeaker = this.shadowRoot.querySelector('#speakerSelect')?.value ?? this._selectedSpeaker ?? '';
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
    const emptySpeakerOption = !this._config.auto_select_first_speaker
      ? '<option value="">Sélectionner une enceinte</option>'
      : '';
    const speakerOptions = emptySpeakerOption + speakers
      .map((speaker, index) => {
        const entityId = speaker.entity_id.trim();
        const label = speaker?.label || entityId || `Enceinte ${index + 1}`;
        const shouldSelect =
          (hasSelectedSpeaker && entityId === existingSpeaker) ||
          (!hasSelectedSpeaker && this._config.auto_select_first_speaker && index === 0);
        return `<option value="${this._escapeHtml(entityId)}" ${shouldSelect ? 'selected' : ''}>${this._escapeHtml(label)}</option>`;
      })
      .join('');
    const historyOptions = this._history
      .map((item, index) => {
        const short = item.text.length > 70 ? `${item.text.slice(0, 70)}…` : item.text;
        const ts = item.ts ? new Date(item.ts).toLocaleString('fr-FR') : '';
        return `
          <div class="history-row">
            <button class="history-item" data-history-index="${index}" type="button" title="${this._escapeHtml(ts)}">
              <span class="history-text">${this._escapeHtml(short)}</span>
            </button>
            ${allowDelete ? `<button class="history-delete" data-delete-history-index="${index}" type="button" aria-label="Supprimer">×</button>` : ''}
          </div>
        `;
      })
      .join('');
    const presetButtons = presets
      .map((preset, index) => {
        const label = preset?.label || `Texte ${index + 1}`;
        const text = preset?.text || '';
        return `
          <button class="preset-btn ${presetsOnly && presets.length === 1 ? 'single-preset' : ''}" type="button" data-preset-text="${this._escapeHtml(text)}">
            ${this._escapeHtml(label)}
          </button>
        `;
      })
      .join('');
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: var(--ha-font-family, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
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
        .label {
          display: block;
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
          outline: none;
        }
        textarea {
          resize: vertical;
          min-height: 90px;
        }
        .row {
          display: grid;
          grid-template-columns: 1fr auto auto;
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
          background: var(--primary-color, #03a9f4);
          color: var(--text-primary-color, #fff);
          font-weight: 700;
          min-width: 120px;
          height: 48px;
        }
        .clear-btn {
          padding: 12px 16px;
          background: var(--secondary-background-color, rgba(127,127,127,0.12));
          color: var(--primary-text-color, #111);
          font-weight: 700;
          min-width: 100px;
          height: 48px;
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
          background: var(--primary-color, #03a9f4);
          color: var(--text-primary-color, #fff);
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
          width: 38px;
          height: 38px;
          background: transparent;
          color: var(--error-color, #d32f2f);
          font-size: 1.35rem;
          line-height: 1;
        }
        .checkbox-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 10px;
          user-select: none;
        }
        .checkbox-row input {
          width: 18px;
          height: 18px;
          margin: 0;
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
        .success {
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 12px;
          background: rgba(46, 125, 50, 0.1);
          color: var(--success-color, #2e7d32);
          font-size: 0.92rem;
        }
        .split {
          display: grid;
          gap: 12px;
        }
        @media (max-width: 640px) {
          .row {
            grid-template-columns: 1fr;
          }
          .send-btn, .clear-btn {
            width: 100%;
          }
        }
      </style>
      <ha-card>
        <div class="header">
          ${this._config.title ? `<div class="title">${this._escapeHtml(this._config.title)}</div>` : ''}
        </div>
        <div class="split">
          ${!hasSpeakers ? `
            <div class="error" role="alert">Aucune enceinte n’est configurée dans la carte.</div>
          ` : `
          ${speakers.length > 1 ? `<div class="section">
            <label class="label" for="speakerSelect">${this._escapeHtml(this._config.speaker_label || 'Enceinte')}</label>
            <select id="speakerSelect">
              ${speakerOptions}
            </select>
          </div>` : ''}
          ${presetsOnly ? '' : `
          <div class="section">
            <label class="label" for="ttsText">Texte</label>
            <textarea id="ttsText" placeholder="${this._escapeHtml(this._config.message_placeholder)}"></textarea>
            <div class="checkbox-row">
              <input id="memorizeCheckbox" type="checkbox" ${existingMemorize ? 'checked' : ''} ${historyEnabled ? '' : 'disabled'} />
              <label for="memorizeCheckbox">${this._escapeHtml(this._config.history_checkbox_label || 'Mémoriser le message')}</label>
            </div>
          </div>
          <div class="section row">
            <button class="send-btn" id="sendBtn" type="button" ${this._isSending ? 'disabled aria-busy="true"' : ''}>${this._escapeHtml(this._config.send_label)}</button>
            <button class="clear-btn" id="clearBtn" type="button">${this._escapeHtml(this._config.clear_label)}</button>
            <div></div>
          </div>
          `}
          ${this._status.text ? `<div class="section ${this._status.isError ? 'error' : 'success'}" role="${this._status.isError ? 'alert' : 'status'}" aria-live="polite">${this._escapeHtml(this._status.text)}</div>` : ''}
          ${presetsOnly && !hasPresets ? '<div class="error" role="alert">Aucun preset n’est configuré.</div>' : ''}
          ${hasPresets ? `
            <div class="section">
              ${presetsOnly && presets.length === 1 ? '' : `<label class="label">${this._escapeHtml(this._config.presets_label || 'Messages rapides')}</label>`}
              <div class="preset-grid">
                ${presetButtons}
              </div>
            </div>
          ` : ''}
          ${historyEnabled ? `
            <div class="section">
              <label class="label">${this._escapeHtml(this._config.history_label || 'Historique')}</label>
              ${hasHistory ? `<div class="history-list">${historyOptions}</div>` : '<div class="empty">Aucun message enregistré pour le moment.</div>'}
            </div>
          ` : ''}
          `}
        </div>
      </ha-card>
    `;
    const speakerSelect = this.shadowRoot.querySelector('#speakerSelect');
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
        if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
          ev.preventDefault();
          this._onSend();
        }
      };
    }
    if (speakerSelect) {
      if (hasSelectedSpeaker) {
        speakerSelect.value = existingSpeaker;
      }
      this._selectedSpeaker = speakerSelect.value || existingSpeaker || '';
      speakerSelect.onchange = (ev) => {
        this._selectedSpeaker = ev.target.value || '';
      };
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
      btn.addEventListener('click', async (ev) => {
        const text = ev.currentTarget?.getAttribute('data-preset-text') || '';
        this._setTextValue(text);
        await this._sendText(text);
      });
    });
    this.shadowRoot.querySelectorAll('[data-history-index]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        const index = Number(ev.currentTarget?.getAttribute('data-history-index'));
        const item = this._history[index];
        if (!item) return;
        this._setTextValue(item.text);
      });
    });
    this.shadowRoot.querySelectorAll('[data-delete-history-index]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        const index = Number(ev.currentTarget?.getAttribute('data-delete-history-index'));
        this._deleteHistoryEntry(index);
      });
    });
  }
  async _onSend() {
    const text = this._getTextValue().trim();
    await this._sendText(text);
  }
  async _sendText(text) {
    if (this._isSending) return;
    const cleanedText = String(text || '').trim();
    if (!cleanedText) {
      this._setStatus('Le texte est vide.');
      return;
    }
    const speakers = this._getSpeakers();
    if (speakers.length === 0) {
      this._setStatus('Aucune enceinte n’est configurée.');
      return;
    }
    const selectedSpeaker = this._getSelectedSpeaker();
    const speaker = speakers.find((item) => item.entity_id.trim() === selectedSpeaker);
    const speakerEntityId = speaker?.entity_id.trim();
    if (!speakerEntityId) {
      this._setStatus('L’enceinte sélectionnée n’est pas valide.');
      return;
    }
    if (!this._hass || typeof this._hass.callService !== 'function') {
      this._setStatus('Home Assistant n’est pas encore prêt. Réessaie dans un instant.');
      return;
    }
    this._isSending = true;
    this._render();
    try {
      const { domain, service } = this._parseService(this._config.tts_service);
      const isModernTtsService = domain === 'tts' && service === 'speak';
      const payload = {
        ...this._config.service_data,
        message: cleanedText,
      };
      let target;
      if (isModernTtsService) {
        const ttsEntityId = this._getTtsEntityId();
        if (!ttsEntityId) {
          throw new Error('Aucune entité TTS n’est configurée ou disponible dans Home Assistant.');
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
      this._setStatus(`Envoyé vers ${speaker.label || speakerEntityId}.`, false);
    } catch (err) {
      const message = err?.message || String(err) || 'Erreur inconnue';
      this._setStatus(`Erreur lors de l’envoi : ${message}`);
    } finally {
      this._isSending = false;
      this._render();
    }
  }
}

class TtsSpeakerCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
  }

  setConfig(config) {
    this._config = {
      ...config,
      speakers: Array.isArray(config?.speakers) ? config.speakers : [],
      presets: Array.isArray(config?.presets) ? config.presets : [],
      history: {
        ...DEFAULT_CONFIG.history,
        ...(config?.history || {}),
      },
      service_data: {
        ...(config?.service_data || {}),
      },
    };
    this._render();
  }

  set hass(hass) {
    const firstLoad = !this._hass;
    this._hass = hass;
    if (firstLoad && this._config) this._render();
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
    return (this._config?.speakers || [])
      .map((speaker) => typeof speaker === 'string' ? { entity_id: speaker, label: '' } : { ...speaker })
      .filter((speaker) => typeof speaker.entity_id === 'string' && speaker.entity_id.trim());
  }

  _emitConfig(config) {
    this._config = config;
    const event = new CustomEvent('config-changed', {
      bubbles: true,
      composed: true,
      detail: { config },
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
        .tts-selector-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 8px;
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
          width: 40px;
          height: 40px;
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
          <label class="field">
            <span>Entité TTS</span>
            <div class="tts-selector-row">
              <ha-selector id="ttsEntitySelector"></ha-selector>
              <button id="clearTtsEntity" type="button">Effacer</button>
            </div>
          </label>
          <div class="helper">Facultatif : si ce champ est vide, la première entité TTS disponible est utilisée automatiquement.</div>
          <div class="grid">
            <label class="field">
              <span>Service TTS</span>
              <input id="ttsService" type="text">
            </label>
            <label class="field">
              <span>Langue (facultatif)</span>
              <input id="language" type="text">
            </label>
          </div>
        </div>

        <div class="section">
          <h3>Affichage</h3>
          <div class="switch-row">
            <span>Afficher uniquement les presets</span>
            <ha-switch id="presetsOnly"></ha-switch>
          </div>
          ${presetsOnly ? '' : `
            <div class="switch-row">
              <span>Activer l’historique</span>
              <ha-switch id="historyEnabled"></ha-switch>
            </div>
            <div class="switch-row">
              <span>Autoriser la suppression dans l’historique</span>
              <ha-switch id="historyAllowDelete"></ha-switch>
            </div>
            <div class="switch-row">
              <span>Effacer le texte après un envoi réussi</span>
              <ha-switch id="clearAfterSend"></ha-switch>
            </div>
            <div class="switch-row">
              <span>Sélectionner automatiquement la première enceinte</span>
              <ha-switch id="autoSelectFirstSpeaker"></ha-switch>
            </div>
            <div class="grid">
              <label class="field">
                <span>Nombre maximal d’éléments</span>
                <input id="historyMaxItems" type="number" min="1" max="100">
              </label>
              <label class="field">
                <span>Texte indicatif du champ</span>
                <input id="messagePlaceholder" type="text">
              </label>
              <label class="field">
                <span>Libellé de la mémorisation</span>
                <input id="historyCheckboxLabel" type="text">
              </label>
              <label class="field">
                <span>Clé de stockage de l’historique</span>
                <input id="historyStorageKey" type="text">
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
      field.addEventListener('change', (ev) => this._patch({ [configKey]: ev.target.value }));
    };
    setField('title', 'title');
    setField('ttsService', 'tts_service', DEFAULT_CONFIG.tts_service);
    setField('language', 'language');
    setField('messagePlaceholder', 'message_placeholder', DEFAULT_CONFIG.message_placeholder);
    setField('historyCheckboxLabel', 'history_checkbox_label', DEFAULT_CONFIG.history_checkbox_label);

    const historyMaxItems = this.shadowRoot.querySelector('#historyMaxItems');
    if (historyMaxItems) {
      historyMaxItems.value = this._config.history.max_items;
      historyMaxItems.addEventListener('change', (ev) => {
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

    const historyStorageKey = this.shadowRoot.querySelector('#historyStorageKey');
    if (historyStorageKey) {
      historyStorageKey.value = this._config.history.storage_key || '';
      historyStorageKey.addEventListener('change', (ev) => {
        this._patch({
          history: {
            ...this._config.history,
            storage_key: ev.target.value || null,
          },
        });
      });
    }

    const speakersSelector = this.shadowRoot.querySelector('#speakersSelector');
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

    const ttsEntitySelector = this.shadowRoot.querySelector('#ttsEntitySelector');
    ttsEntitySelector.hass = this._hass;
    ttsEntitySelector.selector = { entity: { filter: { domain: 'tts' } } };
    ttsEntitySelector.required = false;
    ttsEntitySelector.value = this._config.tts_entity_id || '';
    ttsEntitySelector.addEventListener('value-changed', (ev) => {
      this._patch({ tts_entity_id: ev.detail?.value || '' });
    });
    this.shadowRoot.querySelector('#clearTtsEntity').addEventListener('click', () => {
      this._patch({ tts_entity_id: '' }, true);
    });

    this.shadowRoot.querySelectorAll('[data-speaker-label]').forEach((field) => {
      const index = Number(field.getAttribute('data-speaker-label'));
      field.value = speakers[index]?.label || '';
      field.addEventListener('change', (ev) => {
        const nextSpeakers = speakers.map((speaker, speakerIndex) => (
          speakerIndex === index ? { ...speaker, label: ev.target.value } : speaker
        ));
        this._patch({ speakers: nextSpeakers });
      });
    });

    this.shadowRoot.querySelectorAll('[data-preset-label]').forEach((field) => {
      const index = Number(field.getAttribute('data-preset-label'));
      field.value = presets[index]?.label || '';
      field.addEventListener('change', (ev) => {
        const nextPresets = presets.map((preset, presetIndex) => (
          presetIndex === index ? { ...preset, label: ev.target.value } : preset
        ));
        this._patch({ presets: nextPresets });
      });
    });
    this.shadowRoot.querySelectorAll('[data-preset-text]').forEach((field) => {
      const index = Number(field.getAttribute('data-preset-text'));
      field.value = presets[index]?.text || '';
      field.addEventListener('change', (ev) => {
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
    this.shadowRoot.querySelector('#addPreset').addEventListener('click', () => {
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
