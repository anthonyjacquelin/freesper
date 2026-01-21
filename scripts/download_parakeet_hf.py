#!/usr/bin/env python3
"""
Download Parakeet TDT 0.6b v2 ONNX model from Hugging Face

This script downloads the optimized ONNX version of the Parakeet model
from the onnx-community repository on Hugging Face.
"""

import sys
import os
import json
from pathlib import Path

def download_model(output_dir):
    """
    Download Parakeet ONNX model from Hugging Face

    Args:
        output_dir: Directory to save the model
    """
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        print(json.dumps({
            'error': 'huggingface_hub not installed',
            'message': 'Install with: pip3 install huggingface_hub'
        }), file=sys.stderr)
        sys.exit(1)

    try:
        print(f"Downloading Parakeet TDT 0.6b v2 ONNX model to {output_dir}...", file=sys.stderr)

        # Download the model from Hugging Face
        model_path = snapshot_download(
            repo_id="onnx-community/parakeet-tdt-0.6b-v2-ONNX",
            local_dir=output_dir,
            local_dir_use_symlinks=False
        )

        print(json.dumps({
            'success': True,
            'model_path': model_path,
            'message': 'Model downloaded successfully'
        }))

    except Exception as e:
        print(json.dumps({
            'error': str(e),
            'message': 'Failed to download model'
        }), file=sys.stderr)
        sys.exit(1)


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Download Parakeet ONNX model from Hugging Face')
    parser.add_argument('--output-dir', required=True, help='Output directory for the model')

    args = parser.parse_args()

    # Create output directory if it doesn't exist
    os.makedirs(args.output_dir, exist_ok=True)

    download_model(args.output_dir)


if __name__ == '__main__':
    main()
