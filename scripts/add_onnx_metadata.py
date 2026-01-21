#!/usr/bin/env python3
"""
Ajoute les métadonnées manquantes aux modèles ONNX Parakeet INT8
"""

import onnx
import os

MODEL_DIR = "models/parakeet-tdt-0.6b-v3-int8"

print("🔧 Ajout des métadonnées aux modèles ONNX Parakeet INT8")
print("=" * 60)
print("")

# Charger le fichier tokens pour obtenir vocab_size
tokens_path = os.path.join(MODEL_DIR, "tokens.txt")
with open(tokens_path, 'r', encoding='utf-8') as f:
    tokens = [line.strip() for line in f]
vocab_size = len(tokens)

print(f"📊 Vocabulaire: {vocab_size} tokens")
print("")

# Métadonnées à ajouter
metadata = {
    'vocab_size': str(vocab_size),  # Nombre exact de lignes dans tokens.txt
    'context_size': '2',  # Taille du contexte pour le decoder
    'model_type': 'transducer',
    'model_author': 'nvidia',
    'url': 'https://github.com/k2-fsa/sherpa-onnx',
    'sample_rate': '16000',
    'feature_dim': '128',
    'n_mels': '128',
    'decode_chunk_len': '0',  # 0 = offline mode
    'blank_id': '8197'  # <blk> est à l'index 8197
}

# Ajouter métadonnées au decoder (c'est lui qui en a besoin)
print("🔧 Ajout métadonnées au decoder...")
decoder_path = os.path.join(MODEL_DIR, "decoder.int8.onnx")
decoder_model = onnx.load(decoder_path)

# Ajouter ou mettre à jour les métadonnées
for key, value in metadata.items():
    # Chercher si la metadata existe
    found = False
    for meta in decoder_model.metadata_props:
        if meta.key == key:
            meta.value = value
            found = True
            break
    
    # Si pas trouvée, ajouter
    if not found:
        meta_prop = decoder_model.metadata_props.add()
        meta_prop.key = key
        meta_prop.value = value
    
    print(f"   ✓ {key}: {value}")

# Sauvegarder
onnx.save(decoder_model, decoder_path)
print("")
print("✅ Métadonnées ajoutées au decoder!")
print("")

# Faire pareil pour encoder et joiner
for model_name in ['encoder.int8.onnx', 'joiner.int8.onnx']:
    print(f"🔧 Ajout métadonnées à {model_name}...")
    model_path = os.path.join(MODEL_DIR, model_name)
    model = onnx.load(model_path)
    
    for key, value in metadata.items():
        found = False
        for meta in model.metadata_props:
            if meta.key == key:
                meta.value = value
                found = True
                break
        if not found:
            meta_prop = model.metadata_props.add()
            meta_prop.key = key
            meta_prop.value = value
    
    onnx.save(model, model_path)
    print(f"   ✓ Métadonnées ajoutées")

print("")
print("=" * 60)
print("🎉 Métadonnées ajoutées à tous les modèles!")
print("=" * 60)
print("")
print("Vous pouvez maintenant utiliser sherpa-onnx avec ces modèles.")
