const { ipcRenderer } = require('electron');

let currentView = 'model-manager-view';
let isCapturingHotkey = false;
let capturedKeys = [];
let loadModelsDebounceTimer = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadModels();
  await loadSettings();
  await loadHistory();

  // Window controls
  document.getElementById('close-button')?.addEventListener('click', () => {
    ipcRenderer.send('window-close');
  });

  document.getElementById('minimize-button')?.addEventListener('click', () => {
    ipcRenderer.send('window-minimize');
  });

  document.getElementById('maximize-button')?.addEventListener('click', () => {
    ipcRenderer.send('window-maximize');
  });

  // Set up event listeners
  document.getElementById('clear-history-btn')?.addEventListener('click', clearHistory);
  
  // Auto-paste checkbox - save immediately when changed
  const autoPasteCheckbox = document.getElementById('auto-paste');
  if (autoPasteCheckbox) {
    autoPasteCheckbox.addEventListener('change', async () => {
      await saveSettings();
    });
  }
  
  // Language select - save immediately when changed
  const languageSelect = document.getElementById('language');
  if (languageSelect) {
    languageSelect.addEventListener('change', async () => {
      await saveSettings();
    });
  }
  
  // Hotkey capture - click to activate
  const hotkeyDisplay = document.getElementById('hotkey-display');
  if (hotkeyDisplay) {
    hotkeyDisplay.addEventListener('click', startHotkeyCapture);
    // Also capture when focused
    hotkeyDisplay.setAttribute('tabindex', '0');
    hotkeyDisplay.addEventListener('focus', startHotkeyCapture);
  }

  // Navigation tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const viewName = e.target.getAttribute('data-view');
      switchView(viewName);
      
      // Update active tab
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
    });
  });

  // Listen for conversion progress (for any model installation)
  ipcRenderer.on('conversion-progress', (event, data) => {
    updateInstallButton(data);
  });

  // Listen for conversion complete - refresh models list
  ipcRenderer.on('conversion-complete', (event, data) => {
    console.log('Conversion complete:', data);
    loadModels(); // Refresh models list immediately
  });
});

// View switching
ipcRenderer.on('show-view', (event, viewName) => {
  switchView(viewName);
});

function switchView(viewName) {
  // Handle both formats: "model-manager" and "model-manager-view"
  const viewId = viewName.endsWith('-view') ? viewName : `${viewName}-view`;
  
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });

  const targetView = document.getElementById(viewId);
  if (targetView) {
    targetView.classList.add('active');
    currentView = viewId;
  }
}

// Model Management
async function loadModels() {
  try {
    const { installed, available } = await ipcRenderer.invoke('get-models');

    // Render installed models
    const installedContainer = document.getElementById('installed-models');
    if (installed.length === 0) {
      installedContainer.innerHTML = '<p class="empty-state">No models installed yet</p>';
    } else {
      installedContainer.innerHTML = installed.map(model => createInstalledModelCard(model)).join('');
    }

    // Render available models
    const availableContainer = document.getElementById('available-models');
    const availableSection = document.getElementById('available-models-section');
    
    if (available.length === 0) {
      // Hide the entire section if no models are available
      if (availableSection) {
        availableSection.style.display = 'none';
      }
    } else {
      // Show section and render models
      if (availableSection) {
        availableSection.style.display = 'block';
      }
      availableContainer.innerHTML = available.map(model => createAvailableModelCard(model)).join('');
    }

    // Attach event listeners
    attachModelEventListeners();
  } catch (error) {
    console.error('Failed to load models:', error);
  }
}

function createInstalledModelCard(model) {
  const isActive = model.isActive ? 'active' : '';
  const buttonText = model.isActive ? '✓ Active' : 'Load';
  const buttonClass = model.isActive ? 'primary-btn active' : 'primary-btn';
  
  return `
    <div class="model-card ${isActive}" data-model-id="${model.id}">
      <div class="model-header">
        <span class="model-name">${model.name}</span>
        <span class="model-size">${model.size}</span>
      </div>
      ${model.isActive ? '<div class="model-badge">Active model</div>' : ''}
      <div class="model-description">${model.description}</div>
      <div class="model-actions">
        <button class="${buttonClass} load-model" data-path="${model.path}" ${model.isActive ? 'disabled' : ''}>
          ${buttonText}
        </button>
        <button class="danger-btn delete-model" data-model-id="${model.id}">
          Delete
        </button>
      </div>
    </div>
  `;
}

function createAvailableModelCard(model) {
  const dataRepo = model.huggingFaceRepo ? `data-repo="${model.huggingFaceRepo}"` : '';
  const dataType = model.type ? `data-type="${model.type}"` : '';
  
  return `
    <div class="model-card" data-model-id="${model.id}">
      <div class="model-header">
        <span class="model-name">${model.name}</span>
        <span class="model-size">${model.size}</span>
      </div>
      <div class="model-description">${model.description}</div>
      
      <!-- Progress bar (hidden by default) -->
      <div class="install-progress" id="progress-${model.id}" style="display: none;">
        <div class="progress-bar-container">
          <div class="progress-bar-fill" id="progress-fill-${model.id}" style="width: 0%"></div>
        </div>
        <div class="progress-info">
          <div class="progress-text">
            <span class="progress-stage" id="progress-stage-${model.id}">Preparing</span>
            <span class="progress-message" id="progress-message-${model.id}">Initializing...</span>
          </div>
          <span class="progress-percent" id="progress-percent-${model.id}">0%</span>
        </div>
      </div>
      
      <div class="model-actions">
        <button class="secondary-btn install-model" data-model-id="${model.id}" ${dataRepo} ${dataType}>
          Install
        </button>
      </div>
    </div>
  `;
}

function attachModelEventListeners() {
  // Install buttons (auto-convert additional models)
  document.querySelectorAll('.install-model').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const modelId = e.target.getAttribute('data-model-id');
      const repo = e.target.getAttribute('data-repo');
      const modelType = e.target.getAttribute('data-type');
      const modelCard = e.target.closest('.model-card');

      // Show progress bar immediately
      const progressContainer = document.getElementById(`progress-${modelId}`);
      if (progressContainer) {
        e.target.style.display = 'none';
        progressContainer.style.display = 'block';
        if (modelCard) modelCard.classList.add('downloading');
        
        // Set initial state
        const progressFill = document.getElementById(`progress-fill-${modelId}`);
        const progressStage = document.getElementById(`progress-stage-${modelId}`);
        const progressMessage = document.getElementById(`progress-message-${modelId}`);
        const progressPercent = document.getElementById(`progress-percent-${modelId}`);
        
        if (progressFill) progressFill.style.width = '5%';
        if (progressStage) progressStage.textContent = 'Starting';
        if (progressMessage) progressMessage.textContent = 'Preparing download...';
        if (progressPercent) progressPercent.textContent = '0%';
      }

      e.target.disabled = true;
      e.target.setAttribute('data-installing', 'true');

      try {
        // Direct download for Parakeet INT8 (only available model)
        const result = await ipcRenderer.invoke('download-parakeet-int8', { modelId });
        
        if (result.success) {
          // Models list will be refreshed by conversion-complete event
        } else {
          throw new Error(result.error || 'Installation failed');
        }
      } catch (error) {
        console.error('Installation failed:', error);
        
        // Show error in progress bar
        const progressStage = document.getElementById(`progress-stage-${modelId}`);
        const progressMessage = document.getElementById(`progress-message-${modelId}`);
        const progressFill = document.getElementById(`progress-fill-${modelId}`);
        
        if (progressStage) progressStage.textContent = 'Error';
        if (progressMessage) progressMessage.textContent = error.message || 'Installation failed';
        if (progressFill) progressFill.style.background = '#4a2a2a';
        
        // Reset after error
        setTimeout(() => {
          if (progressContainer) progressContainer.style.display = 'none';
          if (modelCard) modelCard.classList.remove('downloading');
          e.target.style.display = 'inline-block';
          e.target.textContent = 'Install';
          e.target.disabled = false;
          e.target.removeAttribute('data-installing');
          if (progressFill) progressFill.style.background = '';
        }, 3000);
      }
    });
  });

  // Load buttons
  document.querySelectorAll('.load-model').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const modelPath = e.target.getAttribute('data-path');
      await loadModel(modelPath, e.target);
    });
  });

  // Delete buttons
  document.querySelectorAll('.delete-model').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const modelId = e.target.getAttribute('data-model-id');
      const modelCard = e.target.closest('.model-card');
      const isActive = modelCard.classList.contains('active');
      
      let confirmMessage = 'Are you sure you want to delete this model? This action cannot be undone.';
      
      if (isActive) {
        confirmMessage = '⚠️ This model is currently active.\n\n' +
                        'If you delete it:\n' +
                        '• It will be unloaded from memory\n' +
                        '• Recording will be disabled until a new model is loaded\n\n' +
                        'Are you sure you want to continue?';
      }
      
      if (confirm(confirmMessage)) {
        await deleteModel(modelId);
      }
    });
  });
}

// Update install button during conversion progress
function updateInstallButton(data) {
  const { modelId, stage, progress, message } = data;
  
  // Find the install button and progress elements for this model
  const btn = document.querySelector(`.install-model[data-model-id="${modelId}"]`);
  const modelCard = document.querySelector(`.model-card[data-model-id="${modelId}"]`);
  if (!btn) return;
  
  const progressContainer = document.getElementById(`progress-${modelId}`);
  const progressFill = document.getElementById(`progress-fill-${modelId}`);
  const progressStage = document.getElementById(`progress-stage-${modelId}`);
  const progressMessage = document.getElementById(`progress-message-${modelId}`);
  const progressPercent = document.getElementById(`progress-percent-${modelId}`);
  
  // Show progress bar and add downloading class
  if (progressContainer && !btn.getAttribute('data-installing')) {
    btn.setAttribute('data-installing', 'true');
    btn.disabled = true;
    btn.style.display = 'none'; // Hide button
    progressContainer.style.display = 'block'; // Show progress bar
    if (modelCard) modelCard.classList.add('downloading');
  }
  
  // Update progress bar and text
  if (progressFill && progressPercent) {
    const roundedProgress = Math.round(progress || 0);
    progressFill.style.width = `${roundedProgress}%`;
    progressPercent.textContent = `${roundedProgress}%`;
    
    // Update stage title
    if (progressStage) {
      if (stage === 'installing-deps') {
        progressStage.textContent = 'Configuration';
      } else if (stage === 'converting' || stage === 'downloading') {
        progressStage.textContent = 'Downloading';
      } else if (stage === 'extracting') {
        progressStage.textContent = 'Extracting';
      } else if (stage === 'complete') {
        progressStage.textContent = 'Complete';
        progressFill.classList.add('complete');
      } else if (stage === 'error') {
        progressStage.textContent = 'Error';
      } else {
        progressStage.textContent = 'Installing';
      }
    }
    
    // Update message
    if (progressMessage) {
      if (message) {
        progressMessage.textContent = message;
      } else if (stage === 'installing-deps') {
        progressMessage.textContent = 'Installing Python dependencies...';
      } else if (stage === 'converting' || stage === 'downloading') {
        progressMessage.textContent = 'Downloading model...';
      } else if (stage === 'extracting') {
        progressMessage.textContent = 'Extracting archive...';
      } else if (stage === 'complete') {
        progressMessage.textContent = 'Model is ready to use!';
        progressFill.style.width = '100%';
        progressPercent.textContent = '100%';
        
        // Hide progress and reload models after a short delay (debounced)
        setTimeout(() => {
          if (progressContainer) progressContainer.style.display = 'none';
          if (modelCard) modelCard.classList.remove('downloading');

          // Debounce loadModels to prevent multiple simultaneous calls
          if (loadModelsDebounceTimer) clearTimeout(loadModelsDebounceTimer);
          loadModelsDebounceTimer = setTimeout(() => {
            loadModels();
          }, 500);
        }, 1500);
      } else if (stage === 'error') {
        progressMessage.textContent = 'An error occurred';
        progressFill.style.background = '#4a2a2a';
        
        // Reset after error
        setTimeout(() => {
          if (progressContainer) progressContainer.style.display = 'none';
          if (modelCard) modelCard.classList.remove('downloading');
          btn.style.display = 'inline-block';
          btn.disabled = false;
          btn.removeAttribute('data-installing');
          progressFill.style.background = '';
          progressFill.classList.remove('complete');
        }, 3000);
      } else {
        progressMessage.textContent = 'Please wait...';
      }
    }
  }
  
  // Legacy button text update (fallback)
  if (!progressContainer) {
    if (stage === 'installing-deps' || message) {
      btn.textContent = message || `Configuration... ${Math.round(progress)}%`;
    } else if (stage === 'converting') {
      btn.textContent = `Downloading... ${Math.round(progress)}%`;
    } else if (stage === 'complete') {
      btn.textContent = 'Installed ✓';
    } else if (stage === 'error') {
      btn.textContent = 'Failed';
      btn.disabled = false;
      btn.removeAttribute('data-installing');
    } else if (progress !== undefined) {
      btn.textContent = `${Math.round(progress)}%`;
    }
  }
}

// Make copyToClipboard available globally for onclick handlers
window.copyToClipboard = function(text, button) {
  navigator.clipboard.writeText(text).then(() => {
    const originalText = button.textContent;
    button.textContent = 'Copied ✓';
    button.classList.add('copied');
    setTimeout(() => {
      button.textContent = originalText;
      button.classList.remove('copied');
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy:', err);
    button.textContent = 'Failed';
    setTimeout(() => {
      button.textContent = 'Copy';
    }, 2000);
  });
};

async function loadModel(modelPath, button) {
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = 'Loading...';

  try {
    const result = await ipcRenderer.invoke('load-model', modelPath);

    if (result.success) {
      button.textContent = '✓ Loaded';
      
      // Reload models list to update active state
      setTimeout(async () => {
        await loadModels();
      }, 500);
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Load failed:', error);
    button.textContent = 'Failed';
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 2000);
  }
}

async function deleteModel(modelId) {
  try {
    const result = await ipcRenderer.invoke('delete-model', modelId);
    
    if (result.success) {
      console.log('Model deleted successfully');
      // Reload models list
      await loadModels();
    } else {
      // Show error
      alert(result.error || 'Failed to delete model');
    }
  } catch (error) {
    console.error('Failed to delete model:', error);
    alert('Error deleting model: ' + error.message);
  }
}

// Settings
async function loadSettings() {
  try {
    const settings = await ipcRenderer.invoke('get-settings');

    // Display hotkey as badges
    displayHotkey(settings.hotkey);
    document.getElementById('language').value = settings.language;
    document.getElementById('auto-paste').checked = settings.autoPaste;
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

function displayHotkey(hotkeyString) {
  const hotkeyKeys = document.getElementById('hotkey-keys');
  
  // Handle single key (no "+" separator)
  const parts = hotkeyString.includes('+') ? hotkeyString.split('+') : [hotkeyString];
  
  // Clear current display
  hotkeyKeys.innerHTML = '';
  
  // Add each key as a badge
  parts.forEach((key, index) => {
    const badge = document.createElement('span');
    badge.className = 'key-badge';
    badge.textContent = formatKeyName(key);
    hotkeyKeys.appendChild(badge);
    
    // Add "+" separator except for last key
    if (index < parts.length - 1) {
      const plus = document.createElement('span');
      plus.className = 'key-plus';
      plus.textContent = '+';
      hotkeyKeys.appendChild(plus);
    }
  });
}

function formatKeyName(key) {
  const keyMap = {
    'CommandOrControl': 'Cmd',
    'Control': 'Ctrl',
    'Shift': 'Shift',
    'Alt': 'Alt',
    'Option': 'Opt',
    'Space': 'Space',
    'Enter': 'Enter',
    'Escape': 'Esc',
    'Backspace': '⌫',
    'Delete': 'Del',
    'Tab': 'Tab',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→'
  };
  
  return keyMap[key] || key.toUpperCase();
}

// Hotkey capture
function startHotkeyCapture() {
  if (isCapturingHotkey) return;
  
  const hotkeyDisplay = document.getElementById('hotkey-display');
  const hotkeyKeys = document.getElementById('hotkey-keys');
  const hotkeyPrompt = document.getElementById('hotkey-prompt');

  isCapturingHotkey = true;
  capturedKeys = [];

  // Show prompt, hide keys
  hotkeyKeys.style.display = 'none';
  hotkeyPrompt.style.display = 'block';
  hotkeyDisplay.classList.add('capturing');

  // Listen for keydown
  document.addEventListener('keydown', handleHotkeyCapture);
  
  // Stop capture on click outside or Escape
  const stopCapture = (e) => {
    if (e.type === 'click' && !hotkeyDisplay.contains(e.target)) {
      stopHotkeyCapture();
      document.removeEventListener('click', stopCapture);
    }
  };
  
  setTimeout(() => {
    document.addEventListener('click', stopCapture);
  }, 100);
}

function stopHotkeyCapture() {
  const hotkeyDisplay = document.getElementById('hotkey-display');
  const hotkeyKeys = document.getElementById('hotkey-keys');
  const hotkeyPrompt = document.getElementById('hotkey-prompt');

  isCapturingHotkey = false;
  capturedKeys = [];

  hotkeyDisplay.classList.remove('capturing');
  hotkeyKeys.style.display = 'flex';
  hotkeyPrompt.style.display = 'none';

  document.removeEventListener('keydown', handleHotkeyCapture);

  // Don't reload settings here - it would overwrite what was just captured
}

function handleHotkeyCapture(event) {
  if (!isCapturingHotkey) return;

  event.preventDefault();
  event.stopPropagation();

  const modifiers = [];
  const key = event.key;

  // Collect modifiers
  if (event.metaKey || event.key === 'Meta') modifiers.push('CommandOrControl');
  if (event.ctrlKey || event.key === 'Control') {
    if (!event.metaKey) modifiers.push('Control');
  }
  if (event.shiftKey || event.key === 'Shift') modifiers.push('Shift');
  if (event.altKey || event.key === 'Alt') modifiers.push('Alt');

  // Build hotkey string
  let hotkeyString = '';

  // Add key if it's not a modifier key being pressed alone
  if (!['Meta', 'Control', 'Shift', 'Alt'].includes(key)) {
    // Normalize key name
    let normalizedKey = key;
    if (key === ' ') normalizedKey = 'Space';
    else if (key === 'Escape') {
      // Escape = cancel
      stopHotkeyCapture();
      return;
    }
    else if (key.length === 1 && key.match(/[a-zA-Z0-9]/)) {
      normalizedKey = key.toUpperCase();
    }

    // Build hotkey string (with or without modifiers)
    if (modifiers.length > 0) {
      hotkeyString = [...modifiers, normalizedKey].join('+');
    } else {
      // Single key (no modifiers)
      hotkeyString = normalizedKey;
    }
    
    // Display the captured hotkey immediately
    displayHotkey(hotkeyString);
    
    // Save it
    saveHotkey(hotkeyString);
    
    // Stop capturing after a brief delay
    setTimeout(() => {
      stopHotkeyCapture();
    }, 300);
  }
}

async function saveHotkey(hotkeyString) {
  try {
    const settings = await ipcRenderer.invoke('get-settings');
    settings.hotkey = hotkeyString;
    await ipcRenderer.invoke('save-settings', settings);
    console.log('✓ Hotkey saved:', hotkeyString);
  } catch (error) {
    console.error('Failed to save hotkey:', error);
  }
}

async function saveSettings() {
  // Get current settings to preserve hotkey
  const currentSettings = await ipcRenderer.invoke('get-settings');
  
  const settings = {
    hotkey: currentSettings.hotkey, // Keep existing hotkey
    language: document.getElementById('language').value,
    autoPaste: document.getElementById('auto-paste').checked
  };

  try {
    await ipcRenderer.invoke('save-settings', settings);
    console.log('✓ Settings saved');
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

// History
async function loadHistory() {
  try {
    const history = await ipcRenderer.invoke('get-history');
    renderHistory(history);
  } catch (error) {
    console.error('Failed to load history:', error);
  }
}

function renderHistory(history) {
  const historyList = document.getElementById('history-list');

  if (!history || history.length === 0) {
    historyList.innerHTML = '<p class="empty-state">No transcriptions yet</p>';
    return;
  }

  historyList.innerHTML = history.map((item, index) => createHistoryCard(item, index)).join('');
}

function createHistoryCard(item, index) {
  const date = new Date(item.timestamp);
  const dateStr = date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Trim leading/trailing whitespace from text
  const cleanText = (item.text || '').trim();
  const isLongText = cleanText.length > 150;
  const textPreview = isLongText ? cleanText.substring(0, 150) + '...' : cleanText;
  
  return `
    <div class="history-card" data-index="${index}">
      <div class="history-meta">
        <span class="history-date">${dateStr}</span>
        ${item.duration ? `<span class="history-duration">${(item.duration / 1000).toFixed(1)}s</span>` : ''}
      </div>
      <div class="history-text ${isLongText ? 'collapsed' : ''}" id="history-text-${index}">${isLongText ? textPreview : cleanText}</div>
      ${isLongText ? `
        <button class="expand-btn" onclick="toggleHistoryText(${index})">
          <span class="expand-label">Show more</span>
          <span class="collapse-label" style="display:none;">Show less</span>
        </button>
      ` : ''}
      <div class="history-actions">
        <button class="secondary-btn copy-history" onclick="copyFromHistory(${index})">
          Copy text
        </button>
      </div>
    </div>
  `;
}

window.toggleHistoryText = async function(index) {
  const textDiv = document.getElementById(`history-text-${index}`);
  const expandBtn = textDiv.nextElementSibling;
  const expandLabel = expandBtn.querySelector('.expand-label');
  const collapseLabel = expandBtn.querySelector('.collapse-label');
  
  if (textDiv.classList.contains('collapsed')) {
    // Expand: show full text
    const history = await ipcRenderer.invoke('get-history');
    const item = history[index];
    const cleanText = (item.text || '').trim();
    textDiv.textContent = cleanText;
    textDiv.classList.remove('collapsed');
    expandLabel.style.display = 'none';
    collapseLabel.style.display = 'inline';
  } else {
    // Collapse: show preview
    const history = await ipcRenderer.invoke('get-history');
    const item = history[index];
    const cleanText = (item.text || '').trim();
    textDiv.textContent = cleanText.substring(0, 150) + '...';
    textDiv.classList.add('collapsed');
    expandLabel.style.display = 'inline';
    collapseLabel.style.display = 'none';
  }
};

window.copyFromHistory = async function(index) {
  try {
    const history = await ipcRenderer.invoke('get-history');
    const item = history[index];

    if (item && item.text) {
      await navigator.clipboard.writeText(item.text);

      // Visual feedback
      const btn = document.querySelector(`.history-card[data-index="${index}"] .copy-history`);
      if (btn) {
        const originalText = btn.textContent;
        btn.textContent = 'Copied ✓';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = originalText;
          btn.classList.remove('copied');
        }, 2000);
      }
    }
  } catch (error) {
    console.error('Failed to copy from history:', error);
  }
};

// Listen for new transcription events to update history
ipcRenderer.on('transcription-complete', async () => {
  await loadHistory();
});

// Clear history
async function clearHistory() {
  if (!confirm('Are you sure you want to clear all history?')) {
    return;
  }

  try {
    await ipcRenderer.invoke('clear-history');
    await loadHistory(); // Refresh
  } catch (error) {
    console.error('Failed to clear history:', error);
  }
}

