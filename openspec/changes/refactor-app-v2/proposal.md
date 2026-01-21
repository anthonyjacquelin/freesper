# Change: Refactor Application v2 - Complete Feature Set

## Why
L'application freesper nécessite une refonte majeure pour offrir une expérience utilisateur complète. Les utilisateurs ont besoin de :
1. **Deux modèles uniquement** : Parakeet INT8 (639 MB, multilingue) et Whisper Tiny (150 MB)
2. **Configuration du hotkey** personnalisable pour lancer l'écoute
3. **Visualisation audio en temps réel** sous forme de waveform pendant l'enregistrement
4. **Historique des transcriptions** avec possibilité de copier n'importe quel élément

## What Changes

### 1. Model Management (Simplification)
- Supprimer tous les modèles sauf Parakeet INT8 et Whisper Tiny
- Ajouter téléchargement automatique de Parakeet INT8 via sherpa-onnx (639 MB)
- Conserver Whisper Tiny comme modèle de fallback (150 MB)
- Intégrer sherpa-onnx pour l'inférence Parakeet INT8

### 2. Hotkey Configuration
- Permettre à l'utilisateur de configurer sa touche d'écoute
- Interface de capture de raccourci clavier
- Persistance via electron-store
- Validation des conflits de raccourcis

### 3. Audio Visualization
- Afficher une waveform audio en temps réel pendant l'enregistrement
- Utiliser Web Audio API (AudioContext, AnalyserNode)
- Canvas pour le rendu de la waveform
- Animation fluide à 60fps

### 4. Transcription History
- Stocker les 50 dernières transcriptions
- Afficher dans une vue dédiée (date, texte, durée)
- Bouton copier pour chaque élément
- Persistance via electron-store

## Impact

- **Affected specs**: 
  - `model-management` (nouvelle capability)
  - `transcription-history` (nouvelle capability)
  - `audio-visualization` (nouvelle capability)
  - `hotkey-config` (nouvelle capability)

- **Affected code**:
  - `src/modules/modelManager.js` - Simplifier catalogue, ajouter Parakeet INT8
  - `src/modules/inferenceEngine.js` - Ajouter support sherpa-onnx
  - `src/main.js` - Hotkey configuration, historique
  - `ui/index.html` - Nouvelles vues (historique, settings améliorés)
  - `ui/renderer.js` - Logique UI
  - `ui/recording.html` - Waveform visualization
  - `ui/styles.css` - Styles pour nouvelles fonctionnalités

- **Dependencies**:
  - `sherpa-onnx` (Python) - déjà installé
  - Aucune nouvelle dépendance Node.js

- **User impact**:
  - Interface simplifiée avec 2 modèles seulement
  - Meilleure expérience d'enregistrement avec visualisation
  - Accès facile à l'historique des transcriptions
  - Personnalisation du raccourci clavier
