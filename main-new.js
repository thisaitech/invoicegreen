// When running inside Electron, the electron module is available via process.electronBinding
// or via the global electron variable
let app, BrowserWindow, ipcMain, dialog;

if (process.versions.electron) {
  // Running inside Electron - use the internal electron module
  // The 'electron' require will be shimmed by Electron itself
  const electron = require('electron');
  app = electron.app;
  BrowserWindow = electron.BrowserWindow;
  ipcMain = electron.ipcMain;
  dialog = electron.dialog;
} else {
  console.error('This script must be run inside Electron!');
  process.exit(1);
}

const path = require('path');
const fs = require('fs');

console.log('Electron version:', process.versions.electron);
console.log('App object:', !!app);

let mainWindow;
let dataPath;
let data = {
  items: [],
  estimates: [],
  nextEstimateId: 1,
  nextItemId: 1
};

// Initialize data storage
function initDatabase() {
  dataPath = path.join(app.getPath('userData'), 'data.json');

  // Load existing data or create default
  if (fs.existsSync(dataPath)) {
    try {
      const fileData = fs.readFileSync(dataPath, 'utf8');
      data = JSON.parse(fileData);
    } catch (error) {
      console.error('Error loading data:', error);
      initializeDefaultData();
    }
  } else {
    initializeDefaultData();
  }
}

function initializeDefaultData() {
  data = {
    items: [
      { id: 1, name: 'G.I. Chain Link Fence 12 SWG', description: '3.5" Mesh Size | 5\' Height | 10 Bundles', rate: 7350, unit: 'kg' },
      { id: 2, name: 'G.I. Chain Link Fence 10 SWG', description: '2" Mesh Size | 7\' Height | 1 Bundle', rate: 7350, unit: 'kg' },
      { id: 3, name: 'G.I. Barbed Wire 14 X 14 SWG', description: 'TATA Wiron | 1 Bundle', rate: 12800, unit: 'kg' },
      { id: 4, name: 'G.I. WIRE', description: '12 gauge', rate: 7100, unit: 'kg' },
      { id: 5, name: 'G.I. WIRE', description: 'Micon 16 gauge | 25 kg x 1 Coil', rate: 9400, unit: 'kg' }
    ],
    estimates: [],
    nextEstimateId: 1,
    nextItemId: 6
  };
  saveData();
}

function saveData() {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.maximize();

  // Open DevTools in development
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  initDatabase();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// Get all items
ipcMain.handle('get-items', () => {
  return data.items.sort((a, b) => a.name.localeCompare(b.name));
});

// Add new item
ipcMain.handle('add-item', (event, item) => {
  const newItem = {
    id: data.nextItemId++,
    name: item.name,
    description: item.description || '',
    rate: parseFloat(item.rate),
    unit: item.unit
  };
  data.items.push(newItem);
  saveData();
  return newItem;
});

// Update item
ipcMain.handle('update-item', (event, item) => {
  const index = data.items.findIndex(i => i.id === item.id);
  if (index !== -1) {
    data.items[index] = {
      id: item.id,
      name: item.name,
      description: item.description || '',
      rate: parseFloat(item.rate),
      unit: item.unit
    };
    saveData();
  }
  return item;
});

// Delete item
ipcMain.handle('delete-item', (event, id) => {
  data.items = data.items.filter(i => i.id !== id);
  saveData();
  return { success: true };
});

// Get all estimates
ipcMain.handle('get-estimates', () => {
  return data.estimates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100);
});

// Get estimate by ID with items
ipcMain.handle('get-estimate', (event, id) => {
  return data.estimates.find(e => e.id === id) || null;
});

// Save estimate
ipcMain.handle('save-estimate', (event, estimateData) => {
  const newEstimate = {
    id: data.nextEstimateId++,
    estimate_number: estimateData.estimate_number,
    estimate_date: estimateData.estimate_date,
    place_of_supply: estimateData.place_of_supply || '',
    bill_to_name: estimateData.bill_to_name,
    bill_to_address: estimateData.bill_to_address || '',
    sub_total: parseFloat(estimateData.sub_total),
    total: parseFloat(estimateData.total),
    total_in_words: estimateData.total_in_words,
    items: estimateData.items.map(item => ({
      item_name: item.item_name,
      description: item.description || '',
      quantity: parseFloat(item.quantity),
      unit: item.unit,
      rate: parseFloat(item.rate),
      amount: parseFloat(item.amount)
    })),
    created_at: new Date().toISOString()
  };

  data.estimates.push(newEstimate);
  saveData();
  return newEstimate;
});

// Get next estimate number
ipcMain.handle('get-next-estimate-number', () => {
  if (data.estimates.length === 0) {
    return 'EST-000001';
  }

  const lastEstimate = data.estimates[data.estimates.length - 1];
  const match = lastEstimate.estimate_number.match(/(\d+)$/);

  if (match) {
    const nextNum = parseInt(match[1]) + 1;
    return `EST-${String(nextNum).padStart(6, '0')}`;
  }

  return 'EST-000001';
});

// Get printers
ipcMain.handle('get-printers', () => {
  return mainWindow.webContents.getPrinters();
});

// Print estimate
ipcMain.handle('print-estimate', (event, htmlContent, printerName) => {
  return new Promise((resolve, reject) => {
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    printWindow.webContents.on('did-finish-load', () => {
      const options = {
        silent: true,
        deviceName: printerName,
        pageSize: 'A4',
        margins: {
          marginType: 'custom',
          top: 0.5,
          bottom: 0.5,
          left: 0.5,
          right: 0.5
        }
      };

      printWindow.webContents.print(options, (success, errorType) => {
        if (!success) {
          reject(errorType);
        } else {
          resolve({ success: true });
        }
        printWindow.close();
      });
    });
  });
});

// Save PDF
ipcMain.handle('save-pdf', async (event, pdfData, defaultName) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save PDF',
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });

  if (filePath) {
    const buffer = Buffer.from(pdfData, 'base64');
    fs.writeFileSync(filePath, buffer);
    return { success: true, path: filePath };
  }

  return { success: false };
});
