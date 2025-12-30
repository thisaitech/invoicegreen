// Automatic fix for Electron module loading issue with Node.js v24+
// This script patches the electron npm package to not interfere with internal Electron API

const fs = require('fs');
const path = require('path');

const electronIndexPath = path.join(__dirname, 'node_modules', 'electron', 'index.js');

if (fs.existsSync(electronIndexPath)) {
  console.log('Applying Electron compatibility fix...');

  const newContent = `// Patched for Node.js v24+ compatibility
const fs = require('fs');
const path = require('path');

// If running inside Electron (process.versions.electron exists),
// don't export the path - let the internal Electron API be used
if (process.versions && process.versions.electron) {
  // We're inside Electron - don't interfere, let require('electron')
  // resolve to the internal Electron API
  try {
    // Try to load from Electron's internal modules
    module.exports = process.mainModule.require('electron');
  } catch (e) {
    // Fallback: export nothing and let Electron's internal resolver handle it
    module.exports = {};
  }
} else {
  // We're in regular Node.js - export the electron executable path for CLI usage
  const pathFile = path.join(__dirname, 'path.txt');

  function getElectronPath() {
    let executablePath;
    if (fs.existsSync(pathFile)) {
      executablePath = fs.readFileSync(pathFile, 'utf-8');
    }
    if (process.env.ELECTRON_OVERRIDE_DIST_PATH) {
      return path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executablePath || 'electron');
    }
    if (executablePath) {
      return path.join(__dirname, 'dist', executablePath);
    } else {
      throw new Error('Electron failed to install correctly, please delete node_modules/electron and try installing again');
    }
  }

  module.exports = getElectronPath();
}
`;

  fs.writeFileSync(electronIndexPath, newContent, 'utf8');
  console.log('✓ Electron compatibility fix applied successfully!');
} else {
  console.log('Electron not yet installed, fix will be applied on next install');
}
