/* eslint-disable no-undef */
/* global customElements, HTMLElement, window */

/**
 * TTS Speaker Card
 * Carte Lovelace Home Assistant pour envoyer un texte TTS vers une enceinte choisie.
 *
 * Fonctionnalités :
 * - liste déroulante des enceintes configurées dans le YAML
 * - champ texte libre
 * - envoi TTS en un clic
 * - boutons prédéfinis configurables
 * - historique local des textes envoyés
 * - suppression d'une entrée dans l'historique
 *
 * Dépendances :
 * - aucune
 *
 * Installation :
 * - placer ce fichier à la racine du dépôt
 * - référencer la carte via HACS
 * - utiliser dans Lovelace :
 *   type: custom:tts-speaker-card
 */

const DEFAULT_CONFIG = {
  title: "TTS Speaker Card",
  tts_service: "tts.google_translate_say",
  speakers: [],
  presets: [],
  history: {
    enabled: true,
    max_items: 20,
    allow_delete: true,
    storage_key: null,
  },
  message_placeholder: "Saisis ton texte ici…",
  send_label: "Envoyer",
  speaker_label: "Enceinte",
  history_label: "Historique",
  presets_label: "Messages rapides",
  clear_after_send: true,
  auto_select_first_speaker: true,
};

class TtsSpeakerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    this._config = null;
    this._hass = null;
    this._history = [];
    this._dom = {};
    this._boundOnSend = this._onSend.bind(this);
  }

  setConfig(config) {
    if (!config || typeof config !== "object") {
      throw new Error("La configuration de la carte est invalide.");
    }

    this._config = {
      ...DEFAULT_CONFIG,
      ...config,
      history: {
        ...DEFAULT_CONFIG.history,
        ...(config.history || {}),
      },
    };

    this._history = this._loadHistory();
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    const presetsCount = Array.isArray(this._config?.presets) ? this._config.presets.length : 0;
    const historyCount = this._config?.history?.enabled ? Math.min(this._history.length, 6) : 0;
    return 4 + Math.ceil(presetsCount / 2) + historyCount;
  }

  connectedCallback() {
    this._render();
  }

  _slugify(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  _escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  _getStorageKey() {
    const customKey = this._config?.history?.storage_key;
    if (customKey) {
      return `tts-speaker-card.history.${customKey}`;
    }

    const title = this._config?.title || "tts-speaker-card";
    return `tts-speaker-card.history.${this._slugify(title) || "default"}`;
  }

  _loadHistory() {
    try {
      const raw = localStorage.getItem(this._getStorageKey());
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((item) => item && typeof item.text === "string")
        .slice(0, this._config?.history?.max_items || 20);
    } catch (err) {
      return [];
    }
  }

  _saveHistory() {
    try {
      localStorage.setItem(this._getStorageKey(), JSON.stringify(this._history));
    } catch (err) {
      // Pas bloquant : si localStorage est indisponible, on continue sans casser la carte.
    }
  }

  _addToHistory(text) {
    if (!this._config?.history?.enabled) {
      return;
    }

    const cleaned = String(text || "").trim();
    if (!cleaned) {
      return;
    }

    this._history = [
      { text: cleaned, ts: Date.now() },
      ...this._history.filter((item) => item.text !== cleaned),
    ].slice(0, this._config.history.max_items || 20);

    this._saveHistory();
  }

  _deleteHistoryEntry(index) {
    if (!this._config?.history?.enabled) {
      return;
    }

    this._history.splice(index, 1);
    this._saveHistory();
    this._render();
  }

  _parseService(fullService) {
    const service = String(fullService || "tts.google_translate_say").trim();
    const parts = service.split(".");

    if (parts.length < 2) {
      return { domain: "tts", service: "google_translate_say" };
    }

    return {
      domain: parts[0],
      service: parts.slice(1).join("."),
    };
  }

  _getSelectedSpeaker() {
    const select = this.shadowRoot?.querySelector("#speakerSelect");
    if (!select) {
      return null;
    }
    return select.value || null;
  }

  _getTextValue() {
    const textarea = this.shadowRoot?.querySelector("#ttsText");
    if (!textarea) {
      return "";
    }
    return textarea.value || "";
  }

  _setTextValue(value) {
    const textarea = this.shadowRoot?.querySelector("#ttsText");
    if (!textarea) {
      return;
    }
    textarea.value = value;
  }

  _render() {
    if (!this.shadowRoot || !this._config) {
      return;
    }

    const speakers = Array.isArray(this._config.speakers) ? this._config.speakers : [];
    const presets = Array.isArray(this._config.presets) ? this._config.presets : [];
    const historyEnabled = Boolean(this._config.history?.enabled);
    const allowDelete = Boolean(this._config.history?.allow_delete);

    const hasSpeakers = speakers.length > 0;
    const hasPresets = presets.length > 0;
    const hasHistory = historyEnabled && this._history.length > 0;

    const speakerOptions = speakers
      .map((speaker, index) => {
        const entityId = speaker?.entity_id || "";
        const label = speaker?.label || entityId || `Enceinte ${index + 1}`;
        const selected =
          this._config.auto_select_first_speaker &&
          index === 0 &&
          !this._dom.speakerInitialized;

        return `<option value="${this._escapeHtml(entityId)}" ${selected ? "selected" : ""}>${this._escapeHtml(label)}</option>`;
      })
      .join("");

    const historyOptions = this._history
      .map((item, index) => {
        const short = item.text.length > 70 ? `${item.text.slice(0, 70)}…` : item.text;
        const ts = item.ts ? new Date(item.ts).toLocaleString("fr-FR") : "";
        return `
          <div class="history-row">
            <button class="history-item" data-history-index="${index}" type="button" title="${this._escapeHtml(ts)}">
              <span class="history-text">${this._escapeHtml(short)}</span>
            </button>
            ${allowDelete ? `<button class="history-delete" data-delete-history-index="${index}" type="button" aria-label="Supprimer">×</button>` : ""}
          </div>
        `;
      })
      .join("");

    const presetButtons = presets
      .map((preset, index) => {
        const label = preset?.label || `Texte ${index + 1}`;
        const text = preset?.text || "";
        return `
          <button class="preset-btn" type="button" data-preset-text="${this._escapeHtml(text)}">
            ${this._escapeHtml(label)}
          </button>
        `;
      })
      .join("");

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: var(--ha-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
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

        select, textarea, button {
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
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: end;
        }

        .send-btn, .preset-btn, .history-delete {
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

        .send-btn:hover, .preset-btn:hover, .history-delete:hover, .history-item:hover {
          opacity: 0.92;
        }

        .send-btn:active, .preset-btn:active, .history-delete:active, .history-item:active {
          transform: scale(0.99);
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

        .small {
          font-size: 0.9rem;
        }

        @media (max-width: 640px) {
          .row {
            grid-template-columns: 1fr;
          }

          .send-btn {
            width: 100%;
          }
        }
      </style>

      <ha-card>
        <div class="header">
          <div class="title">${this._escapeHtml(this._config.title || "TTS Speaker Card")}</div>
        </div>

        <div class="split">
          <div class="section">
            <label class="label" for="speakerSelect">${this._escapeHtml(this._config.speaker_label || "Enceinte")}</label>
            <select id="speakerSelect" ${hasSpeakers ? "" : "disabled"}>
              ${
                hasSpeakers
                  ? speakerOptions
                  : `<option value="">Aucune enceinte configurée</option>`
              }
            </select>
            ${
              hasSpeakers
                ? ""
                : `<div class="hint">Ajoute au moins une enceinte dans la configuration YAML.</div>`
            }
          </div>

          <div class="section">
            <label class="label" for="ttsText">Texte</label>
            <textarea id="ttsText" placeholder="${this._escapeHtml(this._config.message_placeholder)}"></textarea>
            <div class="hint">Le texte envoyé sera mémorisé dans l’historique si cette option est activée.</div>
          </div>

          <div class="section row">
            <button class="send-btn" id="sendBtn" type="button">${this._escapeHtml(this._config.send_label)}</button>
            <div></div>
          </div>

          ${
            hasPresets
              ? `
                <div class="section">
                  <label class="label">${this._escapeHtml(this._config.presets_label || "Messages rapides")}</label>
                  <div class="preset-grid">
                    ${presetButtons}
                  </div>
                </div>
              `
              : ""
          }

          ${
            historyEnabled
              ? `
                <div class="section">
                  <label class="label">${this._escapeHtml(this._config.history_label || "Historique")}</label>
                  ${
                    hasHistory
                      ? `<div class="history-list">${historyOptions}</div>`
                      : `<div class="empty">Aucun message enregistré pour le moment.</div>`
                  }
                </div>
              `
              : ""
          }

          ${
            !hasSpeakers
              ? `<div class="error">Aucune enceinte n’est configurée dans la carte.</div>`
              : ""
          }
        </div>
      </ha-card>
    `;

    // Récupération des éléments utiles
    this._dom.speakerSelect = this.shadowRoot.querySelector("#speakerSelect");
    this._dom.textarea = this.shadowRoot.querySelector("#ttsText");
    this._dom.sendBtn = this.shadowRoot.querySelector("#sendBtn");

    // Écouteurs
    if (this._dom.sendBtn) {
      this._dom.sendBtn.onclick = this._boundOnSend;
    }

    if (this._dom.textarea) {
      this._dom.textarea.onkeydown = (ev) => {
        // Ctrl+Enter / Cmd+Enter = envoyer
        if ((ev.ctrlKey || ev.metaKey) && ev.key === "Enter") {
          ev.preventDefault();
          this._onSend();
        }
      };
    }

    // Boutons presets
    this.shadowRoot.querySelectorAll("[data-preset-text]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        const text = ev.currentTarget?.getAttribute("data-preset-text") || "";
        this._setTextValue(text);
        await this._sendText(text);
      });
    });

    // Sélection d'un texte d'historique
    this.shadowRoot.querySelectorAll("[data-history-index]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        const index = Number(ev.currentTarget?.getAttribute("data-history-index"));
        const item = this._history[index];
        if (!item) {
          return;
        }
        this._setTextValue(item.text);
      });
    });

    // Suppression d'un texte d'historique
    this.shadowRoot.querySelectorAll("[data-delete-history-index]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        const index = Number(ev.currentTarget?.getAttribute("data-delete-history-index"));
        this._deleteHistoryEntry(index);
      });
    });

    this._dom.speakerInitialized = true;
  }

  async _onSend() {
    const text = this._getTextValue().trim();
    await this._sendText(text);
  }

  async _sendText(text) {
    const cleanedText = String(text || "").trim();

    if (!cleanedText) {
      this._showMessage("Le texte est vide.");
      return;
    }

    const speakers = Array.isArray(this._config.speakers) ? this._config.speakers : [];
    if (speakers.length === 0) {
      this._showMessage("Aucune enceinte n’est configurée.");
      return;
    }

    const selectedSpeaker = this._getSelectedSpeaker();
    const speaker =
      speakers.find((item) => item?.entity_id === selectedSpeaker) ||
      speakers[0];

    const speakerEntityId = speaker?.entity_id;
    if (!speakerEntityId) {
      this._showMessage("L’enceinte sélectionnée n’est pas valide.");
      return;
    }

    try {
      const { domain, service } = this._parseService(this._config.tts_service);

      const payload = {
        entity_id: speakerEntityId,
        message: cleanedText,
        ...(this._config.service_data || {}),
      };

      await this._hass.callService(domain, service, payload);

      this._addToHistory(cleanedText);

      if (this._config.clear_after_send && this._dom.textarea) {
        this._dom.textarea.value = "";
      }

      this._showMessage(`Envoyé vers ${speaker.label || speakerEntityId}.`, false);
      this._render();
    } catch (err) {
      const message = err?.message || String(err) || "Erreur inconnue";
      this._showMessage(`Erreur lors de l’envoi : ${message}`);
    }
  }

  _showMessage(message, isError = true) {
    let box = this.shadowRoot.querySelector("#messageBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "messageBox";
      box.className = isError ? "error" : "hint";
      this.shadowRoot.querySelector("ha-card")?.appendChild(box);
    }

    box.className = isError ? "error" : "hint";
    box.textContent = message;
  }

  getCardSize() {
    return 4;
  }
}

if (!customElements.get("tts-speaker-card")) {
  customElements.define("tts-speaker-card", TtsSpeakerCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "tts-speaker-card",
  name: "TTS Speaker Card",
  description: "Envoie un texte TTS vers une enceinte Home Assistant choisie.",
});
