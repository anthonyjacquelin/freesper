#!/usr/bin/env python3
"""
Test des versions optimisées de Parakeet TDT v3
"""

import os
from pydub import AudioSegment

os.chdir(os.path.dirname(os.path.abspath(__file__)))

def convert_to_wav(audio_file, target_sr=16000):
    """Convertit un fichier audio en WAV mono 16kHz"""
    if audio_file.endswith('.wav'):
        return audio_file
    
    print(f"🔄 Conversion de {audio_file} en WAV...")
    
    audio = AudioSegment.from_file(audio_file)
    audio = audio.set_channels(1)
    audio = audio.set_frame_rate(target_sr)
    
    temp_wav = audio_file.rsplit('.', 1)[0] + '_temp.wav'
    audio.export(temp_wav, format='wav')
    
    print(f"✅ Converti en: {temp_wav}")
    return temp_wav


def test_onnx_asr_int8():
    """Test avec onnx-asr et version INT8"""
    import onnx_asr
    
    print("=" * 60)
    print("🧪 Test 1: Parakeet TDT v3 INT8 (via onnx-asr)")
    print("=" * 60)
    print("")
    
    print("📥 Chargement du modèle INT8 depuis Hugging Face...")
    print("   Modèle: nasedkinpv/parakeet-tdt-0.6b-v3-onnx-int8")
    print("   Taille: ~890 MB (au lieu de 2.4 GB)")
    print("")
    
    try:
        model = onnx_asr.load_model(
            "nasedkinpv/parakeet-tdt-0.6b-v3-onnx-int8",
            providers=["CPUExecutionProvider"]
        )
        print("✅ Modèle INT8 chargé!")
        print("")
        
        # Test français
        audio_file = "ElevenLabs_2026-01-18T17_00_27_Lea - UGC creator_pvc_sp108_s51_sb72_se2_m2.mp3"
        wav_file = convert_to_wav(audio_file)
        
        print("🎤 Transcription en cours...")
        print(f"   Fichier: {audio_file}")
        print("")
        
        result = model.recognize(wav_file, language="fr")
        
        print("📝 Résultat (INT8):")
        print("-" * 60)
        print(result)
        print("-" * 60)
        
        # Cleanup
        if wav_file != audio_file and os.path.exists(wav_file):
            os.remove(wav_file)
        
        return True
        
    except Exception as e:
        print(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_nemo_direct():
    """Test avec NeMo direct (référence)"""
    import nemo.collections.asr as nemo_asr
    
    print("")
    print("=" * 60)
    print("🧪 Test 2: Parakeet TDT v3 via NeMo (référence)")
    print("=" * 60)
    print("")
    
    print("📥 Chargement du modèle NeMo...")
    
    try:
        model = nemo_asr.models.EncDecRNNTBPEModel.from_pretrained(
            model_name="nvidia/parakeet-tdt-0.6b-v3"
        )
        model.eval()
        
        print("✅ Modèle NeMo chargé!")
        print("")
        
        audio_file = "ElevenLabs_2026-01-18T17_00_27_Lea - UGC creator_pvc_sp108_s51_sb72_se2_m2.mp3"
        wav_file = convert_to_wav(audio_file)
        
        print("🎤 Transcription en cours...")
        
        transcriptions = model.transcribe([wav_file])
        
        print("")
        print("📝 Résultat (NeMo FP32):")
        print("-" * 60)
        print(transcriptions[0])
        print("-" * 60)
        
        # Cleanup
        if wav_file != audio_file and os.path.exists(wav_file):
            os.remove(wav_file)
        
        return True
        
    except Exception as e:
        print(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    print("🦜 Comparaison des versions de Parakeet TDT v3")
    print("")
    
    # Test INT8 (optimisé)
    success_int8 = test_onnx_asr_int8()
    
    # Test NeMo (référence)
    success_nemo = test_nemo_direct()
    
    print("")
    print("=" * 60)
    print("📊 Résumé")
    print("=" * 60)
    print(f"INT8 (890MB):  {'✅ Succès' if success_int8 else '❌ Échec'}")
    print(f"NeMo (600MB):  {'✅ Succès' if success_nemo else '❌ Échec'}")
