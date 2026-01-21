const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * AudioRecorder using native Electron APIs (no sox dependency)
 * Uses MediaRecorder API from the renderer process
 */
class AudioRecorder {
  constructor() {
    this.audioChunks = [];
    this.isRecording = false;
    this.tempDir = path.join(app.getPath('userData'), 'temp');
    this.currentRecordingWindow = null;

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Start recording using native Electron media APIs
   * @param {BrowserWindow} window - The window to capture audio from
   */
  startRecording(window) {
    return new Promise((resolve, reject) => {
      // Reset state before checking - fixes "Already recording" bug
      // The actual recording state is managed by the renderer process
      this.audioChunks = [];
      this.isRecording = true;
      this.currentRecordingWindow = window;

      console.log('✓ AudioRecorder: Ready for recording');
      
      // The actual recording will be handled by the renderer process
      // using the Web MediaRecorder API
      resolve();
    });
  }

  /**
   * Add audio chunk from renderer process
   * @param {Buffer} chunk - Audio data chunk
   */
  addAudioChunk(chunk) {
    this.audioChunks.push(chunk);
  }

  /**
   * Reset the recording state (call when recording is cancelled or fails)
   */
  reset() {
    this.isRecording = false;
    this.audioChunks = [];
    this.currentRecordingWindow = null;
    console.log('✓ AudioRecorder: State reset');
  }

  /**
   * Stop recording - just resets the state
   * Audio data comes from the renderer via IPC
   */
  stopRecording() {
    this.isRecording = false;
    console.log('✓ AudioRecorder: Recording stopped');
  }

  /**
   * Get temp directory path
   */
  getTempDir() {
    return this.tempDir;
  }

  cleanup() {
    this.reset();

    // Clean up temp files
    try {
      const files = fs.readdirSync(this.tempDir);
      files.forEach(file => {
        const filePath = path.join(this.tempDir, file);
        const stats = fs.statSync(filePath);

        // Delete files older than 1 hour
        if (Date.now() - stats.mtimeMs > 3600000) {
          fs.unlinkSync(filePath);
        }
      });
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }
}

module.exports = AudioRecorder;
