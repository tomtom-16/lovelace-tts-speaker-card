import assert from 'node:assert/strict';
import test from 'node:test';
import { formatYaml, parseYaml } from '../preview-yaml.mjs';

test('accepte les listes et objets YAML inline', () => {
  assert.deepEqual(parseYaml('speakers: [media_player.salon, media_player.cuisine]'), {
    speakers: ['media_player.salon', 'media_player.cuisine'],
  });
  assert.deepEqual(parseYaml('speaker: {entity_id: media_player.salon, label: Salon}'), {
    speaker: { entity_id: 'media_player.salon', label: 'Salon' },
  });
});

test('accepte les blocs multilignes YAML', () => {
  assert.deepEqual(parseYaml('message: |\n  Première ligne\n  Deuxième ligne'), {
    message: 'Première ligne\nDeuxième ligne\n',
  });
  assert.deepEqual(parseYaml('message: >\n  Première ligne\n  Deuxième ligne'), {
    message: 'Première ligne Deuxième ligne\n',
  });
});

test('conserve le round-trip de la configuration de preview', () => {
  const config = {
    speakers: ['media_player.salon', 'media_player.cuisine'],
    presets: [{ label: 'Bonjour', text: 'Bonjour à tous' }],
    history: { enabled: true, max_items: 5 },
  };
  assert.deepEqual(parseYaml(formatYaml(config)), config);
});
