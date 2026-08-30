import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';

const { window } = parseHTML('<!doctype html><html><body></body></html>');
Object.assign(globalThis, {
  window,
  document: window.document,
  HTMLElement: window.HTMLElement,
  CustomEvent: window.CustomEvent,
  customElements: window.customElements,
  localStorage: {
    values: new Map(),
    getItem(key) { return this.values.get(key) ?? null; },
    setItem(key, value) { this.values.set(key, value); },
    removeItem(key) { this.values.delete(key); },
  },
});
window.customCards = [];

const { TtsSpeakerCard, TtsSpeakerCardEditor } = await import('../tts-speaker-card.js');

const createCard = (config = {}) => {
  const card = new TtsSpeakerCard();
  card.setConfig({
    status_timeout_ms: 0,
    history: { enabled: true },
    speakers: [{ entity_id: 'media_player.salon', label: 'Salon' }],
    ...config,
  });
  document.body.appendChild(card);
  return card;
};

test('met à jour le statut sans remplacer le textarea ni perdre son focus', () => {
  const card = createCard();
  const textarea = card.shadowRoot.querySelector('#ttsText');
  let focusCalled = false;
  const focus = textarea.focus.bind(textarea);
  textarea.focus = () => {
    focusCalled = true;
    focus();
  };
  textarea.focus();
  textarea.value = 'Message en cours de saisie';
  textarea.dispatchEvent(new window.Event('input', { bubbles: true }));

  card._setStatus('Message envoyé', false);

  assert.equal(card.shadowRoot.querySelector('#ttsText'), textarea);
  assert.equal(textarea.value, 'Message en cours de saisie');
  assert.equal(focusCalled, true);
  assert.equal(card.shadowRoot.querySelector('.status').textContent, 'Message envoyé');
});

test('désactive toutes les actions pendant un appel TTS lent', async () => {
  let resolveCall;
  const card = createCard({
    tts_service: 'tts.google_translate_say',
    presets: [{ label: 'Bonjour', text: 'Bonjour' }],
  });
  card.hass = {
    callService() {
      return new Promise((resolve) => { resolveCall = resolve; });
    },
  };
  card._history = [{ text: 'Rappel', ts: Date.now() }];
  card._render();

  const send = card._sendText('Bonjour');
  assert.equal(card._isSending, true);
  assert.ok([...card.shadowRoot.querySelectorAll('[data-send-action]')].every((button) => button.disabled));
  assert.equal(card.shadowRoot.querySelector('ha-card').getAttribute('aria-busy'), 'true');

  resolveCall();
  await send;
  assert.equal(card._isSending, false);
  assert.ok([...card.shadowRoot.querySelectorAll('[data-send-action]')].every((button) => !button.disabled));
});

test('normalise les enceintes et ignore les presets incomplets', () => {
  const card = createCard({
    speakers: [
      ' media_player.salon ',
      { entity_id: 'media_player.salon', label: 'Doublon' },
      { entity_id: 'media_player.cuisine', label: 'Cuisine' },
      { entity_id: 'light.salon', label: 'Invalide' },
    ],
    presets: [{ label: 'Vide', text: '  ' }, { label: 'Valide', text: ' Bonjour ' }],
  });

  assert.deepEqual(card._getSpeakers(), [
    { entity_id: 'media_player.salon', label: '' },
    { entity_id: 'media_player.cuisine', label: 'Cuisine' },
  ]);
  assert.deepEqual(card._config.presets, [{ label: 'Valide', text: 'Bonjour' }]);
});

test('nomme les switches de l’éditeur pour les lecteurs d’écran', () => {
  const editor = new TtsSpeakerCardEditor();
  editor.setConfig({ speakers: ['media_player.salon'] });
  document.body.appendChild(editor);

  assert.equal(editor.shadowRoot.querySelector('#presetsOnly').getAttribute('aria-labelledby'), 'presetsOnlyLabel');
  assert.equal(editor.shadowRoot.querySelector('#historyEnabled').getAttribute('aria-labelledby'), 'historyEnabledLabel');
});
