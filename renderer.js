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

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadMasterItems();
  await initializeNewEstimate();
  setupEventListeners();
  setupDashboardListeners();
  setupCustomerListeners();
});

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
  const advancedPayment = parseFloat(document.getElementById('advanced-payment').value) || 0;
  const beforeRounding = subTotal - advancedPayment;

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
  row.innerHTML = `
    <td style="text-align: center;">${index + 1}</td>
    <td>
      <select class="item-select" onchange="selectItem(${index}, this.value)">
        <option value="">-- Select Item --</option>
        ${masterItems.map(item => `
          <option value="${item.id}">${item.name}</option>
        `).join('')}
      </select>
      <div class="item-description" id="item-desc-${index}"></div>
    </td>
    <td style="text-align: center;"><input type="number" step="0.01" value="" placeholder="0" onfocus="if(this.value==='0')this.value=''" onblur="if(this.value==='')this.value='0'" onchange="updateItemQuantity(${index}, this.value)" style="text-align: center;"></td>
    <td style="text-align: center;">
      <select onchange="updateItemUnit(${index}, this.value)">
        <option value="kg">kg</option>
        <option value="pcs">pcs</option>
        <option value="nos">nos</option>
        <option value="bundle">bundle</option>
        <option value="coil">coil</option>
        <option value="meter">meter</option>
      </select>
    </td>
    <td style="text-align: right;"><input type="number" step="0.01" value="0" onchange="updateItemRate(${index}, this.value)" style="text-align: right;"></td>
    <td style="text-align: right; font-weight: 600;" id="item-amount-${index}">₹0.00</td>
    <td style="text-align: center;">
      <button class="btn btn-danger btn-small" onclick="removeItemRow(${index})">Remove</button>
    </td>
  `;

  tbody.appendChild(row);
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

  // Update rate input
  const row = document.getElementById('items-tbody').children[index];
  row.querySelector('td:nth-child(5) input').value = item.rate;
  row.querySelector('td:nth-child(4) select').value = item.unit;

  updateItemAmount(index);
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
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="text-align: center;">${index + 1}</td>
      <td>
        <select class="item-select" onchange="selectItem(${index}, this.value)">
          <option value="">-- Select Item --</option>
          ${masterItems.map(mItem => `
            <option value="${mItem.id}" ${mItem.name === item.item_name ? 'selected' : ''}>${mItem.name}</option>
          `).join('')}
        </select>
        <div class="item-description" id="item-desc-${index}">${(item.description || '') + hsnDisplay}</div>
      </td>
      <td style="text-align: center;"><input type="number" step="0.01" value="${item.quantity}" onchange="updateItemQuantity(${index}, this.value)" style="text-align: center;"></td>
      <td style="text-align: center;">
        <select onchange="updateItemUnit(${index}, this.value)">
          <option value="kg" ${item.unit === 'kg' ? 'selected' : ''}>kg</option>
          <option value="pcs" ${item.unit === 'pcs' ? 'selected' : ''}>pcs</option>
          <option value="nos" ${item.unit === 'nos' ? 'selected' : ''}>nos</option>
          <option value="bundle" ${item.unit === 'bundle' ? 'selected' : ''}>bundle</option>
          <option value="coil" ${item.unit === 'coil' ? 'selected' : ''}>coil</option>
          <option value="meter" ${item.unit === 'meter' ? 'selected' : ''}>meter</option>
        </select>
      </td>
      <td style="text-align: right;"><input type="number" step="0.01" value="${item.rate}" onchange="updateItemRate(${index}, this.value)" style="text-align: right;"></td>
      <td style="text-align: right; font-weight: 600;" id="item-amount-${index}">₹${item.amount.toFixed(2)}</td>
      <td style="text-align: center;">
        <button class="btn btn-danger btn-small" onclick="removeItemRow(${index})">Remove</button>
      </td>
    `;
    tbody.appendChild(row);
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
  const advancedPayment = parseFloat(document.getElementById('advanced-payment').value) || 0;
  const rounding = parseFloat(document.getElementById('rounding').value) || 0;

  const total = subTotal - advancedPayment + rounding;

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
  const advancedPayment = parseFloat(document.getElementById('advanced-payment').value) || 0;
  const rounding = parseFloat(document.getElementById('rounding').value) || 0;
  const total = subTotal - advancedPayment + rounding;

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
    await ipcRenderer.invoke('save-estimate', estimateData);
    alert('Estimate saved successfully!');
    initializeNewEstimate();
  } catch (error) {
    alert('Error saving estimate: ' + error.message);
  }
}

// Save and Print
async function saveAndPrint() {
  // First save
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
  const advancedPayment = parseFloat(document.getElementById('advanced-payment').value) || 0;
  const rounding = parseFloat(document.getElementById('rounding').value) || 0;
  const total = subTotal - advancedPayment + rounding;

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
    await ipcRenderer.invoke('save-estimate', estimateData);
    // Then print
    await printEstimate();
    initializeNewEstimate();
  } catch (error) {
    alert('Error: ' + error.message);
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
  const advancedPayment = parseFloat(document.getElementById('advanced-payment').value) || 0;
  const rounding = parseFloat(document.getElementById('rounding').value) || 0;
  const total = subTotal - advancedPayment + rounding;
  const totalKg = currentEstimateItems.reduce((sum, item) => {
    if (item.unit === 'kg') return sum + (parseFloat(item.quantity) || 0);
    return sum;
  }, 0);

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
        <td class="right">₹${item.rate.toFixed(2)}</td>
        <td class="right"><strong>₹${item.amount.toFixed(2)}</strong></td>
      </tr>
    `;
    }).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @page { size: A4; margin: 10mm; }
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; font-size: 11px; margin: 0; padding: 0; }

        /* Page Border Container - no padding to eliminate side spaces */
        .page-container { border: 1px solid #333; padding: 0; min-height: calc(297mm - 20mm); }

        /* Header */
        .document-header { text-align: center; margin: 0; padding: 15px; padding-bottom: 10px; border-bottom: 1px solid #333; }
        .document-header h1 { margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 2px; }

        /* Info Table */
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

        /* Footer Section - Full width table layout */
        .footer-table { width: 100%; border-collapse: collapse; margin-top: -1px; }
        .footer-table td { border: 1px solid #333; vertical-align: top; }
        .footer-left-cell { width: 55%; padding: 10px; }
        .footer-right-cell { width: 45%; padding: 0; }

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
            <th class="center" style="width: 6%;">#</th>
            <th class="left" style="width: 38%;">Item & Description</th>
            <th class="center" style="width: 10%;">Qty</th>
            <th class="center" style="width: 10%;">Unit</th>
            <th class="right" style="width: 16%;">Net Rate<br><span class="rate-note">(Incl. GST)</span></th>
            <th class="right" style="width: 20%;">Amount</th>
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
                <td class="value">₹${subTotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td class="label">Advance Payment / Previous Balance</td>
                <td class="value">${advancedPayment > 0 ? '-' : ''}₹${advancedPayment.toFixed(2)}</td>
              </tr>
              <tr>
                <td class="label">Rounding</td>
                <td class="value">₹${rounding.toFixed(2)}</td>
              </tr>
              <tr class="grand">
                <td class="label">TOTAL</td>
                <td class="value">₹${total.toFixed(2)}</td>
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
function generatePDFDocument() {
  const doc = new jsPDF();

  // Title
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.text('ESTIMATE', 105, 20, { align: 'center' });

  // Estimate Info
  doc.setFontSize(10);
  doc.setFont(undefined, 'normal');

  const estimateNumber = document.getElementById('estimate-number').value;
  const estimateDate = document.getElementById('estimate-date').value;
  const billToName = document.getElementById('bill-to-name').value;
  const billToAddress = document.getElementById('bill-to-address').value;

  doc.text(`Estimate No: ${estimateNumber}`, 14, 35);
  doc.text(`Date: ${new Date(estimateDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}`, 14, 42);

  // Bill To
  doc.setFont(undefined, 'bold');
  doc.text('Bill To:', 120, 35);
  doc.setFont(undefined, 'normal');
  doc.text(billToName, 120, 42);

  const addressLines = doc.splitTextToSize(billToAddress, 75);
  doc.text(addressLines, 120, 49);

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
        `₹${item.rate.toFixed(2)}`,
        `₹${item.amount.toFixed(2)}`
      ];
    });

  doc.autoTable({
    startY: 70,
    head: [['#', 'Item & Description', 'Qty', 'Unit', 'Net Rate\n(Incl. GST)', 'Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [102, 126, 234], fontSize: 10 },
    styles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 80 },
      2: { cellWidth: 20 },
      3: { cellWidth: 20 },
      4: { cellWidth: 25 },
      5: { cellWidth: 30, halign: 'right' }
    }
  });

  // Totals
  const finalY = doc.lastAutoTable.finalY + 10;
  const subTotal = currentEstimateItems.reduce((sum, item) => sum + item.amount, 0);
  const advancedPayment = parseFloat(document.getElementById('advanced-payment').value) || 0;
  const rounding = parseFloat(document.getElementById('rounding').value) || 0;
  const total = subTotal - advancedPayment + rounding;

  doc.text('Sub Total (Tax Inclusive):', 120, finalY);
  doc.text(`₹${subTotal.toFixed(2)}`, 185, finalY, { align: 'right' });

  if (advancedPayment > 0) {
    doc.text('Advance/Prev Balance:', 120, finalY + 6);
    doc.text(`-₹${advancedPayment.toFixed(2)}`, 185, finalY + 6, { align: 'right' });
  }

  if (rounding !== 0) {
    doc.text('Rounding:', 120, finalY + (advancedPayment > 0 ? 12 : 6));
    doc.text(`₹${rounding.toFixed(2)}`, 185, finalY + (advancedPayment > 0 ? 12 : 6), { align: 'right' });
  }

  const totalY = finalY + (advancedPayment > 0 ? 18 : rounding !== 0 ? 12 : 6);

  doc.setFont(undefined, 'bold');
  doc.setFontSize(12);
  doc.text('Total:', 120, totalY);
  doc.text(`₹${total.toFixed(2)}`, 185, totalY, { align: 'right' });

  // Total in Words
  doc.setFont(undefined, 'italic');
  doc.setFontSize(9);
  doc.text(`Total In Words: ${numberToWords(total)}`, 14, totalY + 8);

  // Signature
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.text('Authorized Signature', 14, totalY + 30);
  doc.line(14, totalY + 32, 60, totalY + 32);

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
