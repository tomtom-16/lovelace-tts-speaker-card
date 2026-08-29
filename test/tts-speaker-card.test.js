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

test('refuse tts.speak si aucune entité TTS n’est configurée ou disponible', async () => {
  let called = false;
  const card = createCard({ tts_service: 'tts.speak' });
  card.hass = {
    callService() {
      called = true;
    },
  };

  await card._sendText('Test');

  assert.equal(called, false);
  assert.match(card._status.text, /Aucune entité TTS/);
  assert.equal(card._status.isError, true);
});

test('détecte automatiquement une entité TTS disponible', async () => {
  const calls = [];
  const card = createCard({ tts_service: 'tts.speak', tts_entity_id: '' });
  card.hass = {
    states: {
      'tts.indisponible': { state: 'unavailable' },
      'tts.google_translate_fr_com': { state: 'idle' },
    },
    callService(...args) {
      calls.push(args);
    },
  };

  await card._sendText('Bonjour');

  assert.deepEqual(calls[0][3], { entity_id: 'tts.google_translate_fr_com' });
});

test('préfère l’entité TTS explicitement configurée', () => {
  const card = createCard({ tts_entity_id: 'tts.piper' });
  card.hass = {
    states: {
      'tts.google_translate_fr_com': { state: 'idle' },
    },
  };

  assert.equal(card._getTtsEntityId(), 'tts.piper');
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

test('affiche une erreur et masque les contrôles sans enceinte', () => {
  const card = new TtsSpeakerCard();
  card.setConfig({ speakers: [] });

  assert.match(card.shadowRoot.innerHTML, /Aucune enceinte n’est configurée/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /id="ttsText"/);
});

test('adapte le sélecteur au nombre d’enceintes', () => {
  const singleSpeakerCard = createCard();
  assert.doesNotMatch(singleSpeakerCard.shadowRoot.innerHTML, /class="segmented-control"/);
  assert.doesNotMatch(singleSpeakerCard.shadowRoot.innerHTML, /id="speakerSelect"/);

  const multipleSpeakersCard = createCard({
    speakers: [
      { entity_id: 'media_player.salon', label: 'Salon' },
      { entity_id: 'media_player.cuisine', label: 'Cuisine' },
    ],
  });
  assert.match(multipleSpeakersCard.shadowRoot.innerHTML, /class="segmented-control"/);
  assert.doesNotMatch(multipleSpeakersCard.shadowRoot.innerHTML, /id="speakerSelect"/);
  assert.match(multipleSpeakersCard.shadowRoot.innerHTML, /role="radiogroup"/);
  assert.match(multipleSpeakersCard.shadowRoot.innerHTML, /data-speaker-id="media_player\.salon" aria-checked="true"/);
  assert.match(multipleSpeakersCard.shadowRoot.innerHTML, /data-speaker-id="media_player\.cuisine" aria-checked="false"/);

  const fourSpeakersCard = createCard({
    speakers: [
      { entity_id: 'media_player.salon', label: 'Salon' },
      { entity_id: 'media_player.cuisine', label: 'Cuisine' },
      { entity_id: 'media_player.bureau', label: 'Bureau' },
      { entity_id: 'media_player.chambre', label: 'Chambre' },
    ],
  });
  assert.match(fourSpeakersCard.shadowRoot.innerHTML, /class="segmented-control"/);

  const fiveSpeakersCard = createCard({
    speakers: [
      'media_player.salon',
      'media_player.cuisine',
      'media_player.bureau',
      'media_player.chambre',
      'media_player.jardin',
    ],
  });
  assert.doesNotMatch(fiveSpeakersCard.shadowRoot.innerHTML, /class="segmented-control"/);
  assert.match(fiveSpeakersCard.shadowRoot.innerHTML, /<select id="speakerSelect"/);
});

test('supprime l’espacement réservé au titre lorsque celui-ci est vide', () => {
  const cardWithoutTitle = createCard();
  const cardWithTitle = createCard({ title: 'Annonce' });

  assert.doesNotMatch(cardWithoutTitle.shadowRoot.innerHTML, /<div class="header">/);
  assert.match(cardWithTitle.shadowRoot.innerHTML, /<div class="header">/);
});

test('le mode presets only masque la saisie et met en avant un preset unique', () => {
  const card = createCard({
    presets_only: true,
    presets: [{ label: 'Repas', text: 'Le repas est prêt' }],
  });

  assert.doesNotMatch(card.shadowRoot.innerHTML, /id="ttsText"/);
  assert.doesNotMatch(card.shadowRoot.innerHTML, /Historique/);
  assert.match(card.shadowRoot.innerHTML, /single-preset/);
});

test('efface réellement le brouillon après un envoi réussi', async () => {
  const card = createCard({
    tts_service: 'tts.google_translate_say',
    clear_after_send: true,
  });
  card._draftText = 'Texte à effacer';
  card.hass = { callService() {} };

  await card._sendText(card._draftText);

  assert.equal(card._draftText, '');
});

test('envoie immédiatement un message sélectionné dans l’historique', async () => {
  const calls = [];
  const card = createCard({
    tts_service: 'tts.google_translate_say',
    clear_after_send: false,
  });
  card._history = [{ text: 'Message de l’historique', ts: Date.now() }];
  card.hass = { callService(...args) { calls.push(args); } };

  await card._sendHistoryItem(0);

  assert.equal(card._draftText, 'Message de l’historique');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][2].message, 'Message de l’historique');
});

test('accepte aussi les identifiants d’enceintes issus de l’éditeur visuel', () => {
  const card = createCard({ speakers: ['media_player.bureau'] });
  assert.deepEqual(card._getSpeakers(), [{ entity_id: 'media_player.bureau', label: '' }]);
  assert.equal(card._getSelectedSpeaker(), 'media_player.bureau');
});

test('enregistre un éditeur visuel pour la carte', () => {
  assert.ok(registeredElements.get('tts-speaker-card-editor'));
});
