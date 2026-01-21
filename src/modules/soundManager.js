const path = require('path');
const fs = require('fs');

class SoundManager {
  constructor() {
    this.soundsDir = path.join(__dirname, '../../assets/sounds');
    this.startSounds = [];
    this.stopSounds = [];
    
    // Load available sound files
    this.loadSounds();
  }

  loadSounds() {
    try {
      if (!fs.existsSync(this.soundsDir)) {
        console.warn('⚠️  Sounds directory not found:', this.soundsDir);
        return;
      }

      const files = fs.readdirSync(this.soundsDir);
      
      // Filter start sounds (Start1.m4a, Start2.m4a, etc.)
      this.startSounds = files
        .filter(file => file.startsWith('Start') && file.endsWith('.m4a'))
        .map(file => path.join(this.soundsDir, file));
      
      // Filter stop sounds (Stop1.m4a, Stop2.m4a, etc.)
      this.stopSounds = files
        .filter(file => file.startsWith('Stop') && file.endsWith('.m4a'))
        .map(file => path.join(this.soundsDir, file));
      
      console.log(`✓ Loaded ${this.startSounds.length} start sounds and ${this.stopSounds.length} stop sounds`);
    } catch (error) {
      console.error('Failed to load sounds:', error);
    }
  }

  /**
   * Get a random sound file path
   * @param {string} type - 'start' or 'stop'
   * @returns {string|null} - Path to sound file or null if no sounds available
   */
  getRandomSound(type) {
    const sounds = type === 'start' ? this.startSounds : this.stopSounds;
    
    if (sounds.length === 0) {
      console.warn(`⚠️  No ${type} sounds available`);
      return null;
    }
    
    // Pick a random sound
    const randomIndex = Math.floor(Math.random() * sounds.length);
    return sounds[randomIndex];
  }

  /**
   * Get a sound URL for the renderer process
   * @param {string} type - 'start' or 'stop'
   * @returns {string|null} - file:// URL or null
   */
  getRandomSoundUrl(type) {
    const soundPath = this.getRandomSound(type);
    
    if (!soundPath) {
      return null;
    }
    
    // Convert to file:// URL for web audio
    return `file://${soundPath}`;
  }
}

module.exports = SoundManager;
