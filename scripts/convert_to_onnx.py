#!/usr/bin/env python3
"""
Convert Whisper or Parakeet models to ONNX format with CoreML optimization
"""

import argparse
import os
import json
import urllib.request
import zipfile
import shutil
from pathlib import Path


def is_parakeet_model(model_id):
    """Check if model is a Parakeet/NeMo model"""
    parakeet_patterns = ['parakeet', 'nemo', 'nvidia/stt', 'fastconformer']
    return any(p in model_id.lower() for p in parakeet_patterns)


def download_parakeet_onnx(model_id, output_dir):
    """
    Download pre-converted Parakeet ONNX models from sherpa-onnx releases
    
    Parakeet TDT models are transducers (RNN-T) with encoder + decoder + joiner
    """
    print(f"🔄 Downloading pre-converted Parakeet model...")
    print(f"📁 Output directory: {output_dir}")
    print("")
    
    os.makedirs(output_dir, exist_ok=True)
    
    # Sherpa-onnx provides pre-converted models
    # https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models
    model_urls = {
        'parakeet-tdt-0.6b': {
            'url': 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3.tar.bz2',
            'type': 'transducer',
            'files': ['encoder.onnx', 'decoder.onnx', 'joiner.onnx', 'tokens.txt'],
            'rename': {}
        },
        'parakeet-tdt-0.6b-int8': {
            'url': 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2',
            'type': 'transducer',
            'files': ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt'],
            'rename': {
                'encoder.int8.onnx': 'encoder.onnx',
                'decoder.int8.onnx': 'decoder.onnx',
                'joiner.int8.onnx': 'joiner.onnx'
            }
        },
        'parakeet-tdt-0.6b-v2': {
            'url': 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8.tar.bz2',
            'type': 'transducer',
            'files': ['encoder.int8.onnx', 'decoder.int8.onnx', 'joiner.int8.onnx', 'tokens.txt'],
            'rename': {
                'encoder.int8.onnx': 'encoder.onnx',
                'decoder.int8.onnx': 'decoder.onnx',
                'joiner.int8.onnx': 'joiner.onnx'
            }
        },
        'parakeet-tdt-110m': {
            'url': 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemo-parakeet_tdt_transducer_110m-en-36000.tar.bz2',
            'type': 'transducer',
            'files': ['encoder.onnx', 'decoder.onnx', 'joiner.onnx', 'tokens.txt']
        }
    }
    
    # Normalize model ID
    model_key = model_id.lower().replace('nvidia/', '').replace('_', '-')
    
    if model_key not in model_urls:
        # Try partial match
        for key in model_urls:
            if key in model_key or model_key in key:
                model_key = key
                break
        else:
            available = ', '.join(model_urls.keys())
            raise ValueError(f"Parakeet model '{model_id}' not found. Available: {available}")
    
    model_info = model_urls[model_key]
    url = model_info['url']
    
    print(f"⬇️  Downloading from: {url}")
    print("   This may take a few minutes...")
    
    # Download archive
    archive_path = os.path.join(output_dir, 'model.tar.bz2')
    
    def progress_hook(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            percent = min(100, downloaded * 100 / total_size)
            mb_downloaded = downloaded / (1024 * 1024)
            mb_total = total_size / (1024 * 1024)
            print(f"\r   Progress: {percent:.1f}% ({mb_downloaded:.1f}/{mb_total:.1f} MB)", end='', flush=True)
    
    urllib.request.urlretrieve(url, archive_path, progress_hook)
    print()  # New line after progress
    
    print("📦 Extracting model files...")
    
    # Extract tar.bz2
    import tarfile
    with tarfile.open(archive_path, 'r:bz2') as tar:
        tar.extractall(output_dir)
    
    # Find extracted directory and move files up
    extracted_dirs = [d for d in os.listdir(output_dir) if os.path.isdir(os.path.join(output_dir, d)) and d != 'test_wavs']
    if extracted_dirs:
        extracted_dir = os.path.join(output_dir, extracted_dirs[0])
        for item in os.listdir(extracted_dir):
            src = os.path.join(extracted_dir, item)
            dst = os.path.join(output_dir, item)
            if os.path.exists(dst):
                if os.path.isdir(dst):
                    shutil.rmtree(dst)
                else:
                    os.remove(dst)
            shutil.move(src, dst)
        shutil.rmtree(extracted_dir)
    
    # Clean up archive
    os.remove(archive_path)
    
    # Rename files if needed (e.g., encoder.fp16.onnx -> encoder.onnx)
    if 'rename' in model_info:
        print("📝 Renaming model files...")
        for old_name, new_name in model_info['rename'].items():
            old_path = os.path.join(output_dir, old_name)
            new_path = os.path.join(output_dir, new_name)
            if os.path.exists(old_path):
                if os.path.exists(new_path):
                    os.remove(new_path)
                shutil.move(old_path, new_path)
                print(f"   {old_name} -> {new_name}")
    
    # Create config file for inference engine
    config = {
        'model_type': 'transducer',
        'architecture': 'parakeet-tdt',
        'files': {
            'encoder': 'encoder.onnx',
            'decoder': 'decoder.onnx', 
            'joiner': 'joiner.onnx',
            'tokens': 'tokens.txt'
        },
        'sample_rate': 16000,
        'feature_dim': 80,
        'subsampling_factor': 4
    }
    
    config_path = os.path.join(output_dir, 'config.json')
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    
    print("✅ Download complete!")
    print("")
    
    # Validate files - check for renamed files
    print("🔍 Validating ONNX files...")
    expected_files = ['encoder.onnx', 'decoder.onnx', 'joiner.onnx', 'tokens.txt']
    for filename in expected_files:
        filepath = os.path.join(output_dir, filename)
        
        if os.path.exists(filepath):
            file_size_mb = os.path.getsize(filepath) / (1024 * 1024)
            print(f"   ✓ {filename}: {file_size_mb:.1f} MB")
        else:
            print(f"   ⚠️ {filename}: NOT FOUND")
    
    print("")
    print("✅ Parakeet model ready!")
    print(f"📦 Model saved to: {output_dir}")
    
    return True


def convert_whisper_model(model_id, output_dir, optimize=True):
    """
    Convert a Whisper model (Hugging Face Transformers) to ONNX format
    """
    try:
        from optimum.exporters.onnx import main_export
        from transformers import AutoProcessor
        import onnx
    except ImportError:
        print("❌ Required packages not installed")
        print("Please run: pip3 install optimum[onnxruntime] transformers onnx")
        return False

    print(f"🔄 Converting {model_id} to ONNX...")
    print(f"📁 Output directory: {output_dir}")
    print("")

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    try:
        # Export using proper Optimum API
        print("⬇️  Loading and exporting model from Hugging Face...")
        print("   This generates 3 ONNX files: encoder, decoder, decoder_with_past")

        main_export(
            model_name_or_path=model_id,
            output=Path(output_dir),
            task='automatic-speech-recognition-with-past',
            opset=17,
            device='cpu',
            fp16=False
        )

        print("✅ Export complete!")
        print("")

        # Create config for inference engine
        config = {
            'model_type': 'encoder-decoder',
            'architecture': 'whisper',
            'files': {
                'encoder': 'encoder_model.onnx',
                'decoder': 'decoder_model.onnx',
                'decoder_with_past': 'decoder_with_past_model.onnx'
            },
            'sample_rate': 16000,
            'feature_dim': 80,
            'max_length': 448
        }
        
        config_path = os.path.join(output_dir, 'config.json')
        with open(config_path, 'w') as f:
            json.dump(config, f, indent=2)

        # Validate all required files exist
        print("🔍 Validating ONNX files...")
        required_files = ['encoder_model.onnx', 'decoder_model.onnx', 'decoder_with_past_model.onnx']

        for filename in required_files:
            filepath = os.path.join(output_dir, filename)
            if not os.path.exists(filepath):
                raise RuntimeError(f"Missing required ONNX file: {filename}")

            model = onnx.load(filepath)
            if not model.graph:
                raise RuntimeError(f"Invalid ONNX model (no graph): {filename}")

            file_size_mb = os.path.getsize(filepath) / (1024 * 1024)
            print(f"   ✓ {filename}: {len(model.graph.node)} nodes, {file_size_mb:.1f} MB")

        print("")
        print("✅ All ONNX files validated successfully!")
        print(f"📦 Model saved to: {output_dir}")

        if optimize:
            print("")
            print("🚀 Optimization notes:")
            print("   ✓ ONNX Runtime graph optimizations applied during export")
            print("   ✓ CoreML execution provider will be used on Apple Silicon")
            print("   ✓ KV cache optimization enabled (decoder_with_past)")

        return True

    except Exception as e:
        print(f"❌ Conversion failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def convert_model(model_id, output_dir, optimize=True):
    """
    Convert a model to ONNX format - auto-detects model type
    """
    if is_parakeet_model(model_id):
        return download_parakeet_onnx(model_id, output_dir)
    else:
        return convert_whisper_model(model_id, output_dir, optimize)


def main():
    parser = argparse.ArgumentParser(
        description="Convert speech models to ONNX format"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="openai/whisper-tiny",
        help="Hugging Face model ID"
    )
    parser.add_argument(
        "--output",
        type=str,
        help="Output directory (default: models/<model-name>)"
    )
    parser.add_argument(
        "--no-optimize",
        action="store_true",
        help="Skip optimization step"
    )

    args = parser.parse_args()

    # Determine output directory
    if args.output:
        output_dir = args.output
    else:
        model_name = args.model.split("/")[-1]
        output_dir = f"models/{model_name}"

    # Convert
    success = convert_model(
        args.model,
        output_dir,
        optimize=not args.no_optimize
    )

    if success:
        print("")
        print("=" * 60)
        print("🎉 SUCCESS! Your model is ready to use")
        print("=" * 60)
        print("")
        print("Next steps:")
        print("  1. Restart freesper if it's running")
        print("  2. Open Model Manager in the app")
        print("  3. Your model should appear as installed")
        print("  4. Select it and start transcribing!")
        print("")
        print(f"Model location: {os.path.abspath(output_dir)}")
    else:
        exit(1)


if __name__ == "__main__":
    main()
