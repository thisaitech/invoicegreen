// Preload script that fixes the electron module resolution issue
// This script runs BEFORE main.js and patches the module system

const Module = require('module');
const path = require('path');

// Store the original _load function
const originalLoad = Module._load;

// List of electron submodules that should be handled by Electron's internal resolver
const electronModules = new Set(['electron', 'electron/main', 'electron/common']);

// Patch Module._load to skip the npm electron package
Module._load = function(request, parent, isMain) {
  if (electronModules.has(request)) {
    // Check if we're loading from our app code (not from node_modules electron package)
    const callerFile = parent && parent.filename;
    const isFromNodeModulesElectron = callerFile && callerFile.includes(path.join('node_modules', 'electron'));

    if (!isFromNodeModulesElectron) {
      // Delete the npm electron package from cache to force re-resolution
      const electronPkgPath = path.join(__dirname, 'node_modules', 'electron', 'index.js');
      if (require.cache[electronPkgPath]) {
        delete require.cache[electronPkgPath];
      }

      // Also delete any cached version of electron
      for (const key of Object.keys(require.cache)) {
        if (key.includes('node_modules') && key.includes('electron') && key.endsWith('index.js')) {
          delete require.cache[key];
        }
      }
    }
  }

  return originalLoad.call(this, request, parent, isMain);
};

// Now load the actual main.js
require('./main.js');
