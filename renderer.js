/**
 * Estimate Generator - Renderer Process
 * MINIMAL VERSION - No DOM updates during typing
 */

const { ipcRenderer } = require('electron');
const { jsPDF } = require('jspdf');
require('jspdf-autotable');

var masterItems = [];
var estimateItems = [];
var editingId = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  masterItems = await ipcRenderer.invoke('get-items');
  await loadCustomerDropdown();
  await setNewEstimateNumber();
  setTodayDate();
  addRow();
  setupEvents();
  startInputSync(); // Start polling for input changes
  applyFocusFixToAll(); // Apply focus cycle fix to all inputs
  if (typeof setupDashboardListeners === 'function') setupDashboardListeners();
}

function setupEvents() {
  // Navigation
  document.querySelectorAll('.nav-btn').forEach(function(btn) {
    btn.onclick = function() { switchView(this.dataset.view); };
  });

  // Buttons
  var el;
  el = document.getElementById('add-item-row-btn'); if (el) el.onclick = addRow;
  el = document.getElementById('save-estimate-btn'); if (el) el.onclick = saveEstimate;
  el = document.getElementById('save-and-print-btn'); if (el) el.onclick = saveAndPrint;
  el = document.getElementById('preview-estimate-btn'); if (el) el.onclick = showPreview;
  el = document.getElementById('download-pdf-btn'); if (el) el.onclick = downloadPDF;
  el = document.getElementById('auto-round-btn'); if (el) el.onclick = autoRound;
  el = document.getElementById('print-from-preview-btn'); if (el) el.onclick = printFromPreview;
  el = document.getElementById('add-new-item-btn'); if (el) el.onclick = function() { openItemModal(); };
  el = document.getElementById('save-item-btn'); if (el) el.onclick = saveItem;
  el = document.getElementById('add-customer-btn'); if (el) el.onclick = function() { openCustomerModal(); };
  el = document.getElementById('save-customer-btn'); if (el) el.onclick = saveCustomer;

  // Totals - NO event handlers, polling handles it

  // Customer search - respond to both input and change events
  el = document.getElementById('customer-search');
  if (el) {
    el.oninput = handleCustomerSearch;
    el.onchange = handleCustomerSelect;
  }

  // Preview modal buttons
  el = document.getElementById('preview-edit-btn');
  if (el) el.onclick = function() {
    var modal = document.getElementById('estimate-preview-modal');
    var id = parseInt(modal.dataset.estimateId);
    if (id) { window.editEstimate(id); modal.classList.remove('active'); }
  };

  el = document.getElementById('preview-pdf-btn');
  if (el) {
    el.onclick = async function(e) {
      e.preventDefault();
      e.stopPropagation();
      var modal = document.getElementById('estimate-preview-modal');
      var id = modal ? parseInt(modal.dataset.estimateId) : 0;
      if (id && !isNaN(id)) {
        await window.downloadEstimatePDF(id);
      } else {
        alert('No estimate selected');
      }
    };
  }

  el = document.getElementById('preview-print-btn');
  if (el) el.onclick = function() {
    var modal = document.getElementById('estimate-preview-modal');
    var id = parseInt(modal.dataset.estimateId);
    if (id) window.printEstimateFromDashboard(id);
  };

  // Modal close
  ['print-preview-modal', 'email-modal', 'customer-modal', 'item-modal', 'estimate-preview-modal'].forEach(function(id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    modal.querySelectorAll('.close, .btn-cancel').forEach(function(btn) {
      btn.onclick = function(e) { e.stopPropagation(); modal.classList.remove('active'); };
    });
    modal.onclick = function(e) { if (e.target === modal) modal.classList.remove('active'); };
  });
}

function switchView(view) {
  document.querySelectorAll('.nav-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.view === view);
  });
  document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active'); });
  var el = document.getElementById(view + '-view');
  if (el) el.classList.add('active');
  if (view === 'dashboard' && typeof loadDashboard === 'function') loadDashboard();
  else if (view === 'customers') loadCustomersList();
  else if (view === 'items') loadItemsList();
}

// ============ ITEMS TABLE ============
// KEYBOARD CAPTURE WORKAROUND - manually handle keyboard input when frozen
var lastFocusedInput = null;
var inputFrozenTimer = null;

// Global keyboard handler to capture input when element appears frozen
document.addEventListener('keydown', function(e) {
  var el = document.activeElement;
  if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA')) return;
  if (el.type === 'date' || el.type === 'checkbox' || el.type === 'radio') return;

  // Check if this is a printable character or special key
  var key = e.key;

  // Handle backspace
  if (key === 'Backspace') {
    var val = el.value;
    var start = el.selectionStart || val.length;
    var end = el.selectionEnd || val.length;
    if (start === end && start > 0) {
      el.value = val.slice(0, start - 1) + val.slice(end);
      try { el.setSelectionRange(start - 1, start - 1); } catch(ex) {}
    } else if (start !== end) {
      el.value = val.slice(0, start) + val.slice(end);
      try { el.setSelectionRange(start, start); } catch(ex) {}
    }
    triggerInputEvent(el);
    e.preventDefault();
    return;
  }

  // Handle delete
  if (key === 'Delete') {
    var val = el.value;
    var start = el.selectionStart || 0;
    var end = el.selectionEnd || 0;
    if (start === end && start < val.length) {
      el.value = val.slice(0, start) + val.slice(end + 1);
      try { el.setSelectionRange(start, start); } catch(ex) {}
    } else if (start !== end) {
      el.value = val.slice(0, start) + val.slice(end);
      try { el.setSelectionRange(start, start); } catch(ex) {}
    }
    triggerInputEvent(el);
    e.preventDefault();
    return;
  }

  // Check if this is a numeric input field (qty, rate, advance, previous-balance, rounding)
  var isNumericField = el.id && (
    el.id.startsWith('qty-') ||
    el.id.startsWith('rate-') ||
    el.id === 'advanced-payment' ||
    el.id === 'previous-balance' ||
    el.id === 'rounding' ||
    el.id === 'modal-item-rate' ||
    el.id === 'modal-item-available-qty' ||
    el.id === 'modal-customer-opening-balance'
  );

  // Handle printable characters
  if (key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    // For numeric text inputs, only allow numbers, decimal, and minus
    if (isNumericField) {
      var val = el.value || '';
      var start = el.selectionStart !== null ? el.selectionStart : val.length;

      // Allow digits
      if (/\d/.test(key)) {
        // OK, allow digit
      }
      // Allow decimal point if not already present
      else if (key === '.' && !val.includes('.')) {
        // OK, allow decimal
      }
      // Allow minus only at start
      else if (key === '-' && start === 0 && !val.includes('-')) {
        // OK, allow minus at start
      }
      // Block all other characters
      else {
        e.preventDefault();
        return;
      }
    }

    var val = el.value;
    var start = el.selectionStart !== null ? el.selectionStart : val.length;
    var end = el.selectionEnd !== null ? el.selectionEnd : val.length;

    el.value = val.slice(0, start) + key + val.slice(end);
    var newPos = start + 1;
    try { el.setSelectionRange(newPos, newPos); } catch(ex) {}
    triggerInputEvent(el);
    e.preventDefault();
  }
}, true);

function triggerInputEvent(el) {
  var evt = new Event('input', { bubbles: true, cancelable: true });
  el.dispatchEvent(evt);
}

// ============ FOCUS GLOW SYSTEM - POLLING BASED ============
// Polls every 100ms to check which element is focused and applies glow
var glowInterval = null;
var lastGlowedId = null;

function startGlowPolling() {
  if (glowInterval) return; // Already running

  glowInterval = setInterval(function() {
    var active = document.activeElement;
    var activeId = active ? (active.id || active.tagName + Math.random()) : null;

    // Check if focus changed
    if (activeId === lastGlowedId) return; // No change

    // Remove glow from ALL inputs first
    document.querySelectorAll('input, textarea, select').forEach(function(el) {
      el.style.outline = '';
      el.style.borderColor = '';
      el.style.borderWidth = '';
      el.style.boxShadow = '';
      el.style.backgroundColor = '';
    });

    // Apply glow to currently focused element
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
      active.style.outline = 'none';
      active.style.borderColor = '#667eea';
      active.style.borderWidth = '2px';
      active.style.boxShadow = '0 0 0 4px rgba(102, 126, 234, 0.3)';
      active.style.backgroundColor = '#fff';
      lastGlowedId = activeId;
    } else {
      lastGlowedId = null;
    }
  }, 100);
}

function resetGlowTracking() {
  lastGlowedId = null;
}

function applyFocusFixToAll() {
  startGlowPolling();
}

function addRow() {
  var idx = estimateItems.length;
  estimateItems.push({ item_name: '', description: '', hsn_code: '', quantity: 0, unit: 'kg', rate: 0, amount: 0 });
  renderTable();
  setTimeout(function() {
    var inp = document.getElementById('name-' + idx);
    if (inp) inp.focus();
  }, 100);
}

function renderTable() {
  var tbody = document.getElementById('items-tbody');
  if (!tbody) return;

  // Reset glow tracking since we're destroying and recreating elements
  resetGlowTracking();

  var html = '';
  for (var i = 0; i < estimateItems.length; i++) {
    var item = estimateItems[i];
    var hsn = item.hsn_code ? ' | HSN: ' + item.hsn_code : '';
    var desc = (item.description || '') + hsn;

    html += '<tr>';
    html += '<td style="text-align:center">' + (i + 1) + '</td>';
    html += '<td>';
    html += '<input type="text" id="name-' + i + '" value="' + esc(item.item_name) + '" placeholder="Type item..." list="items-list-' + i + '" style="width:100%;padding:8px;margin-bottom:4px;border:1px solid #ddd;border-radius:4px">';
    html += '<datalist id="items-list-' + i + '">';
    for (var j = 0; j < masterItems.length; j++) {
      html += '<option value="' + esc(masterItems[j].name) + '">';
    }
    html += '</datalist>';
    html += '<input type="text" id="desc-' + i + '" value="' + esc(desc) + '" placeholder="Description" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;font-size:12px">';
    html += '</td>';
    html += '<td><input type="text" id="qty-' + i + '" value="' + (item.quantity || '') + '" placeholder="0" inputmode="decimal" style="width:70px;padding:8px;text-align:center;border:1px solid #ddd;border-radius:4px"></td>';
    html += '<td><select id="unit-' + i + '" style="padding:8px;border:1px solid #ddd;border-radius:4px">';
    ['kg', 'pcs', 'nos', 'bundle', 'coil', 'meter'].forEach(function(u) {
      html += '<option value="' + u + '"' + (item.unit === u ? ' selected' : '') + '>' + u + '</option>';
    });
    html += '</select></td>';
    html += '<td><input type="text" id="rate-' + i + '" value="' + (item.rate || '') + '" placeholder="0" inputmode="decimal" style="width:90px;padding:8px;text-align:right;border:1px solid #ddd;border-radius:4px"></td>';
    html += '<td style="text-align:right;font-weight:600" id="amt-' + i + '">₹' + (item.amount || 0).toFixed(2) + '</td>';
    html += '<td><button onclick="removeRow(' + i + ')" style="background:#e53e3e;color:white;border:none;padding:6px 12px;border-radius:4px;cursor:pointer">Remove</button></td>';
    html += '</tr>';
  }

  tbody.innerHTML = html;

  // Bind ONLY select elements - no input events to avoid freeze
  for (var i = 0; i < estimateItems.length; i++) {
    bindSelectOnly(i);
  }

  calcTotals();

  // Apply focus fix to any remaining inputs
  applyFocusFixToAll();
}

function bindSelectOnly(idx) {
  var unitEl = document.getElementById('unit-' + idx);
  if (unitEl) {
    unitEl.onchange = function() {
      estimateItems[idx].unit = this.value;
    };
  }
}

// Polling function - syncs input values every 500ms WITHOUT affecting focus
var syncInterval = null;
function startInputSync() {
  if (syncInterval) return;
  syncInterval = setInterval(function() {
    var activeEl = document.activeElement;
    var activeId = activeEl ? activeEl.id : '';

    for (var i = 0; i < estimateItems.length; i++) {
      var nameEl = document.getElementById('name-' + i);
      var descEl = document.getElementById('desc-' + i);
      var qtyEl = document.getElementById('qty-' + i);
      var rateEl = document.getElementById('rate-' + i);
      var unitEl = document.getElementById('unit-' + i);

      // Only sync if NOT currently focused (to avoid interfering with typing)
      if (nameEl && activeId !== 'name-' + i) {
        var newName = nameEl.value;
        if (newName !== estimateItems[i].item_name) {
          estimateItems[i].item_name = newName;
          // Check for master item match
          var m = masterItems.find(function(x) { return x.name === newName; });
          if (m) {
            estimateItems[i].description = m.description || '';
            estimateItems[i].hsn_code = m.hsn_code || '';
            estimateItems[i].rate = m.rate || 0;
            estimateItems[i].unit = m.unit || 'kg';
            if (descEl && activeId !== 'desc-' + i) descEl.value = (m.description || '') + (m.hsn_code ? ' | HSN: ' + m.hsn_code : '');
            if (rateEl && activeId !== 'rate-' + i) rateEl.value = m.rate || '';
            if (unitEl) unitEl.value = m.unit || 'kg';
          }
        }
      }

      if (descEl && activeId !== 'desc-' + i) {
        estimateItems[i].description = descEl.value.replace(/\s*\|\s*HSN:\s*\S+\s*$/, '');
      }

      if (qtyEl && activeId !== 'qty-' + i) {
        var newQty = parseFloat(qtyEl.value) || 0;
        if (newQty !== estimateItems[i].quantity) {
          estimateItems[i].quantity = newQty;
          calcRowSilent(i);
        }
      }

      if (rateEl && activeId !== 'rate-' + i) {
        var newRate = parseFloat(rateEl.value) || 0;
        if (newRate !== estimateItems[i].rate) {
          estimateItems[i].rate = newRate;
          calcRowSilent(i);
        }
      }

      if (unitEl) {
        estimateItems[i].unit = unitEl.value;
      }
    }

    calcTotals();
  }, 500);
}

// Silent calc - only updates amount display, no other DOM changes
function calcRowSilent(idx) {
  var item = estimateItems[idx];
  if (!item) return;
  item.amount = (item.quantity || 0) * (item.rate || 0);
  var el = document.getElementById('amt-' + idx);
  if (el) el.textContent = '₹' + item.amount.toFixed(2);
}

window.removeRow = function(idx) {
  estimateItems.splice(idx, 1);
  renderTable();
};

function calcTotals() {
  var sub = 0, kg = 0;
  for (var i = 0; i < estimateItems.length; i++) {
    sub += estimateItems[i].amount || 0;
    if (estimateItems[i].unit === 'kg') kg += estimateItems[i].quantity || 0;
  }
  var advEl = document.getElementById('advanced-payment');
  var prevBalEl = document.getElementById('previous-balance');
  var rndEl = document.getElementById('rounding');
  var adv = advEl ? parseFloat(advEl.value) || 0 : 0;
  var prevBal = prevBalEl ? parseFloat(prevBalEl.value) || 0 : 0;
  var rnd = rndEl ? parseFloat(rndEl.value) || 0 : 0;
  // Formula: Grand Total = Sub Total - Advance + Previous Balance + Rounding
  // Advance is subtracted, Previous Balance is added
  var total = sub - adv + prevBal + rnd;

  var el;
  el = document.getElementById('sub-total'); if (el) el.textContent = '₹' + sub.toFixed(2);
  el = document.getElementById('grand-total'); if (el) el.textContent = '₹' + total.toFixed(2);
  el = document.getElementById('total-kg'); if (el) el.textContent = kg.toFixed(2) + ' kg';
  el = document.getElementById('total-words'); if (el) el.textContent = 'Total In Words: ' + numToWords(Math.abs(total));
}

function autoRound() {
  var sub = 0;
  for (var i = 0; i < estimateItems.length; i++) sub += estimateItems[i].amount || 0;
  var advEl = document.getElementById('advanced-payment');
  var prevBalEl = document.getElementById('previous-balance');
  var rndEl = document.getElementById('rounding');
  var adv = advEl ? parseFloat(advEl.value) || 0 : 0;
  var prevBal = prevBalEl ? parseFloat(prevBalEl.value) || 0 : 0;
  // Round to nearest whole number (Sub Total - Advance + Previous Balance)
  var beforeRound = sub - adv + prevBal;
  if (rndEl) rndEl.value = (Math.round(beforeRound) - beforeRound).toFixed(2);
  calcTotals();
}

function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ============ FORM ============
async function setNewEstimateNumber() {
  var num = await ipcRenderer.invoke('get-next-estimate-number');
  var el = document.getElementById('estimate-number');
  if (el) el.value = num;
}

function setTodayDate() {
  var el = document.getElementById('estimate-date');
  if (el) {
    var d = new Date();
    el.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
}

async function loadCustomerDropdown() {
  var customers = await ipcRenderer.invoke('get-customers');
  var dl = document.getElementById('customer-list');
  if (dl) {
    dl.innerHTML = '';
    customers.forEach(function(c) { dl.innerHTML += '<option value="' + esc(c.name) + '">'; });
  }
}

// Handle customer search - filter and show matching customers as user types
async function handleCustomerSearch() {
  var el = document.getElementById('customer-search');
  if (!el) return;
  var searchTerm = el.value.toLowerCase().trim();
  if (!searchTerm) return;

  var customers = await ipcRenderer.invoke('get-customers');
  var dl = document.getElementById('customer-list');
  if (dl) {
    dl.innerHTML = '';
    // Filter customers whose name starts with or contains the search term
    customers.forEach(function(c) {
      var name = c.name || '';
      if (name.toLowerCase().indexOf(searchTerm) !== -1) {
        dl.innerHTML += '<option value="' + esc(name) + '">';
      }
    });
  }

  // Auto-fill if exact match found
  var exactMatch = customers.find(function(c) {
    return c.name && c.name.toLowerCase() === searchTerm;
  });
  if (exactMatch) {
    var nameEl = document.getElementById('bill-to-name');
    var addrEl = document.getElementById('bill-to-address');
    if (nameEl) nameEl.value = exactMatch.name;
    if (addrEl) addrEl.value = [exactMatch.address, exactMatch.city, exactMatch.state, exactMatch.country].filter(Boolean).join(', ');
  }
}

async function handleCustomerSelect() {
  var el = document.getElementById('customer-search');
  if (!el) return;
  var customers = await ipcRenderer.invoke('get-customers');
  var c = customers.find(function(x) { return x.name === el.value; });
  if (c) {
    var nameEl = document.getElementById('bill-to-name');
    var addrEl = document.getElementById('bill-to-address');
    if (nameEl) nameEl.value = c.name;
    if (addrEl) addrEl.value = [c.address, c.city, c.state, c.country].filter(Boolean).join(', ');
  }
}

async function resetForm() {
  editingId = null;
  estimateItems = [];

  // Reset glow tracking for new estimate
  resetGlowTracking();

  await setNewEstimateNumber();
  setTodayDate();

  // Reset all form fields
  ['bill-to-name', 'bill-to-address', 'customer-search', 'advanced-payment', 'previous-balance', 'rounding'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      el.value = '';
      el.style.borderColor = '#ddd';
      el.style.borderWidth = '1px';
      el.style.boxShadow = 'none';
      el.style.backgroundColor = '#fff';
    }
  });

  await loadCustomerDropdown();
  addRow();
}

// ============ SAVE ============
async function saveEstimate() {
  var nameEl = document.getElementById('bill-to-name');
  if (!nameEl || !nameEl.value.trim()) { alert('Please enter Bill To name'); return; }

  // Sync all inputs before save
  syncAllInputs();

  var valid = estimateItems.filter(function(x) { return x.quantity > 0; });
  if (valid.length === 0) { alert('Please add at least one item with quantity'); return; }

  var sub = 0;
  valid.forEach(function(x) { sub += x.amount; });
  var advEl = document.getElementById('advanced-payment');
  var prevBalEl = document.getElementById('previous-balance');
  var rndEl = document.getElementById('rounding');
  var adv = advEl ? parseFloat(advEl.value) || 0 : 0;
  var prevBal = prevBalEl ? parseFloat(prevBalEl.value) || 0 : 0;
  var rnd = rndEl ? parseFloat(rndEl.value) || 0 : 0;

  // Formula: Grand Total = Sub Total - Advance + Previous Balance + Rounding
  var total = sub - adv + prevBal + rnd;
  var data = {
    estimate_number: document.getElementById('estimate-number').value,
    estimate_date: document.getElementById('estimate-date').value,
    bill_to_name: nameEl.value.trim(),
    bill_to_address: document.getElementById('bill-to-address').value || '',
    sub_total: sub,
    advanced_payment: adv,
    previous_balance: prevBal,
    rounding: rnd,
    total: total,
    total_in_words: numToWords(Math.abs(total)),
    items: valid
  };

  try {
    if (editingId) {
      data.id = editingId;
      await ipcRenderer.invoke('update-estimate', data);
      alert('Estimate updated!');
    } else {
      await ipcRenderer.invoke('save-estimate', data);
      alert('Estimate saved!');
    }
    await resetForm();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

async function saveAndPrint() {
  var nameEl = document.getElementById('bill-to-name');
  if (!nameEl || !nameEl.value.trim()) { alert('Please enter Bill To name'); return; }

  syncAllInputs();

  var valid = estimateItems.filter(function(x) { return x.quantity > 0; });
  if (valid.length === 0) { alert('Please add at least one item with quantity'); return; }

  var btn = document.getElementById('save-and-print-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  try {
    var sub = 0;
    valid.forEach(function(x) { sub += x.amount; });
    var advEl = document.getElementById('advanced-payment');
    var prevBalEl = document.getElementById('previous-balance');
    var rndEl = document.getElementById('rounding');
    var adv = advEl ? parseFloat(advEl.value) || 0 : 0;
    var prevBal = prevBalEl ? parseFloat(prevBalEl.value) || 0 : 0;
    var rnd = rndEl ? parseFloat(rndEl.value) || 0 : 0;

    // Formula: Grand Total = Sub Total - Advance + Previous Balance + Rounding
    var total = sub - adv + prevBal + rnd;
    var data = {
      estimate_number: document.getElementById('estimate-number').value,
      estimate_date: document.getElementById('estimate-date').value,
      bill_to_name: nameEl.value.trim(),
      bill_to_address: document.getElementById('bill-to-address').value || '',
      sub_total: sub,
      advanced_payment: adv,
      previous_balance: prevBal,
      rounding: rnd,
      total: total,
      total_in_words: numToWords(Math.abs(total)),
      items: valid
    };

    if (editingId) {
      data.id = editingId;
      await ipcRenderer.invoke('update-estimate', data);
    } else {
      await ipcRenderer.invoke('save-estimate', data);
    }

    await printEst();
    await resetForm();
  } catch (e) {
    alert('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Save & Print'; }
  }
}

function syncAllInputs() {
  for (var i = 0; i < estimateItems.length; i++) {
    var nameEl = document.getElementById('name-' + i);
    var descEl = document.getElementById('desc-' + i);
    var qtyEl = document.getElementById('qty-' + i);
    var rateEl = document.getElementById('rate-' + i);
    var unitEl = document.getElementById('unit-' + i);

    if (nameEl) estimateItems[i].item_name = nameEl.value;
    if (descEl) estimateItems[i].description = descEl.value.replace(/\s*\|\s*HSN:\s*\S+\s*$/, '');
    if (qtyEl) estimateItems[i].quantity = parseFloat(qtyEl.value) || 0;
    if (rateEl) estimateItems[i].rate = parseFloat(rateEl.value) || 0;
    if (unitEl) estimateItems[i].unit = unitEl.value;
    estimateItems[i].amount = estimateItems[i].quantity * estimateItems[i].rate;
  }
}

// ============ PRINT & PDF ============
async function printEst() {
  syncAllInputs();
  var html = genPrintHTML();
  try {
    var r = await ipcRenderer.invoke('print-estimate', html, 'System Default');
    if (r.success) alert('Printed!');
    else if (!r.cancelled) alert('Print failed');
  } catch (e) {
    alert('Print error: ' + e.message);
  }
}

function showPreview() {
  syncAllInputs();
  var frame = document.getElementById('preview-frame');
  if (frame) frame.srcdoc = genPrintHTML();
  var modal = document.getElementById('print-preview-modal');
  if (modal) modal.classList.add('active');
}

async function printFromPreview() {
  var frame = document.getElementById('preview-frame');
  if (!frame) return;
  try {
    var r = await ipcRenderer.invoke('print-estimate', frame.srcdoc, 'System Default');
    if (r.success) {
      alert('Printed!');
      document.getElementById('print-preview-modal').classList.remove('active');
    }
  } catch (e) {
    alert('Print error: ' + e.message);
  }
}

async function downloadPDF() {
  var nameEl = document.getElementById('bill-to-name');
  if (!nameEl || !nameEl.value.trim()) { alert('Please enter Bill To name'); return; }
  syncAllInputs();
  var valid = estimateItems.filter(function(x) { return x.quantity > 0; });
  if (valid.length === 0) { alert('Please add at least one item'); return; }

  try {
    var doc = genPDFDoc();
    var num = document.getElementById('estimate-number').value;
    var pdfData = doc.output('datauristring').split(',')[1];
    var r = await ipcRenderer.invoke('save-pdf', pdfData, 'Estimate_' + num + '.pdf');
    if (r.success) alert('Saved to:\n' + r.path);
  } catch (e) {
    alert('PDF error: ' + e.message);
  }
}

// ============ MASTER ITEMS ============
async function loadItemsList() {
  masterItems = await ipcRenderer.invoke('get-items');
  var tbody = document.getElementById('items-master-tbody');
  if (!tbody) return;

  if (masterItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px">No items</td></tr>';
    return;
  }

  var html = '';
  masterItems.forEach(function(x) {
    html += '<tr>';
    html += '<td>' + esc(x.name) + '</td>';
    html += '<td>' + esc(x.description || '-') + '</td>';
    html += '<td style="text-align:right">₹' + parseFloat(x.rate).toFixed(2) + '</td>';
    html += '<td style="text-align:center">' + x.unit + '</td>';
    html += '<td style="text-align:right">' + parseFloat(x.available_qty || 0).toFixed(2) + '</td>';
    html += '<td style="text-align:center"><button class="btn btn-small" onclick="editMasterItem(' + x.id + ')">Edit</button> <button class="btn btn-danger btn-small" onclick="deleteMasterItem(' + x.id + ')">Delete</button></td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;
}

function openItemModal(item) {
  var modal = document.getElementById('item-modal');
  document.getElementById('modal-title').textContent = item ? 'Edit Item' : 'Add New Item';
  document.getElementById('modal-item-id').value = item ? item.id : '';
  document.getElementById('modal-item-name').value = item ? item.name : '';
  document.getElementById('modal-item-description').value = item ? item.description : '';
  document.getElementById('modal-item-hsn').value = item ? item.hsn_code : '';
  document.getElementById('modal-item-rate').value = item ? item.rate : '';
  document.getElementById('modal-item-unit').value = item ? item.unit : 'kg';
  document.getElementById('modal-item-available-qty').value = item ? item.available_qty : '';
  modal.classList.add('active');
  // Apply focus fix to modal inputs
  setTimeout(applyFocusFixToAll, 100);
}

async function saveItem() {
  var id = document.getElementById('modal-item-id').value;
  var item = {
    name: document.getElementById('modal-item-name').value,
    description: document.getElementById('modal-item-description').value,
    hsn_code: document.getElementById('modal-item-hsn').value,
    rate: parseFloat(document.getElementById('modal-item-rate').value),
    unit: document.getElementById('modal-item-unit').value,
    available_qty: parseFloat(document.getElementById('modal-item-available-qty').value) || 0
  };
  if (!item.name || !item.rate) { alert('Please fill required fields'); return; }

  if (id) {
    item.id = parseInt(id);
    await ipcRenderer.invoke('update-item', item);
  } else {
    await ipcRenderer.invoke('add-item', item);
  }

  document.getElementById('item-modal').classList.remove('active');
  masterItems = await ipcRenderer.invoke('get-items');
  loadItemsList();
}

window.editMasterItem = async function(id) {
  var item = masterItems.find(function(x) { return x.id === id; });
  if (item) openItemModal(item);
};

window.deleteMasterItem = async function(id) {
  if (confirm('Delete this item?')) {
    await ipcRenderer.invoke('delete-item', id);
    masterItems = await ipcRenderer.invoke('get-items');
    loadItemsList();
  }
};

// ============ CUSTOMERS ============
function openCustomerModal(c) {
  var modal = document.getElementById('customer-modal');
  document.getElementById('customer-modal-title').textContent = c ? 'Edit Customer' : 'Add Customer';
  document.getElementById('modal-customer-id').value = c ? c.id : '';
  document.getElementById('modal-customer-name').value = c ? c.name : '';
  document.getElementById('modal-customer-address').value = c ? c.address : '';
  document.getElementById('modal-customer-city').value = c ? c.city : '';
  document.getElementById('modal-customer-state').value = c ? c.state : 'Tamil Nadu';
  document.getElementById('modal-customer-country').value = c ? c.country : 'India';
  document.getElementById('modal-customer-phone').value = c ? c.phone : '';
  document.getElementById('modal-customer-email').value = c ? c.email : '';
  document.getElementById('modal-customer-vehicle').value = c ? c.vehicle : '';
  document.getElementById('modal-customer-gstn').value = c ? c.gstn : '';
  document.getElementById('modal-customer-opening-balance').value = c ? c.opening_balance : '';
  modal.classList.add('active');
  // Apply focus fix to modal inputs
  setTimeout(applyFocusFixToAll, 100);
}

async function saveCustomer() {
  var id = document.getElementById('modal-customer-id').value;
  var name = document.getElementById('modal-customer-name').value.trim();
  if (!name) { alert('Please enter customer name'); return; }

  var data = {
    name: name,
    address: document.getElementById('modal-customer-address').value.trim(),
    city: document.getElementById('modal-customer-city').value.trim(),
    state: document.getElementById('modal-customer-state').value.trim(),
    country: document.getElementById('modal-customer-country').value.trim(),
    phone: document.getElementById('modal-customer-phone').value.trim(),
    email: document.getElementById('modal-customer-email').value.trim(),
    vehicle: document.getElementById('modal-customer-vehicle').value.trim(),
    gstn: document.getElementById('modal-customer-gstn').value.trim(),
    opening_balance: parseFloat(document.getElementById('modal-customer-opening-balance').value) || 0
  };

  if (id) {
    data.id = parseInt(id);
    await ipcRenderer.invoke('update-customer', data);
  } else {
    await ipcRenderer.invoke('add-customer', data);
  }

  document.getElementById('customer-modal').classList.remove('active');
  await loadCustomerDropdown();
  loadCustomersList();
}

async function loadCustomersList() {
  var customers = await ipcRenderer.invoke('get-customers');
  var estimates = await ipcRenderer.invoke('get-estimates');
  var tbody = document.getElementById('customers-tbody');
  if (!tbody) return;

  if (customers.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px">No customers</td></tr>';
    return;
  }

  var html = '';
  customers.forEach(function(c) {
    var ce = estimates.filter(function(e) { return e.bill_to_name === c.name; });
    var t = 0;
    ce.forEach(function(e) { t += e.total || 0; });
    var addr = [c.address, c.city, c.state].filter(Boolean).join(', ');
    html += '<tr>';
    html += '<td>' + esc(c.name) + '</td>';
    html += '<td>' + esc(addr || '-') + '</td>';
    html += '<td style="text-align:center">' + ce.length + '</td>';
    html += '<td style="text-align:right">₹' + t.toFixed(2) + '</td>';
    html += '<td style="text-align:right">₹0.00</td>';
    html += '<td style="text-align:right">₹' + t.toFixed(2) + '</td>';
    html += '<td style="text-align:center"><button class="btn btn-small" onclick="editCust(' + c.id + ')">Edit</button> <button class="btn btn-danger btn-small" onclick="delCust(' + c.id + ')">Delete</button></td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;
}

window.editCust = async function(id) {
  var customers = await ipcRenderer.invoke('get-customers');
  var c = customers.find(function(x) { return x.id === id; });
  if (c) openCustomerModal(c);
};

window.delCust = async function(id) {
  if (confirm('Delete this customer?')) {
    await ipcRenderer.invoke('delete-customer', id);
    loadCustomersList();
  }
};

// ============ NUMBER TO WORDS ============
function numToWords(num) {
  if (num < 0) num = Math.abs(num);
  num = Math.round(num);
  if (num === 0) return 'Zero Rupees Only';

  var ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  var tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  var teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  function conv(n) {
    if (n === 0) return '';
    var r = '';
    if (n >= 100) { r += ones[Math.floor(n / 100)] + ' Hundred '; n %= 100; }
    if (n >= 20) { r += tens[Math.floor(n / 10)] + ' '; n %= 10; }
    else if (n >= 10) { r += teens[n - 10] + ' '; return r; }
    if (n > 0) r += ones[n] + ' ';
    return r;
  }

  var cr = Math.floor(num / 10000000); num %= 10000000;
  var lk = Math.floor(num / 100000); num %= 100000;
  var th = Math.floor(num / 1000); num %= 1000;

  var r = '';
  if (cr > 0) r += conv(cr) + 'Crore ';
  if (lk > 0) r += conv(lk) + 'Lakh ';
  if (th > 0) r += conv(th) + 'Thousand ';
  if (num > 0) r += conv(num);

  return r.trim() + ' Rupees Only';
}

// ============ PRINT HTML ============
function genPrintHTML() {
  var num = document.getElementById('estimate-number').value;
  var date = document.getElementById('estimate-date').value;
  var name = document.getElementById('bill-to-name').value;
  var addr = document.getElementById('bill-to-address').value;

  var valid = estimateItems.filter(function(x) { return x.quantity > 0; });
  var sub = 0, kg = 0;
  valid.forEach(function(x) { sub += x.amount; if (x.unit === 'kg') kg += x.quantity; });

  var advEl = document.getElementById('advanced-payment');
  var prevBalEl = document.getElementById('previous-balance');
  var rndEl = document.getElementById('rounding');
  var adv = advEl ? parseFloat(advEl.value) || 0 : 0;
  var prevBal = prevBalEl ? parseFloat(prevBalEl.value) || 0 : 0;
  var rnd = rndEl ? parseFloat(rndEl.value) || 0 : 0;
  // Formula: Grand Total = Sub Total - Advance + Previous Balance + Rounding
  var total = sub - adv + prevBal + rnd;

  function fmt(n) { return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  var rows = '';
  valid.forEach(function(x, i) {
    var hsn = x.hsn_code ? ' | HSN: ' + x.hsn_code : '';
    rows += '<tr><td style="text-align:center;border:1px solid #333;padding:8px">' + (i + 1) + '</td>';
    rows += '<td style="border:1px solid #333;padding:8px"><strong>' + esc(x.item_name) + '</strong><br><span style="font-size:9px;color:#555">' + esc(x.description) + hsn + '</span></td>';
    rows += '<td style="text-align:center;border:1px solid #333;padding:8px">' + x.quantity + '</td>';
    rows += '<td style="text-align:center;border:1px solid #333;padding:8px">' + x.unit + '</td>';
    rows += '<td style="text-align:right;border:1px solid #333;padding:8px">' + fmt(x.rate) + '</td>';
    rows += '<td style="text-align:right;border:1px solid #333;padding:8px;font-weight:bold">' + fmt(x.amount) + '</td></tr>';
  });

  var fmtDate = new Date(date).toLocaleDateString('en-GB');

  // Always show Previous Balance row
  var rowspanVal = '6';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:10mm}body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:0}.c{border:1px solid #333}</style></head><body><div class="c"><table style="width:100%;border-collapse:collapse"><tr><td style="width:44%;padding:10px;border:1px solid #333"><strong>Estimate No:</strong> ' + num + '<br><strong>Date:</strong> ' + fmtDate + '</td><td style="width:56%;padding:10px;border:1px solid #333"><strong>Bill To:</strong><br>' + esc(name) + '<br>' + esc(addr).replace(/,/g, '<br>') + '</td></tr></table><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#e8e8e8"><th style="border:1px solid #333;padding:8px;width:5%">#</th><th style="border:1px solid #333;padding:8px;text-align:left;width:39%">Item & Description</th><th style="border:1px solid #333;padding:8px;width:10%">Qty</th><th style="border:1px solid #333;padding:8px;width:8%">Unit</th><th style="border:1px solid #333;padding:8px;width:15%;text-align:right">Rate</th><th style="border:1px solid #333;padding:8px;width:23%;text-align:right">Amount</th></tr></thead><tbody>' + rows + '</tbody></table><table style="width:100%;border-collapse:collapse"><tr><td style="width:44%;padding:10px;border:1px solid #333;vertical-align:top" rowspan="' + rowspanVal + '"><strong>Total Qty:</strong> ' + kg.toFixed(2) + ' kg<br><strong>In Words:</strong> ' + numToWords(Math.abs(total)) + '</td><td style="border:1px solid #333;padding:6px 10px;width:33%">Sub Total</td><td style="border:1px solid #333;padding:6px 10px;text-align:right;width:23%">' + fmt(sub) + '</td></tr><tr><td style="border:1px solid #333;padding:6px 10px">Advance</td><td style="border:1px solid #333;padding:6px 10px;text-align:right">' + fmt(adv) + '</td></tr><tr><td style="border:1px solid #333;padding:6px 10px">Previous Balance</td><td style="border:1px solid #333;padding:6px 10px;text-align:right">' + fmt(prevBal) + '</td></tr><tr><td style="border:1px solid #333;padding:6px 10px">Rounding</td><td style="border:1px solid #333;padding:6px 10px;text-align:right">' + fmt(rnd) + '</td></tr><tr style="background:#e8e8e8;font-weight:bold"><td style="border:1px solid #333;padding:8px 10px">TOTAL</td><td style="border:1px solid #333;padding:8px 10px;text-align:right">₹' + fmt(total) + '</td></tr><tr><td colspan="2" style="border:1px solid #333;padding:15px;text-align:center"><div style="height:40px"></div><div style="border-top:1px solid #333;padding-top:5px;font-size:10px">Authorized Signature</div></td></tr></table></div></body></html>';
}

// ============ PDF ============
// Generate PDF from estimate data directly (for dashboard PDF download)
function genPDFFromEstimate(estimate) {
  var doc = new jsPDF();
  function fmt(n) { return parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  // Page border
  doc.setDrawColor(51);
  doc.setLineWidth(0.3);
  doc.rect(10, 10, 190, 277);

  var num = estimate.estimate_number;
  var date = estimate.estimate_date;
  var name = estimate.bill_to_name;
  var addr = estimate.bill_to_address || '';

  // Header row height - start from top
  var headerY = 10;
  var headerH = 35;

  // Left header - Estimate No & Date with box
  doc.setDrawColor(51);
  doc.rect(10, headerY, 95, headerH);
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('Estimate No:', 14, headerY + 14);
  doc.setFont(undefined, 'normal');
  doc.text(num, 48, headerY + 14);
  doc.setFont(undefined, 'bold');
  doc.text('Date:', 14, headerY + 26);
  doc.setFont(undefined, 'normal');
  doc.text(new Date(date).toLocaleDateString('en-GB'), 48, headerY + 26);

  // Right header - Bill To with box (same height as left)
  doc.setFillColor(240, 240, 240);
  doc.rect(105, headerY, 95, 8, 'F');
  doc.rect(105, headerY, 95, 8, 'S');
  doc.setFont(undefined, 'bold');
  doc.setFontSize(10);
  doc.text('Bill To', 152, headerY + 6, { align: 'center' });
  doc.rect(105, headerY + 8, 95, headerH - 8, 'S');
  doc.setFont(undefined, 'bold');
  doc.text(name, 109, headerY + 16);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  // Split address properly and display each line
  var addrText = doc.splitTextToSize(addr, 88);
  doc.text(addrText, 109, headerY + 23);

  // Get items directly from estimate
  var items = estimate.items || [];
  var valid = [];
  var sub = 0, kg = 0;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (item && item.quantity > 0) {
      valid.push(item);
      sub += parseFloat(item.amount) || 0;
      if (item.unit === 'kg') kg += parseFloat(item.quantity) || 0;
    }
  }

  var tableData = [];
  for (var i = 0; i < valid.length; i++) {
    var x = valid[i];
    tableData.push([i + 1, x.item_name + '\n' + (x.description || '') + (x.hsn_code ? ' | HSN: ' + x.hsn_code : ''), x.quantity, x.unit, fmt(x.rate), fmt(x.amount)]);
  }

  doc.autoTable({
    startY: headerY + headerH + 2,
    head: [['#', 'Item & Description', 'Qty', 'Unit', 'Rate', 'Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [232, 232, 232],
      textColor: [0, 0, 0],
      fontSize: 10,
      fontStyle: 'bold',
      cellPadding: 4,
      halign: 'center'
    },
    styles: {
      fontSize: 9,
      lineColor: [51],
      lineWidth: 0.2,
      cellPadding: 4,
      overflow: 'linebreak',
      valign: 'middle'
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 68, halign: 'left' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 32, halign: 'right' },
      5: { cellWidth: 40, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: 10, right: 10, top: 20, bottom: 20 },
    showHead: 'everyPage',
    tableWidth: 190,
    didDrawPage: function(data) {
      doc.setDrawColor(51);
      doc.setLineWidth(0.3);
      doc.rect(10, 10, 190, 277);
    }
  });

  var fY = doc.lastAutoTable.finalY;
  var adv = parseFloat(estimate.advanced_payment) || 0;
  var prevBal = parseFloat(estimate.previous_balance) || 0;
  var rnd = parseFloat(estimate.rounding) || 0;
  // Formula: Grand Total = Sub Total - Advance + Previous Balance + Rounding
  var total = sub - adv + prevBal + rnd;

  // Build totals rows for right side table - always show all fields
  var totalsData = [];
  totalsData.push(['Sub Total', fmt(sub)]);
  totalsData.push(['Advance', fmt(adv)]);
  totalsData.push(['Previous Balance', fmt(prevBal)]);
  totalsData.push(['Rounding', fmt(rnd)]);

  var rowH = 8;
  var totalRows = totalsData.length + 1; // +1 for TOTAL row
  var boxHeight = (totalRows * rowH) + 8;

  // Left box - Total Qty and In Words
  doc.setDrawColor(51);
  doc.rect(10, fY, 95, boxHeight);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(10);
  doc.text('Total Qty: ' + kg.toFixed(2) + ' kg', 14, fY + 10);
  doc.setFontSize(9);
  doc.text('In Words:', 14, fY + 20);
  doc.setFont(undefined, 'normal');
  var words = doc.splitTextToSize(numToWords(Math.abs(total)), 85);
  doc.text(words, 14, fY + 28);

  // Right section - Totals table with proper grid
  var rightX = 105;
  var rightW = 95;
  var labelW = 55;
  var valueW = 40;
  var currentY = fY;

  doc.setDrawColor(51);

  // Draw each row with borders
  for (var r = 0; r < totalsData.length; r++) {
    // Row border
    doc.rect(rightX, currentY, rightW, rowH);
    // Vertical divider
    doc.line(rightX + labelW, currentY, rightX + labelW, currentY + rowH);
    // Label
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text(totalsData[r][0], rightX + 4, currentY + 6);
    // Value (right aligned)
    doc.text(totalsData[r][1], rightX + rightW - 4, currentY + 6, { align: 'right' });
    currentY += rowH;
  }

  // TOTAL row with background
  doc.setFillColor(232, 232, 232);
  doc.rect(rightX, currentY, rightW, rowH + 2, 'F');
  doc.rect(rightX, currentY, rightW, rowH + 2, 'S');
  doc.line(rightX + labelW, currentY, rightX + labelW, currentY + rowH + 2);
  doc.setFont(undefined, 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL', rightX + 4, currentY + 7);
  doc.text('Rs. ' + fmt(total), rightX + rightW - 4, currentY + 7, { align: 'right' });

  // Signature section
  var sigY = Math.max(fY + boxHeight, currentY + rowH + 2) + 2;
  doc.setDrawColor(51);
  doc.rect(10, sigY, 190, 25);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(9);
  doc.line(130, sigY + 18, 190, sigY + 18);
  doc.text('Authorized Signature', 160, sigY + 23, { align: 'center' });

  return doc;
}

// Generate PDF from current form (for new estimate view)
function genPDFDoc() {
  var doc = new jsPDF();
  function fmt(n) { return parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  doc.setDrawColor(51); doc.setLineWidth(0.3); doc.rect(10, 10, 190, 277);

  var num = document.getElementById('estimate-number').value;
  var date = document.getElementById('estimate-date').value;
  var name = document.getElementById('bill-to-name').value;
  var addr = document.getElementById('bill-to-address').value;

  // Header row - start from top (no title)
  var headerY = 10;
  var headerH = 35;

  // Left header - Estimate No & Date
  doc.rect(10, headerY, 95, headerH);
  doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.text('Estimate No:', 14, headerY + 14);
  doc.setFont(undefined, 'normal'); doc.text(num, 48, headerY + 14);
  doc.setFont(undefined, 'bold'); doc.text('Date:', 14, headerY + 26);
  doc.setFont(undefined, 'normal'); doc.text(new Date(date).toLocaleDateString('en-GB'), 48, headerY + 26);

  // Right header - Bill To
  doc.setFillColor(240, 240, 240); doc.rect(105, headerY, 95, 8, 'F'); doc.rect(105, headerY, 95, 8, 'S');
  doc.setFont(undefined, 'bold'); doc.text('Bill To', 152, headerY + 6, { align: 'center' });
  doc.rect(105, headerY + 8, 95, headerH - 8, 'S'); doc.text(name, 109, headerY + 16);
  doc.setFont(undefined, 'normal'); doc.setFontSize(8);
  var addrText = doc.splitTextToSize(addr, 88);
  doc.text(addrText, 109, headerY + 23);

  var valid = [];
  var sub = 0, kg = 0;
  for (var i = 0; i < estimateItems.length; i++) {
    var item = estimateItems[i];
    if (item && item.quantity > 0) {
      valid.push(item);
      sub += parseFloat(item.amount) || 0;
      if (item.unit === 'kg') kg += parseFloat(item.quantity) || 0;
    }
  }

  var tableData = [];
  for (var i = 0; i < valid.length; i++) {
    var x = valid[i];
    tableData.push([i + 1, x.item_name + '\n' + (x.description || '') + (x.hsn_code ? ' | HSN: ' + x.hsn_code : ''), x.quantity, x.unit, fmt(x.rate), fmt(x.amount)]);
  }

  doc.autoTable({
    startY: headerY + headerH + 2,
    head: [['#', 'Item & Description', 'Qty', 'Unit', 'Rate', 'Amount']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [232, 232, 232],
      textColor: [0, 0, 0],
      fontSize: 10,
      fontStyle: 'bold',
      cellPadding: 4,
      halign: 'center'
    },
    styles: {
      fontSize: 9,
      lineColor: [51],
      lineWidth: 0.2,
      cellPadding: 4,
      overflow: 'linebreak',
      valign: 'middle'
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 68, halign: 'left' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 32, halign: 'right' },
      5: { cellWidth: 40, halign: 'right', fontStyle: 'bold' }
    },
    margin: { left: 10, right: 10, top: 20, bottom: 20 },
    showHead: 'everyPage',
    tableWidth: 190,
    didDrawPage: function(data) {
      doc.setDrawColor(51);
      doc.setLineWidth(0.3);
      doc.rect(10, 10, 190, 277);
    }
  });

  var fY = doc.lastAutoTable.finalY;
  var advEl = document.getElementById('advanced-payment');
  var prevBalEl = document.getElementById('previous-balance');
  var rndEl = document.getElementById('rounding');
  var adv = advEl ? parseFloat(advEl.value) || 0 : 0;
  var prevBal = prevBalEl ? parseFloat(prevBalEl.value) || 0 : 0;
  var rnd = rndEl ? parseFloat(rndEl.value) || 0 : 0;
  // Formula: Grand Total = Sub Total - Advance + Previous Balance + Rounding
  var total = sub - adv + prevBal + rnd;

  // Always show all 4 rows + TOTAL row
  var rightRows = 5;
  var rowHeight = 8;
  var boxHeight = (rightRows * rowHeight) + 12;

  // Left box - Total Qty and In Words
  doc.rect(10, fY, 95, boxHeight);
  doc.setFont(undefined, 'bold'); doc.setFontSize(10);
  doc.text('Total Qty: ' + kg.toFixed(2) + ' kg', 14, fY + 10);
  doc.text('In Words:', 14, fY + 22);
  doc.setFont(undefined, 'normal'); doc.setFontSize(9);
  var words = doc.splitTextToSize(numToWords(Math.abs(total)), 85);
  doc.text(words, 14, fY + 32);

  // Right box - Totals section
  doc.rect(105, fY, 95, boxHeight);
  var lineY = fY + 10;

  // Sub Total row
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text('Sub Total', 109, lineY);
  doc.setFont(undefined, 'bold');
  doc.text(fmt(sub), 196, lineY, { align: 'right' });
  lineY += rowHeight;

  // Advance row
  doc.setFont(undefined, 'normal');
  doc.text('Advance', 109, lineY);
  doc.text(fmt(adv), 196, lineY, { align: 'right' });
  lineY += rowHeight;

  // Previous Balance row (always show)
  doc.text('Previous Balance', 109, lineY);
  doc.text(fmt(prevBal), 196, lineY, { align: 'right' });
  lineY += rowHeight;

  // Rounding row
  doc.text('Rounding', 109, lineY);
  doc.text(fmt(rnd), 196, lineY, { align: 'right' });
  lineY += rowHeight;

  // TOTAL row with background
  doc.setFillColor(232, 232, 232);
  doc.rect(105, lineY - 4, 95, 12, 'F');
  doc.setFont(undefined, 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL', 109, lineY + 4);
  doc.text('Rs. ' + fmt(total), 196, lineY + 4, { align: 'right' });

  return doc;
}

// ============ DASHBOARD ============
window.editEstimate = async function(id) {
  var e = await ipcRenderer.invoke('get-estimate', id);
  if (!e) return;
  editingId = id;

  // Reset glow tracking for edited estimate
  resetGlowTracking();

  document.querySelectorAll('.nav-btn').forEach(function(b) {
    b.classList.remove('active');
    if (b.dataset.view === 'new-estimate') b.classList.add('active');
  });
  document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active'); });
  document.getElementById('new-estimate-view').classList.add('active');

  document.getElementById('estimate-number').value = e.estimate_number;
  document.getElementById('estimate-date').value = e.estimate_date;
  document.getElementById('bill-to-name').value = e.bill_to_name;
  document.getElementById('bill-to-address').value = e.bill_to_address || '';
  document.getElementById('advanced-payment').value = e.advanced_payment || '';
  document.getElementById('previous-balance').value = e.previous_balance || '';
  document.getElementById('rounding').value = e.rounding || '';

  estimateItems = e.items.map(function(x) {
    return { item_name: x.item_name, description: x.description || '', hsn_code: x.hsn_code || '', quantity: x.quantity, unit: x.unit, rate: x.rate, amount: x.amount };
  });

  renderTable();
};

window.downloadEstimatePDF = async function(id) {
  try {
    var e = await ipcRenderer.invoke('get-estimate', id);
    if (!e) {
      alert('Estimate not found');
      return;
    }

    // Generate PDF directly from estimate data
    var doc = genPDFFromEstimate(e);
    var pdfData = doc.output('datauristring').split(',')[1];
    var r = await ipcRenderer.invoke('save-pdf', pdfData, 'Estimate_' + e.estimate_number + '.pdf');
    if (r.success) {
      alert('PDF saved to:\n' + r.path);
    }
  } catch (err) {
    alert('PDF Error: ' + err.message);
  }
};

// Generate print HTML directly from estimate data
function genPrintHTMLFromEstimate(estimate) {
  function fmt(n) { return parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  var items = estimate.items || [];
  var sub = 0, kg = 0;
  var rows = '';
  for (var i = 0; i < items.length; i++) {
    var x = items[i];
    if (x.quantity > 0) {
      sub += parseFloat(x.amount) || 0;
      if (x.unit === 'kg') kg += parseFloat(x.quantity) || 0;
      var hsn = x.hsn_code ? ' | HSN: ' + x.hsn_code : '';
      rows += '<tr><td style="text-align:center;border:1px solid #333;padding:8px">' + (i + 1) + '</td>';
      rows += '<td style="border:1px solid #333;padding:8px"><strong>' + esc(x.item_name) + '</strong><br><span style="font-size:9px;color:#555">' + esc(x.description) + hsn + '</span></td>';
      rows += '<td style="text-align:center;border:1px solid #333;padding:8px">' + x.quantity + '</td>';
      rows += '<td style="text-align:center;border:1px solid #333;padding:8px">' + x.unit + '</td>';
      rows += '<td style="text-align:right;border:1px solid #333;padding:8px">' + fmt(x.rate) + '</td>';
      rows += '<td style="text-align:right;border:1px solid #333;padding:8px;font-weight:bold">' + fmt(x.amount) + '</td></tr>';
    }
  }

  var adv = parseFloat(estimate.advanced_payment) || 0;
  var prevBal = parseFloat(estimate.previous_balance) || 0;
  var rnd = parseFloat(estimate.rounding) || 0;
  // Formula: Grand Total = Sub Total - Advance + Previous Balance + Rounding
  var total = sub - adv + prevBal + rnd;

  var fmtDate = new Date(estimate.estimate_date).toLocaleDateString('en-GB');
  // Always show all rows including Previous Balance
  var rowspanVal = '6';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:10mm}body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:0}.c{border:1px solid #333}</style></head><body><div class="c"><table style="width:100%;border-collapse:collapse"><tr><td style="width:44%;padding:10px;border:1px solid #333"><strong>Estimate No:</strong> ' + estimate.estimate_number + '<br><strong>Date:</strong> ' + fmtDate + '</td><td style="width:56%;padding:10px;border:1px solid #333"><strong>Bill To:</strong><br>' + esc(estimate.bill_to_name) + '<br>' + esc(estimate.bill_to_address || '').replace(/,/g, '<br>') + '</td></tr></table><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#e8e8e8"><th style="border:1px solid #333;padding:8px;width:5%">#</th><th style="border:1px solid #333;padding:8px;text-align:left;width:39%">Item & Description</th><th style="border:1px solid #333;padding:8px;width:10%">Qty</th><th style="border:1px solid #333;padding:8px;width:8%">Unit</th><th style="border:1px solid #333;padding:8px;width:15%;text-align:right">Rate</th><th style="border:1px solid #333;padding:8px;width:23%;text-align:right">Amount</th></tr></thead><tbody>' + rows + '</tbody></table><table style="width:100%;border-collapse:collapse"><tr><td style="width:44%;padding:10px;border:1px solid #333;vertical-align:top" rowspan="' + rowspanVal + '"><strong>Total Qty:</strong> ' + kg.toFixed(2) + ' kg<br><strong>In Words:</strong> ' + numToWords(Math.abs(total)) + '</td><td style="border:1px solid #333;padding:6px 10px;width:33%">Sub Total</td><td style="border:1px solid #333;padding:6px 10px;text-align:right;width:23%">' + fmt(sub) + '</td></tr><tr><td style="border:1px solid #333;padding:6px 10px">Advance</td><td style="border:1px solid #333;padding:6px 10px;text-align:right">' + fmt(adv) + '</td></tr><tr><td style="border:1px solid #333;padding:6px 10px">Previous Balance</td><td style="border:1px solid #333;padding:6px 10px;text-align:right">' + fmt(prevBal) + '</td></tr><tr><td style="border:1px solid #333;padding:6px 10px">Rounding</td><td style="border:1px solid #333;padding:6px 10px;text-align:right">' + fmt(rnd) + '</td></tr><tr style="background:#e8e8e8;font-weight:bold"><td style="border:1px solid #333;padding:8px 10px">TOTAL</td><td style="border:1px solid #333;padding:8px 10px;text-align:right">₹' + fmt(total) + '</td></tr><tr><td colspan="2" style="border:1px solid #333;padding:15px;text-align:center"><div style="height:40px"></div><div style="border-top:1px solid #333;padding-top:5px;font-size:10px">Authorized Signature</div></td></tr></table></div></body></html>';
}

window.printEstimateFromDashboard = async function(id) {
  var e = await ipcRenderer.invoke('get-estimate', id);
  if (!e) return;

  // Generate print HTML directly from estimate data and print
  var html = genPrintHTMLFromEstimate(e);
  var win = window.open('', 'Print', 'width=800,height=600');
  win.document.write(html);
  win.document.close();
  win.onload = function() { win.print(); };
};

// Exports
Object.defineProperty(window, 'estimateItems', { get: function() { return estimateItems; }, set: function(v) { estimateItems = v; } });
window.generatePrintHTML = genPrintHTML;
window.genPrintHTMLFromEstimate = genPrintHTMLFromEstimate;
window.genPDFFromEstimate = genPDFFromEstimate;
window.renderTable = renderTable;
window.calcTotals = calcTotals;
window.resetForm = resetForm;
