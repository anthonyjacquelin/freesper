## Context
Parakeet TDT v3 est un modèle de transcription multilingue de NVIDIA qui offre une qualité supérieure pour le français et 24 autres langues européennes. Contrairement aux modèles Whisper ONNX déjà intégrés, Parakeet nécessite le framework NeMo/PyTorch pour fonctionner.

### Constraints
- **Format du modèle** : TorchScript (.pt) au lieu de ONNX - nécessite PyTorch runtime
- **Taille** : ~2.4 GB (vs 150MB pour Whisper Tiny)
- **Temps de chargement** : 5-10 secondes vs <1 seconde pour ONNX
- **Dépendances lourdes** : NeMo Toolkit (~150 packages Python)
- **Architecture** : Transducer (encoder + decoder + joint) vs encoder-decoder de Whisper

## Goals / Non-Goals

### Goals
- Intégrer Parakeet TDT v3 comme option de modèle dans l'application
- Utiliser l'approche subprocess Python/NeMo (solution qui fonctionne)
- Maintenir la compatibilité avec les modèles ONNX existants
- Fournir une UX claire sur les trade-offs (qualité vs performance)

### Non-Goals
- Convertir Parakeet en ONNX pur (échecs répétés avec PyTorch 2.9)
- Supporter TorchScript directement dans Node.js (trop complexe)
- Optimiser les performances de chargement (hors scope pour cette itération)
- Supporter d'autres modèles NeMo que Parakeet TDT v3

## Decisions

### Decision 1: Subprocess Python avec NeMo
**Choix** : Utiliser un subprocess Python qui charge NeMo et fait l'inférence

**Rationale** :
- ✅ Solution testée et fonctionnelle (`test_parakeet_nemo.py` donne d'excellents résultats)
- ✅ Réutilise l'écosystème Python existant (librosa, numpy déjà requis)
- ✅ Pas de dépendances Node.js complexes
- ✅ Isolation : crash Python n'affecte pas l'app Electron
- ❌ Latence subprocess : ~100-200ms overhead
- ❌ Mémoire : processus Python séparé

**Alternatives considérées** :
1. **TorchScript dans Node.js** : Rejeté - pas de binding Node.js stable pour PyTorch
2. **Conversion ONNX** : Rejeté - PyTorch 2.9 incompatible avec modèles NeMo complexes
3. **Serveur Python séparé** : Overkill pour une app desktop locale

### Decision 2: Cache du modèle en mémoire Python
**Choix** : Garder un processus Python long-running avec modèle chargé

**Rationale** :
- Évite de recharger le modèle à chaque transcription (5-10s de surcoût)
- Communication via stdin/stdout JSON pour envoyer audio paths
- Processus peut être recyclé si crash

**Alternatives** :
- Recharger à chaque fois : trop lent
- Serveur HTTP Python : complexité inutile

### Decision 3: Format .nemo natif
**Choix** : Utiliser le fichier .nemo directement depuis HuggingFace cache

**Rationale** :
- Format natif NeMo - pas besoin de conversion
- Déjà téléchargé dans le cache HuggingFace
- Taille : 2.3 GB (600M paramètres FP32 - taille normale)
- NeMo charge directement via `from_pretrained()`

### Decision 4: Gestion des dépendances via `uv`
**Choix** : Utiliser `uv` pour gérer l'environnement Python virtuel

**Rationale** :
- Déjà configuré (`pyproject.toml` créé)
- Plus rapide que pip
- Lock file pour reproductibilité

## Risks / Trade-offs

### Risk 1: Dépendances lourdes NeMo
- **Impact** : Installation ~500MB de packages, peut échouer
- **Mitigation** : 
  - Documentation claire des prérequis
  - Script de vérification des dépendances
  - Fallback gracieux vers Whisper si NeMo indisponible

### Risk 2: Performance dégradée
- **Impact** : Chargement initial 5-10s, subprocess overhead
- **Mitigation** :
  - UI feedback clair (spinner, message "Chargement modèle...")
  - Cache du processus Python entre transcriptions
  - Documentation des trade-offs qualité/vitesse

### Risk 3: Compatibilité PyTorch/NeMo
- **Impact** : Versions futures peuvent casser
- **Mitigation** :
  - Lock des versions dans `pyproject.toml`
  - Tests automatisés de transcription

## Migration Plan

### Installation
1. Utilisateur install avec modèles existants
2. Découvre Parakeet dans Model Manager (badge "Haute Qualité")
3. Clique "Télécharger" → script vérifie dépendances Python
4. Si manquantes : affiche instructions `uv sync` ou `pip install`
5. Copie fichiers .pt dans `~/Library/.../models/`
6. Premier use : chargement 5-10s avec feedback UI

### Rollback
- Supprimer répertoire modèle Parakeet
- App continue avec modèles ONNX existants
- Aucun impact sur fonctionnalité existante

## Open Questions
- [ ] Faut-il un mode "préchargement" au démarrage de l'app pour éviter latence ?
- [ ] Doit-on supporter plusieurs modèles NeMo ou juste Parakeet v3 ?
- [ ] Comment gérer les mises à jour du modèle (v3 → v4) ?
