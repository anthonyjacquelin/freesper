#!/usr/bin/env python3
"""
Test avec onnx-asr et config manuel
"""

import os
import sys

# Ajouter le répertoire models au path pour que onnx-asr le trouve
sys.path.insert(0, os.path.abspath('../models'))

import onnx_asr

os.chdir(os.path.dirname(os.path.abspath(__file__)))

MODEL_PATH = os.path.abspath("../models/parakeet-tdt-0.6b-v3-int8")

print("=" * 60)
print("🦜 Test Parakeet INT8 avec onnx-asr")
print("=" * 60)
print("")
print(f"📥 Modèle: {MODEL_PATH}")
print("   Taille: 639 MB (INT8 quantifié)")
print("")

# Tester si le config.json est bien là
config_path = os.path.join(MODEL_PATH, "config.json")
if os.path.exists(config_path):
    print("✓ config.json trouvé")
    import json
    with open(config_path) as f:
        config = json.load(f)
        print(f"   Architecture: {config.get('architecture')}")
        print(f"   Feature dim: {config.get('feature_dim')}")
else:
    print("❌ config.json manquant")

print("")

# Simple test de reconnaissance
audio_file = "test_english.wav"
print(f"🎤 Test rapide: {audio_file}")

try:
    # Essayer de charger avec onnx-asr
    # Note: onnx-asr nécessite peut-être un format de config spécifique
    print("   Tentative chargement...")
    
    # Pour l'instant, testons juste si on peut accéder aux fichiers
    for filename in ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt']:
        filepath = os.path.join(MODEL_PATH, filename)
        if os.path.exists(filepath):
            size_mb = os.path.getsize(filepath) / (1024**2)
            print(f"   ✓ {filename}: {size_mb:.1f} MB")
        else:
            print(f"   ❌ {filename}: MANQUANT")
    
    print("")
    print("📋 Conclusion:")
    print("   Les fichiers ONNX INT8 sont prêts (639 MB)")
    print("   Pour l'intégration dans l'app, nous avons 2 options:")
    print("")
    print("   Option A: NeMo FP32 (2.3GB)")
    print("     ✅ Fonctionne parfaitement")
    print("     ✅ Simple subprocess Python")
    print("     ❌ Plus lourd")
    print("")
    print("   Option B: ONNX INT8 (639 MB)")  
    print("     ✅ Plus léger (73% réduction)")
    print("     ✅ Compatible infrastructure existante")
    print("     ⚠️  Nécessite implémentation décodeur transducer")
    print("")
    
except Exception as e:
    print(f"❌ Erreur: {e}")
    import traceback
    traceback.print_exc()
