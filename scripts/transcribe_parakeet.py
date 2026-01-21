#!/usr/bin/env python3
"""
Script d'inférence pour Parakeet TDT v3 via NeMo
Utilisé par l'app Electron via subprocess pour transcription audio
"""

import sys
import json
import os
from pathlib import Path

def transcribe_audio(audio_path, model_name="nvidia/parakeet-tdt-0.6b-v3"):
    """
    Transcrit un fichier audio avec Parakeet TDT v3
    
    Args:
        audio_path: Chemin vers fichier audio (WAV, MP3, etc.)
        model_name: ID HuggingFace du modèle
        
    Returns:
        dict avec 'success', 'text', et optionnel 'error'
    """
    try:
        import nemo.collections.asr as nemo_asr
        from pydub import AudioSegment
        import tempfile
        
        # Charger le modèle (utilisera le cache HuggingFace)
        model = nemo_asr.models.EncDecRNNTBPEModel.from_pretrained(
            model_name=model_name
        )
        model.eval()
        
        # Convertir en WAV si nécessaire
        audio_path = Path(audio_path)
        if not audio_path.exists():
            return {
                'success': False,
                'error': f'Fichier audio non trouvé: {audio_path}'
            }
        
        # Si MP3 ou autre format, convertir en WAV temporaire
        temp_wav = None
        if audio_path.suffix.lower() != '.wav':
            audio = AudioSegment.from_file(str(audio_path))
            audio = audio.set_channels(1)  # Mono
            audio = audio.set_frame_rate(16000)  # 16kHz
            
            # Créer fichier temporaire
            temp_wav = tempfile.NamedTemporaryFile(
                suffix='.wav',
                delete=False
            )
            audio.export(temp_wav.name, format='wav')
            transcribe_path = temp_wav.name
        else:
            transcribe_path = str(audio_path)
        
        # Transcription
        transcriptions = model.transcribe([transcribe_path])
        
        # Nettoyer fichier temporaire
        if temp_wav:
            os.unlink(temp_wav.name)
        
        # Extraire le texte du résultat
        if transcriptions and len(transcriptions) > 0:
            result = transcriptions[0]
            # result peut être un Hypothesis object ou une string
            if hasattr(result, 'text'):
                text = result.text
            else:
                text = str(result)
            
            return {
                'success': True,
                'text': text
            }
        else:
            return {
                'success': False,
                'error': 'Aucune transcription générée'
            }
            
    except ImportError as e:
        return {
            'success': False,
            'error': f'Dépendances manquantes: {str(e)}. Installez avec: uv sync'
        }
    except Exception as e:
        return {
            'success': False,
            'error': f'Erreur transcription: {str(e)}'
        }


def main():
    """Point d'entrée CLI"""
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Usage: transcribe_parakeet.py <audio_path>'
        }))
        sys.exit(1)
    
    audio_path = sys.argv[1]
    result = transcribe_audio(audio_path)
    
    # Retourner JSON sur stdout
    print(json.dumps(result))
    
    # Exit code selon succès
    sys.exit(0 if result['success'] else 1)


if __name__ == '__main__':
    main()
