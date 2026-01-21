#!/usr/bin/env python3
"""
Transcription audio avec Parakeet INT8 via sherpa-onnx + VAD chunking
Usage: python transcribe_sherpa_vad.py <audio_file>
Output: JSON avec success et text
"""

import argparse
import json
import os
import sys
import numpy as np
from pathlib import Path
import re

try:
    import sherpa_onnx
    import soundfile as sf
    import torch
except ImportError as e:
    print(json.dumps({
        "success": False,
        "error": f"Dépendance manquante: {e}. Installez avec: uv add sherpa-onnx soundfile torch"
    }))
    sys.exit(1)


def post_process_text(text):
    """
    Post-traitement du texte transcrit :
    - Nettoyer les interjections (Uh, Euh, etc.)
    - Nettoyer les espaces multiples
    - Capitalisation basique
    """
    if not text or not isinstance(text, str):
        return text
    
    # Supprimer les interjections isolées
    interjections = [
        r'\bUh+\b', r'\bEuh+\b', r'\bHum+\b', r'\bHmm+\b',
        r'\bEr+\b', r'\bUm+\b', r'\bAh+\b', r'\bOh+\b'
    ]
    
    for pattern in interjections:
        text = re.sub(pattern + r'[,\.]?\s+', ' ', text, flags=re.IGNORECASE)
        text = re.sub(r'\s+' + pattern + r'\s+', ' ', text, flags=re.IGNORECASE)
    
    # Nettoyer les espaces multiples
    text = re.sub(r'\s+', ' ', text).strip()
    
    # Majuscule au début
    if text:
        text = text[0].upper() + text[1:] if len(text) > 1 else text.upper()
    
    # Ajouter un point final si manquant
    if text and text[-1] not in '.!?':
        text += '.'
    
    return text


def load_silero_vad():
    """Charge le modèle Silero VAD"""
    try:
        model, utils = torch.hub.load(repo_or_dir='snakers4/silero-vad',
                                      model='silero_vad',
                                      force_reload=False,
                                      onnx=False)
        return model, utils
    except Exception as e:
        raise Exception(f"Erreur chargement Silero VAD: {e}")


def get_speech_timestamps(audio_samples, vad_model, sample_rate=16000, 
                          min_speech_duration_ms=250, max_speech_duration_s=30):
    """
    Détecte les segments de parole dans l'audio
    """
    # Silero VAD attend des samples en float32 normalisés
    if audio_samples.dtype != np.float32:
        audio_samples = audio_samples.astype(np.float32)
    
    # Convertir en tensor PyTorch
    audio_tensor = torch.from_numpy(audio_samples)
    
    # Obtenir les timestamps
    speech_timestamps = vad_model(audio_tensor, sample_rate)
    
    return speech_timestamps


def transcribe_with_sherpa_chunked(audio_file, model_dir):
    """
    Transcrit un fichier audio avec Parakeet INT8 via sherpa-onnx
    Utilise VAD pour découper l'audio en segments
    """
    # Charger Silero VAD
    print("Chargement du VAD...", file=sys.stderr)
    try:
        vad_model, vad_utils = load_silero_vad()
        (get_speech_ts, _, _, _, _) = vad_utils
    except Exception as e:
        # Si VAD échoue, on continue sans chunking
        print(f"⚠️  VAD non disponible, transcription sans chunking: {e}", file=sys.stderr)
        return transcribe_whole_file(audio_file, model_dir)
    
    # Charger l'audio
    print(f"Chargement audio: {audio_file}", file=sys.stderr)
    samples, sample_rate = sf.read(audio_file, dtype='float32')
    duration = len(samples) / sample_rate
    print(f"Audio: {duration:.2f}s, {sample_rate}Hz", file=sys.stderr)
    
    # Détecter les segments de parole
    print("Détection segments de parole...", file=sys.stderr)
    speech_timestamps = get_speech_ts(torch.from_numpy(samples), vad_model, sampling_rate=sample_rate)
    
    if not speech_timestamps:
        print("⚠️  Aucun segment de parole détecté", file=sys.stderr)
        return ""
    
    print(f"✓ {len(speech_timestamps)} segments détectés", file=sys.stderr)
    
    # Charger le modèle sherpa-onnx
    print("Chargement modèle Parakeet INT8...", file=sys.stderr)
    recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=os.path.join(model_dir, 'encoder.int8.onnx'),
        decoder=os.path.join(model_dir, 'decoder.int8.onnx'),
        joiner=os.path.join(model_dir, 'joiner.int8.onnx'),
        tokens=os.path.join(model_dir, 'tokens.txt'),
        num_threads=4,
        sample_rate=16000,
        feature_dim=128,
        model_type='nemo_transducer'
    )
    
    # Transcrire chaque segment
    transcriptions = []
    for i, timestamp in enumerate(speech_timestamps):
        start_sample = timestamp['start']
        end_sample = timestamp['end']
        
        # Extraire le segment
        segment = samples[start_sample:end_sample]
        
        # Transcrire le segment
        stream = recognizer.create_stream()
        stream.accept_waveform(sample_rate, segment)
        recognizer.decode_stream(stream)
        result = stream.result
        
        if result.text.strip():
            transcriptions.append(result.text.strip())
            print(f"  Segment {i+1}/{len(speech_timestamps)}: \"{result.text[:50]}...\"", file=sys.stderr)
    
    # Combiner les transcriptions
    full_text = " ".join(transcriptions)
    return full_text


def transcribe_whole_file(audio_file, model_dir):
    """Transcription sans VAD (fallback)"""
    samples, sample_rate = sf.read(audio_file, dtype='float32')
    
    recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=os.path.join(model_dir, 'encoder.int8.onnx'),
        decoder=os.path.join(model_dir, 'decoder.int8.onnx'),
        joiner=os.path.join(model_dir, 'joiner.int8.onnx'),
        tokens=os.path.join(model_dir, 'tokens.txt'),
        num_threads=4,
        sample_rate=16000,
        feature_dim=128,
        model_type='nemo_transducer'
    )
    
    stream = recognizer.create_stream()
    stream.accept_waveform(sample_rate, samples)
    recognizer.decode_stream(stream)
    return stream.result.text


def main():
    parser = argparse.ArgumentParser(description="Transcription avec Parakeet INT8 + VAD chunking")
    parser.add_argument("audio_file", help="Fichier audio (WAV ou MP3)")
    parser.add_argument(
        "--model-dir",
        default=None,
        help="Répertoire du modèle (défaut: ~/Library/Application Support/freesper/models/parakeet-int8)"
    )
    args = parser.parse_args()

    # Déterminer le répertoire du modèle
    if args.model_dir:
        model_dir = args.model_dir
    else:
        home = Path.home()
        model_dir = home / "Library" / "Application Support" / "freesper" / "models" / "parakeet-int8"

    model_dir = str(model_dir)

    try:
        # Transcrire avec VAD chunking
        text = transcribe_with_sherpa_chunked(args.audio_file, model_dir)

        # Retourner JSON
        result = {
            "success": True,
            "text": text
        }
        print(json.dumps(result))

    except Exception as e:
        # Erreur
        result = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(result))
        sys.exit(1)


if __name__ == "__main__":
    main()
