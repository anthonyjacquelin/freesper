#!/usr/bin/env python3
"""
Transcription audio avec Parakeet INT8 via sherpa-onnx
Usage: python transcribe_sherpa.py <audio_file>
Output: JSON avec success et text
"""

import argparse
import json
import os
import sys
import numpy as np
from pathlib import Path

try:
    import sherpa_onnx
    from pydub import AudioSegment
except ImportError as e:
    print(json.dumps({
        "success": False,
        "error": f"Dépendance manquante: {e}. Installez avec: uv add sherpa-onnx pydub"
    }))
    sys.exit(1)


def load_audio_samples(audio_file, sr=16000):
    """
    Charge un fichier audio et retourne les samples normalisés
    """
    try:
        audio = AudioSegment.from_file(audio_file)
        audio = audio.set_channels(1).set_frame_rate(sr)
        samples = np.array(audio.get_array_of_samples(), dtype=np.float32) / 32768.0
        return samples
    except Exception as e:
        raise Exception(f"Erreur lecture audio: {e}")


def transcribe_with_sherpa(audio_file, model_dir, language='fr'):
    """
    Transcrit un fichier audio avec Parakeet INT8 via sherpa-onnx
    
    Args:
        audio_file: Chemin vers le fichier audio
        model_dir: Répertoire contenant le modèle
        language: Code langue (ex: 'fr', 'en') - Note: Parakeet détecte auto mais on peut améliorer
    """
    # Chemins des fichiers modèle
    encoder = os.path.join(model_dir, 'encoder.int8.onnx')
    decoder = os.path.join(model_dir, 'decoder.int8.onnx')
    joiner = os.path.join(model_dir, 'joiner.int8.onnx')
    tokens = os.path.join(model_dir, 'tokens.txt')

    # Vérifier que tous les fichiers existent
    for file in [encoder, decoder, joiner, tokens]:
        if not os.path.exists(file):
            raise FileNotFoundError(f"Fichier modèle manquant: {file}")

    # Configuration du recognizer avec paramètres optimisés pour le français
    recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=encoder,
        decoder=decoder,
        joiner=joiner,
        tokens=tokens,
        num_threads=2,
        sample_rate=16000,
        feature_dim=128,  # Parakeet uses 128 mel bins, not 80
        model_type='nemo_transducer',
        # Paramètres de decoding pour améliorer la cohérence linguistique
        decoding_method='greedy_search',  # Plus stable que beam search pour une langue
        max_active_paths=4  # Réduit les chemins alternatifs (moins de mélange de langues)
    )

    # Charger l'audio
    samples = load_audio_samples(audio_file)

    # Créer un stream et transcrire
    stream = recognizer.create_stream()
    stream.accept_waveform(16000, samples)
    recognizer.decode_stream(stream)

    # Récupérer le résultat
    result = stream.result.text
    
    # Post-processing basique: nettoyer les artefacts
    result = result.strip()

    return result


def main():
    parser = argparse.ArgumentParser(description="Transcription avec Parakeet INT8 (sherpa-onnx)")
    parser.add_argument("audio_file", help="Fichier audio (WAV ou MP3)")
    parser.add_argument(
        "--model-dir",
        default=None,
        help="Répertoire du modèle (défaut: ~/Library/Application Support/freesper/models/parakeet-int8)"
    )
    parser.add_argument(
        "--language",
        default="fr",
        help="Code langue pour optimisation (défaut: fr)"
    )
    args = parser.parse_args()

    # Déterminer le répertoire du modèle
    if args.model_dir:
        model_dir = args.model_dir
    else:
        # Chemin par défaut sur macOS
        home = Path.home()
        model_dir = home / "Library" / "Application Support" / "freesper" / "models" / "parakeet-int8"

    model_dir = str(model_dir)

    try:
        # Transcrire avec la langue spécifiée
        text = transcribe_with_sherpa(args.audio_file, model_dir, language=args.language)

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
