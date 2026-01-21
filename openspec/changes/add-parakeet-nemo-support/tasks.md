## 1. Setup and Dependencies
- [ ] 1.1 Mettre à jour `pyproject.toml` avec dépendances NeMo (`nemo_toolkit[asr]`, `pydub`, `sentencepiece`)
- [ ] 1.2 Créer un script d'installation/vérification des dépendances Python
- [ ] 1.3 Documenter les prérequis dans README

## 2. Python Inference Script
- [ ] 2.1 Créer `scripts/transcribe_parakeet.py` basé sur `tests/test_parakeet_nemo.py`
- [ ] 2.2 Implémenter conversion audio MP3/WAV vers format compatible
- [ ] 2.3 Ajouter gestion des erreurs et timeout
- [ ] 2.4 Retourner résultat en JSON pour parsing Node.js

## 3. Model Management
- [ ] 3.1 Créer répertoire `~/Library/Application Support/freesper/models/parakeet-tdt-0.6b-v3/`
- [ ] 3.2 Copier fichiers du modèle converti (encoder.pt, decoder.pt, joint.pt, tokenizer.model, config.json)
- [ ] 3.3 Mettre à jour `modelManager.js` pour détecter l'architecture "nemo"
- [ ] 3.4 Ajouter Parakeet TDT v3 au catalogue de modèles disponibles

## 4. Inference Engine Integration
- [ ] 4.1 Ajouter méthode `loadNeMoModel()` dans `inferenceEngine.js`
- [ ] 4.2 Implémenter `transcribeWithNeMo()` via subprocess Python
- [ ] 4.3 Ajouter gestion du cache du modèle (éviter rechargement à chaque transcription)
- [ ] 4.4 Gérer les erreurs subprocess et timeouts

## 5. UI and Configuration
- [ ] 5.1 Ajouter Parakeet TDT v3 dans la liste des modèles (Model Manager UI)
- [ ] 5.2 Afficher statut de chargement (modèle lourd, prend du temps)
- [ ] 5.3 Ajouter badge "Multilingue 25 langues" dans la description

## 6. Testing and Validation
- [ ] 6.1 Tester transcription audio français (fichier test existant)
- [ ] 6.2 Tester transcription audio anglais
- [ ] 6.3 Vérifier gestion des erreurs (modèle non chargé, dépendances manquantes)
- [ ] 6.4 Mesurer performances (temps de chargement, RTF)
- [ ] 6.5 Tester end-to-end : enregistrement → transcription → paste

## 7. Documentation
- [ ] 7.1 Mettre à jour QUICKSTART.md avec instructions Parakeet
- [ ] 7.2 Documenter architecture NeMo dans les commentaires code
- [ ] 7.3 Ajouter section dépannage pour erreurs NeMo courantes
