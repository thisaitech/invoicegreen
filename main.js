/**
 * Estimate Generator - Main Process
 * Handles application lifecycle, window management, and IPC communication
 */

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const util = require('util');

const writeFile = util.promisify(fs.writeFile);

// ============================================================================
// DISABLE HARDWARE ACCELERATION - FIX FOR INPUT FREEZE ON WINDOWS
// ============================================================================
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

// ============================================================================
// APPLICATION STATE
// ============================================================================

let mainWindow;
let dataPath;
let data = {
  items: [],
  customers: [],
  estimates: [],
  nextItemId: 1,
  nextCustomerId: 1,
  nextEstimateId: 1
};

// ============================================================================
// DATABASE FUNCTIONS
// ============================================================================

function initDatabase() {
  dataPath = path.join(app.getPath('userData'), 'data.json');

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
      { id: 1, name: 'G.I. Chain Link Fence 12 SWG', description: '3.5" Mesh Size | 5\' Height | 10 Bundles', hsn_code: '7314', rate: 7350, unit: 'kg', available_qty: 0 },
      { id: 2, name: 'G.I. Chain Link Fence 10 SWG', description: '2" Mesh Size | 7\' Height | 1 Bundle', hsn_code: '7314', rate: 7350, unit: 'kg', available_qty: 0 },
      { id: 3, name: 'G.I. Barbed Wire 14 X 14 SWG', description: 'TATA Wiron | 1 Bundle', hsn_code: '7313', rate: 12800, unit: 'kg', available_qty: 0 },
      { id: 4, name: 'G.I. WIRE', description: '12 gauge', hsn_code: '7217', rate: 7100, unit: 'kg', available_qty: 0 },
      { id: 5, name: 'G.I. WIRE', description: 'Micon 16 gauge | 25 kg x 1 Coil', hsn_code: '7217', rate: 9400, unit: 'kg', available_qty: 0 }
    ],
    customers: [],
    estimates: [],
    nextItemId: 6,
    nextCustomerId: 1,
    nextEstimateId: 1
  };
  saveData();
}

async function saveData() {
  try {
    await writeFile(dataPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving data:', error);
  }
}

// ============================================================================
// WINDOW MANAGEMENT
// ============================================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#f0f2f5',
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
      offscreen: false,
      enableBlinkFeatures: '',
      disableBlinkFeatures: 'Auxclick'
    }
  });

  // Show window only after fully loaded to prevent rendering issues
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();
  });

  mainWindow.loadFile('index.html');
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

// ============================================================================
// IPC HANDLERS - ITEMS
// ============================================================================

ipcMain.handle('get-items', async () => {
  return data.items.sort((a, b) => a.name.localeCompare(b.name));
});

ipcMain.handle('add-item', async (event, item) => {
  const newItem = {
    id: data.nextItemId++,
    name: item.name,
    description: item.description || '',
    hsn_code: item.hsn_code || '',
    rate: parseFloat(item.rate),
    unit: item.unit,
    available_qty: parseFloat(item.available_qty) || 0
  };
  data.items.push(newItem);
  await saveData();
  return newItem;
});

ipcMain.handle('update-item', async (event, item) => {
  const index = data.items.findIndex(i => i.id === item.id);
  if (index !== -1) {
    data.items[index] = {
      id: item.id,
      name: item.name,
      description: item.description || '',
      hsn_code: item.hsn_code || '',
      rate: parseFloat(item.rate),
      unit: item.unit,
      available_qty: parseFloat(item.available_qty) || 0
    };
    await saveData();
  }
  return item;
});

ipcMain.handle('delete-item', async (event, id) => {
  data.items = data.items.filter(i => i.id !== id);
  await saveData();
  return { success: true };
});

// ============================================================================
// IPC HANDLERS - ESTIMATES
// ============================================================================

ipcMain.handle('get-estimates', async () => {
  return data.estimates.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100);
});

ipcMain.handle('get-estimate', async (event, id) => {
  return data.estimates.find(e => e.id === id) || null;
});

ipcMain.handle('save-estimate', async (event, estimateData) => {
  const newEstimate = {
    id: data.nextEstimateId++,
    estimate_number: estimateData.estimate_number,
    estimate_date: estimateData.estimate_date,
    place_of_supply: estimateData.place_of_supply || '',
    bill_to_name: estimateData.bill_to_name,
    bill_to_address: estimateData.bill_to_address || '',
    sub_total: parseFloat(estimateData.sub_total),
    advanced_payment: parseFloat(estimateData.advanced_payment) || 0,
    previous_balance: parseFloat(estimateData.previous_balance) || 0,
    advance_sign: estimateData.advance_sign || '-',
    rounding: parseFloat(estimateData.rounding) || 0,
    total: parseFloat(estimateData.total),
    total_in_words: estimateData.total_in_words,
    items: estimateData.items.map(item => ({
      item_name: item.item_name,
      description: item.description || '',
      hsn_code: item.hsn_code || '',
      quantity: parseFloat(item.quantity),
      unit: item.unit,
      rate: parseFloat(item.rate),
      amount: parseFloat(item.amount)
    })),
    created_at: new Date().toISOString()
  };

  // Update inventory
  estimateData.items.forEach(estItem => {
    const masterItem = data.items.find(i => i.name === estItem.item_name);
    if (masterItem && masterItem.available_qty !== undefined) {
      masterItem.available_qty = Math.max(0, (masterItem.available_qty || 0) - parseFloat(estItem.quantity));
    }
  });

  data.estimates.push(newEstimate);
  await saveData();
  return newEstimate;
});

ipcMain.handle('update-estimate', async (event, estimateData) => {
  const index = data.estimates.findIndex(e => e.id === estimateData.id);
  if (index === -1) {
    throw new Error('Estimate not found');
  }

  const oldEstimate = data.estimates[index];

  // Restore inventory from old estimate
  if (oldEstimate.items) {
    oldEstimate.items.forEach(oldItem => {
      const masterItem = data.items.find(i => i.name === oldItem.item_name);
      if (masterItem && masterItem.available_qty !== undefined) {
        masterItem.available_qty = (masterItem.available_qty || 0) + parseFloat(oldItem.quantity);
      }
    });
  }

  const updatedEstimate = {
    id: estimateData.id,
    estimate_number: estimateData.estimate_number,
    estimate_date: estimateData.estimate_date,
    place_of_supply: estimateData.place_of_supply || '',
    bill_to_name: estimateData.bill_to_name,
    bill_to_address: estimateData.bill_to_address || '',
    sub_total: parseFloat(estimateData.sub_total),
    advanced_payment: parseFloat(estimateData.advanced_payment) || 0,
    advance_sign: estimateData.advance_sign || '-',
    rounding: parseFloat(estimateData.rounding) || 0,
    total: parseFloat(estimateData.total),
    total_in_words: estimateData.total_in_words,
    items: estimateData.items.map(item => ({
      item_name: item.item_name,
      description: item.description || '',
      hsn_code: item.hsn_code || '',
      quantity: parseFloat(item.quantity),
      unit: item.unit,
      rate: parseFloat(item.rate),
      amount: parseFloat(item.amount)
    })),
    created_at: oldEstimate.created_at,
    updated_at: new Date().toISOString()
  };

  // Reduce inventory for new items
  estimateData.items.forEach(estItem => {
    const masterItem = data.items.find(i => i.name === estItem.item_name);
    if (masterItem && masterItem.available_qty !== undefined) {
      masterItem.available_qty = Math.max(0, (masterItem.available_qty || 0) - parseFloat(estItem.quantity));
    }
  });

  data.estimates[index] = updatedEstimate;
  await saveData();
  return updatedEstimate;
});

ipcMain.handle('delete-estimate', async (event, id) => {
  data.estimates = data.estimates.filter(e => e.id !== id);
  await saveData();
  return { success: true };
});

ipcMain.handle('delete-all-estimates', async () => {
  data.estimates = [];
  data.nextEstimateId = 1;
  await saveData();
  return { success: true };
});

// ============================================================================
// IPC HANDLERS - ESTIMATE NUMBER
// ============================================================================

// Helper function to get max estimate number from existing estimates
function getMaxEstimateNumber() {
  let maxNum = 0;
  if (data.estimates && data.estimates.length > 0) {
    data.estimates.forEach(est => {
      if (est.estimate_number) {
        const match = est.estimate_number.match(/(\d+)$/);
        if (match) {
          const num = parseInt(match[1]);
          if (num > maxNum) maxNum = num;
        }
      }
    });
  }
  return maxNum;
}

ipcMain.handle('get-next-estimate-number', async () => {
  const maxNum = getMaxEstimateNumber();
  const nextNum = maxNum + 1;
  return `EST-${String(nextNum).padStart(3, '0')}`;
});

ipcMain.handle('increment-estimate-number', async () => {
  // This is called AFTER save-estimate, so the new estimate is already in the list
  // The next call to get-next-estimate-number will automatically return the correct number
  // We don't need to do anything special here
  return true;
});

// ============================================================================
// IPC HANDLERS - CUSTOMERS
// ============================================================================

ipcMain.handle('get-customers', async () => {
  return data.customers || [];
});

ipcMain.handle('add-customer', async (event, customer) => {
  if (!data.customers) data.customers = [];
  if (!data.nextCustomerId) data.nextCustomerId = 1;

  const newCustomer = {
    id: data.nextCustomerId++,
    name: customer.name,
    address: customer.address || '',
    city: customer.city || '',
    state: customer.state || 'Tamil Nadu',
    country: customer.country || 'India',
    phone: customer.phone || '',
    email: customer.email || '',
    vehicle: customer.vehicle || '',
    gstn: customer.gstn || '',
    opening_balance: parseFloat(customer.opening_balance) || 0
  };

  data.customers.push(newCustomer);
  await saveData();
  return newCustomer;
});

ipcMain.handle('update-customer', async (event, customer) => {
  const index = data.customers.findIndex(c => c.id === customer.id);
  if (index !== -1) {
    data.customers[index] = {
      id: customer.id,
      name: customer.name,
      address: customer.address || '',
      city: customer.city || '',
      state: customer.state || 'Tamil Nadu',
      country: customer.country || 'India',
      phone: customer.phone || '',
      email: customer.email || '',
      vehicle: customer.vehicle || '',
      gstn: customer.gstn || '',
      opening_balance: parseFloat(customer.opening_balance) || 0
    };
    await saveData();
  }
  return customer;
});

ipcMain.handle('delete-customer', async (event, id) => {
  data.customers = data.customers.filter(c => c.id !== id);
  await saveData();
  return { success: true };
});

// ============================================================================
// IPC HANDLERS - PRINTING & PDF
// ============================================================================

ipcMain.handle('get-printers', async () => {
  return [{ name: 'System Default', isDefault: true }];
});

ipcMain.handle('print-estimate', (event, htmlContent, printerName) => {
  return new Promise((resolve, reject) => {
    const printWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

    printWindow.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        const options = {
          silent: false,
          printBackground: true,
          pageSize: 'A4',
          margins: { marginType: 'default' }
        };

        printWindow.webContents.print(options, (success, errorType) => {
          printWindow.close();
          if (success) {
            resolve({ success: true });
          } else {
            // Handle cancelled/canceled (both spellings) or any cancel-related error
            const isCancelled = !errorType ||
              errorType.toLowerCase().includes('cancel') ||
              errorType.toLowerCase().includes('cancelled');
            resolve({ success: false, cancelled: isCancelled, error: errorType });
          }
        });
      }, 500);
    });

    printWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      printWindow.close();
      reject(new Error(`Failed to load print content: ${errorDescription}`));
    });
  });
});

ipcMain.handle('save-pdf', async (event, pdfData, defaultName) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save PDF',
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
  });

  if (filePath) {
    const buffer = Buffer.from(pdfData, 'base64');
    await writeFile(filePath, buffer);
    return { success: true, path: filePath };
  }

  return { success: false, cancelled: true };
});

// ============================================================================
// IPC HANDLERS - EMAIL
// ============================================================================

ipcMain.handle('send-email', async (event, emailData) => {
  const tempPdfPath = path.join(app.getPath('temp'), emailData.fileName);
  const buffer = Buffer.from(emailData.pdfData, 'base64');
  await writeFile(tempPdfPath, buffer);

  const mailtoLink = `mailto:${emailData.to}?subject=${encodeURIComponent(emailData.subject)}&body=${encodeURIComponent(emailData.message + '\n\n[PDF saved to: ' + tempPdfPath + ']')}`;
  await shell.openExternal(mailtoLink);

  return {
    success: true,
    message: 'Email client opened. PDF saved to: ' + tempPdfPath,
    pdfPath: tempPdfPath
  };
});
