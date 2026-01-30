# Problème de changement d'écran lors de l'utilisation du raccourci clavier

## Description du problème

Actuellement, lorsque l'utilisateur appuie sur le raccourci clavier (par défaut `Cmd+Shift+Space`) pour commencer l'enregistrement audio, la fenêtre d'enregistrement apparaît sur l'écran principal du système (celui avec la barre des tâches macOS) au lieu de rester sur l'écran où l'utilisateur est actuellement positionné.

### Comportement actuel
1. L'utilisateur travaille sur un écran secondaire (par exemple avec un navigateur en plein écran)
2. Il appuie sur le raccourci clavier pour commencer à parler
3. La fenêtre d'enregistrement apparaît sur l'écran principal
4. L'utilisateur doit déplacer son regard vers l'écran principal pour voir la fenêtre d'enregistrement

### Problème identifié
Le code dans `src/main.js` utilise `screen.getPrimaryDisplay()` pour centrer la fenêtre d'enregistrement :

```javascript
const { screen } = require('electron');
const primaryDisplay = screen.getPrimaryDisplay();
const { width, height } = primaryDisplay.workAreaSize;

recordingWindow.setPosition(
  Math.floor((width - 400) / 2),
  Math.floor((height - 120) / 2)
);
```

Cette approche présente deux problèmes :
1. `getPrimaryDisplay()` retourne toujours l'écran principal (avec la Dock), pas l'écran où l'utilisateur travaille
2. Sur les configurations multi-écran, l'écran principal n'est pas forcément celui où l'utilisateur a le focus

## Solution proposée

### Objectif
La fenêtre d'enregistrement doit apparaître sur l'écran où l'utilisateur a actuellement le focus, sans changer d'écran.

### Approche technique

#### 1. Détection de l'écran actif
Utiliser l'API Electron pour déterminer sur quel écran la fenêtre active (ou le curseur) se trouve :

```javascript
// Option A: Basé sur la position du curseur
const { screen } = require('electron');
const cursorPos = screen.getCursorScreenPoint();
const activeDisplay = screen.getDisplayNearestPoint(cursorPos);

// Option B: Basé sur la fenêtre focalisée (si elle existe)
const focusedWindow = BrowserWindow.getFocusedWindow();
if (focusedWindow) {
  const bounds = focusedWindow.getBounds();
  const activeDisplay = screen.getDisplayMatching(bounds);
}
```

#### 2. Positionnement intelligent
- Centrer la fenêtre sur l'écran actif
- Prendre en compte la `workArea` (zone utilisable sans barre des tâches)
- Éviter les zones occupées par d'autres éléments système

#### 3. Fallback gracieux
- Si la détection échoue, utiliser l'écran principal comme fallback
- Maintenir la compatibilité avec les configurations mono-écran

### Avantages de la solution
- **Expérience utilisateur fluide** : pas de changement d'écran inattendu
- **Respect du contexte** : l'utilisateur reste dans son environnement de travail
- **Compatibilité** : fonctionne sur toutes les configurations (mono/multi-écran)

### Points d'attention
- **Performance** : la détection doit être rapide pour ne pas retarder l'enregistrement
- **Précision** : gérer les cas où le curseur est à la frontière entre deux écrans
- **Accessibilité** : maintenir la visibilité de la fenêtre sur tous types d'écrans

## Impact sur l'architecture

### Fichiers concernés
- `src/main.js` : modification de la fonction `showRecordingWindow()`
- Pas de changement dans l'interface utilisateur
- Pas de changement dans les modules audio/inférence

### Compatibilité
- ✅ macOS (tous les modèles)
- ✅ Configurations multi-écran
- ✅ Configurations mono-écran
- ✅ Écrans externes et intégrés

### Tests requis
- Configuration multi-écran avec écran principal différent de l'écran actif
- Passage rapide entre écrans pendant l'utilisation
- Cas d'erreur (écran déconnecté pendant l'utilisation)

Cette modification améliorerait significativement l'expérience utilisateur en éliminant le changement d'écran perturbateur lors de l'utilisation du raccourci clavier.