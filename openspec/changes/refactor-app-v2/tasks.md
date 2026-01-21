## 1. Model Management - Simplification

- [x] 1.1 Mettre à jour `modelManager.js` - catalogue avec 2 modèles uniquement
- [x] 1.2 Créer script `scripts/transcribe_sherpa.py` pour inférence Parakeet INT8
- [x] 1.3 Ajouter méthode `downloadParakeetInt8()` dans modelManager
- [x] 1.4 Mettre à jour `inferenceEngine.js` - support sherpa-onnx via subprocess
- [x] 1.5 Tester téléchargement et inférence Parakeet INT8

## 2. Hotkey Configuration

- [x] 2.1 Créer composant UI capture de raccourci dans `index.html`
- [x] 2.2 Ajouter logique de capture dans `renderer.js`
- [x] 2.3 Mettre à jour `main.js` - re-enregistrer hotkey dynamiquement
- [x] 2.4 Persister configuration dans electron-store
- [x] 2.5 Valider conflits de raccourcis

## 3. Audio Visualization (Waveform)

- [x] 3.1 Créer canvas waveform dans `recording.html`
- [x] 3.2 Implémenter AudioContext + AnalyserNode dans recording window
- [x] 3.3 Créer fonction de rendu waveform (requestAnimationFrame)
- [x] 3.4 Connecter au flux audio d'enregistrement
- [x] 3.5 Styliser avec CSS (couleurs, dimensions)

## 4. Transcription History

- [x] 4.1 Créer structure de données historique dans electron-store
- [x] 4.2 Ajouter vue historique dans `index.html`
- [x] 4.3 Implémenter affichage liste dans `renderer.js`
- [x] 4.4 Ajouter bouton copier pour chaque transcription
- [x] 4.5 Limiter à 50 entrées (FIFO)
- [x] 4.6 Ajouter entrée menu/tray pour accéder à l'historique

## 5. UI Polish

- [x] 5.1 Mettre à jour styles.css avec design moderne
- [x] 5.2 Simplifier Model Manager UI (2 modèles)
- [x] 5.3 Améliorer Settings UI (hotkey capture)
- [x] 5.4 Créer vue historique stylisée

## 6. Integration & Testing

- [ ] 6.1 Tester workflow complet : record → transcribe → history
- [ ] 6.2 Tester changement de hotkey
- [ ] 6.3 Tester téléchargement des 2 modèles
- [ ] 6.4 Tester copie depuis historique
