# TTS Speaker Card

Carte Lovelace pour envoyer rapidement un texte vers une enceinte Home Assistant.

## Fonctionnalités

- Sélection d’une enceinte configurée en YAML
- Compatibilité avec `tts.speak` et les anciens services TTS
- Messages prédéfinis envoyés en un clic
- Historique local, dédupliqué et limité
- Raccourci `Ctrl+Entrée` ou `Cmd+Entrée`
- Libellés, langue et données de service personnalisables

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

## Configuration recommandée

L’action moderne `tts.speak` nécessite une entité TTS pour la voix et une ou plusieurs entités `media_player` pour la sortie :

```yaml
type: custom:tts-speaker-card
title: TTS rapide
tts_service: tts.speak
tts_entity_id: tts.home_assistant_cloud
language: fr-FR

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

history:
  enabled: true
  max_items: 20
  allow_delete: true
  storage_key: tts-maison

service_data:
  cache: true
```

`tts_entity_id` doit correspondre à une entité disponible dans **Outils de développement > États**, par exemple `tts.home_assistant_cloud`.

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
| `tts_service` | `tts.speak` | Action Home Assistant au format `domaine.service` |
| `tts_entity_id` | vide | Entité `tts.*`, obligatoire avec `tts.speak` |
| `language` | vide | Langue transmise au moteur TTS |
| `speakers` | `[]` | Liste des sorties `{ entity_id, label }` |
| `presets` | `[]` | Liste des messages `{ label, text }` |
| `service_data` | `{}` | Données supplémentaires transmises à l’action |
| `clear_after_send` | `true` | Efface le texte après un envoi réussi |
| `auto_select_first_speaker` | `true` | Sélectionne automatiquement la première enceinte |
| `status_timeout_ms` | `5000` | Durée d’affichage du statut ; `0` le conserve |
| `message_placeholder` | `Saisis ton texte ici…` | Texte indicatif du champ |
| `send_label` | `Envoyer` | Libellé du bouton d’envoi |
| `clear_label` | `Effacer` | Libellé du bouton d’effacement |
| `speaker_label` | `Enceinte` | Libellé de la liste des enceintes |
| `history_label` | `Historique` | Titre de l’historique |
| `presets_label` | `Messages rapides` | Titre des messages prédéfinis |
| `history_checkbox_label` | `Mémoriser le message` | Libellé de la case d’historique |

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
- `storage_key` permet de partager ou séparer l’historique entre plusieurs cartes.

## Développement

Le projet n’a aucune dépendance d’exécution. Node.js 22 ou plus récent suffit pour lancer les vérifications :

```bash
npm test
npm run check
```
