#!/usr/bin/env python3.13
"""
Transcribe audio using onnx-asr library

This script uses the lightweight onnx-asr library to transcribe audio files
with NVIDIA Parakeet models from ONNX format.
"""

import sys
import json
import argparse
from pathlib import Path

def transcribe_audio(audio_path, model_name='nemo-parakeet-tdt-0.6b-v3', language=None):
    """
    Transcribe audio file using onnx-asr

    Args:
        audio_path: Path to audio file
        model_name: Model identifier (default: nemo-parakeet-tdt-0.6b-v3)
        language: Optional language code for multilingual models

    Returns:
        dict: Transcription result with text and metadata
    """
    try:
        import onnx_asr
    except ImportError:
        return {
            'error': 'onnx_asr not installed',
            'message': 'Install with: pip3.13 install onnx-asr[cpu,hub]'
        }

    try:
        # Load the model
        print(f"Loading model: {model_name}...", file=sys.stderr)
        model = onnx_asr.load_model(model_name)
        print(f"✓ Model loaded", file=sys.stderr)

        # Transcribe the audio
        print(f"Transcribing: {audio_path}...", file=sys.stderr)
        if language:
            result = model.transcribe(audio_path, language=language)
        else:
            result = model.transcribe(audio_path)

        # Extract text from result
        # onnx-asr returns a dict with 'text' key
        transcription_text = result.get('text', result) if isinstance(result, dict) else str(result)

        return {
            'success': True,
            'text': transcription_text,
            'model': model_name,
            'audio_path': audio_path
        }

    except FileNotFoundError:
        return {
            'error': 'Audio file not found',
            'message': f'Could not find audio file: {audio_path}'
        }
    except Exception as e:
        return {
            'error': str(e),
            'message': f'Transcription failed: {str(e)}'
        }


def main():
    parser = argparse.ArgumentParser(description='Transcribe audio using onnx-asr')
    parser.add_argument('audio_path', help='Path to audio file')
    parser.add_argument('--model', default='nemo-parakeet-tdt-0.6b-v3',
                        help='Model name (default: nemo-parakeet-tdt-0.6b-v3)')
    parser.add_argument('--language', default=None,
                        help='Language code for multilingual models')
    parser.add_argument('--json', action='store_true',
                        help='Output as JSON')

    args = parser.parse_args()

    result = transcribe_audio(args.audio_path, args.model, args.language)

    if args.json or 'error' in result:
        print(json.dumps(result, indent=2))
    else:
        # Print just the transcription text for easy parsing
        print(result.get('text', ''))

    # Exit with error code if transcription failed
    if 'error' in result:
        sys.exit(1)


if __name__ == '__main__':
    main()
