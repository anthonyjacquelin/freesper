#!/usr/bin/env python3
"""
Test de la version INT8 optimisée de Parakeet (sherpa-onnx)
"""

import os
import onnx_asr

os.chdir('/Users/anthonyjacquelin/Documents/dev/freesper/tests')

MODEL_DIR = "../models/parakeet-tdt-0.6b-v3-int8"

print("=" * 60)
print("🦜 Test Parakeet TDT v3 INT8 (sherpa-onnx)")
print("=" * 60)
print("")
print("📥 Chargement du modèle INT8 local...")
print(f"   Répertoire: {MODEL_DIR}")
print("   Taille: ~639 MB (encoder 622MB + decoder 11MB + joiner 6MB)")
print("")

try:
    model = onnx_asr.load_model(
        MODEL_DIR,
        providers=["CPUExecutionProvider"]
    )
    print("✅ Modèle INT8 chargé!")
    print("")
    
    # Test avec audio français
    audio_file = "ElevenLabs_2026-01-18T17_00_27_Lea - UGC creator_pvc_sp108_s51_sb72_se2_m2.mp3"
    print(f"🎤 Transcription en cours...")
    print(f"   Fichier: {audio_file}")
    print("")
    
    result = model.recognize(audio_file)
    
    print("📝 Résultat (INT8 quantifié):")
    print("-" * 60)
    print(result)
    print("-" * 60)
    
except Exception as e:
    print(f"❌ Erreur: {e}")
    import traceback
    traceback.print_exc()
