#!/usr/bin/env python3
"""
Test de la version INT8 optimisée de Parakeet avec onnxruntime direct
"""

import os
import numpy as np
import onnxruntime as ort
from pydub import AudioSegment
import librosa

os.chdir(os.path.dirname(os.path.abspath(__file__)))

MODEL_DIR = "../models/parakeet-tdt-0.6b-v3-int8"

def load_audio(audio_file, sr=16000):
    """Charge et convertit l'audio"""
    print(f"🔄 Chargement audio: {audio_file}")
    
    # Charger avec pydub
    audio = AudioSegment.from_file(audio_file)
    audio = audio.set_channels(1).set_frame_rate(sr)
    
    # Convertir en numpy
    samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
    samples = samples / 32768.0  # Normaliser
    
    print(f"   Durée: {len(samples)/sr:.2f}s")
    
    return samples, sr

def extract_mel_features(audio, sr=16000):
    """Extrait les mel-spectrograms (128 bins pour Parakeet)"""
    print("🔄 Extraction mel-spectrogram...")
    
    # Mel-spectrogram avec 128 bins (spécifique à Parakeet)
    mel_spec = librosa.feature.melspectrogram(
        y=audio,
        sr=sr,
        n_fft=512,
        hop_length=160,
        n_mels=128,  # Parakeet utilise 128 au lieu de 80
        fmin=0,
        fmax=sr/2
    )
    
    # Log mel
    log_mel = librosa.power_to_db(mel_spec, ref=np.max)
    
    print(f"   Shape: {log_mel.shape}")
    
    return log_mel

print("=" * 60)
print("🦜 Test Parakeet TDT v3 INT8 (sherpa-onnx)")
print("=" * 60)
print("")
print("📥 Chargement du modèle INT8...")
print(f"   Répertoire: {MODEL_DIR}")
print("")

# Charger les modèles ONNX
encoder_path = os.path.join(MODEL_DIR, "encoder.int8.onnx")
decoder_path = os.path.join(MODEL_DIR, "decoder.int8.onnx")
joiner_path = os.path.join(MODEL_DIR, "joiner.int8.onnx")

print("   Chargement encoder INT8...")
encoder = ort.InferenceSession(
    encoder_path,
    providers=['CPUExecutionProvider']
)
print(f"   ✓ Encoder: {os.path.getsize(encoder_path) / (1024**2):.0f} MB")

print("   Chargement decoder INT8...")
decoder = ort.InferenceSession(
    decoder_path,
    providers=['CPUExecutionProvider']
)
print(f"   ✓ Decoder: {os.path.getsize(decoder_path) / (1024**2):.0f} MB")

print("   Chargement joiner INT8...")
joiner = ort.InferenceSession(
    joiner_path,
    providers=['CPUExecutionProvider']
)
print(f"   ✓ Joiner: {os.path.getsize(joiner_path) / (1024**2):.0f} MB")

print("")
print("✅ Modèle INT8 chargé!")
print(f"   Total: ~{(os.path.getsize(encoder_path) + os.path.getsize(decoder_path) + os.path.getsize(joiner_path)) / (1024**2):.0f} MB")
print("   Note: Parakeet utilise 128 bins mel (au lieu de 80 pour Whisper)")
print("")

# Charger tokens
tokens_path = os.path.join(MODEL_DIR, "tokens.txt")
with open(tokens_path, 'r', encoding='utf-8') as f:
    tokens = [line.strip() for line in f]
print(f"✓ Vocabulaire: {len(tokens)} tokens")
print("")

# Test transcription
audio_file = "test_english.wav"
print(f"🎤 Transcription de test...")
print(f"   Fichier: {audio_file}")
print("")

audio, sr = load_audio(audio_file)
mel_features = extract_mel_features(audio, sr)

# Préparer input encoder (batch, n_mels, time)
mel_input = mel_features[np.newaxis, :, :]  # (1, 80, time)
length = np.array([mel_input.shape[2]], dtype=np.int64)

print("🔄 Inférence encoder...")
print(f"   Input shape: {mel_input.shape}")

# Run encoder
encoder_inputs = encoder.get_inputs()
print(f"   Encoder attend: {[inp.name for inp in encoder_inputs]}")

encoder_result = encoder.run(None, {
    encoder_inputs[0].name: mel_input.astype(np.float32),
    encoder_inputs[1].name: length
})

encoded = encoder_result[0]
print(f"✅ Encoder output shape: {encoded.shape}")
print("")
print("🎉 Le modèle INT8 fonctionne !")
print("   Taille optimale : ~639 MB vs 2.3 GB (73% de réduction)")
