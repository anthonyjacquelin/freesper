# Implementation Tasks

## 1. Investigation et Benchmark (Recherche)
- [ ] 1.1 Identifier les modèles utilisés par Cursor/VS Code Speech pour comparaison
- [ ] 1.2 Tester Whisper avec langue forcée (`--language fr`)
- [ ] 1.3 Rechercher des modèles français-uniquement (Hugging Face, Sherpa-ONNX)
- [ ] 1.4 Documenter les specs techniques de chaque modèle (taille, RTF, langues, qualité)

## 2. Tests de Configuration Parakeet
- [ ] 2.1 Tester différents paramètres de beam search
- [ ] 2.2 Tester avec VAD plus agressif (segments plus courts = moins de mélange)
- [ ] 2.3 Expérimenter avec temperature et top_k parameters si disponibles
- [ ] 2.4 Documenter les résultats de chaque configuration

## 3. Évaluation de Modèles Alternatifs
- [ ] 3.1 Télécharger et tester 2-3 modèles candidats
- [ ] 3.2 Créer un script de benchmark standardisé (même audio pour tous les modèles)
- [ ] 3.3 Mesurer: WER (Word Error Rate), cohérence linguistique, RTF, ponctuation
- [ ] 3.4 Créer un tableau comparatif des résultats

## 4. Implémentation du Meilleur Modèle
- [ ] 4.1 Ajouter le modèle gagnant au catalogue `modelManager.js`
- [ ] 4.2 Implémenter le moteur d'inférence si différent de sherpa-onnx
- [ ] 4.3 Mettre à jour les scripts Python si nécessaire
- [ ] 4.4 Tester l'intégration end-to-end

## 5. Interface Utilisateur
- [ ] 5.1 Ajouter un badge "Recommandé" sur le meilleur modèle dans le Model Manager
- [ ] 5.2 Ajouter des indicateurs de qualité (étoiles, score) pour chaque modèle
- [ ] 5.3 (Optionnel) Ajouter un sélecteur de langue dans Settings
- [ ] 5.4 Documenter les différences entre modèles dans l'UI

## 6. Documentation
- [ ] 6.1 Créer un guide de sélection de modèle dans README
- [ ] 6.2 Documenter les compromis (taille vs qualité vs vitesse)
- [ ] 6.3 Ajouter des exemples de transcription pour chaque modèle
- [ ] 6.4 Mettre à jour AGENTS.md avec les nouvelles contraintes qualité

## 7. Validation
- [ ] 7.1 Tester avec des enregistrements longs (>2 minutes)
- [ ] 7.2 Tester avec du vocabulaire technique (noms de produits, code)
- [ ] 7.3 Tester avec différents accents français
- [ ] 7.4 Vérifier qu'il n'y a plus de mélange de langues

## Notes
- La recherche (1-3) est la partie la plus importante
- Ne pas implémenter avant d'avoir identifié une solution qui fonctionne
- Prioriser la qualité sur la vitesse: un modèle 2x plus lent mais sans erreur est préférable
- Le benchmark doit être reproductible pour évaluer d'autres modèles à l'avenir
