console.log('📦 recordingRenderer.js: Script loading...');

const { ipcRenderer } = require('electron');

// Import native audio recorder
const NativeAudioRecorder = require('./nativeAudioRecorder');

let audioRecorder = null;

console.log('📦 recordingRenderer.js: Dependencies loaded');

// Initialize immediately or wait for DOMContentLoaded
function initialize() {
  console.log('🚀 recordingRenderer.js: Initializing...');
  audioRecorder = new NativeAudioRecorder();
  console.log('✓ recordingRenderer.js: NativeAudioRecorder created');
}

// If DOM is already loaded, initialize immediately
// Otherwise, wait for DOMContentLoaded
if (document.readyState === 'loading') {
  console.log('📍 recordingRenderer.js: Waiting for DOMContentLoaded');
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  console.log('📍 recordingRenderer.js: DOM already loaded, initializing immediately');
  initialize();
}

// Listen for start recording command
ipcRenderer.on('start-audio-recording', async () => {
  console.log('Starting audio recording...');
  try {
    await audioRecorder.startRecording();
    console.log('✓ Recording started');
  } catch (error) {
    console.error('Failed to start recording:', error);
    ipcRenderer.send('recording-error', { error: error.message });
  }
});

// Listen for stop recording command
ipcRenderer.on('stop-audio-recording', async () => {
  console.log('📍 Stopping audio recording...');
  console.log('📍 Audio recorder state:', audioRecorder ? 'initialized' : 'NULL');

  if (!audioRecorder) {
    console.error('❌ audioRecorder is null - renderer not initialized properly!');
    ipcRenderer.invoke('audio-data-recorded', null).catch(err => {
      console.error('Failed to send error to main process:', err);
    });
    return;
  }

  try {
    console.log('📍 Calling audioRecorder.stopRecording()...');
    const audioBlob = await audioRecorder.stopRecording();
    console.log('✓ Recording stopped');
    console.log('  Blob size:', (audioBlob.size / 1024).toFixed(2), 'KB');
    console.log('  Blob type:', audioBlob.type);

    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('No audio data recorded (empty blob)');
    }

    // Convert Blob to ArrayBuffer
    console.log('📍 Converting Blob to ArrayBuffer...');
    const arrayBuffer = await audioBlob.arrayBuffer();
    console.log('✓ Conversion complete:', arrayBuffer.byteLength, 'bytes');

    // Send audio data to main process for transcription
    console.log('📍 Sending audio data to main process...');
    const result = await ipcRenderer.invoke('audio-data-recorded', arrayBuffer);
    console.log('✓ Main process response:', result);

    if (!result.success) {
      console.error('❌ Transcription failed:', result.error);
    } else {
      console.log('✅ Transcription successful:', result.text);
    }
  } catch (error) {
    console.error('❌ Failed to stop recording:', error);
    console.error('Error stack:', error.stack);

    // Send error to main process
    try {
      await ipcRenderer.invoke('audio-data-recorded', null);
    } catch (ipcError) {
      console.error('Failed to notify main process of error:', ipcError);
    }
  }
});

// Update UI based on status
ipcRenderer.on('recording-status', (event, data) => {
  const statusElement = document.getElementById('status');
  const pulseElement = document.querySelector('.pulse');
  
  if (statusElement) {
    switch (data.status) {
      case 'recording':
        statusElement.textContent = 'Enregistrement en cours...';
        if (pulseElement) pulseElement.style.display = 'block';
        break;
      case 'processing':
        statusElement.textContent = 'Transcription en cours...';
        if (pulseElement) pulseElement.style.display = 'none';
        break;
      case 'complete':
        statusElement.textContent = 'Terminé !';
        break;
    }
  }
});

// Handle transcription complete
ipcRenderer.on('transcription-complete', (event, data) => {
  console.log('Transcription complete:', data.text);
  const statusElement = document.getElementById('status');
  if (statusElement) {
    statusElement.textContent = '✓ Transcription terminée';
  }
});

// Handle transcription error
ipcRenderer.on('transcription-error', (event, data) => {
  console.error('Transcription error:', data.error);
  const statusElement = document.getElementById('status');
  if (statusElement) {
    statusElement.textContent = '✗ Erreur: ' + data.error;
  }
});
