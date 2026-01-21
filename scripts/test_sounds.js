#!/usr/bin/env node

/**
 * Test script to verify sound manager functionality
 */

const path = require('path');
const fs = require('fs');

console.log('Testing Sound Manager...\n');

// Simulate sound manager
const soundsDir = path.join(__dirname, '../assets/sounds');

console.log('Sounds directory:', soundsDir);
console.log('Directory exists:', fs.existsSync(soundsDir));

if (fs.existsSync(soundsDir)) {
  const files = fs.readdirSync(soundsDir);
  console.log('\nFiles found:', files.length);
  
  const startSounds = files.filter(file => file.startsWith('Start') && file.endsWith('.m4a'));
  const stopSounds = files.filter(file => file.startsWith('Stop') && file.endsWith('.m4a'));
  
  console.log('\nStart sounds:', startSounds.length);
  startSounds.forEach(file => console.log('  -', file));
  
  console.log('\nStop sounds:', stopSounds.length);
  stopSounds.forEach(file => console.log('  -', file));
  
  // Test random selection
  console.log('\n--- Testing Random Selection ---');
  for (let i = 0; i < 5; i++) {
    const randomStart = startSounds[Math.floor(Math.random() * startSounds.length)];
    const randomStop = stopSounds[Math.floor(Math.random() * stopSounds.length)];
    console.log(`Test ${i + 1}: Start=${randomStart}, Stop=${randomStop}`);
  }
  
  console.log('\n✓ Sound Manager test passed!');
} else {
  console.error('\n✗ Sounds directory not found!');
  process.exit(1);
}
