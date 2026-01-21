#!/usr/bin/env python3
"""
Extract mel-spectrogram features from audio for speech recognition models

This script is called by the Node.js inference engine to preprocess audio.
"""

import sys
import json
import numpy as np

def extract_mel_spectrogram(audio_path, n_mels=80, n_fft=400, hop_length=160, sr=16000):
    """
    Extract log-mel spectrogram features from audio file

    Args:
        audio_path: Path to audio file
        n_mels: Number of mel filterbanks (80 for Whisper, Parakeet)
        n_fft: FFT window size
        hop_length: Hop length for STFT
        sr: Target sample rate

    Returns:
        Dictionary with features and shape
    """
    try:
        import librosa
    except ImportError:
        print(json.dumps({
            'error': 'librosa not installed',
            'message': 'Install with: pip3 install librosa'
        }))
        sys.exit(1)

    try:
        # Load audio at target sample rate
        audio, _ = librosa.load(audio_path, sr=sr, mono=True)

        # Compute mel spectrogram
        mel_spec = librosa.feature.melspectrogram(
            y=audio,
            sr=sr,
            n_fft=n_fft,
            hop_length=hop_length,
            n_mels=n_mels,
            fmin=0,
            fmax=8000  # Typical for speech
        )

        # Convert to log scale (dB)
        log_mel = librosa.power_to_db(mel_spec, ref=np.max)

        # Convert to list for JSON serialization
        features = log_mel.tolist()

        # Return features and shape
        result = {
            'features': features,
            'shape': [n_mels, len(features[0])],
            'duration': len(audio) / sr
        }

        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({
            'error': str(e),
            'message': 'Failed to extract features'
        }), file=sys.stderr)
        sys.exit(1)


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Extract mel-spectrogram features')
    parser.add_argument('audio_path', help='Path to audio file')
    parser.add_argument('--n_mels', type=int, default=80, help='Number of mel filterbanks')
    parser.add_argument('--n_fft', type=int, default=400, help='FFT window size')
    parser.add_argument('--hop_length', type=int, default=160, help='Hop length')
    parser.add_argument('--sr', type=int, default=16000, help='Sample rate')
    
    args = parser.parse_args()
    
    extract_mel_spectrogram(
        args.audio_path, 
        n_mels=args.n_mels, 
        n_fft=args.n_fft, 
        hop_length=args.hop_length,
        sr=args.sr
    )


if __name__ == '__main__':
    main()
