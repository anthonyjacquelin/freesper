# Change: Améliorer la qualité de transcription multilingue

## Why
Le modèle Parakeet INT8 actuel mélange fréquemment les langues pendant la transcription (français/anglais/espagnol), ce qui rend les transcriptions peu utilisables. D'autres outils (comme dans les éditeurs de code) transcrivent en français sans mélange de langues, ce qui montre que le problème vient de notre configuration ou choix de modèle, pas de la performance du microphone.

**Problème observé**:
> "I'm saying I'm a problem of transcription, in fact, because the whole project which I pass in anglais, in espannial, en franc, it detected mal the language, and a mix between two that I do."

Alors que l'utilisateur parlait uniquement en français.

## What Changes
- **Investiguer** les modèles alternatifs qui gèrent mieux la cohérence linguistique
- **Évaluer** si un modèle français-uniquement serait plus approprié que multilingue
- **Comparer** avec les modèles utilisés par d'autres outils (Cursor, VS Code Speech)
- **Tester** différentes configurations de décodage pour Parakeet
- **Documenter** les options de modèles dans le Model Manager avec leur qualité de transcription
- Possibilité d'ajouter un **sélecteur de langue** pour forcer une langue spécifique

**Options à explorer**:
1. Modèle français-uniquement (Whisper French, OpenAI Whisper avec langue forcée)
2. Configuration avancée de Parakeet (beam search, temperature, etc.)
3. Modèles alternatifs: Wav2Vec2 français, XLSR-Wav2Vec2
4. Sherpa-ONNX avec d'autres modèles transducer

## Impact
- Affected specs: `speech-inference` (critères de qualité de transcription)
- Affected code:
  - `src/modules/inferenceEngine.js` (configuration de décodage)
  - `src/modules/modelManager.js` (catalogue de modèles avec scores de qualité)
  - `scripts/transcribe_sherpa_vad.py` (paramètres d'inférence)
  - Interface utilisateur: sélecteur de langue dans Settings
  
- User impact:
  - **Amélioration critique**: transcriptions cohérentes dans une seule langue
  - Meilleure ponctuation et capitalisation
  - Réduction drastique des erreurs de mélange de langues
  - Expérience comparable aux outils professionnels (Cursor Speech, Whisper Desktop)

## Out of Scope
- Post-processing avec LLM local (Ollama): trop complexe, devrait être résolu au niveau du modèle
- Correction grammaticale avancée: pas nécessaire si le modèle transcrit correctement
- Traduction automatique: hors sujet
