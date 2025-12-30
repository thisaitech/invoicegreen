// Electron loader - fixes module resolution for Node.js v24+
const Module = require('module');
const path = require('path');

// Patch the require system BEFORE loading main.js
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function(request, parent, isMain, options) {
  // When app code requires 'electron', bypass the npm package
  if (request === 'electron' && process.versions.electron) {
    // Check if this is from app code (not from node_modules)
    if (parent && parent.filename && !parent.filename.includes('node_modules')) {
      // Force resolution to Electron's internal module
      // by pretending the npm package doesn't exist
      const electronPkgPath = path.join(__dirname, 'node_modules', 'electron');
      const originalPaths = Module._pathCache;

      // Temporarily hide the electron npm package
      try {
        // Clear path cache
        Module._pathCache = Object.create(null);

        // Try resolving without the npm package
        const resolved = originalResolveFilename.call(this, request, {
          ...parent,
          paths: parent.paths.filter(p => !p.includes(path.join('node_modules', 'electron')))
        }, isMain, options);

        return resolved;
      } catch (e) {
        // If that fails, let it proceed normally
      } finally {
        Module._pathCache = originalPaths;
      }
    }
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

// Now load the actual main.js
require('./main.js');
