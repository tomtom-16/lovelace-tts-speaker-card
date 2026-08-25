# TTS Speaker Card

<p align="center">
  <img src="icon.png" alt="Icône TTS Speaker Card" width="160">
</p>

Carte Lovelace pour envoyer rapidement un texte vers une enceinte Home Assistant.

## Fonctionnalités

- Éditeur visuel intégré au tableau de bord Home Assistant
- Sélection des enceintes depuis les entités `media_player` connues
- Masquage automatique du sélecteur lorsqu’une seule enceinte est configurée
- Compatibilité avec `tts.speak` et les anciens services TTS
- Messages prédéfinis envoyés en un clic
- Mode `presets_only` pour créer une carte composée uniquement de boutons
- Historique local, dédupliqué et limité
- Raccourci `Ctrl+Entrée` ou `Cmd+Entrée`
- Libellés, langue et données de service personnalisables
- Préfixe TTS optionnel pour ajouter automatiquement une pause ou un texte avant chaque message

## Installation

### Avec HACS

1. Dans HACS, ajoute ce dépôt comme dépôt personnalisé de type **Tableau de bord**.
2. Télécharge **TTS Speaker Card**.
3. Vérifie que HACS a ajouté la ressource au tableau de bord, puis recharge Home Assistant.

HACS gère normalement l’URL de la ressource. Si tu dois l’ajouter manuellement, utilise le chemin affiché par HACS dans **Paramètres > Tableaux de bord > Ressources**.

### Manuellement

1. Copie `tts-speaker-card.js` dans le dossier `config/www/`.
2. Ajoute cette ressource dans **Paramètres > Tableaux de bord > Ressources** :

```yaml
url: /local/tts-speaker-card.js
type: module
```

## Configuration visuelle

Ajoute la carte depuis le sélecteur de cartes du tableau de bord, puis utilise l’onglet visuel. Le champ **Enceintes** est automatiquement alimenté avec les entités `media_player` disponibles dans Home Assistant. L’éditeur permet aussi de régler la langue, les presets, l’historique et le mode presets uniquement.

La configuration YAML reste disponible pour les usages avancés. Les paramètres techniques `tts_service`, `tts_entity_id` et `tts_prefix`, ainsi que les options de personnalisation `message_placeholder`, `history_checkbox_label` et `history.storage_key`, sont volontairement disponibles uniquement dans l’éditeur YAML.

## Configuration recommandée

L’action moderne `tts.speak` nécessite une entité TTS pour la voix et une ou plusieurs entités `media_player` pour la sortie :

```yaml
type: custom:tts-speaker-card
title: TTS rapide
tts_service: tts.speak
tts_entity_id: tts.home_assistant_cloud
language: fr-FR
tts_prefix: "… … "

speakers:
  - entity_id: media_player.salon
    label: Salon
  - entity_id: media_player.cuisine
    label: Cuisine

presets:
  - label: Bonjour
    text: "Bonjour tout le monde"
  - label: Repas
    text: "Le repas est prêt"

presets_only: false

history:
  enabled: true
  max_items: 20
  allow_delete: true
  storage_key: tts-maison

service_data:
  cache: true
```

`tts_entity_id` peut correspondre à une entité disponible dans **Outils de développement > États**, par exemple `tts.home_assistant_cloud`. Si ce paramètre est vide avec `tts.speak`, la carte utilise automatiquement la première entité `tts.*` disponible.

`tts_prefix` permet d’ajouter automatiquement un préfixe devant chaque message envoyé au moteur TTS. Si ce paramètre est absent ou vide, aucun préfixe n’est ajouté.
Cette option peut notamment être utile avec certaines enceintes qui nécessitent un court délai pour initialiser leur sortie audio. Par exemple :
```yaml
tts_prefix: "… … "
```

## Ancien service TTS

Les services historiques qui prennent directement le lecteur multimédia dans `entity_id` restent pris en charge :

```yaml
type: custom:tts-speaker-card
tts_service: tts.google_translate_say
language: fr-fr
speakers:
  - entity_id: media_player.salon
    label: Salon
```

Dans ce mode, `tts_entity_id` n’est pas utilisé.

## Paramètres

| Paramètre | Défaut | Description |
| --- | --- | --- |
| `title` | vide | Titre de la carte |
| `tts_service` | `tts.speak` | Action Home Assistant au format `domaine.service` (YAML uniquement) |
| `tts_entity_id` | vide | Entité `tts.*` ; si vide avec `tts.speak`, la première entité disponible est utilisée (YAML uniquement) |
| `language` | vide | Langue transmise au moteur TTS |
| `tts_prefix` | vide | Préfixe ajouté automatiquement devant chaque message TTS (YAML uniquement) |
| `speakers` | `[]` | Liste des sorties `{ entity_id, label }` |
| `presets` | `[]` | Liste des messages `{ label, text }` |
| `presets_only` | `false` | Masque la saisie et l’historique pour n’afficher que les presets |
| `service_data` | `{}` | Données supplémentaires transmises à l’action |
| `clear_after_send` | `true` | Efface le texte après un envoi réussi |
| `auto_select_first_speaker` | `true` | Sélectionne automatiquement la première enceinte |
| `status_timeout_ms` | `5000` | Durée d’affichage du statut ; `0` le conserve |
| `message_placeholder` | `Saisis ton texte ici…` | Texte indicatif du champ (YAML uniquement) |
| `send_label` | `Envoyer` | Libellé du bouton d’envoi |
| `clear_label` | `Effacer` | Libellé du bouton d’effacement |
| `speaker_label` | `Enceinte` | Libellé de la liste des enceintes |
| `history_label` | `Historique` | Titre de l’historique |
| `presets_label` | `Messages rapides` | Titre des messages prédéfinis |
| `history_checkbox_label` | `Mémoriser le message` | Libellé de la case d’historique (YAML uniquement) |

### Comportement selon le nombre d’enceintes

- Sans enceinte, la carte affiche une erreur de configuration.
- Avec une seule enceinte, celle-ci est utilisée directement et le sélecteur est masqué.
- Avec plusieurs enceintes, le sélecteur reste affiché.

### Mode presets uniquement

Active **Afficher uniquement les presets** dans l’éditeur visuel ou ajoute :

```yaml
presets_only: true
```

Le champ texte, les boutons d’envoi/effacement et l’historique sont alors masqués. Avec un seul preset, la carte l’affiche comme un bouton principal pleine largeur. Le sélecteur d’enceinte n’apparaît que si plusieurs enceintes sont configurées.

### Historique

L’historique est stocké dans le navigateur, pas dans Home Assistant. `max_items` est borné entre 1 et 100.

```yaml
history:
  enabled: true
  max_items: 20
  allow_delete: true
  storage_key: tts-maison
```

- `enabled` active l’historique.
- `max_items` fixe le nombre maximal d’entrées.
- `allow_delete` affiche les boutons de suppression.
- `storage_key` permet de partager ou séparer l’historique entre plusieurs cartes (YAML uniquement).
- Cliquer sur un message de l’historique l’envoie immédiatement vers l’enceinte sélectionnée, comme un preset.

## Développement

Le projet n’a aucune dépendance d’exécution. Node.js 22 ou plus récent suffit pour lancer les vérifications :

```bash
npm test
npm run check
```
