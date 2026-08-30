# Audit complet — TTS Speaker Card

Audit réalisé le 30 août 2026, sur le commit `3880c97`. Aucun fichier n’a été modifié et le dépôt est resté propre.

## Résumé exécutif

Le projet est globalement fonctionnel, compact et compréhensible. Son cœur métier — appels TTS modernes et historiques, choix d’enceinte, presets, historique et prévention des doubles envois — est correctement conçu. Les 18 tests existants passent, la syntaxe JavaScript est valide et l’implémentation de `tts.speak` correspond à l’API Home Assistant actuelle : entité `tts.*` en cible et `media_player_entity_id` dans les données. [Documentation Home Assistant](https://www.home-assistant.io/actions/tts.speak/)

Aucun problème critique confirmé n’a été trouvé. La dette technique est néanmoins **modérée** : elle se concentre dans le rendu intégral du composant, l’absence de validation centralisée, des défauts d’accessibilité concrets et une stratégie de tests qui simule trop peu le DOM réel.

### Principales qualités

- Aucun package d’exécution : surface d’attaque et bundle très réduits.
- Carte distribuable directement par HACS, sans chaîne de build fragile.
- Compatibilité correcte avec `tts.speak` et les anciens services.
- Valeurs dynamiques correctement échappées avant injection HTML.
- `service_data` ne peut pas écraser le message ou la cible calculée.
- Double envoi bloqué pendant un appel en cours.
- Nettoyage du timer au démontage.
- États sans enceinte, historique vide et presets absents traités.
- Contrôle segmenté plutôt bien conçu au clavier : radiogroup, flèches, Home/End, roving tabindex.
- Documentation fonctionnelle détaillée.

### Principaux problèmes

- Le DOM complet de la carte est détruit puis recréé à chaque statut.
- Plusieurs défauts d’accessibilité : focus invisible, contraste insuffisant, switches sans nom accessible.
- L’historique est activé par défaut et peut être partagé involontairement entre plusieurs cartes.
- Les tests n’utilisent pas un vrai DOM et ne couvrent ni l’éditeur ni le parseur YAML.
- La configuration n’est pas suffisamment normalisée ou validée.
- Le statut est positionné en absolu, tronqué et fragile sur mobile.
- Le mode presets seul ne présente pas correctement l’état occupé pendant un appel lent.

### Les 5 actions ayant le plus d’impact

1. Remplacer les rerenders complets par des mises à jour ciblées du statut, de l’historique et de l’état occupé.
2. Corriger focus, contraste, noms accessibles des switches et disposition du statut.
3. Introduire une normalisation/validation unique de la configuration.
4. Ajouter des tests avec un DOM réel pour les interactions, l’éditeur et le focus.
5. Revoir la clé et le consentement de stockage de l’historique.

## Compréhension du projet

- **Nature** : carte Lovelace personnalisée pour Home Assistant.
- **Stack** : JavaScript ES modules, Web Components, Shadow DOM, CSS natif.
- **Framework** : aucun.
- **Bundler** : aucun.
- **Dépendances** : aucune dépendance npm déclarée.
- **Fichier distribué** : [tts-speaker-card.js](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js), 1 153 lignes, environ 44 Kio.
- **Composants** :
  - `TtsSpeakerCard` : rendu et interactions.
  - `TtsSpeakerCardEditor` : éditeur visuel Home Assistant.
- **État** : propriétés mutables de l’instance (`_history`, `_draftText`, `_selectedSpeaker`, `_status`, `_isSending`).
- **API** : `hass.callService`.
- **Persistance** : `localStorage`.
- **Styles** : CSS injecté dans le Shadow DOM à chaque rendu.
- **Preview** : serveur HTTP Node et parseur YAML maison.
- **Tests** : `node:test`, sans DOM réel.
- **CI** : validation HACS et tests sous Node 24.
- **SEO** : non applicable ; il s’agit d’un composant de dashboard authentifié, non d’un site public indexable.

## Tableau des problèmes

| Priorité | Catégorie | Problème | Impact | Localisation | Recommandation |
|---|---|---|---|---|---|
| 🟠 Important | Architecture/UX | Rerender intégral via `innerHTML` à chaque statut | Perte de focus, recréation des contrôles et listeners, coût multiplié avec plusieurs cartes | [tts-speaker-card.js:219](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:219), [tts-speaker-card.js:317](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:317) | Mettre à jour le DOM de façon ciblée et installer le style une seule fois |
| 🟠 Important | Accessibilité | `outline: none` sans remplacement sur `select` et `textarea` | Focus clavier invisible | [tts-speaker-card.js:355](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:355) | Ajouter un style `:focus-visible` contrasté |
| 🟠 Important | Accessibilité/UI | Blanc sur bleu `#03a9f4` : contraste de 2,63:1 | Texte des boutons illisible pour certains utilisateurs, sous WCAG AA | [tts-speaker-card.js:390](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:390), [tts-speaker-card.js:415](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:415) | Utiliser une couleur de texte calculée par le thème ou un bleu plus sombre |
| 🟠 Important | Accessibilité | Switches de l’éditeur sans label accessible associé | Fonction des switches incertaine au lecteur d’écran | [tts-speaker-card.js:999](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:999) | Ajouter `aria-label`/`aria-labelledby` ou utiliser les composants de formulaire HA prévus |
| 🟠 Important | UI/Responsive | Statut absolu, limité à 50 %, tronqué sur une ligne | Erreurs importantes masquées et chevauchement possible avec « Historiser » | [tts-speaker-card.js:504](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:504) | Réserver une ligne au statut ou utiliser une grille responsive |
| 🟠 Important | Confidentialité/UX | Clé d’historique dérivée uniquement du titre | Plusieurs cartes sans titre ou au titre similaire partagent leurs messages | [tts-speaker-card.js:130](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:130) | Dériver une clé stable de la carte ou exiger une clé explicite pour le partage |
| 🟠 Important | Qualité | Tests sans vrai DOM | Focus, événements, navigation clavier et éditeur non réellement testés | [tts-speaker-card.test.js:4](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/test/tts-speaker-card.test.js:4) | Ajouter quelques tests d’intégration DOM ciblés |
| 🟠 Important | Robustesse | Configuration faiblement validée | Doublons d’enceintes, presets vides et types incohérents produisent une UI invalide | [tts-speaker-card.js:56](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:56), [tts-speaker-card.js:256](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:256) | Centraliser validation et normalisation dans une fonction unique |
| 🟡 Moyen | UX | Presets/historique non désactivés pendant l’envoi | Les clics supplémentaires sont ignorés sans feedback, surtout en `presets_only` | [tts-speaker-card.js:682](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:682), [tts-speaker-card.js:712](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:712) | Appliquer `disabled` et `aria-busy` à toutes les actions d’envoi |
| 🟡 Moyen | Configuration | Choix automatique opaque de la première entité TTS | Mauvaise voix ou mauvais fournisseur si plusieurs entités existent | [tts-speaker-card.js:190](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:190) | Exposer l’entité TTS dans l’éditeur visuel lorsque plusieurs choix existent |
| 🟡 Moyen | Données/UX | Échec de `localStorage` silencieux | L’utilisateur pense que l’historique est conservé alors qu’il ne l’est pas | [tts-speaker-card.js:138](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:138) | Afficher un avertissement non bloquant une seule fois |
| 🟡 Moyen | Éditeur | Normalisation des enceintes différente entre carte et éditeur | Espaces et formats atypiques sont acceptés différemment | [tts-speaker-card.js:100](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:100), [tts-speaker-card.js:818](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:818) | Partager le même normaliseur |
| 🟡 Moyen | Preview | Le parseur prétend accepter le YAML habituel mais en rejette une partie | Configurations valides rejetées : listes inline YAML, blocs `|`, ancres, etc. | [preview-yaml.mjs:27](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/preview-yaml.mjs:27), [preview.html:173](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/preview.html:173) | Documenter le sous-ensemble ou renforcer le parseur |
| 🟡 Moyen | Maintenabilité | Carte et éditeur concentrés dans un fichier de 1 153 lignes | Rendu, métier, stockage et CSS difficiles à tester séparément | [tts-speaker-card.js](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js) | Séparer logiquement helpers, normalisation et rendu tout en conservant un artefact HACS unique |
| 🟡 Moyen | Responsive | Largeurs minimales des boutons incompatibles avec les très petits conteneurs | Overflow possible sous environ 260 px | [tts-speaker-card.js:403](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:403), [tts-speaker-card.js:539](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:539) | Empiler les boutons sur un breakpoint plus pertinent |
| 🟡 Moyen | Accessibilité | Suppressions nommées uniquement « Supprimer » | Contexte de l’élément supprimé absent au lecteur d’écran | [tts-speaker-card.js:298](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:298) | Inclure un extrait du message dans le nom accessible |
| 🟡 Moyen | Sécurité CI | Actions GitHub référencées par branches/tags mutables | Risque supply-chain et exécutions non reproductibles | [.github/workflows/validate.yaml:14](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/.github/workflows/validate.yaml:14), [.github/workflows/validate.yml:13](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/.github/workflows/validate.yml:13) | Épingler les actions à des SHA vérifiés |
| 🟢 Mineur | Release | Version npm `1.0.0` incohérente avec le dernier tag `v0.2.3` | Confusion pour maintenance et automatisation | [package.json:3](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/package.json:3) | Définir une source de version cohérente |
| 🟢 Mineur | CI | Node 22 annoncé mais seule la version 24 est testée | Compatibilité minimale non garantie par la CI | [README.md:167](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/README.md:167), [.github/workflows/validate.yml:15](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/.github/workflows/validate.yml:15) | Tester Node 22 et la version courante |
| 🟢 Mineur | Accessibilité | Cibles tactiles de suppression de 38/40 px | En dessous de la cible recommandée de 44 px | [tts-speaker-card.js:478](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:478), [tts-speaker-card.js:944](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:944) | Passer à au moins 44×44 px |
| 🟢 Mineur | Accessibilité | Pas de `prefers-reduced-motion` | Animations très légères mais non désactivables | [tts-speaker-card.js:385](/Users/thomasbeuraert/Documents/lovelace-tts-speaker-card/tts-speaker-card.js:385) | Désactiver transitions et transformations si réduction demandée |

## Analyse détaillée des problèmes importants

### 1. Rerender intégral et perte de focus

`_setStatus()` appelle `_render()`, qui remplace tout le contenu du Shadow DOM. Le timer de cinq secondes fait la même chose lorsqu’il efface le statut.

Scénario concret :

1. L’utilisateur envoie un message.
2. Il commence immédiatement à saisir le suivant.
3. Le statut précédent expire.
4. Le `textarea` est remplacé par un nouveau nœud.
5. Le texte est restauré, mais le focus et la position du curseur sont perdus.

La décision de ne pas rerendre dans le setter `hass` pour protéger la saisie est bonne, mais les changements de statut réintroduisent exactement le problème évité.

Correction : créer le squelette une fois, conserver des références aux éléments, puis mettre à jour `textContent`, `disabled`, `aria-busy`, l’historique et les valeurs concernées. À défaut, capturer/restaurer l’élément actif et la sélection du textarea.

- Effort : **moyen**
- Confiance : **élevée**, conséquence directe du remplacement DOM ; non observée visuellement faute de navigateur.

### 2. Accessibilité clavier et contraste

Les champs `select` et `textarea` reçoivent explicitement `outline: none` sans style de remplacement. Un utilisateur clavier ne peut donc pas identifier avec certitude le champ actif.

Le fallback principal utilise `#03a9f4` avec du blanc. Le ratio calculé est de **2,63:1**, inférieur au minimum de 4,5:1 pour le texte normal. Cela concerne notamment le bouton d’envoi, le preset principal et les segments sélectionnés.

Correction :

```css
select:focus-visible,
textarea:focus-visible,
button:focus-visible {
  outline: 2px solid var(--primary-text-color);
  outline-offset: 2px;
}
```

Pour le contraste, utiliser une variable de texte explicitement adaptée au fond ou assombrir la couleur primaire. Comme le thème Home Assistant peut remplacer ces couleurs, le défaut est confirmé pour les fallbacks mais dépend du thème effectif.

- Effort : **faible**
- Confiance : **élevée pour les fallbacks**, affichage réel dépendant du thème.

### 3. Switches de l’éditeur sans nom accessible

Les textes visuels sont des `<span>` voisins de `<ha-switch>`, sans `aria-label`, `aria-labelledby` ou association explicite. L’encapsulation Shadow DOM de `ha-switch` ne permet pas de supposer que le texte voisin devient automatiquement son nom accessible.

Correction : donner un identifiant au texte et référencer celui-ci avec `aria-labelledby`, ou employer le composant de formulaire Home Assistant qui gère déjà label, description et accessibilité.

- Effort : **faible**
- Confiance : **moyenne à élevée**, selon le comportement interne exact de la version de `ha-switch`.

### 4. Historique partagé involontairement

Sans `history.storage_key`, la clé dépend uniquement du titre slugifié. Toutes les cartes sans titre utilisent `tts-speaker-card.history.default`. Deux titres différents mais donnant le même slug partagent aussi les données.

Conséquences :

- un message destiné à une pièce apparaît sur une autre carte ;
- un clic peut immédiatement l’envoyer sur une autre enceinte ;
- les messages persistent entre sessions Home Assistant utilisant le même profil de navigateur ;
- des textes potentiellement privés sont stockés en clair, alors que l’historique est actif par défaut.

La documentation explique le stockage local et la clé personnalisée, ce qui réduit la surprise pour un utilisateur avancé, mais pas le risque par défaut.

Correction : dériver par défaut une clé incluant au minimum les enceintes configurées, ou désactiver l’historique tant qu’une clé stable n’a pas été déterminée. Le partage doit être explicite via `storage_key`.

- Effort : **faible à moyen**
- Confiance : **élevée**

### 5. Validation de configuration insuffisante

`setConfig` vérifie seulement que la valeur est un objet. Il ne rejette pas un tableau et ne valide pas précisément les champs.

Cas concrets :

- deux enceintes avec le même `entity_id` peuvent être rendues toutes deux avec `aria-checked="true"` ;
- un preset vide produit un bouton actif qui répond « Le texte est vide » ;
- `service_data`, `history` ou les booléens peuvent recevoir des types inattendus ;
- les identifiants `tts.*` et `media_player.*` ne sont pas vérifiés ;
- les espaces sont normalisés différemment dans la carte et l’éditeur.

Correction : une fonction pure `normalizeConfig(config)` utilisée par la carte, l’éditeur et les tests. Elle doit borner les nombres, normaliser les chaînes, dédupliquer les enceintes et ignorer ou signaler les presets incomplets.

- Effort : **moyen**
- Confiance : **élevée**

### 6. Tests trop éloignés du navigateur

`FakeShadowRoot.querySelector()` retourne toujours `null` et `querySelectorAll()` toujours `[]`. Les tests vérifient principalement des chaînes HTML et appellent directement des méthodes internes.

Ils ne peuvent donc pas détecter :

- perte de focus ;
- boutons réellement cliquables ;
- navigation clavier du radiogroup ;
- état `disabled`/`aria-busy` ;
- labels accessibles ;
- changement de sélection ;
- fonctionnement de l’éditeur ;
- régression dans le parseur YAML ;
- écrasement potentiel de modifications successives dans l’éditeur.

Il n’est pas nécessaire de rechercher une couverture massive. Quelques scénarios DOM réels apporteraient l’essentiel de la valeur.

- Effort : **moyen**
- Confiance : **élevée**

## Performance

### Optimisations réellement importantes

- Éviter le remplacement complet du Shadow DOM.
- Ne pas réinjecter et reparcourir tout le CSS à chaque statut.
- Ne pas recréer tous les handlers après chaque envoi ou suppression.

### Optimisations secondaires

- Normaliser les enceintes une seule fois au changement de configuration.
- Mettre en cache les fragments statiques de style.
- Éviter les deux rerenders successifs en fin d’envoi : `_setStatus()` puis `finally`.

### Optimisations prématurées ou inutiles

- Ajouter un bundler uniquement pour réduire les 44 Kio actuels.
- Introduire du lazy loading ou du code splitting.
- Ajouter une bibliothèque de gestion d’état.
- Mémoriser chaque petite expression.
- Optimiser l’image `icon.png` pour le runtime : elle n’est pas chargée par la carte.

Le bundle est déjà très petit et sans dépendance. La performance réseau n’est pas un problème significatif.

## UX et UI

Points positifs :

- messages d’erreur compréhensibles ;
- bouton d’envoi désactivé pendant l’appel ;
- raccourci clavier documenté ;
- sélection automatique logique pour une enceinte unique ;
- état vide de l’historique ;
- mode presets seul clairement pris en charge.

Points à améliorer :

- Le statut peut masquer précisément la partie utile d’une erreur.
- Les erreurs disparaissent après cinq secondes comme les succès ; une erreur pourrait rester jusqu’à la prochaine action.
- Les presets et éléments d’historique restent visuellement actifs durant un appel.
- Le choix automatique de l’entité TTS n’est pas explicite lorsque plusieurs fournisseurs existent.
- Quand l’historique est désactivé, le contrôle « Historiser » reste affiché mais désactivé, ce qui ajoute une interaction morte.
- Les boutons d’historique envoient immédiatement le texte ; ce comportement est documenté, mais leur nom accessible pourrait annoncer « Envoyer à nouveau… » plutôt que seulement afficher le message.

Le projet possède déjà une petite base cohérente de composants visuels. Il n’a pas besoin d’un design system séparé ; quelques tokens internes pour rayon, espacement, hauteur interactive et couleurs d’état suffiraient.

## Responsive

La grille des presets et le sélecteur segmenté utilisent correctement `auto-fit` et `minmax`. L’éditeur passe également ses presets sur une disposition mobile raisonnable.

Risques déduits du CSS :

- En dessous d’environ 260 px de largeur utile, les minima des boutons d’envoi et d’effacement peuvent provoquer un overflow.
- Le breakpoint mobile de `.row` ne change pratiquement rien à la grille.
- Le statut absolu peut chevaucher le libellé de checkbox sur les petits écrans.
- Les textes longs du statut sont tronqués.
- Les boutons de suppression font 38/40 px.
- Les très longs titres et libellés sont globalement mieux traités dans les segments grâce à `overflow-wrap:anywhere`.

Ces risques n’ont pas été vérifiés visuellement, le serveur `localhost:3000` n’étant pas joignable depuis l’environnement.

## Sécurité

### Points satisfaisants

- Aucun secret ou fichier d’environnement exposé.
- Aucune dépendance d’exécution à auditer.
- Toutes les valeurs insérées dans `innerHTML` passent par `_escapeHtml`.
- Pas de `eval`, `Function`, rendu HTML arbitraire ou redirection.
- Les champs critiques de l’appel TTS écrasent correctement les éventuelles valeurs de `service_data`.
- Le serveur de preview est limité à `127.0.0.1` et protège contre la traversée de répertoires.
- La configuration des services est sous le contrôle d’un administrateur Home Assistant, ce qui limite le risque d’abus par entrée non fiable.

### Risques modérés

Les actions CI sont référencées avec `@main`, `@v6` ou un autre tag mutable. GitHub indique que seul un SHA complet rend la référence immuable. [Recommandations de sécurité GitHub Actions](https://docs.github.com/en/actions/reference/security/secure-use?learn=getting_started&learnProduct=actions)

L’historique local relève davantage de la confidentialité que d’une vulnérabilité : textes en clair et partage possible entre cartes/utilisateurs du même profil navigateur.

Aucune vulnérabilité XSS confirmée n’a été trouvée.

## Preview et parseur YAML

Le parseur fonctionne pour la configuration documentée et son round-trip principal réussit. Il ne s’agit toutefois pas d’un parseur YAML général.

Tests ciblés confirmés :

- `speakers: [media_player.salon, media_player.cuisine]` est rejeté, bien que valide en YAML.
- Les blocs multilignes `message: |` sont rejetés.
- Ancres, aliases et plusieurs syntaxes YAML usuelles ne sont pas pris en charge.

La phrase « La syntaxe habituelle de configuration Home Assistant est acceptée » est donc trop large. Comme la preview est un outil de développement et non le produit, la priorité reste moyenne.

## Qualité, CI et tests

Vérifications exécutées :

- `npm test` : **18/18 tests réussis**.
- `npm run check` : **réussi**.
- `node --test test/tts-speaker-card.test.js` : **réussi**.
- `git diff --check` : **réussi**.
- Node utilisé : **26.8.1**.
- Dépôt après audit : **propre**.
- Serveur `http://localhost:3000` : **non joignable depuis l’environnement**.
- Audit npm : non pertinent, aucune dépendance et aucun lockfile.

`npm run check` exécute seulement `node --check` : il ne constitue ni un lint, ni un type checking. L’absence de TypeScript n’est pas problématique en soi, mais quelques annotations JSDoc sur la configuration et les structures `Speaker`, `Preset` et `HistoryItem` apporteraient une vérification utile sans changer la stack.

## Roadmap finale

### Quick wins

| Action | Impact | Effort | Risque |
|---|---|---|---|
| Restaurer un focus visible sur tous les contrôles | Élevé | Faible | Faible |
| Corriger le contraste des actions primaires | Élevé | Faible | Faible |
| Ajouter des noms accessibles aux switches et suppressions | Élevé | Faible | Faible |
| Ne plus tronquer le statut et le sortir du positionnement absolu | Élevé | Faible | Faible |
| Désactiver presets/historique pendant l’appel | Moyen | Faible | Faible |
| Épingler les actions CI à des SHA | Moyen | Faible | Faible |
| Aligner versions npm, tags et matrice Node | Faible | Faible | Faible |

### Priorité haute

| Action | Impact | Effort | Risque |
|---|---|---|---|
| Remplacer les rerenders complets par des mises à jour ciblées | Très élevé | Moyen | Moyen |
| Centraliser validation et normalisation de configuration | Élevé | Moyen | Faible |
| Corriger la stratégie de clé de l’historique | Élevé | Faible à moyen | Moyen, migration des historiques existants |
| Ajouter des tests DOM sur focus, clavier, busy et erreurs | Élevé | Moyen | Faible |
| Tester l’éditeur visuel et ses modifications successives | Élevé | Moyen | Faible |

### Améliorations structurelles

| Action | Impact | Effort | Risque |
|---|---|---|---|
| Séparer logique TTS, stockage, normalisation et rendu | Moyen à élevé | Moyen | Moyen |
| Partager les helpers entre carte et éditeur | Moyen | Faible à moyen | Faible |
| Ajouter des types JSDoc et un contrôle statique | Moyen | Moyen | Faible |
| Tester le parseur YAML ou restreindre explicitement sa promesse | Moyen | Faible à moyen | Faible |
| Exposer le fournisseur TTS dans l’éditeur lorsqu’il est ambigu | Moyen | Moyen | Faible |

### Polish

| Action | Impact | Effort | Risque |
|---|---|---|---|
| Passer les cibles tactiles à 44 px | Moyen | Faible | Faible |
| Empiler les actions sur les très petites largeurs | Moyen | Faible | Faible |
| Ajouter `prefers-reduced-motion` | Faible | Faible | Faible |
| Remplacer les pseudo-titres `<label>` par des headings adaptés | Faible | Faible | Faible |
| Clarifier l’action immédiate des éléments d’historique | Faible à moyen | Faible | Faible |

Conclusion : le projet repose sur une base saine et pragmatique. Une refonte n’est pas justifiée. Le meilleur investissement consiste à fiabiliser le cycle de rendu, l’accessibilité et les tests d’interaction, puis à durcir la normalisation et le stockage de l’historique.