// Simple test to check if Electron can load
try {
  const electron = require('electron');
  console.log('Type of electron:', typeof electron);
  console.log('Electron value:', electron);
  console.log('Has app?:', !!electron.app);

  if (electron.app) {
    console.log('SUCCESS: Electron loaded correctly!');
    electron.app.quit();
  } else {
    console.log('FAIL: electron.app is not available');
  }
} catch (error) {
  console.error('ERROR loading electron:', error.message);
}
