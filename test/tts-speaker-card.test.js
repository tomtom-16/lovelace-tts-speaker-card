import assert from 'node:assert/strict';
import test from 'node:test';

class FakeShadowRoot {
  constructor() {
    this.innerHTML = '';
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }
}

globalThis.HTMLElement = class {
  constructor() {
    this.isConnected = false;
  }

  attachShadow() {
    this.shadowRoot = new FakeShadowRoot();
    return this.shadowRoot;
  }
};

const registeredElements = new Map();
globalThis.customElements = {
  define(name, element) {
    registeredElements.set(name, element);
  },
  get(name) {
    return registeredElements.get(name);
  },
};

const storage = new Map();
globalThis.localStorage = {
  getItem(key) {
    return storage.get(key) ?? null;
  },
  setItem(key, value) {
    storage.set(key, value);
  },
};
globalThis.window = { customCards: [], setTimeout };

const { TtsSpeakerCard } = await import('../tts-speaker-card.js');

function createCard(config = {}) {
  const card = new TtsSpeakerCard();
  card.setConfig({
    speakers: [{ entity_id: 'media_player.salon', label: 'Salon' }],
    ...config,
  });
  card._selectedSpeaker = 'media_player.salon';
  return card;
}

test('envoie le payload attendu avec un ancien service TTS', async () => {
  const calls = [];
  const card = createCard({
    tts_service: 'tts.google_translate_say',
    language: 'fr-fr',
    service_data: { cache: false, message: 'ne doit pas remplacer le texte' },
  });
  card.hass = {
    callService(...args) {
      calls.push(args);
    },
  };

  await card._sendText(' Bonjour ');

  assert.deepEqual(calls, [
    [
      'tts',
      'google_translate_say',
      {
        cache: false,
        message: 'Bonjour',
        entity_id: 'media_player.salon',
        language: 'fr-fr',
      },
      undefined,
    ],
  ]);
});

test('envoie le payload et la cible attendus avec tts.speak', async () => {
  const calls = [];
  const card = createCard({
    tts_service: 'tts.speak',
    tts_entity_id: 'tts.home_assistant_cloud',
    service_data: { cache: true },
  });
  card.hass = {
    callService(...args) {
      calls.push(args);
    },
  };

  await card._sendText('Test moderne');

  assert.deepEqual(calls, [
    [
      'tts',
      'speak',
      {
        cache: true,
        message: 'Test moderne',
        media_player_entity_id: 'media_player.salon',
      },
      { entity_id: 'tts.home_assistant_cloud' },
    ],
  ]);
});

test('refuse tts.speak sans entité TTS', async () => {
  let called = false;
  const card = createCard({ tts_service: 'tts.speak' });
  card.hass = {
    callService() {
      called = true;
    },
  };

  await card._sendText('Test');

  assert.equal(called, false);
  assert.match(card._status.text, /tts_entity_id/);
  assert.equal(card._status.isError, true);
});

test('borne la taille de l’historique entre 1 et 100 entrées', () => {
  assert.equal(createCard({ history: { max_items: 0 } })._getHistoryLimit(), 1);
  assert.equal(createCard({ history: { max_items: 500 } })._getHistoryLimit(), 100);
  assert.equal(createCard({ history: { max_items: 'invalide' } })._getHistoryLimit(), 20);
});

test('refuse un nom de service mal formé', () => {
  const card = createCard();
  assert.throws(() => card._parseService('tts'), /domaine\.service/);
  assert.throws(() => card._parseService('tts.speak.extra'), /domaine\.service/);
});

test('bloque les doubles envois tant que le premier est en cours', async () => {
  let resolveCall;
  let callCount = 0;
  const card = createCard({
    tts_service: 'tts.speak',
    tts_entity_id: 'tts.home_assistant_cloud',
  });
  card.hass = {
    callService() {
      callCount += 1;
      return new Promise((resolve) => {
        resolveCall = resolve;
      });
    },
  };

  const firstSend = card._sendText('Premier');
  await card._sendText('Second');
  assert.equal(callCount, 1);

  resolveCall();
  await firstSend;
});
