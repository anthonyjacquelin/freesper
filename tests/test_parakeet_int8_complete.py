#!/usr/bin/env python3
"""
Transcription complète avec Parakeet INT8 (avec gestion des états)
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
    audio = AudioSegment.from_file(audio_file)
    audio = audio.set_channels(1).set_frame_rate(sr)
    samples = np.array(audio.get_array_of_samples(), dtype=np.float32) / 32768.0
    return samples, sr

def extract_mel_features(audio, sr=16000):
    """Extrait mel-spectrograms 128 bins"""
    mel_spec = librosa.feature.melspectrogram(
        y=audio, sr=sr, n_fft=512, hop_length=160,
        n_mels=128, fmin=0, fmax=sr/2
    )
    log_mel = librosa.power_to_db(mel_spec, ref=np.max)
    return log_mel

def greedy_decode_with_states(encoder_output, decoder, joiner, tokens, max_length=500):
    """Décodage glouton avec gestion des états du decoder"""
    
    T = encoder_output.shape[1]  # Longueur temps encodé
    blank_id = 0
    hypothesis = []
    
    # Obtenir les shapes des inputs
    decoder_inputs = {inp.name: inp for inp in decoder.get_inputs()}
    
    # Initialiser les états du decoder
    # Le decoder attend: targets, target_length, states, onnx::Slice_3
    targets = np.array([[blank_id]], dtype=np.int64)
    target_length = np.array([1], dtype=np.int64)
    
    # États initiaux (généralement zeros)
    # Trouver les shapes depuis les inputs
    states_shape = None
    slice_shape = None
    for name, inp in decoder_inputs.items():
        if 'states' in name.lower():
            states_shape = inp.shape
        if 'slice' in name.lower() or 'cache' in name.lower():
            slice_shape = inp.shape
    
    # Créer états initiaux (estimés)
    if states_shape:
        # Remplacer les dimensions dynamiques par des valeurs concrètes
        concrete_shape = []
        for dim in states_shape:
            if isinstance(dim, str) or dim is None or dim < 0:
                concrete_shape.append(1)  # Batch size ou sequence length
            else:
                concrete_shape.append(dim)
        states = np.zeros(concrete_shape, dtype=np.float32)
    else:
        states = np.zeros((1, 2, 512), dtype=np.float32)  # Shape par défaut
    
    if slice_shape:
        concrete_slice = []
        for dim in slice_shape:
            if isinstance(dim, str) or dim is None or dim < 0:
                concrete_slice.append(1)
            else:
                concrete_slice.append(dim)
        slice_val = np.zeros(concrete_slice, dtype=np.int64)
    else:
        slice_val = np.array([0], dtype=np.int64)
    
    t = 0
    while t < T and len(hypothesis) < max_length:
        # Encoder output à t
        enc_t = encoder_output[:, t:t+1, :]  # (1, 1, dim)
        
        # Run decoder avec tous les inputs
        try:
            decoder_feed = {
                'targets': targets,
                'target_length': target_length,
                'states.1': states,
                'onnx::Slice_3': slice_val
            }
            dec_output = decoder.run(None, decoder_feed)
            dec_t = dec_output[0]  # (1, 1, dim)
            
            # Mettre à jour les états si disponibles
            if len(dec_output) > 1:
                states = dec_output[1]
            
        except Exception as e:
            print(f"      Erreur decoder à t={t}: {e}")
            # Essayer avec inputs minimaux
            dec_output = decoder.run(None, {'targets': targets})
            dec_t = dec_output[0]
        
        # Joint network
        joint_output = joiner.run(None, {
            'encoder_outputs': enc_t.astype(np.float32),
            'decoder_outputs': dec_t.astype(np.float32)
        })
        
        logits = joint_output[0].squeeze()
        pred = int(np.argmax(logits))
        
        if pred == blank_id:
            t += 1
        else:
            hypothesis.append(pred)
            targets = np.array([[pred]], dtype=np.int64)
    
    # Décoder tokens en texte
    text_parts = []
    for token_id in hypothesis:
        if 0 <= token_id < len(tokens):
            token = tokens[token_id]
            if token.startswith('▁'):
                token = ' ' + token[1:]
            text_parts.append(token)
    
    return ''.join(text_parts).strip()

print("=" * 60)
print("🦜 Parakeet INT8 - Audio Français")
print("=" * 60)
print("")

# Charger modèles
print("📥 Chargement modèle INT8 (639 MB)...")
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

with open(os.path.join(MODEL_DIR, "tokens.txt"), 'r', encoding='utf-8') as f:
    tokens = [line.strip() for line in f]

print("✅ Modèle INT8 chargé!")
print("")

# Audio français
audio_file = "ElevenLabs_2026-01-18T17_00_27_Lea - UGC creator_pvc_sp108_s51_sb72_se2_m2.mp3"
print(f"🎤 Audio: {audio_file}")
print("")

audio, sr = load_audio(audio_file)
print(f"   Durée: {len(audio)/sr:.2f}s")

mel_features = extract_mel_features(audio, sr)
print(f"   Mel shape: {mel_features.shape}")

# Encoder
print("")
print("🔄 Encoder...")
mel_input = mel_features[np.newaxis, :, :]
length = np.array([mel_input.shape[2]], dtype=np.int64)

encoded = encoder.run(None, {
    'audio_signal': mel_input.astype(np.float32),
    'length': length
})[0]

print(f"   ✓ Output: {encoded.shape}")

# Décodage
print("")
print("🔄 Décodage transducer (greedy)...")
text = greedy_decode_with_states(encoded, decoder, joiner, tokens)

print("")
print("📝 Résultat (Parakeet INT8 - 639 MB):")
print("-" * 60)
print(text)
print("-" * 60)
