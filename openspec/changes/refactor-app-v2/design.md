## Context
Freesper est une application Electron de speech-to-text 100% offline pour macOS. L'application actuelle supporte plusieurs modèles mais l'intégration est complexe. Cette refonte simplifie à 2 modèles optimisés et ajoute des fonctionnalités UX essentielles.

## Goals / Non-Goals

### Goals
- Simplifier à 2 modèles : Parakeet INT8 (meilleur) et Whisper Tiny (fallback)
- Permettre la configuration du hotkey d'enregistrement
- Afficher une waveform audio en temps réel pendant l'enregistrement
- Maintenir un historique des transcriptions avec copie facile

### Non-Goals
- Support de modèles supplémentaires
- Streaming transcription en temps réel
- Export/import de l'historique
- Multi-langue pour l'UI

## Decisions

### Decision 1: Utiliser sherpa-onnx pour Parakeet INT8
- **Rationale**: sherpa-onnx est optimisé pour les modèles transducer ONNX, fonctionne parfaitement avec le modèle INT8 de 639 MB
- **Alternatives considered**: 
  - NeMo direct (2.3 GB, trop lourd)
  - onnx-asr (incompatible avec transducers)
  - ONNX Runtime Node.js direct (complexité des métadonnées)

### Decision 2: Web Audio API pour la visualisation
- **Rationale**: Native dans Electron, performant, pas de dépendance externe
- **Alternatives considered**:
  - Bibliothèques tierces (wavesurfer.js) - overkill pour notre cas d'usage

### Decision 3: electron-store pour l'historique
- **Rationale**: Déjà utilisé pour les settings, simple et fiable
- **Alternatives considered**:
  - SQLite (trop complexe pour 50 entrées)
  - JSON file (electron-store fait déjà ça mieux)

### Decision 4: Canvas pour le rendu waveform
- **Rationale**: Performant, contrôle total sur le rendu, 60fps possible
- **Alternatives considered**:
  - SVG (moins performant pour animations)
  - CSS animations (limité pour ce cas d'usage)

## Risks / Trade-offs

- **Risk**: Téléchargement Parakeet INT8 (639 MB) peut prendre du temps
  - Mitigation: Afficher progression, permettre annulation, proposer Whisper Tiny comme alternative rapide

- **Risk**: sherpa-onnx via Python subprocess ajoute latence
  - Mitigation: ~1s pour 27s d'audio, acceptable pour usage non-temps-réel

## Migration Plan

1. Supprimer les modèles obsolètes du catalogue
2. Ajouter Parakeet INT8 avec téléchargement sherpa-onnx
3. Implémenter l'inférence via subprocess Python
4. Ajouter la configuration hotkey
5. Implémenter la visualisation audio
6. Ajouter l'historique des transcriptions

Pas de migration de données nécessaire - les anciens modèles peuvent rester installés.

## Open Questions

- Aucune question ouverte - toutes les décisions techniques ont été validées par les tests
