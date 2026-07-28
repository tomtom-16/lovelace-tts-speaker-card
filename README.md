# TTS Speaker Card

Carte Lovelace Home Assistant pour envoyer un texte en text-to-speech vers une enceinte choisie.

## Fonctionnalités

- Sélection d’une enceinte configurée dans le YAML
- Envoi d’un message TTS
- Boutons de messages prédéfinis
- Historique local des textes envoyés
- Suppression d’une entrée d’historique
- Paramètre global de langue pour toute la carte

## Installation

### Via HACS

1. Ajoute ce dépôt dans HACS comme **Tableau de bord**.
2. Installe la carte.
3. Recharge Home Assistant et vide le cache du navigateur si nécessaire.

### Installation manuelle

Ajoute la ressource JavaScript dans Home Assistant :

```yaml
url: /hacsfiles/tts-speaker-card.js
type: module
```

Puis utilise la carte dans un dashboard Lovelace.

## Configuration YAML

Exemple complet :

```yaml
type: custom:tts-speaker-card
title: TTS rapide
language: fr-fr
tts_service: tts.google_translate_say

speakers:
  - entity_id: media_player.salon
    label: Salon
  - entity_id: media_player.cuisine
    label: Cuisine
  - entity_id: media_player.chambre
    label: Chambre

presets:
  - label: Bonjour
    text: "Bonjour tout le monde"
  - label: Repas
    text: "Le repas est prêt"
  - label: Sortie
    text: "Nous partons dans cinq minutes"

history:
  enabled: true
  max_items: 20
  allow_delete: true
  storage_key: tts-maison
```

## Paramètres disponibles

### `title`
Titre affiché sur la carte.

### `language`
Langue utilisée pour le service TTS, par exemple :

```yaml
language: fr-fr
```

### `tts_service`
Nom complet du service TTS à appeler.

Exemple :

```yaml
tts_service: tts.google_translate_say
```

### `speakers`
Liste des enceintes disponibles dans la carte.

Chaque entrée peut contenir :

- `entity_id` : l’entité Home Assistant de l’enceinte
- `label` : le nom affiché dans la liste déroulante

Exemple :

```yaml
speakers:
  - entity_id: media_player.salon
    label: Salon
```

### `presets`
Liste de textes prédéfinis.  
Chaque bouton envoie le texte correspondant en un seul clic.

Exemple :

```yaml
presets:
  - label: Bonjour
    text: "Bonjour tout le monde"
```

### `history`
Options de l’historique local.

Champs disponibles :

- `enabled` : active ou non l’historique
- `max_items` : nombre maximum d’entrées gardées
- `allow_delete` : affiche le bouton de suppression
- `storage_key` : clé de stockage personnalisée

Exemple :

```yaml
history:
  enabled: true
  max_items: 20
  allow_delete: true
  storage_key: tts-maison
```

## Exemple minimal

```yaml
type: custom:tts-speaker-card
speakers:
  - entity_id: media_player.salon
    label: Salon
```
