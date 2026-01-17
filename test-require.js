// Test different ways to load Electron
console.log('=== Testing Electron loading ===');
console.log('process.versions.electron:', process.versions.electron);
console.log('');

console.log('1. require("electron"):');
try {
  const e1 = require('electron');
  console.log('  Type:', typeof e1);
  console.log('  Value:', String(e1).substring(0, 100));
  console.log('  Has .app?:', !!e1.app);
} catch (err) {
  console.log('  Error:', err.message);
}

console.log('');
console.log('2. process.electronBinding:');
try {
  console.log('  Available?:', typeof process.electronBinding);
  if (process.electronBinding) {
    const e2 = process.electronBinding('electron_browser_app');
    console.log('  Got:', e2);
  }
} catch (err) {
  console.log('  Error:', err.message);
}

console.log('');
console.log('3. Check module.paths:');
console.log(require.resolve.paths('electron'));

if (process.versions.electron) {
  setTimeout(() => {
    console.log('Exiting...');
    process.exit(0);
  }, 2000);
}
