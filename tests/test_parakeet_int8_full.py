#!/usr/bin/env python3
"""
Transcription complète avec Parakeet TDT v3 INT8
"""

import os
import numpy as np
import onnxruntime as ort
from pydub import AudioSegment
import librosa

os.chdir('/Users/anthonyjacquelin/Documents/dev/freesper/tests')

MODEL_DIR = "../models/parakeet-tdt-0.6b-v3-int8"

def load_audio(audio_file, sr=16000):
    """Charge et convertit l'audio"""
    print(f"🔄 Chargement audio: {audio_file}")
    
    audio = AudioSegment.from_file(audio_file)
    audio = audio.set_channels(1).set_frame_rate(sr)
    
    samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
    samples = samples / 32768.0
    
    print(f"   Durée: {len(samples)/sr:.2f}s")
    return samples, sr

def extract_mel_features(audio, sr=16000):
    """Extrait mel-spectrograms 128 bins"""
    mel_spec = librosa.feature.melspectrogram(
        y=audio,
        sr=sr,
        n_fft=512,
        hop_length=160,
        n_mels=128,
        fmin=0,
        fmax=sr/2
    )
    log_mel = librosa.power_to_db(mel_spec, ref=np.max)
    return log_mel

def greedy_decode(encoder_output, decoder, joiner, tokens):
    """Décodage glouton pour transducer"""
    print("🔄 Décodage transducer...")
    
    batch_size = encoder_output.shape[0]
    T = encoder_output.shape[1]  # Temps encodé
    
    blank_id = 0
    hypothesis = []
    
    # Get input/output names
    decoder_inputs = [inp.name for inp in decoder.get_inputs()]
    decoder_outputs = [out.name for out in decoder.get_outputs()]
    joiner_inputs = [inp.name for inp in joiner.get_inputs()]
    
    print(f"   Decoder inputs: {decoder_inputs}")
    print(f"   Joiner inputs: {joiner_inputs}")
    
    # Initial decoder state (blank token)
    targets = np.array([[blank_id]], dtype=np.int64)
    
    for t in range(T):
        # Encoder output à la position t
        enc_t = encoder_output[:, t:t+1, :]  # (1, 1, dim)
        
        # Decoder output
        dec_output = decoder.run(None, {decoder_inputs[0]: targets})
        dec_t = dec_output[0]  # Premier output
        
        # Joint network - combiner encoder et decoder
        joint_output = joiner.run(None, {
            joiner_inputs[0]: enc_t.astype(np.float32),
            joiner_inputs[1]: dec_t.astype(np.float32)
        })
        
        logits = joint_output[0].squeeze()  # (vocab_size,)
        pred = np.argmax(logits)
        
        if pred == blank_id:
            # Blank: continuer
            continue
        else:
            # Non-blank: ajouter au hypothesis
            hypothesis.append(int(pred))
            targets = np.array([[int(pred)]], dtype=np.int64)
    
    # Décoder les tokens en texte
    text_parts = []
    for token_id in hypothesis:
        if 0 <= token_id < len(tokens):
            token = tokens[token_id]
            # Nettoyer les tokens spéciaux
            if token.startswith('▁'):
                token = ' ' + token[1:]
            text_parts.append(token)
    
    text = ''.join(text_parts).strip()
    return text

print("=" * 60)
print("🦜 Transcription avec Parakeet TDT v3 INT8")
print("=" * 60)
print("")

# Charger modèles
print("📥 Chargement du modèle INT8...")
encoder = ort.InferenceSession(
    os.path.join(MODEL_DIR, "encoder.int8.onnx"),
    providers=['CPUExecutionProvider']
)
decoder = ort.InferenceSession(
    os.path.join(MODEL_DIR, "decoder.int8.onnx"),
    providers=['CPUExecutionProvider']
)
joiner = ort.InferenceSession(
    os.path.join(MODEL_DIR, "joiner.int8.onnx"),
    providers=['CPUExecutionProvider']
)

# Charger vocabulaire
with open(os.path.join(MODEL_DIR, "tokens.txt"), 'r', encoding='utf-8') as f:
    tokens = [line.strip() for line in f]

total_size_mb = (
    os.path.getsize(os.path.join(MODEL_DIR, "encoder.int8.onnx")) +
    os.path.getsize(os.path.join(MODEL_DIR, "decoder.int8.onnx")) +
    os.path.getsize(os.path.join(MODEL_DIR, "joiner.int8.onnx"))
) / (1024**2)

print(f"✅ Modèle chargé! Taille: {total_size_mb:.0f} MB")
print("")

# Audio français
audio_file = "ElevenLabs_2026-01-18T17_00_27_Lea - UGC creator_pvc_sp108_s51_sb72_se2_m2.mp3"
print(f"🎤 Transcription: {audio_file}")
print("")

# Charger et traiter audio
audio, sr = load_audio(audio_file)
mel_features = extract_mel_features(audio, sr)

# Encoder
print("🔄 Inférence encoder...")
mel_input = mel_features[np.newaxis, :, :]  # (1, 128, time)
length = np.array([mel_input.shape[2]], dtype=np.int64)

encoder_result = encoder.run(None, {
    'audio_signal': mel_input.astype(np.float32),
    'length': length
})
encoded = encoder_result[0]
print(f"   ✓ Encoder output: {encoded.shape}")

# Décodage
text = greedy_decode(encoded, decoder, joiner, tokens)

print("")
print("📝 Résultat (Parakeet INT8 - 639 MB):")
print("-" * 60)
print(text)
print("-" * 60)
