#!/usr/bin/env python3
"""
Test final avec Parakeet INT8 - API sherpa-onnx simplifiée
"""

import os
import numpy as np

os.chdir('/Users/anthonyjacquelin/Documents/dev/freesper/tests')

print("=" * 60)
print("🦜 Test Parakeet INT8 (sherpa-onnx)")
print("=" * 60)
print("")

try:
    import sherpa_onnx
    
    MODEL_DIR = "../models/parakeet-tdt-0.6b-v3-int8"
    
    print("📥 Chargement du modèle INT8 (639 MB)...")
    
    # Utiliser from_transducer avec model_type="nemo_transducer"
    recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=os.path.join(MODEL_DIR, "encoder.int8.onnx"),
        decoder=os.path.join(MODEL_DIR, "decoder.int8.onnx"),
        joiner=os.path.join(MODEL_DIR, "joiner.int8.onnx"),
        tokens=os.path.join(MODEL_DIR, "tokens.txt"),
        num_threads=2,
        sample_rate=16000,
        feature_dim=80,  # Standard pour sherpa-onnx
        model_type="nemo_transducer",  # CLEF: spécifier le type NeMo
        debug=False
    )
    
    print("✅ Modèle chargé!")
    print("")
    
    # Test sur audio français
    audio_file = "ElevenLabs_2026-01-18T17_00_27_Lea - UGC creator_pvc_sp108_s51_sb72_se2_m2.mp3"
    print(f"🎤 Transcription: {audio_file}")
    print("")
    
    # Convertir audio en samples (sherpa-onnx fait l'extraction de features)
    from pydub import AudioSegment
    audio = AudioSegment.from_file(audio_file)
    audio = audio.set_channels(1).set_frame_rate(16000)
    samples = np.array(audio.get_array_of_samples(), dtype=np.float32) / 32768.0
    
    print(f"   Durée: {len(samples)/16000:.2f}s")
    print(f"   Samples: {len(samples)}")
    print("")
    
    # Créer stream et accepter l'audio (sherpa-onnx fait le reste)
    print("🔄 Décodage...")
    stream = recognizer.create_stream()
    stream.accept_waveform(16000, samples)
    
    # Décoder
    recognizer.decode_stream(stream)
    
    result = stream.result.text
    
    print("")
    print("📝 Résultat (Parakeet INT8 - 639 MB):")
    print("-" * 60)
    print(result)
    print("-" * 60)
    
except Exception as e:
    print(f"❌ Erreur: {e}")
    import traceback
    traceback.print_exc()
