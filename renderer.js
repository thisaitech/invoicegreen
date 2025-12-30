const { ipcRenderer } = require('electron');
const jsPDF = require('jspdf');
require('jspdf-autotable');

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
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><h3>No items yet</h3><p>Click "Add New Item" to get started</p></td></tr>';
    return;
  }

  tbody.innerHTML = masterItems.map(item => `
    <tr>
      <td>${item.name}</td>
      <td>${item.description || '-'}</td>
      <td>₹${parseFloat(item.rate).toFixed(2)}</td>
      <td>${item.unit}</td>
      <td>
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
  } else {
    title.textContent = 'Add New Item';
    document.getElementById('modal-item-id').value = '';
    document.getElementById('modal-item-name').value = '';
    document.getElementById('modal-item-description').value = '';
    document.getElementById('modal-item-hsn').value = '';
    document.getElementById('modal-item-rate').value = '';
    document.getElementById('modal-item-unit').value = 'kg';
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
    unit: document.getElementById('modal-item-unit').value
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

// New Estimate
async function initializeNewEstimate() {
  const estimateNumber = await ipcRenderer.invoke('get-next-estimate-number');
  document.getElementById('estimate-number').value = estimateNumber;
  document.getElementById('estimate-date').valueAsDate = new Date();
  document.getElementById('bill-to-name').value = '';
  document.getElementById('bill-to-address').value = '';

  currentEstimateItems = [];
  document.getElementById('items-tbody').innerHTML = '';

  // Add first row
  addItemRow();
  updateTotals();
}

function addItemRow() {
  const tbody = document.getElementById('items-tbody');
  const index = currentEstimateItems.length;

  currentEstimateItems.push({
    item_name: '',
    description: '',
    quantity: 0,
    unit: 'kg',
    rate: 0,
    amount: 0
  });

  const row = document.createElement('tr');
  row.innerHTML = `
    <td>${index + 1}</td>
    <td>
      <select class="item-select" onchange="selectItem(${index}, this.value)">
        <option value="">-- Select Item --</option>
        ${masterItems.map(item => `
          <option value="${item.id}">${item.name}</option>
        `).join('')}
      </select>
      <div class="item-description" id="item-desc-${index}"></div>
    </td>
    <td><input type="number" step="0.01" value="0" onchange="updateItemQuantity(${index}, this.value)"></td>
    <td>
      <select onchange="updateItemUnit(${index}, this.value)">
        <option value="kg">kg</option>
        <option value="pcs">pcs</option>
        <option value="nos">nos</option>
        <option value="bundle">bundle</option>
        <option value="coil">coil</option>
        <option value="meter">meter</option>
      </select>
    </td>
    <td><input type="number" step="0.01" value="0" onchange="updateItemRate(${index}, this.value)"></td>
    <td style="text-align: right; font-weight: 600;" id="item-amount-${index}">₹0.00</td>
    <td>
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
  currentEstimateItems[index].rate = item.rate;
  currentEstimateItems[index].unit = item.unit;

  // Update description display
  document.getElementById(`item-desc-${index}`).textContent = item.description || '';

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
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>
        <select class="item-select" onchange="selectItem(${index}, this.value)">
          <option value="">-- Select Item --</option>
          ${masterItems.map(mItem => `
            <option value="${mItem.id}" ${mItem.name === item.item_name ? 'selected' : ''}>${mItem.name}</option>
          `).join('')}
        </select>
        <div class="item-description" id="item-desc-${index}">${item.description || ''}</div>
      </td>
      <td><input type="number" step="0.01" value="${item.quantity}" onchange="updateItemQuantity(${index}, this.value)"></td>
      <td>
        <select onchange="updateItemUnit(${index}, this.value)">
          <option value="kg" ${item.unit === 'kg' ? 'selected' : ''}>kg</option>
          <option value="pcs" ${item.unit === 'pcs' ? 'selected' : ''}>pcs</option>
          <option value="nos" ${item.unit === 'nos' ? 'selected' : ''}>nos</option>
          <option value="bundle" ${item.unit === 'bundle' ? 'selected' : ''}>bundle</option>
          <option value="coil" ${item.unit === 'coil' ? 'selected' : ''}>coil</option>
          <option value="meter" ${item.unit === 'meter' ? 'selected' : ''}>meter</option>
        </select>
      </td>
      <td><input type="number" step="0.01" value="${item.rate}" onchange="updateItemRate(${index}, this.value)"></td>
      <td style="text-align: right; font-weight: 600;" id="item-amount-${index}">₹${item.amount.toFixed(2)}</td>
      <td>
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

function generatePrintHTML() {
  const estimateNumber = document.getElementById('estimate-number').value;
  const estimateDate = document.getElementById('estimate-date').value;
  const billToName = document.getElementById('bill-to-name').value;
  const billToAddress = document.getElementById('bill-to-address').value;
  const subTotal = currentEstimateItems.reduce((sum, item) => sum + item.amount, 0);

  const itemsHTML = currentEstimateItems
    .filter(i => i.quantity > 0)
    .map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>
          <strong>${item.item_name}</strong><br>
          <small style="color: #666;">${item.description || ''}</small>
        </td>
        <td>${item.quantity}</td>
        <td>${item.unit}</td>
        <td>₹${item.rate.toFixed(2)}</td>
        <td style="text-align: right;">₹${item.amount.toFixed(2)}</td>
      </tr>
    `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        @page { size: A4; margin: 0.5in; }
        body { font-family: Arial, sans-serif; font-size: 12px; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
        .header h1 { margin: 0; font-size: 24px; }
        .info-section { display: flex; justify-content: space-between; margin-bottom: 20px; }
        .info-box { flex: 1; }
        .info-box h3 { margin: 0 0 10px 0; font-size: 14px; border-bottom: 1px solid #999; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #f0f0f0; padding: 10px; text-align: left; border: 1px solid #ddd; font-size: 11px; }
        td { padding: 8px; border: 1px solid #ddd; font-size: 11px; }
        .totals { text-align: right; margin-top: 20px; }
        .totals .row { margin: 5px 0; }
        .totals .grand { font-size: 16px; font-weight: bold; border-top: 2px solid #333; padding-top: 10px; }
        .words { margin-top: 20px; font-style: italic; color: #666; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>ESTIMATE</h1>
      </div>

      <div class="info-section">
        <div class="info-box">
          <p><strong>Estimate No:</strong> ${estimateNumber}</p>
          <p><strong>Date:</strong> ${new Date(estimateDate).toLocaleDateString('en-IN')}</p>
        </div>
        <div class="info-box">
          <h3>Bill To</h3>
          <p><strong>${billToName}</strong></p>
          <p>${billToAddress.replace(/\n/g, '<br>')}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th width="5%">#</th>
            <th width="40%">Item & Description</th>
            <th width="10%">Qty</th>
            <th width="10%">Unit</th>
            <th width="15%">Rate</th>
            <th width="20%">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHTML}
        </tbody>
      </table>

      <div class="totals">
        <div class="row"><strong>Sub Total:</strong> ₹${subTotal.toFixed(2)}</div>
        <div class="row grand"><strong>Total:</strong> ₹${subTotal.toFixed(2)}</div>
      </div>

      <div class="words">
        <strong>Total In Words:</strong> ${numberToWords(subTotal)}
      </div>
    </body>
    </html>
  `;
}

// Download PDF
async function downloadPDF() {
  const doc = generatePDFDocument();

  const estimateNumber = document.getElementById('estimate-number').value;
  const pdfData = doc.output('datauristring').split(',')[1];
  const defaultName = `Estimate_${estimateNumber}_${new Date().toISOString().split('T')[0]}.pdf`;

  const result = await ipcRenderer.invoke('save-pdf', pdfData, defaultName);

  if (result.success) {
    alert(`PDF saved successfully to:\n${result.path}`);
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
      <td>${new Date(est.estimate_date).toLocaleDateString('en-IN')}</td>
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
  if (num === 0) return 'Zero Rupees Only';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  function convertLessThanThousand(n) {
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
    result += convertLessThanThousand(num);
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

  document.getElementById('email-subject').value = `Estimate ${estimateNumber} - ${billToName}`;
  document.getElementById('email-message').value = `Dear ${billToName},\n\nPlease find attached estimate ${estimateNumber} for your review.\n\nThank you for your business.`;

  modal.classList.add('active');
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
  doc.text(`Date: ${new Date(estimateDate).toLocaleDateString('en-IN')}`, 14, 42);

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
    .map((item, index) => [
      index + 1,
      `${item.item_name}\n${item.description || ''}`,
      item.quantity,
      item.unit,
      `₹${item.rate.toFixed(2)}`,
      `₹${item.amount.toFixed(2)}`
    ]);

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
    doc.text('Advanced Payment:', 120, finalY + 6);
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
window.updateItemQuantity = updateItemQuantity;
window.updateItemUnit = updateItemUnit;
window.updateItemRate = updateItemRate;
window.removeItemRow = removeItemRow;
window.editItem = editItem;
window.deleteItem = deleteItem;
window.viewEstimate = viewEstimate;
