#!/usr/bin/env python3
"""
Transcription avec Parakeet TDT v3 INT8 via sherpa-onnx
"""

import os
import sherpa_onnx

os.chdir('/Users/anthonyjacquelin/Documents/dev/freesper/tests')

MODEL_DIR = "../models/parakeet-tdt-0.6b-v3-int8"

print("=" * 60)
print("🦜 Transcription avec Parakeet INT8 (sherpa-onnx)")
print("=" * 60)
print("")
print("📥 Chargement du modèle INT8...")
print(f"   Taille: 639 MB (vs 2.3 GB FP32)")
print("")

# Configuration du modèle transducer
recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
    encoder=os.path.join(MODEL_DIR, "encoder.int8.onnx"),
    decoder=os.path.join(MODEL_DIR, "decoder.int8.onnx"),
    joiner=os.path.join(MODEL_DIR, "joiner.int8.onnx"),
    tokens=os.path.join(MODEL_DIR, "tokens.txt"),
    num_threads=4,
    sample_rate=16000,
    feature_dim=128,  # Parakeet utilise 128 bins mel
    debug=False
)

print("✅ Modèle chargé!")
print("")

# Transcription
audio_file = "ElevenLabs_2026-01-18T17_00_27_Lea - UGC creator_pvc_sp108_s51_sb72_se2_m2.mp3"
print(f"🎤 Transcription: {audio_file}")
print("")

# Créer un stream pour l'audio
stream = recognizer.create_stream()

# Charger audio
print("🔄 Chargement et traitement audio...")
from pydub import AudioSegment
audio = AudioSegment.from_file(audio_file)
audio = audio.set_channels(1).set_frame_rate(16000)
samples = np.array(audio.get_array_of_samples(), dtype=np.float32) / 32768.0

print(f"   Durée: {len(samples)/16000:.2f}s")
print("")

# Accepter audio dans le stream
stream.accept_waveform(16000, samples)

# Décoder
print("🔄 Décodage en cours...")
recognizer.decode_stream(stream)

# Récupérer le résultat
result = stream.result.text

print("")
print("📝 Résultat (Parakeet INT8 - 639 MB):")
print("-" * 60)
print(result)
print("-" * 60)
print("")
print("🎉 Transcription terminée avec succès!")
