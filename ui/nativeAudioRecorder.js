/**
 * Native Audio Recorder using Web MediaRecorder API
 * This runs in the renderer process and uses browser APIs
 */

class NativeAudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.stream = null;
  }

  /**
   * Start recording audio from microphone
   */
  async startRecording() {
    try {
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1, // Mono
          sampleRate: 16000, // 16kHz for Whisper
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Try different formats in order of preference
      let options = {};
      
      if (MediaRecorder.isTypeSupported('audio/wav')) {
        options.mimeType = 'audio/wav';
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=pcm')) {
        options.mimeType = 'audio/webm;codecs=pcm';
      } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options.mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options.mimeType = 'audio/webm';
      } else {
        // Fallback to default
        options = {};
      }

      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.audioChunks = [];

      this.mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      });

      this.mediaRecorder.start(100); // Collect data every 100ms
      console.log('✓ Recording started with native MediaRecorder');
      console.log('  Format:', this.mediaRecorder.mimeType || 'default');

      return true;
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw new Error(`Microphone access denied or unavailable: ${error.message}`);
    }
  }

  /**
   * Stop recording and return audio data
   */
  async stopRecording() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        return reject(new Error('Not recording'));
      }

      this.mediaRecorder.addEventListener('stop', async () => {
        try {
          // Stop all audio tracks
          if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
          }

          // Combine chunks into a single Blob
          const audioBlob = new Blob(this.audioChunks, { 
            type: this.mediaRecorder.mimeType 
          });

          console.log('✓ Recording stopped');
          console.log('  Size:', (audioBlob.size / 1024).toFixed(2), 'KB');
          console.log('  Type:', audioBlob.type);

          resolve(audioBlob);
        } catch (error) {
          reject(error);
        }
      });

      this.mediaRecorder.stop();
    });
  }

  /**
   * Check if recording is active
   */
  isRecording() {
    return this.mediaRecorder && this.mediaRecorder.state === 'recording';
  }

  /**
   * Cancel recording without saving
   */
  cancel() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    this.audioChunks = [];
  }
}

// Export for use in renderer
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NativeAudioRecorder;
}
