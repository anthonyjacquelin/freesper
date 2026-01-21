#!/usr/bin/env python3
"""
Convertit le modèle Parakeet TDT v3 de NeMo vers TorchScript/ONNX
"""

import os
import sys

def convert_parakeet_to_onnx(output_dir="models/parakeet-tdt-0.6b-v3-onnx"):
    """Convertit Parakeet TDT v3 en TorchScript puis ONNX"""
    
    import nemo.collections.asr as nemo_asr
    import torch
    
    print("📥 Chargement du modèle Parakeet TDT 0.6b-v3 depuis Hugging Face...")
    print("   Modèle: nvidia/parakeet-tdt-0.6b-v3")
    print("   (Le téléchargement peut prendre plusieurs minutes)")
    print("")
    
    # Charger le modèle
    try:
        model = nemo_asr.models.EncDecRNNTBPEModel.from_pretrained(
            model_name="nvidia/parakeet-tdt-0.6b-v3"
        )
        print("✅ Modèle chargé!")
        print("")
    except Exception as e:
        print(f"❌ Erreur lors du chargement: {e}")
        return False
    
    model.eval()
    model.freeze()
    
    os.makedirs(output_dir, exist_ok=True)
    
    print("🔄 Conversion en TorchScript/ONNX...")
    print(f"   Destination: {output_dir}")
    print("")
    
    # Wrapper pour l'encoder avec preprocessor
    class EncoderWrapper(torch.nn.Module):
        def __init__(self, encoder, preprocessor):
            super().__init__()
            self.encoder = encoder
            self.preprocessor = preprocessor
        
        def forward(self, audio_signal, length):
            processed_signal, processed_signal_length = self.preprocessor(
                input_signal=audio_signal, 
                length=length
            )
            encoded, encoded_len = self.encoder(
                audio_signal=processed_signal, 
                length=processed_signal_length
            )
            return encoded, encoded_len
    
    # Wrapper pour le decoder
    class DecoderWrapper(torch.nn.Module):
        def __init__(self, decoder):
            super().__init__()
            self.decoder = decoder
        
        def forward(self, targets, target_length):
            # Le decoder NeMo retourne (output, prednet_lengths, states)
            result = self.decoder(targets=targets, target_length=target_length)
            if isinstance(result, tuple):
                return result[0]  # Juste le decoder output
            return result
    
    # Wrapper pour le joint - accès direct aux couches
    class JointWrapper(torch.nn.Module):
        def __init__(self, joint):
            super().__init__()
            # Copier les couches du joint
            self.enc = joint.enc
            self.pred = joint.pred
            self.joint_net = joint.joint_net
        
        def forward(self, encoder_output, decoder_output):
            # encoder_output: (B, T, enc_hidden)
            # decoder_output: (B, U, pred_hidden)
            
            # Projections
            enc = self.enc(encoder_output)  # (B, T, joint_hidden)
            pred = self.pred(decoder_output)  # (B, U, joint_hidden)
            
            # Broadcast et addition
            enc = enc.unsqueeze(2)  # (B, T, 1, joint_hidden)
            pred = pred.unsqueeze(1)  # (B, 1, U, joint_hidden)
            
            joint = enc + pred  # (B, T, U, joint_hidden)
            
            # Joint network (ReLU + Linear)
            joint = self.joint_net(joint)  # (B, T, U, num_classes)
            
            return joint
    
    try:
        batch_size = 1
        audio_len = 16000  # 1 seconde
        
        # 1. Encoder
        print("   Étape 1/3: Export de l'encoder...")
        encoder_wrapper = EncoderWrapper(model.encoder, model.preprocessor)
        encoder_wrapper.eval()
        
        audio_signal = torch.randn(batch_size, audio_len)
        length = torch.tensor([audio_len], dtype=torch.long)
        
        with torch.no_grad():
            traced_encoder = torch.jit.trace(encoder_wrapper, (audio_signal, length), strict=False)
        
        encoder_path = os.path.join(output_dir, "encoder.pt")
        traced_encoder.save(encoder_path)
        size_mb = os.path.getsize(encoder_path) / (1024*1024)
        print(f"   ✓ encoder.pt: {size_mb:.1f} MB")
        
        # 2. Decoder
        print("   Étape 2/3: Export du decoder...")
        decoder_wrapper = DecoderWrapper(model.decoder)
        decoder_wrapper.eval()
        
        targets = torch.zeros(batch_size, 1, dtype=torch.long)
        target_length = torch.tensor([1], dtype=torch.long)
        
        with torch.no_grad():
            traced_decoder = torch.jit.trace(decoder_wrapper, (targets, target_length), strict=False)
        
        decoder_path = os.path.join(output_dir, "decoder.pt")
        traced_decoder.save(decoder_path)
        size_mb = os.path.getsize(decoder_path) / (1024*1024)
        print(f"   ✓ decoder.pt: {size_mb:.1f} MB")
        
        # 3. Joint
        print("   Étape 3/3: Export du joint network...")
        joint_wrapper = JointWrapper(model.joint)
        joint_wrapper.eval()
        
        # Obtenir les dimensions depuis le modèle
        enc_hidden = model.joint.encoder_hidden
        pred_hidden = model.joint.pred_hidden
        
        enc_out = torch.randn(batch_size, 10, enc_hidden)
        dec_out = torch.randn(batch_size, 1, pred_hidden)
        
        with torch.no_grad():
            traced_joint = torch.jit.trace(joint_wrapper, (enc_out, dec_out), strict=False)
        
        joint_path = os.path.join(output_dir, "joint.pt")
        traced_joint.save(joint_path)
        size_mb = os.path.getsize(joint_path) / (1024*1024)
        print(f"   ✓ joint.pt: {size_mb:.1f} MB")
        
        print("")
        print("✅ Export TorchScript terminé!")
        print("")
        
    except Exception as e:
        print(f"❌ Erreur lors de l'export: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Extraire le tokenizer
    print("📦 Extraction du tokenizer...")
    try:
        import zipfile
        from pathlib import Path
        
        cache_dir = Path.home() / ".cache/huggingface/hub"
        model_cache = cache_dir / "models--nvidia--parakeet-tdt-0.6b-v3/snapshots"
        
        if model_cache.exists():
            snapshots = list(model_cache.iterdir())
            if snapshots:
                latest_snapshot = max(snapshots, key=lambda p: p.stat().st_mtime)
                nemo_file = latest_snapshot / "parakeet-tdt-0.6b-v3.nemo"
                
                if nemo_file.exists():
                    with zipfile.ZipFile(nemo_file, 'r') as zip_ref:
                        for file_info in zip_ref.filelist:
                            if 'tokenizer.model' in file_info.filename:
                                data = zip_ref.read(file_info)
                                out_path = os.path.join(output_dir, "tokenizer.model")
                                with open(out_path, 'wb') as f:
                                    f.write(data)
                                size_kb = len(data) / 1024
                                print(f"   ✓ tokenizer.model: {size_kb:.1f} KB")
                                break
        print("")
    except Exception as e:
        print(f"   ⚠️  Erreur: {e}")
        print("")
    
    # Créer config
    print("📝 Création du fichier de configuration...")
    import json
    
    files = {}
    for f in os.listdir(output_dir):
        if f.endswith('.pt') or f.endswith('.onnx'):
            name = f.replace('.pt', '').replace('.onnx', '')
            files[name] = f
    
    config = {
        'model_type': 'transducer',
        'architecture': 'parakeet-tdt-v3',
        'format': 'torchscript',  # ou 'onnx' si conversion réussie
        'source': 'nvidia/parakeet-tdt-0.6b-v3',
        'files': files,
        'tokenizer': 'tokenizer.model',
        'sample_rate': 16000,
        'feature_dim': 80,
        'encoder_hidden': model.joint.encoder_hidden,
        'pred_hidden': model.joint.pred_hidden,
        'vocab_size': model.joint._num_classes,
        'languages': ['bg', 'hr', 'cs', 'da', 'nl', 'en', 'et', 'fi', 'fr', 'de', 
                     'el', 'hu', 'it', 'lv', 'lt', 'mt', 'pl', 'pt', 'ro', 'sk', 
                     'sl', 'es', 'sv', 'ru', 'uk']
    }
    
    with open(os.path.join(output_dir, 'config.json'), 'w') as f:
        json.dump(config, f, indent=2)
    print("   ✓ config.json créé")
    print("")
    
    # Afficher les fichiers
    print("📦 Fichiers générés:")
    total_size = 0
    for filename in sorted(os.listdir(output_dir)):
        filepath = os.path.join(output_dir, filename)
        if os.path.isfile(filepath):
            size_mb = os.path.getsize(filepath) / (1024 * 1024)
            total_size += size_mb
            print(f"   ✓ {filename}: {size_mb:.1f} MB")
    
    print(f"\n   Total: {total_size:.1f} MB")
    print("")
    print("=" * 60)
    print("🎉 Conversion réussie!")
    print("=" * 60)
    print(f"\nModèle exporté dans: {os.path.abspath(output_dir)}")
    print("")
    print("Note: Les fichiers sont au format TorchScript (.pt)")
    print("      Pour utiliser avec onnxruntime, une conversion")
    print("      supplémentaire serait nécessaire avec une version")
    print("      antérieure de PyTorch (< 2.5)")
    print("")
    
    return True


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Convertit Parakeet TDT v3 de NeMo vers TorchScript"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="models/parakeet-tdt-0.6b-v3-onnx",
        help="Répertoire de sortie"
    )
    
    args = parser.parse_args()
    
    success = convert_parakeet_to_onnx(args.output)
    
    if not success:
        sys.exit(1)
