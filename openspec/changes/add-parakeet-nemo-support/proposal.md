# Change: Add Parakeet TDT v3 via NeMo Integration

## Why
Le modèle Parakeet TDT v3 de NVIDIA offre une transcription multilingue (25 langues dont le français) avec une qualité supérieure à Whisper Small. Les tests ont montré une transcription quasi-parfaite en français. Cependant, le modèle n'est pas disponible en ONNX pur - il nécessite NeMo/PyTorch pour fonctionner.

## What Changes
- Ajouter un moteur d'inférence Python utilisant NeMo pour Parakeet TDT v3
- Créer un script Python (`scripts/transcribe_parakeet.py`) qui charge et utilise le modèle via NeMo
- Intégrer ce script dans `inferenceEngine.js` via subprocess pour l'architecture "nemo"
- Ajouter la gestion des modèles NeMo dans le Model Manager
- Utiliser le fichier .nemo directement depuis le cache HuggingFace (`~/.cache/huggingface/hub/`)
- Mettre à jour `pyproject.toml` pour inclure les dépendances NeMo

## Impact
- Affected specs: `speech-inference` (modification pour ajouter architecture NeMo)
- Affected code:
  - `src/modules/inferenceEngine.js` (nouvelle méthode `transcribeWithNeMo`)
  - `src/modules/modelManager.js` (détection et gestion des modèles NeMo)
  - Nouveau fichier: `scripts/transcribe_parakeet.py` (inférence NeMo)
  - Mise à jour: `pyproject.toml` (dépendances NeMo)
- Dependencies: 
  - **NOUVELLE**: `nemo_toolkit[asr]` (via uv/pip)
  - Existantes: Python 3.10+, torch, pydub
- User impact: 
  - Meilleure qualité de transcription en français et autres langues européennes
  - Modèle plus lourd (2.3GB pour 600M paramètres - taille normale) mais beaucoup plus précis
  - Temps de chargement initial plus long (~5-10 secondes)
  - Utilise le fichier .nemo directement depuis le cache HuggingFace
