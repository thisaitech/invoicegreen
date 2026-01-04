// Get electron modules
const { ipcRenderer } = require('electron');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');

// Debug logging
console.log('Renderer loaded, ipcRenderer:', typeof ipcRenderer);

// State
let masterItems = [];
let currentEstimateItems = [];
let currentView = 'new-estimate';
let editingEstimateId = null; // Track if we're editing an existing estimate

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadMasterItems();
  await initializeNewEstimate();
  setupEventListeners();
  setupDashboardListeners();
  setupCustomerListeners();
  setupItemsTableDelegation();
  setupWindowFocusFix();
});

// SIMPLE POLLING APPROACH - No complex event listeners that can freeze
// This checks input values every 100ms and updates accordingly
let inputPollingInterval = null;

function setupWindowFocusFix() {
  // Start polling when app loads
  startInputPolling();

  // Restart polling on focus
  window.addEventListener('focus', () => {
    startInputPolling();
  });

  // Restart polling on visibility change
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      startInputPolling();
    }
  });
}

function startInputPolling() {
  // Clear existing interval
  if (inputPollingInterval) {
    clearInterval(inputPollingInterval);
  }

  // Poll every 100ms to check for input changes
  inputPollingInterval = setInterval(() => {
    syncInputsToData();
  }, 100);
}

// Sync all input values to currentEstimateItems
// Only syncs if user is actively typing (input is focused)
function syncInputsToData() {
  const tbody = document.getElementById('items-tbody');
  if (!tbody) return;

  const rows = tbody.querySelectorAll('tr');
  rows.forEach((row, index) => {
    if (!currentEstimateItems[index]) return;

    const itemNameInput = row.querySelector('.item-name-input');
    const itemDescInput = row.querySelector('.item-desc-input');
    const qtyInput = row.querySelector('.qty-input');
    const rateInput = row.querySelector('.rate-input');
    const unitSelect = row.querySelector('.unit-select');

    // Sync item name if focused
    if (itemNameInput && document.activeElement === itemNameInput) {
      const newName = itemNameInput.value || '';
      if (currentEstimateItems[index].item_name !== newName) {
        currentEstimateItems[index].item_name = newName;
      }
    }

    // Sync item description if focused (strip HSN suffix for data storage)
    if (itemDescInput && document.activeElement === itemDescInput) {
      const descValue = itemDescInput.value || '';
      const descWithoutHsn = descValue.replace(/\s*\|\s*HSN:\s*\d+\s*$/, '');
      if (currentEstimateItems[index].description !== descWithoutHsn) {
        currentEstimateItems[index].description = descWithoutHsn;
      }
    }

    // Only sync qty if it's focused (user is typing) OR value changed from what we expect
    if (qtyInput) {
      const inputValue = qtyInput.value;
      const newQty = parseFloat(inputValue) || 0;
      const currentQty = currentEstimateItems[index].quantity;

      // If input is focused, sync input -> data
      // If input is not focused and values differ, sync data -> input (for programmatic updates)
      if (document.activeElement === qtyInput) {
        if (currentQty !== newQty) {
          currentEstimateItems[index].quantity = newQty;
          updateItemAmountDisplay(index);
        }
      }
    }

    if (rateInput) {
      const inputValue = rateInput.value;
      const newRate = parseFloat(inputValue) || 0;
      const currentRate = currentEstimateItems[index].rate;

      // If input is focused, sync input -> data
      if (document.activeElement === rateInput) {
        if (currentRate !== newRate) {
          currentEstimateItems[index].rate = newRate;
          updateItemAmountDisplay(index);
        }
      }
    }

    if (unitSelect) {
      currentEstimateItems[index].unit = unitSelect.value;
    }
  });
}

// Update just the amount display without touching inputs
function updateItemAmountDisplay(index) {
  const item = currentEstimateItems[index];
  if (!item) return;

  item.amount = item.quantity * item.rate;
  const amountEl = document.getElementById(`item-amount-${index}`);
  if (amountEl) {
    amountEl.textContent = `₹${item.amount.toFixed(2)}`;
  }
  updateTotals();
}

// Simple event delegation - for text inputs, selects and buttons
function setupItemsTableDelegation() {
  const tbody = document.getElementById('items-tbody');
  if (!tbody) {
    console.error('items-tbody not found!');
    return;
  }

  // Handle input events for item name (to detect datalist selection)
  tbody.addEventListener('input', (e) => {
    const target = e.target;
    const index = parseInt(target.dataset.index);

    if (target.classList.contains('item-name-input')) {
      const itemName = target.value;
      // Check if this matches a master item (user selected from dropdown)
      const masterItem = masterItems.find(i => i.name === itemName);
      if (masterItem) {
        handleItemNameSelection(index, itemName);
      } else {
        // User is typing custom item name
        currentEstimateItems[index].item_name = itemName;
      }
    }

    if (target.classList.contains('item-desc-input')) {
      // User is editing description
      updateItemDescription(index, target.value);
    }
  });

  // Handle change events (fires when user leaves input or selects from datalist)
  tbody.addEventListener('change', (e) => {
    const target = e.target;
    const index = parseInt(target.dataset.index);

    if (target.classList.contains('item-name-input')) {
      const itemName = target.value;
      // Check if this matches a master item
      const masterItem = masterItems.find(i => i.name === itemName);
      if (masterItem) {
        handleItemNameSelection(index, itemName);
      }
    }
  });

  // Handle click events (for remove buttons)
  tbody.addEventListener('click', (e) => {
    const target = e.target;
    if (target.classList.contains('remove-btn')) {
      const index = parseInt(target.dataset.index);
      removeItemRow(index);
    }
  });
}

// Event Listeners
function setupEventListeners() {
  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const view = e.currentTarget.dataset.view;
      switchView(view);
    });
  });

  // New Estimate
  document.getElementById('add-item-row-btn').addEventListener('click', addItemRow);
  document.getElementById('save-estimate-btn').addEventListener('click', saveEstimate);
  document.getElementById('save-and-print-btn').addEventListener('click', saveAndPrint);
  document.getElementById('preview-estimate-btn').addEventListener('click', showPrintPreview);
  document.getElementById('email-pdf-btn').addEventListener('click', showEmailModal);
  document.getElementById('download-pdf-btn').addEventListener('click', downloadPDF);

  // Print from preview
  const printFromPreviewBtn = document.getElementById('print-from-preview-btn');
  if (printFromPreviewBtn) {
    printFromPreviewBtn.addEventListener('click', printFromPreview);
  }

  // Send email
  const sendEmailBtn = document.getElementById('send-email-btn');
  if (sendEmailBtn) {
    sendEmailBtn.addEventListener('click', sendEmail);
  }

  // Auto-rounding button
  const autoRoundBtn = document.getElementById('auto-round-btn');
  if (autoRoundBtn) {
    autoRoundBtn.addEventListener('click', autoCalculateRounding);
  }

  // Items Management
  document.getElementById('add-new-item-btn').addEventListener('click', () => openItemModal());
  document.getElementById('save-item-btn').addEventListener('click', saveItem);

  // Modal
  document.querySelectorAll('.close').forEach(el => {
    el.addEventListener('click', closeItemModal);
  });

  // Date default
  document.getElementById('estimate-date').valueAsDate = new Date();
}

// Auto-calculate rounding
function autoCalculateRounding() {
  const subTotal = currentEstimateItems.reduce((sum, item) => sum + item.amount, 0);
  // User enters negative to subtract, positive to add
  const advancedPayment = parseFloat(document.getElementById('advanced-payment').value) || 0;
  const beforeRounding = subTotal + advancedPayment;

  // Round to nearest whole number
  const rounded = Math.round(beforeRounding);
  const roundingAmount = rounded - beforeRounding;

  document.getElementById('rounding').value = roundingAmount.toFixed(2);
  updateTotals();
}

// View Switching
function switchView(view) {
  currentView = view;

  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.view === view) {
      btn.classList.add('active');
    }
  });

  // Update views
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(`${view}-view`).classList.add('active');

  // Load data for view
  if (view === 'dashboard') {
    loadDashboard();
  } else if (view === 'estimates') {
    loadEstimates();
  } else if (view === 'customers') {
    loadCustomers();
  } else if (view === 'items') {
    loadItemsTable();
  } else if (view === 'new-estimate') {
    initializeNewEstimate();
  }
}

// Master Items
async function loadMasterItems() {
  masterItems = await ipcRenderer.invoke('get-items');
}

async function loadItemsTable() {
  await loadMasterItems();
  const tbody = document.getElementById('items-master-tbody');

  if (masterItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><h3>No items yet</h3><p>Click "Add New Item" to get started</p></td></tr>';
    return;
  }

  tbody.innerHTML = masterItems.map(item => `
    <tr>
      <td style="text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name}</td>
      <td style="text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.description || ''}">${item.description || '-'}</td>
      <td style="text-align: right;">₹${parseFloat(item.rate).toFixed(2)}</td>
      <td style="text-align: center;">${item.unit}</td>
      <td style="text-align: right; color: ${(item.available_qty || 0) <= 0 ? '#e53e3e' : '#48bb78'}; font-weight: 600;">${parseFloat(item.available_qty || 0).toFixed(2)}</td>
      <td style="text-align: center;">
        <button class="btn btn-edit btn-small" onclick="editItem(${item.id})">Edit</button>
        <button class="btn btn-danger btn-small" onclick="deleteItem(${item.id})">Delete</button>
      </td>
    </tr>
  `).join('');
}

function openItemModal(item = null) {
  const modal = document.getElementById('item-modal');
  const title = document.getElementById('modal-title');

  if (item) {
    title.textContent = 'Edit Item';
    document.getElementById('modal-item-id').value = item.id;
    document.getElementById('modal-item-name').value = item.name;
    document.getElementById('modal-item-description').value = item.description || '';
    document.getElementById('modal-item-hsn').value = item.hsn_code || '';
    document.getElementById('modal-item-rate').value = item.rate;
    document.getElementById('modal-item-unit').value = item.unit;
    document.getElementById('modal-item-available-qty').value = item.available_qty || '';
  } else {
    title.textContent = 'Add New Item';
    document.getElementById('modal-item-id').value = '';
    document.getElementById('modal-item-name').value = '';
    document.getElementById('modal-item-description').value = '';
    document.getElementById('modal-item-hsn').value = '';
    document.getElementById('modal-item-rate').value = '';
    document.getElementById('modal-item-unit').value = 'kg';
    document.getElementById('modal-item-available-qty').value = '';
  }

  modal.classList.add('active');
}

function closeItemModal() {
  document.getElementById('item-modal').classList.remove('active');
}

async function saveItem() {
  const id = document.getElementById('modal-item-id').value;
  const item = {
    name: document.getElementById('modal-item-name').value,
    description: document.getElementById('modal-item-description').value,
    hsn_code: document.getElementById('modal-item-hsn').value || '',
    rate: parseFloat(document.getElementById('modal-item-rate').value),
    unit: document.getElementById('modal-item-unit').value,
    available_qty: parseFloat(document.getElementById('modal-item-available-qty').value) || 0
  };

  if (!item.name || !item.rate) {
    alert('Please fill in all required fields');
    return;
  }

  if (id) {
    item.id = parseInt(id);
    await ipcRenderer.invoke('update-item', item);
  } else {
    await ipcRenderer.invoke('add-item', item);
  }

  closeItemModal();
  await loadMasterItems();
  loadItemsTable();
}

async function editItem(id) {
  const item = masterItems.find(i => i.id === id);
  if (item) {
    openItemModal(item);
  }
}

async function deleteItem(id) {
  if (confirm('Are you sure you want to delete this item?')) {
    await ipcRenderer.invoke('delete-item', id);
    await loadMasterItems();
    loadItemsTable();
  }
}

// Get current date in IST (Indian Standard Time) as YYYY-MM-DD string
function getISTDateString() {
  const now = new Date();
  // IST is UTC+5:30
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + istOffset);
  return istDate.toISOString().split('T')[0];
}

// New Estimate
async function initializeNewEstimate() {
  // Reset editing mode
  editingEstimateId = null;

  const estimateNumber = await ipcRenderer.invoke('get-next-estimate-number');
  document.getElementById('estimate-number').value = estimateNumber;
  document.getElementById('estimate-date').value = getISTDateString();
  document.getElementById('bill-to-name').value = '';
  document.getElementById('bill-to-address').value = '';

  // Clear customer search
  const customerSearch = document.getElementById('customer-search');
  if (customerSearch) {
    customerSearch.value = '';
  }

  // Clear advanced payment and rounding
  const advancedPayment = document.getElementById('advanced-payment');
  const rounding = document.getElementById('rounding');
  if (advancedPayment) advancedPayment.value = '';
  if (rounding) rounding.value = '';

  // Load customer dropdown
  await loadCustomerDropdown();

  currentEstimateItems = [];
  document.getElementById('items-tbody').innerHTML = '';

  // Add first row
  addItemRow();
  updateTotals();
}

// Load customers into dropdown (datalist)
async function loadCustomerDropdown() {
  const customers = await ipcRenderer.invoke('get-customers');
  const datalist = document.getElementById('customer-list');

  if (!datalist) {
    console.warn('Customer datalist not found');
    return;
  }

  datalist.innerHTML = '';

  customers.forEach(customer => {
    const option = document.createElement('option');
    option.value = customer.name;
    option.dataset.customerId = customer.id;
    datalist.appendChild(option);
  });

  // Setup customer search input handler
  const searchInput = document.getElementById('customer-search');
  if (searchInput && !searchInput.dataset.listenerAdded) {
    searchInput.addEventListener('change', async (e) => {
      const selectedName = e.target.value;
      const customers = await ipcRenderer.invoke('get-customers');
      const customer = customers.find(c => c.name === selectedName);

      if (customer) {
        const fullAddress = [
          customer.address,
          customer.city,
          customer.state,
          customer.country
        ].filter(Boolean).join(', ');

        document.getElementById('bill-to-name').value = customer.name;
        document.getElementById('bill-to-address').value = fullAddress;
      }
    });
    searchInput.dataset.listenerAdded = 'true';
  }
}

// Select customer from dropdown
async function selectCustomer(customerId) {
  if (!customerId) {
    document.getElementById('bill-to-name').value = '';
    document.getElementById('bill-to-address').value = '';
    return;
  }

  const customers = await ipcRenderer.invoke('get-customers');
  const customer = customers.find(c => c.id == customerId);

  if (customer) {
    const fullAddress = `${customer.address}${customer.city ? '\n' + customer.city : ''}${customer.state ? ', ' + customer.state : ''}${customer.country ? '\n' + customer.country : ''}`;

    document.getElementById('bill-to-name').value = customer.name;
    document.getElementById('bill-to-address').value = fullAddress.trim();
  }
}

function addItemRow() {
  const tbody = document.getElementById('items-tbody');
  const index = currentEstimateItems.length;

  currentEstimateItems.push({
    item_name: '',
    description: '',
    hsn_code: '',
    quantity: 0,
    unit: 'kg',
    rate: 0,
    amount: 0
  });

  const row = document.createElement('tr');
  row.id = `item-row-${index}`;
  row.innerHTML = `
    <td style="text-align: center;">${index + 1}</td>
    <td>
      <input type="text" class="item-name-input" data-index="${index}" id="item-name-${index}"
             list="item-list-${index}" placeholder="Type item name..." autocomplete="off">
      <datalist id="item-list-${index}">
        ${masterItems.map(item => `<option value="${item.name}">${item.name}</option>`).join('')}
      </datalist>
      <input type="text" class="item-desc-input" data-index="${index}" id="item-desc-${index}"
             placeholder="Description (auto-filled or type here)">
    </td>
    <td style="text-align: center;"><input type="text" class="qty-input" data-index="${index}" value="" placeholder="0" style="text-align: center; width: 80px;"></td>
    <td style="text-align: center;">
      <select class="unit-select" data-index="${index}">
        <option value="kg">kg</option>
        <option value="pcs">pcs</option>
        <option value="nos">nos</option>
        <option value="bundle">bundle</option>
        <option value="coil">coil</option>
        <option value="meter">meter</option>
      </select>
    </td>
    <td style="text-align: right;"><input type="text" class="rate-input" data-index="${index}" value="0" style="text-align: right; width: 100px;"></td>
    <td style="text-align: right; font-weight: 600;" id="item-amount-${index}">₹0.00</td>
    <td style="text-align: center;">
      <button class="btn btn-danger btn-small remove-btn" data-index="${index}">Remove</button>
    </td>
  `;

  tbody.appendChild(row);
  // Polling will handle qty/rate updates - no event listeners needed on inputs
}

function selectItem(index, itemId) {
  if (!itemId) return;

  const item = masterItems.find(i => i.id == itemId);
  if (!item) return;

  currentEstimateItems[index].item_name = item.name;
  currentEstimateItems[index].description = item.description;
  currentEstimateItems[index].hsn_code = item.hsn_code || '';
  currentEstimateItems[index].rate = item.rate;
  currentEstimateItems[index].unit = item.unit;

  // Update description display (include HSN code if available)
  const hsnDisplay = item.hsn_code ? ` | HSN: ${item.hsn_code}` : '';
  document.getElementById(`item-desc-${index}`).textContent = (item.description || '') + hsnDisplay;

  // Update rate input and unit select
  const row = document.getElementById('items-tbody').children[index];
  const rateInput = row.querySelector('.rate-input');
  const unitSelect = row.querySelector('.unit-select');
  const qtyInput = row.querySelector('.qty-input');

  rateInput.value = item.rate;
  unitSelect.value = item.unit;

  updateItemAmount(index);

  // Focus on qty input after selecting item so user can enter quantity
  setTimeout(() => {
    qtyInput.focus();
    qtyInput.select();
  }, 50);
}

function updateItemQuantity(index, value) {
  currentEstimateItems[index].quantity = parseFloat(value) || 0;
  updateItemAmount(index);
}

function updateItemUnit(index, value) {
  currentEstimateItems[index].unit = value;
}

function updateItemRate(index, value) {
  currentEstimateItems[index].rate = parseFloat(value) || 0;
  updateItemAmount(index);
}

function updateItemAmount(index) {
  const item = currentEstimateItems[index];
  item.amount = item.quantity * item.rate;
  document.getElementById(`item-amount-${index}`).textContent = `₹${item.amount.toFixed(2)}`;
  updateTotals();
}

function updateItemName(index, value) {
  currentEstimateItems[index].item_name = value;
}

function updateItemDescription(index, value) {
  // Strip HSN code from description if user edits it
  currentEstimateItems[index].description = value.replace(/\s*\|\s*HSN:\s*\d+\s*$/, '');
}

function handleItemNameSelection(index, itemName) {
  // Find matching master item
  const item = masterItems.find(i => i.name === itemName);
  if (!item) return;

  // Auto-fill the item details from master
  currentEstimateItems[index].item_name = item.name;
  currentEstimateItems[index].description = item.description;
  currentEstimateItems[index].hsn_code = item.hsn_code || '';
  currentEstimateItems[index].rate = item.rate;
  currentEstimateItems[index].unit = item.unit;

  // Update description input with HSN
  const hsnDisplay = item.hsn_code ? ` | HSN: ${item.hsn_code}` : '';
  const descInput = document.getElementById(`item-desc-${index}`);
  if (descInput) {
    descInput.value = (item.description || '') + hsnDisplay;
  }

  // Update rate input and unit select
  const row = document.getElementById('items-tbody').children[index];
  if (row) {
    const rateInput = row.querySelector('.rate-input');
    const unitSelect = row.querySelector('.unit-select');
    const qtyInput = row.querySelector('.qty-input');

    if (rateInput) rateInput.value = item.rate;
    if (unitSelect) unitSelect.value = item.unit;

    updateItemAmount(index);

    // Focus on qty input after selecting item
    if (qtyInput) {
      setTimeout(() => {
        qtyInput.focus();
        qtyInput.select();
      }, 50);
    }
  }
}

function removeItemRow(index) {
  currentEstimateItems.splice(index, 1);
  renderItemsTable();
  updateTotals();
}

function renderItemsTable() {
  const tbody = document.getElementById('items-tbody');
  tbody.innerHTML = '';

  currentEstimateItems.forEach((item, index) => {
    const hsnDisplay = item.hsn_code ? ` | HSN: ${item.hsn_code}` : '';
    const descWithHsn = (item.description || '') + hsnDisplay;
    const row = document.createElement('tr');
    row.id = `item-row-${index}`;
    row.innerHTML = `
      <td style="text-align: center;">${index + 1}</td>
      <td>
        <input type="text" class="item-name-input" data-index="${index}" id="item-name-${index}"
               list="item-list-${index}" placeholder="Type item name..." autocomplete="off" value="${item.item_name || ''}">
        <datalist id="item-list-${index}">
          ${masterItems.map(mItem => `<option value="${mItem.name}">${mItem.name}</option>`).join('')}
        </datalist>
        <input type="text" class="item-desc-input" data-index="${index}" id="item-desc-${index}"
               placeholder="Description (auto-filled or type here)" value="${descWithHsn}">
      </td>
      <td style="text-align: center;"><input type="text" class="qty-input" data-index="${index}" value="${item.quantity}" style="text-align: center; width: 80px;"></td>
      <td style="text-align: center;">
        <select class="unit-select" data-index="${index}">
          <option value="kg" ${item.unit === 'kg' ? 'selected' : ''}>kg</option>
          <option value="pcs" ${item.unit === 'pcs' ? 'selected' : ''}>pcs</option>
          <option value="nos" ${item.unit === 'nos' ? 'selected' : ''}>nos</option>
          <option value="bundle" ${item.unit === 'bundle' ? 'selected' : ''}>bundle</option>
          <option value="coil" ${item.unit === 'coil' ? 'selected' : ''}>coil</option>
          <option value="meter" ${item.unit === 'meter' ? 'selected' : ''}>meter</option>
        </select>
      </td>
      <td style="text-align: right;"><input type="text" class="rate-input" data-index="${index}" value="${item.rate}" style="text-align: right; width: 100px;"></td>
      <td style="text-align: right; font-weight: 600;" id="item-amount-${index}">₹${item.amount.toFixed(2)}</td>
      <td style="text-align: center;">
        <button class="btn btn-danger btn-small remove-btn" data-index="${index}">Remove</button>
      </td>
    `;
    tbody.appendChild(row);
    // Polling handles qty/rate updates - no event listeners needed
  });
}

function updateTotals() {
  const subTotal = currentEstimateItems.reduce((sum, item) => sum + item.amount, 0);

  // Calculate total kg (sum of quantities where unit is 'kg')
  const totalKg = currentEstimateItems.reduce((sum, item) => {
    if (item.unit === 'kg') {
      return sum + (parseFloat(item.quantity) || 0);
    }
    return sum;
  }, 0);

  // Get advanced payment and rounding
  // User enters negative (-10000) to subtract, positive (10000) to add
  const advancedPayment = parseFloat(document.getElementById('advanced-payment').value) || 0;
  const rounding = parseFloat(document.getElementById('rounding').value) || 0;

  // advancedPayment sign is respected: negative subtracts, positive adds
  const total = subTotal + advancedPayment + rounding;

  document.getElementById('sub-total').textContent = `₹${subTotal.toFixed(2)}`;
  document.getElementById('grand-total').textContent = `₹${total.toFixed(2)}`;
  document.getElementById('total-kg').textContent = `${totalKg.toFixed(2)} kg`;
  document.getElementById('total-words').textContent = `Total In Words: ${numberToWords(total)}`;
}

// Add event listeners for advanced payment and rounding
document.addEventListener('DOMContentLoaded', () => {
  const advPayment = document.getElementById('advanced-payment');
  const roundingInput = document.getElementById('rounding');

  if (advPayment) {
    advPayment.addEventListener('input', updateTotals);
  }
  if (roundingInput) {
    roundingInput.addEventListener('input', updateTotals);
  }
});

// Save Estimate
async function saveEstimate() {
  const estimateNumber = document.getElementById('estimate-number').value;
  const estimateDate = document.getElementById('estimate-date').value;
  const billToName = document.getElementById('bill-to-name').value;
  const billToAddress = document.getElementById('bill-to-address').value;

  if (!billToName) {
    alert('Please enter Bill To name');
    return;
  }

  if (currentEstimateItems.length === 0 || currentEstimateItems.every(i => i.quantity === 0)) {
    alert('Please add at least one item');
    return;
  }

  const subTotal = currentEstimateItems.reduce((sum, item) => sum + item.amount, 0);
  // User enters negative to subtract, positive to add
  const advancedPayment = parseFloat(document.getElementById('advanced-payment').value) || 0;
  const rounding = parseFloat(document.getElementById('rounding').value) || 0;
  const total = subTotal + advancedPayment + rounding;

  const estimateData = {
    estimate_number: estimateNumber,
    estimate_date: estimateDate,
    place_of_supply: '',
    bill_to_name: billToName,
    bill_to_address: billToAddress,
    sub_total: subTotal,
    advanced_payment: advancedPayment,
    rounding: rounding,
    total: total,
    total_in_words: numberToWords(total),
    items: currentEstimateItems.filter(i => i.quantity > 0)
  };

  try {
    if (editingEstimateId) {
      // Update existing estimate
      estimateData.id = editingEstimateId;
      await ipcRenderer.invoke('update-estimate', estimateData);
      alert('Estimate updated successfully!');
    } else {
      // Create new estimate
      await ipcRenderer.invoke('save-estimate', estimateData);
      // Increment estimate number only for new estimates
      await ipcRenderer.invoke('increment-estimate-number');
      alert('Estimate saved successfully!');
    }
    editingEstimateId = null; // Reset editing state
    initializeNewEstimate();
  } catch (error) {
    alert('Error saving estimate: ' + error.message);
  }
}

// Flag to prevent duplicate saves
let isSavingAndPrinting = false;

// Save and Print
async function saveAndPrint() {
  // Prevent duplicate clicks
  if (isSavingAndPrinting) {
    return;
  }

  const saveBtn = document.getElementById('save-and-print-btn');

  // Validate first before disabling button
  const billToName = document.getElementById('bill-to-name').value;
  if (!billToName) {
    alert('Please enter Bill To name');
    return;
  }

  if (currentEstimateItems.length === 0 || currentEstimateItems.every(i => i.quantity === 0)) {
    alert('Please add at least one item');
    return;
  }

  // Set flag and disable button immediately
  isSavingAndPrinting = true;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }

  const estimateNumber = document.getElementById('estimate-number').value;
  const estimateDate = document.getElementById('estimate-date').value;
  const billToAddress = document.getElementById('bill-to-address').value;

  const subTotal = currentEstimateItems.reduce((sum, item) => sum + item.amount, 0);
  // User enters negative to subtract, positive to add
  const advancedPayment = parseFloat(document.getElementById('advanced-payment').value) || 0;
  const rounding = parseFloat(document.getElementById('rounding').value) || 0;
  const total = subTotal + advancedPayment + rounding;

  const estimateData = {
    estimate_number: estimateNumber,
    estimate_date: estimateDate,
    place_of_supply: '',
    bill_to_name: billToName,
    bill_to_address: billToAddress,
    sub_total: subTotal,
    advanced_payment: advancedPayment,
    rounding: rounding,
    total: total,
    total_in_words: numberToWords(total),
    items: currentEstimateItems.filter(i => i.quantity > 0)
  };

  try {
    // Save and print in parallel for speed
    const savePromise = ipcRenderer.invoke('save-estimate', estimateData);
    const printPromise = printEstimate();

    await savePromise;
    await ipcRenderer.invoke('increment-estimate-number');
    await printPromise;

    initializeNewEstimate();
  } catch (error) {
    alert('Error: ' + error.message);
  } finally {
    // Re-enable button
    isSavingAndPrinting = false;
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Save & Print';
    }
  }
}

// Print Estimate
async function printEstimate() {
  const printers = await ipcRenderer.invoke('get-printers');

  if (printers.length === 0) {
    alert('No printers found');
    return;
  }

  // Find Zebra printer or use default
  let selectedPrinter = printers.find(p => p.name.toLowerCase().includes('zebra'));
  if (!selectedPrinter) {
    selectedPrinter = printers[0];
  }

  const htmlContent = generatePrintHTML();

  try {
    await ipcRenderer.invoke('print-estimate', htmlContent, selectedPrinter.name);
    alert('Sent to printer successfully!');
  } catch (error) {
    alert('Print error: ' + error);
  }
}

// Format address for print - each component on separate line
function formatAddressForPrint(addressString) {
  if (!addressString) return '';

  // Split by comma or newline
  const parts = addressString.split(/[,\n]+/).map(p => p.trim()).filter(p => p);

  // Try to identify and organize parts
  const formattedParts = [];
  let street = '';
  let city = '';
  let pincode = '';
  let state = '';
  let country = '';

  parts.forEach(part => {
    // Check if it's a pincode (6 digits)
    if (/^\d{6}$/.test(part)) {
      pincode = part;
    }
    // Check if it contains pincode
    else if (/\d{6}/.test(part)) {
      const match = part.match(/(\d{6})/);
      if (match) {
        pincode = match[1];
        // Remove pincode from the part
        const remaining = part.replace(/\d{6}/, '').trim().replace(/^[,\s]+|[,\s]+$/g, '');
        if (remaining) {
          if (!city) city = remaining;
          else street += (street ? ', ' : '') + remaining;
        }
      }
    }
    // Known states
    else if (/tamil\s*nadu|karnataka|kerala|andhra|telangana|maharashtra|gujarat/i.test(part)) {
      state = part;
    }
    // Known countries
    else if (/india|usa|uk|united/i.test(part)) {
      country = part;
    }
    // Likely city if short and no street yet assigned
    else if (part.length < 25 && !city && street) {
      city = part;
    }
    // Otherwise it's street/address
    else {
      if (!street) street = part;
      else if (!city) city = part;
      else street += ', ' + part;
    }
  });

  // Build formatted address - each on new line
  const lines = [];
  if (street) lines.push(street);
  if (city && pincode) lines.push(`${city} - ${pincode}`);
  else if (city) lines.push(city);
  else if (pincode) lines.push(pincode);
  if (state) lines.push(state);
  if (country) lines.push(country);

  return lines.join('<br>');
}

function generatePrintHTML() {
  const estimateNumber = document.getElementById('estimate-number').value;
  const estimateDate = document.getElementById('estimate-date').value;
  const billToName = document.getElementById('bill-to-name').value;
  const billToAddress = document.getElementById('bill-to-address').value;
  const formattedAddress = formatAddressForPrint(billToAddress);
  const subTotal = currentEstimateItems.reduce((sum, item) => sum + item.amount, 0);
  // User enters negative to subtract, positive to add
  const advancedPayment = parseFloat(document.getElementById('advanced-payment').value) || 0;
  const rounding = parseFloat(document.getElementById('rounding').value) || 0;
  const total = subTotal + advancedPayment + rounding;
  const totalKg = currentEstimateItems.reduce((sum, item) => {
    if (item.unit === 'kg') return sum + (parseFloat(item.quantity) || 0);
    return sum;
  }, 0);

  // Helper to format number (no currency symbol)
  const formatNumber = (num) => {
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Helper to format total with Rupee symbol
  const formatTotal = (num) => {
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const itemsHTML = currentEstimateItems
    .filter(i => i.quantity > 0)
    .map((item, index) => {
      const hsnDisplay = item.hsn_code ? ` | HSN: ${item.hsn_code}` : '';
      return `
      <tr>
        <td class="center">${index + 1}</td>
        <td class="left">
          <strong>${item.item_name}</strong><br>
          <span class="desc">${(item.description || '') + hsnDisplay}</span>
        </td>
        <td class="center">${item.quantity}</td>
        <td class="center">${item.unit}</td>
        <td class="right">${formatNumber(item.rate)}</td>
        <td class="right"><strong>${formatNumber(item.amount)}</strong></td>
      </tr>
    `;
    }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        @page { size: A4; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 0; }

        /* Page Border Container - no padding to eliminate side spaces */
        .page-container { border: 1px solid #333; padding: 0; min-height: calc(297mm - 20mm); }

        /* Header */
        .document-header { text-align: center; margin: 0; padding: 15px; padding-bottom: 10px; border-bottom: 1px solid #333; }
        .document-header h1 { margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 2px; }

        /* Info Table - 50/50 split to align with items table and footer */
        .info-table { width: 100%; margin-bottom: 0; border-collapse: collapse; }
        .info-table td { padding: 8px 15px; vertical-align: top; border: 1px solid #333; border-top: none; }
        .info-table .label { font-weight: bold; width: 120px; background: #f5f5f5; }
        .info-table .value { }
        .info-left { width: 50%; }
        .info-right { width: 50%; }

        /* Items Table */
        .items-table { width: 100%; border-collapse: collapse; margin-top: -1px; }
        .items-table th {
          background: #e8e8e8;
          padding: 10px 8px;
          border: 1px solid #333;
          font-weight: bold;
          font-size: 11px;
        }
        .items-table th.center { text-align: center; }
        .items-table th.left { text-align: left; }
        .items-table th.right { text-align: right; }
        .items-table td {
          padding: 8px;
          border: 1px solid #333;
          font-size: 10px;
          vertical-align: top;
        }
        .items-table td.center { text-align: center; }
        .items-table td.left { text-align: left; }
        .items-table td.right { text-align: right; }
        .items-table .desc { font-size: 9px; color: #555; font-style: italic; }
        .items-table .rate-note { font-size: 8px; color: #666; font-weight: normal; }

        /* Footer Section - Full width table layout (50/50 split to align with Unit column) */
        .footer-table { width: 100%; border-collapse: collapse; margin-top: -1px; }
        .footer-table td { border: 1px solid #333; vertical-align: top; }
        .footer-left-cell { width: 50%; padding: 10px; }
        .footer-right-cell { width: 50%; padding: 0; }

        /* Totals Table */
        .totals-table { width: 100%; border-collapse: collapse; }
        .totals-table td { padding: 6px 10px; border: none; border-bottom: 1px solid #ddd; font-size: 11px; }
        .totals-table tr:last-child td { border-bottom: none; }
        .totals-table .label { text-align: left; background: #f9f9f9; }
        .totals-table .value { text-align: right; font-weight: bold; width: 120px; }
        .totals-table .grand td { background: #e8e8e8; font-size: 13px; font-weight: bold; border-top: 1px solid #333; }

        /* Other elements */
        .items-summary { font-size: 11px; margin-bottom: 8px; }
        .words-section { font-size: 10px; font-style: italic; color: #333; margin: 0; padding: 8px; background: #f9f9f9; }
        .signature-box { border-top: 1px solid #333; padding: 10px; text-align: center; }
        .signature-space { height: 40px; }
        .signature-label { font-size: 10px; border-top: 1px solid #333; padding-top: 5px; }

      </style>
    </head>
    <body>
      <div class="page-container">
      <div class="document-header">
        <h1>ESTIMATE</h1>
      </div>

      <table class="info-table">
        <tr>
          <td class="info-left" colspan="2">
            <table style="width: 100%; border: none;">
              <tr><td style="border: none; padding: 2px;"><strong>Estimate No:</strong></td><td style="border: none; padding: 2px;">${estimateNumber}</td></tr>
              <tr><td style="border: none; padding: 2px;"><strong>Estimate Date:</strong></td><td style="border: none; padding: 2px;">${new Date(estimateDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td></tr>
            </table>
          </td>
          <td class="info-right" colspan="2" style="padding: 0;">
            <div style="background: #f5f5f5; padding: 6px 10px; border-bottom: 1px solid #333; font-weight: bold;">Recipient / Bill To</div>
            <div style="padding: 8px 10px;">
              <strong>${billToName}</strong><br>
              ${formattedAddress}
            </div>
          </td>
        </tr>
      </table>

      <table class="items-table">
        <thead>
          <tr>
            <th class="center" style="width: 5%;">#</th>
            <th class="left" style="width: 35%;">Item & Description</th>
            <th class="center" style="width: 10%;">Qty</th>
            <th class="center" style="width: 8%;">Unit</th>
            <th class="right" style="width: 18%;">Net Rate<br><span class="rate-note">(Incl. GST)</span></th>
            <th class="right" style="width: 24%;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>

      <table class="footer-table">
        <tr>
          <td class="footer-left-cell">
            <div class="items-summary"><strong>Total Quantity:</strong> ${totalKg.toFixed(2)} kg</div>
            <div class="words-section"><strong>Amount in Words:</strong> ${numberToWords(total)}</div>
          </td>
          <td class="footer-right-cell">
            <table class="totals-table">
              <tr>
                <td class="label">Sub Total <span style="font-size: 9px; color: #666;">(Tax Inclusive)</span></td>
                <td class="value">${formatNumber(subTotal)}</td>
              </tr>
              <tr>
                <td class="label">Advance / Prev Balance</td>
                <td class="value">${advancedPayment > 0 ? '- ' : ''}${formatNumber(advancedPayment)}</td>
              </tr>
              <tr>
                <td class="label">Rounding</td>
                <td class="value">${formatNumber(rounding)}</td>
              </tr>
              <tr class="grand">
                <td class="label">TOTAL</td>
                <td class="value">${formatTotal(total)}</td>
              </tr>
            </table>
            <div class="signature-box">
              <div class="signature-space"></div>
              <div class="signature-label">Authorized Signature</div>
            </div>
          </td>
        </tr>
      </table>
      </div>
    </body>
    </html>
  `;
}

// Download PDF
async function downloadPDF() {
  const billToName = document.getElementById('bill-to-name').value;

  if (!billToName) {
    alert('Please enter Bill To name first');
    return;
  }

  if (currentEstimateItems.length === 0 || currentEstimateItems.every(i => i.quantity === 0)) {
    alert('Please add at least one item with quantity');
    return;
  }

  try {
    const doc = generatePDFDocument();
    const estimateNumber = document.getElementById('estimate-number').value;
    const pdfData = doc.output('datauristring').split(',')[1];
    const defaultName = `Estimate_${estimateNumber}_${new Date().toISOString().split('T')[0]}.pdf`;

    const result = await ipcRenderer.invoke('save-pdf', pdfData, defaultName);

    if (result.success) {
      alert(`PDF saved successfully to:\n${result.path}`);
    } else if (result.cancelled) {
      // User cancelled, do nothing
    } else {
      alert('Failed to save PDF. Please try again.');
    }
  } catch (error) {
    console.error('PDF Error:', error);
    alert('Error generating PDF: ' + error.message);
  }
}

// Load Estimates
async function loadEstimates() {
  const estimates = await ipcRenderer.invoke('get-estimates');
  const tbody = document.getElementById('estimates-tbody');

  if (estimates.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><h3>No estimates yet</h3><p>Create your first estimate</p></td></tr>';
    return;
  }

  tbody.innerHTML = estimates.map(est => `
    <tr>
      <td>${est.estimate_number}</td>
      <td>${new Date(est.estimate_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
      <td>${est.bill_to_name}</td>
      <td>₹${parseFloat(est.total).toFixed(2)}</td>
      <td>
        <button class="btn btn-edit btn-small" onclick="viewEstimate(${est.id})">View</button>
      </td>
    </tr>
  `).join('');
}

async function viewEstimate(id) {
  const estimate = await ipcRenderer.invoke('get-estimate', id);
  // For now, just show an alert. You can implement a view modal if needed
  alert(`Estimate: ${estimate.estimate_number}\nTotal: ₹${estimate.total}`);
}

// Utility: Number to Words
function numberToWords(num) {
  // Handle negative numbers
  if (num < 0) num = Math.abs(num);

  // Round to whole number to avoid decimal issues
  num = Math.round(num);

  if (num === 0) return 'Zero Rupees Only';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  function convertLessThanThousand(n) {
    n = Math.floor(n);
    if (n === 0) return '';

    let result = '';

    if (n >= 100) {
      result += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }

    if (n >= 20) {
      result += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    } else if (n >= 10) {
      result += teens[n - 10] + ' ';
      return result;
    }

    if (n > 0) {
      result += ones[n] + ' ';
    }

    return result;
  }

  const crores = Math.floor(num / 10000000);
  num %= 10000000;

  const lakhs = Math.floor(num / 100000);
  num %= 100000;

  const thousands = Math.floor(num / 1000);
  num %= 1000;

  let result = '';

  if (crores > 0) {
    result += convertLessThanThousand(crores) + 'Crore ';
  }

  if (lakhs > 0) {
    result += convertLessThanThousand(lakhs) + 'Lakh ';
  }

  if (thousands > 0) {
    result += convertLessThanThousand(thousands) + 'Thousand ';
  }

  if (num > 0) {
    result += convertLessThanThousand(Math.floor(num));
  }

  return result.trim() + ' Rupees Only';
}

// Print Preview
function showPrintPreview() {
  const htmlContent = generatePrintHTML();
  const modal = document.getElementById('print-preview-modal');
  const iframe = document.getElementById('preview-frame');

  iframe.srcdoc = htmlContent;
  modal.classList.add('active');
}

async function printFromPreview() {
  const printers = await ipcRenderer.invoke('get-printers');

  if (printers.length === 0) {
    alert('No printers found');
    return;
  }

  let selectedPrinter = printers.find(p => p.name.toLowerCase().includes('zebra'));
  if (!selectedPrinter) {
    selectedPrinter = printers[0];
  }

  const iframe = document.getElementById('preview-frame');
  const htmlContent = iframe.srcdoc;

  try {
    await ipcRenderer.invoke('print-estimate', htmlContent, selectedPrinter.name);
    alert('Sent to printer successfully!');
    document.getElementById('print-preview-modal').classList.remove('active');
  } catch (error) {
    alert('Print error: ' + error);
  }
}

// Email PDF
function showEmailModal() {
  const billToName = document.getElementById('bill-to-name').value;

  if (!billToName) {
    alert('Please enter Bill To name first');
    return;
  }

  const modal = document.getElementById('email-modal');
  const estimateNumber = document.getElementById('estimate-number').value;
  const emailInput = document.getElementById('email-to');

  // Clear and prepare email input
  emailInput.value = '';
  emailInput.removeAttribute('readonly');
  emailInput.removeAttribute('disabled');

  document.getElementById('email-subject').value = `Estimate ${estimateNumber} - ${billToName}`;
  document.getElementById('email-message').value = `Dear ${billToName},\n\nPlease find attached estimate ${estimateNumber} for your review.\n\nThank you for your business.`;

  modal.classList.add('active');

  // Focus on email input after modal is visible
  setTimeout(() => emailInput.focus(), 100);
}

async function sendEmail() {
  const toEmail = document.getElementById('email-to').value;
  const subject = document.getElementById('email-subject').value;
  const message = document.getElementById('email-message').value;

  if (!toEmail) {
    alert('Please enter recipient email address');
    return;
  }

  // Generate PDF
  const doc = generatePDFDocument();
  const pdfData = doc.output('datauristring').split(',')[1];

  const estimateNumber = document.getElementById('estimate-number').value;
  const fileName = `Estimate_${estimateNumber}.pdf`;

  try {
    await ipcRenderer.invoke('send-email', {
      to: toEmail,
      subject: subject,
      message: message,
      pdfData: pdfData,
      fileName: fileName
    });

    alert('Email sent successfully!');
    document.getElementById('email-modal').classList.remove('active');
  } catch (error) {
    alert('Email error: ' + error.message);
  }
}

// Helper to generate PDF document object
// Format address for PDF (returns array of lines)
function formatAddressForPDF(addressString) {
  if (!addressString) return [];

  const parts = addressString.split(/[,\n]+/).map(p => p.trim()).filter(p => p);

  let street = '', city = '', pincode = '', state = '', country = '';

  const knownStates = ['Tamil Nadu', 'Tamilnadu', 'Karnataka', 'Kerala', 'Andhra Pradesh', 'Telangana', 'Maharashtra', 'Gujarat', 'Rajasthan', 'Delhi', 'Punjab', 'Haryana', 'Uttar Pradesh', 'Madhya Pradesh', 'West Bengal', 'Bihar', 'Odisha', 'Assam', 'Jharkhand', 'Chhattisgarh', 'Goa'];
  const knownCountries = ['India', 'INDIA', 'USA', 'UK', 'UAE', 'Singapore', 'Australia'];

  parts.forEach(part => {
    if (/^\d{6}$/.test(part)) {
      pincode = part;
    }
    else if (knownStates.some(s => part.toLowerCase() === s.toLowerCase())) {
      state = part;
    }
    else if (knownCountries.some(c => part.toLowerCase() === c.toLowerCase())) {
      country = part;
    }
    else if (part.length < 25 && !city && street) {
      city = part;
    }
    else {
      if (!street) street = part;
      else if (!city) city = part;
      else street += ', ' + part;
    }
  });

  const lines = [];
  if (street) lines.push(street);
  if (city && pincode) lines.push(`${city} - ${pincode}`);
  else if (city) lines.push(city);
  else if (pincode) lines.push(pincode);
  if (state) lines.push(state);
  if (country) lines.push(country);

  return lines;
}

function generatePDFDocument() {
  const doc = new jsPDF();

  // Helper to format number (no currency symbol)
  const fmtNumber = (num) => {
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Helper to format total with Rupee symbol
  const fmtTotal = (num) => {
    return 'Rs. ' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Page border
  doc.setDrawColor(51, 51, 51);
  doc.setLineWidth(0.3);
  doc.rect(10, 10, 190, 277);

  // Title
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.text('ESTIMATE', 105, 22, { align: 'center' });

  // Line under title
  doc.setLineWidth(0.3);
  doc.line(10, 26, 200, 26);

  // Get form data
  const estimateNumber = document.getElementById('estimate-number').value;
  const estimateDate = document.getElementById('estimate-date').value;
  const billToName = document.getElementById('bill-to-name').value;
  const billToAddress = document.getElementById('bill-to-address').value;

  // Left side - Estimate info
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('Estimate No:', 14, 35);
  doc.setFont(undefined, 'normal');
  doc.text(estimateNumber, 50, 35);

  doc.setFont(undefined, 'bold');
  doc.text('Estimate Date:', 14, 43);
  doc.setFont(undefined, 'normal');
  doc.text(new Date(estimateDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }), 50, 43);

  // Right side - Recipient / Bill To header
  doc.setFillColor(245, 245, 245);
  doc.rect(105, 28, 95, 8, 'F');
  doc.setDrawColor(51, 51, 51);
  doc.rect(105, 28, 95, 8, 'S');
  doc.setFont(undefined, 'bold');
  doc.text('Recipient / Bill To', 109, 34);

  // Address box - increased height to fit all lines
  doc.rect(105, 36, 95, 30, 'S');
  doc.setFont(undefined, 'bold');
  doc.setFontSize(10);
  doc.text(billToName, 109, 43);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);

  const addressLines = formatAddressForPDF(billToAddress);
  let addrY = 49;
  addressLines.forEach(line => {
    doc.text(line, 109, addrY);
    addrY += 5;
  });

  // Items Table
  const tableData = currentEstimateItems
    .filter(i => i.quantity > 0)
    .map((item, index) => {
      const hsnDisplay = item.hsn_code ? ` | HSN: ${item.hsn_code}` : '';
      return [
        index + 1,
        `${item.item_name}\n${(item.description || '') + hsnDisplay}`,
        item.quantity,
        item.unit,
        fmtNumber(item.rate),
        fmtNumber(item.amount)
      ];
    });

  // Column widths aligned with footer divider at x=105
  // Left side (before divider): 10 + 67 + 18 = 95mm
  // Right side (after divider): 15 + 35 + 45 = 95mm
  doc.autoTable({
    startY: 68,
    head: [['#', 'Item & Description', 'Qty', 'Unit', 'Net Rate\n(Incl. GST)', 'Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [232, 232, 232], textColor: [0, 0, 0], fontSize: 10, fontStyle: 'bold' },
    styles: { fontSize: 9, lineColor: [51, 51, 51], lineWidth: 0.2 },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 67 },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 15, halign: 'center' },
      4: { cellWidth: 35, halign: 'right' },
      5: { cellWidth: 45, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: 10, right: 10 }
  });

  // Calculate totals
  const finalY = doc.lastAutoTable.finalY;
  const subTotal = currentEstimateItems.reduce((sum, item) => sum + item.amount, 0);
  // User enters negative to subtract, positive to add
  const advancedPayment = parseFloat(document.getElementById('advanced-payment').value) || 0;
  const rounding = parseFloat(document.getElementById('rounding').value) || 0;
  const total = subTotal + advancedPayment + rounding;
  const totalKg = currentEstimateItems.reduce((sum, item) => {
    if (item.unit === 'kg') return sum + (parseFloat(item.quantity) || 0);
    return sum;
  }, 0);

  // Footer section - with straight borders (2 columns only)
  const footerY = finalY;
  const leftW = 95;
  const rightW = 95;

  // Draw footer manually for perfect alignment
  doc.setDrawColor(51, 51, 51);
  doc.setLineWidth(0.2);

  // Left column - Total Quantity row
  doc.rect(10, footerY, leftW, 10);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(10);
  doc.text('Total Quantity: ' + totalKg.toFixed(2) + ' kg', 14, footerY + 7);

  // Left column - Amount in Words (spans remaining rows)
  doc.setFillColor(249, 249, 249);
  doc.rect(10, footerY + 10, leftW, 50, 'FD');
  doc.setFont(undefined, 'bold');
  doc.setFontSize(9);
  doc.text('Amount in Words:', 14, footerY + 18);
  doc.setFont(undefined, 'normal');
  const wordsLines = doc.splitTextToSize(numberToWords(total), leftW - 10);
  doc.text(wordsLines, 14, footerY + 26);

  // Right column - Sub Total
  doc.setFillColor(249, 249, 249);
  doc.rect(10 + leftW, footerY, rightW, 10, 'FD');
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.text('Sub Total (Tax Inclusive)', 10 + leftW + 4, footerY + 7);
  doc.setFont(undefined, 'bold');
  doc.text(fmtNumber(subTotal), 10 + leftW + rightW - 4, footerY + 7, { align: 'right' });

  // Right column - Advance
  doc.setFillColor(255, 255, 255);
  doc.rect(10 + leftW, footerY + 10, rightW, 10, 'FD');
  doc.setFont(undefined, 'normal');
  doc.text('Advance / Prev Balance', 10 + leftW + 4, footerY + 17);
  doc.setFont(undefined, 'bold');
  doc.text((advancedPayment > 0 ? '- ' : '') + fmtNumber(advancedPayment), 10 + leftW + rightW - 4, footerY + 17, { align: 'right' });

  // Right column - Rounding
  doc.setFillColor(255, 255, 255);
  doc.rect(10 + leftW, footerY + 20, rightW, 10, 'FD');
  doc.setFont(undefined, 'normal');
  doc.text('Rounding', 10 + leftW + 4, footerY + 27);
  doc.setFont(undefined, 'bold');
  doc.text(fmtNumber(rounding), 10 + leftW + rightW - 4, footerY + 27, { align: 'right' });

  // Right column - TOTAL
  doc.setFillColor(232, 232, 232);
  doc.rect(10 + leftW, footerY + 30, rightW, 10, 'FD');
  doc.setFont(undefined, 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL', 10 + leftW + 4, footerY + 37);
  doc.text(fmtTotal(total), 10 + leftW + rightW - 4, footerY + 37, { align: 'right' });

  // Right column - Signature
  doc.setFillColor(255, 255, 255);
  doc.rect(10 + leftW, footerY + 40, rightW, 20, 'FD');
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.line(10 + leftW + 20, footerY + 52, 10 + leftW + rightW - 20, footerY + 52);
  doc.text('Authorized Signature', 10 + leftW + (rightW / 2), footerY + 57, { align: 'center' });

  return doc;
}

// Make functions globally accessible
window.selectItem = selectItem;
window.selectCustomer = selectCustomer;
window.updateItemQuantity = updateItemQuantity;
window.updateItemUnit = updateItemUnit;
window.updateItemRate = updateItemRate;
window.removeItemRow = removeItemRow;
window.editItem = editItem;
window.deleteItem = deleteItem;
window.viewEstimate = viewEstimate;
