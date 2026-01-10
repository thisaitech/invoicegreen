// Dashboard functionality

// Format currency in Indian format (with commas for lakhs/crores)
function formatIndianCurrency(amount) {
  var num = parseFloat(amount) || 0;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Format estimate number to 3 digits (EST-001 format)
function formatEstimateNumber(estNum) {
  if (!estNum) return estNum;
  var match = estNum.match(/EST-(\d+)/);
  if (match) {
    var num = parseInt(match[1]);
    return 'EST-' + String(num).padStart(3, '0');
  }
  return estNum;
}

var currentFilter = 'all';
var currentPaymentStatus = 'all';
var customFrom = null;
var customTo = null;
var currentSearchTerm = '';

// Load Dashboard
async function loadDashboard() {
  var estimates = await ipcRenderer.invoke('get-estimates');
  var filtered = filterEstimates(estimates, currentFilter, customFrom, customTo);

  // Calculate statistics for ALL filtered estimates (before payment status filter)
  var stats = calculateStats(filtered);

  // Update stat cards with status counts
  document.getElementById('total-estimates').textContent = stats.count;
  document.getElementById('pending-estimates').textContent = stats.pendingCount;
  document.getElementById('partial-estimates').textContent = stats.partialCount;
  document.getElementById('completed-estimates').textContent = stats.completedCount;

  // Now filter by payment status for the table display
  filtered = filterByPaymentStatus(filtered, currentPaymentStatus);

  // Load estimates table
  loadDashboardEstimates(filtered);
}

function filterByPaymentStatus(estimates, status) {
  if (status === 'all') return estimates;

  return estimates.filter(function(est) {
    var total = parseFloat(est.total) || 0;
    var advanced = parseFloat(est.advanced_payment) || 0;
    var pending = total - advanced;

    switch (status) {
      case 'completed':
        return pending <= 0;
      case 'partial':
        return advanced > 0 && pending > 0;
      case 'pending':
        return advanced === 0 && pending > 0;
      default:
        return true;
    }
  });
}

function filterEstimates(estimates, filter, from, to) {
  var now = new Date();
  now.setHours(0, 0, 0, 0);

  return estimates.filter(function(est) {
    var estDate = new Date(est.estimate_date);
    estDate.setHours(0, 0, 0, 0);

    switch (filter) {
      case 'today':
        return estDate.getTime() === now.getTime();

      case 'week':
        var weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return estDate >= weekAgo && estDate <= now;

      case 'month':
        var monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return estDate >= monthAgo && estDate <= now;

      case 'custom':
        if (from && to) {
          var fromDate = new Date(from);
          var toDate = new Date(to);
          fromDate.setHours(0, 0, 0, 0);
          toDate.setHours(23, 59, 59, 999);
          return estDate >= fromDate && estDate <= toDate;
        }
        return true;

      case 'all':
      default:
        return true;
    }
  });
}

function calculateStats(estimates) {
  var stats = {
    count: estimates.length,
    pendingCount: 0,
    partialCount: 0,
    completedCount: 0
  };

  for (var i = 0; i < estimates.length; i++) {
    var est = estimates[i];
    var total = parseFloat(est.total) || 0;
    var advanced = parseFloat(est.advanced_payment) || 0;
    var pending = total - advanced;

    if (pending <= 0) {
      stats.completedCount++;
    } else if (advanced > 0 && pending > 0) {
      stats.partialCount++;
    } else {
      stats.pendingCount++;
    }
  }

  return stats;
}

function loadDashboardEstimates(estimates) {
  var tbody = document.getElementById('dashboard-estimates');

  // Filter by search term
  var filtered = estimates;
  if (currentSearchTerm) {
    var searchLower = currentSearchTerm.toLowerCase();
    filtered = estimates.filter(function(est) {
      return est.bill_to_name.toLowerCase().indexOf(searchLower) !== -1 ||
        est.estimate_number.toLowerCase().indexOf(searchLower) !== -1;
    });
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><h3>No estimates found</h3><p>' + (currentSearchTerm ? 'Try a different search term' : 'Create your first estimate') + '</p></td></tr>';
    return;
  }

  var html = '';
  for (var i = 0; i < filtered.length; i++) {
    var est = filtered[i];
    var total = parseFloat(est.total) || 0;
    var advanced = parseFloat(est.advanced_payment) || 0;
    var pending = total - advanced;

    var status, statusClass;
    if (pending <= 0) {
      status = 'Completed';
      statusClass = 'status-completed';
    } else if (advanced > 0) {
      status = 'Partial';
      statusClass = 'status-partial';
    } else {
      status = 'Pending';
      statusClass = 'status-pending';
    }

    var dateObj = new Date(est.estimate_date);
    var formattedDate = dateObj.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    var displayEstNum = formatEstimateNumber(est.estimate_number);

    html += '<tr>';
    html += '<td style="white-space: nowrap; font-size: 12px;">' + formattedDate + '</td>';
    html += '<td style="white-space: nowrap;"><a href="#" class="estimate-link" onclick="openEstimatePreview(' + est.id + '); return false;"><strong>' + displayEstNum + '</strong></a></td>';
    html += '<td style="max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px;" title="' + est.bill_to_name + '">' + est.bill_to_name + '</td>';
    html += '<td style="text-align: right; white-space: nowrap; font-size: 12px;">₹' + total.toFixed(2) + '</td>';
    html += '<td style="text-align: right; color: #48bb78; white-space: nowrap; font-size: 12px;">₹' + advanced.toFixed(2) + '</td>';
    html += '<td style="text-align: right; color: ' + (pending > 0 ? '#f56565' : '#48bb78') + '; font-weight: 600; white-space: nowrap; font-size: 12px;">₹' + pending.toFixed(2) + '</td>';
    html += '<td style="text-align: center;"><span class="status-badge ' + statusClass + '" style="font-size: 10px; padding: 3px 6px;">' + status + '</span></td>';
    html += '<td style="text-align: center; white-space: nowrap;">';
    // All buttons in single row: Edit, PDF, Print, Comp (if pending), Del
    html += '<button class="btn btn-small btn-edit" onclick="editEstimate(' + est.id + ')" style="padding: 4px 6px; font-size: 10px; margin: 1px;">Edit</button>';
    html += '<button class="btn btn-small" onclick="downloadEstimatePDF(' + est.id + ')" style="background: #38a169; color: white; padding: 4px 6px; font-size: 10px; margin: 1px;">PDF</button>';
    html += '<button class="btn btn-small" onclick="printEstimateFromDashboard(' + est.id + ')" style="background: #3182ce; color: white; padding: 4px 6px; font-size: 10px; margin: 1px;">Print</button>';
    if (pending > 0) {
      html += '<button class="btn btn-small" onclick="markEstimateCompleted(' + est.id + ')" style="background: #48bb78; color: white; padding: 4px 6px; font-size: 10px; margin: 1px;">Comp</button>';
    }
    html += '<button class="btn btn-small btn-danger" onclick="deleteEstimate(' + est.id + ')" style="padding: 4px 6px; font-size: 10px; margin: 1px;">Del</button>';
    html += '</td>';
    html += '</tr>';
  }

  tbody.innerHTML = html;
}

// Delete single estimate
async function deleteEstimate(id) {
  var estimate = await ipcRenderer.invoke('get-estimate', id);
  if (!estimate) return;

  if (confirm('Delete estimate ' + estimate.estimate_number + '?\n\nCustomer: ' + estimate.bill_to_name + '\nTotal: ₹' + parseFloat(estimate.total).toFixed(2) + '\n\nThis cannot be undone!')) {
    await ipcRenderer.invoke('delete-estimate', id);
    loadDashboard();
  }
}

// Delete all estimates
async function deleteAllEstimates() {
  var estimates = await ipcRenderer.invoke('get-estimates');

  if (estimates.length === 0) {
    alert('No estimates to delete');
    return;
  }

  var confirmMsg = 'WARNING!\n\nDelete ALL ' + estimates.length + ' estimates?\n\nThis will permanently delete:\n- All estimate data\n- All payment records\n\nThis CANNOT be undone!\n\nAre you absolutely sure?';

  if (confirm(confirmMsg)) {
    var doubleConfirm = confirm('Final confirmation: Delete everything?');
    if (doubleConfirm) {
      await ipcRenderer.invoke('delete-all-estimates');
      loadDashboard();
      alert('All estimates deleted successfully');
    }
  }
}

// Search functionality
function setupSearch() {
  var searchInput = document.getElementById('estimate-search');
  if (searchInput) {
    searchInput.oninput = function(e) {
      currentSearchTerm = e.target.value;
      loadDashboard();
    };
  }
}

async function viewEstimateDetails(id) {
  var estimate = await ipcRenderer.invoke('get-estimate', id);
  if (!estimate) return;

  var pending = parseFloat(estimate.total || 0) - parseFloat(estimate.advanced_payment || 0);
  var itemsText = '';
  for (var i = 0; i < estimate.items.length; i++) {
    var item = estimate.items[i];
    itemsText += '  - ' + item.item_name + ' (' + item.quantity + ' ' + item.unit + ' @ ₹' + item.rate + ') = ₹' + item.amount.toFixed(2) + '\n';
  }

  var details = '\nESTIMATE: ' + estimate.estimate_number + '\nDate: ' + new Date(estimate.estimate_date).toLocaleDateString('en-GB') + '\n\nCUSTOMER:\n' + estimate.bill_to_name + '\n' + (estimate.bill_to_address || '') + '\n\nITEMS:\n' + itemsText + '\nTOTALS:\nSub Total: ₹' + parseFloat(estimate.sub_total).toFixed(2) + '\nAdvanced Payment: ₹' + parseFloat(estimate.advanced_payment || 0).toFixed(2) + '\nRounding: ₹' + parseFloat(estimate.rounding || 0).toFixed(2) + '\n──────────────────\nTotal: ₹' + parseFloat(estimate.total).toFixed(2) + '\nPending: ₹' + pending.toFixed(2) + '\n\nStatus: ' + (pending > 0 ? 'PENDING PAYMENT' : 'COMPLETED');

  alert(details.trim());
}

// Setup Dashboard Event Listeners
function setupDashboardListeners() {
  setupSearch();

  // Payment status filter buttons
  var statusBtns = document.querySelectorAll('.status-filter-btn');
  for (var i = 0; i < statusBtns.length; i++) {
    statusBtns[i].onclick = function(e) {
      var status = e.currentTarget.dataset.status;
      var allBtns = document.querySelectorAll('.status-filter-btn');
      for (var j = 0; j < allBtns.length; j++) {
        allBtns[j].classList.remove('active');
      }
      e.currentTarget.classList.add('active');
      currentPaymentStatus = status;
      loadDashboard();
    };
  }

  // Delete all button
  var deleteAllBtn = document.getElementById('delete-all-estimates-btn');
  if (deleteAllBtn) {
    deleteAllBtn.onclick = deleteAllEstimates;
  }

  // Filter buttons
  var filterBtns = document.querySelectorAll('.filter-btn');
  for (var i = 0; i < filterBtns.length; i++) {
    filterBtns[i].onclick = function(e) {
      var filter = e.currentTarget.dataset.filter;
      var allBtns = document.querySelectorAll('.filter-btn');
      for (var j = 0; j < allBtns.length; j++) {
        allBtns[j].classList.remove('active');
      }
      e.currentTarget.classList.add('active');
      currentFilter = filter;

      var customRange = document.getElementById('custom-date-range');
      if (filter === 'custom') {
        customRange.style.display = 'flex';
      } else {
        customRange.style.display = 'none';
        loadDashboard();
      }
    };
  }

  // Custom filter apply
  var applyBtn = document.getElementById('apply-custom-filter');
  if (applyBtn) {
    applyBtn.onclick = function() {
      customFrom = document.getElementById('filter-from').value;
      customTo = document.getElementById('filter-to').value;

      if (customFrom && customTo) {
        loadDashboard();
      } else {
        alert('Please select both From and To dates');
      }
    };
  }
}

// Generate preview HTML directly from estimate data
function generatePreviewHTML(estimate) {
  function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function fmt(n) { return parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function numToWords(num) {
    if (num === 0) return 'Zero Rupees Only';
    num = Math.round(num);
    var ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    var tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function conv(n) {
      if (n === 0) return '';
      var r = '';
      if (n >= 100) { r += ones[Math.floor(n / 100)] + ' Hundred '; n %= 100; }
      if (n >= 20) { r += tens[Math.floor(n / 10)] + ' '; n %= 10; }
      else if (n >= 10) { r += ones[n] + ' '; return r; }
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

  var items = estimate.items || [];
  var sub = parseFloat(estimate.sub_total) || 0;
  var adv = parseFloat(estimate.advanced_payment) || 0;
  var prevBal = parseFloat(estimate.previous_balance) || 0;
  var rnd = parseFloat(estimate.rounding) || 0;
  // Formula: Grand Total = Sub Total - Advance + Previous Balance + Rounding
  var total = sub - adv + prevBal + rnd;
  var kg = 0;

  var rows = '';
  for (var i = 0; i < items.length; i++) {
    var x = items[i];
    if (x.quantity > 0) {
      if (x.unit === 'kg') kg += x.quantity;
      var hsn = x.hsn_code ? ' | HSN: ' + x.hsn_code : '';
      rows += '<tr><td style="text-align:center;border:1px solid #333;padding:8px">' + (i + 1) + '</td>';
      rows += '<td style="border:1px solid #333;padding:8px"><strong>' + esc(x.item_name) + '</strong><br><span style="font-size:9px;color:#555">' + esc(x.description) + hsn + '</span></td>';
      rows += '<td style="text-align:center;border:1px solid #333;padding:8px">' + x.quantity + '</td>';
      rows += '<td style="text-align:center;border:1px solid #333;padding:8px">' + x.unit + '</td>';
      rows += '<td style="text-align:right;border:1px solid #333;padding:8px">' + fmt(x.rate) + '</td>';
      rows += '<td style="text-align:right;border:1px solid #333;padding:8px;font-weight:bold">' + fmt(x.amount) + '</td></tr>';
    }
  }

  var fmtDate = new Date(estimate.estimate_date).toLocaleDateString('en-GB');
  // Always show all rows including Previous Balance (rowspan = 6)
  var rowspanVal = '6';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>@page{size:A4;margin:10mm}body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:0}.c{border:1px solid #333}</style></head><body><div class="c"><table style="width:100%;border-collapse:collapse"><tr><td style="width:44%;padding:10px;border:1px solid #333"><strong>Estimate No:</strong> ' + estimate.estimate_number + '<br><strong>Date:</strong> ' + fmtDate + '</td><td style="width:56%;padding:10px;border:1px solid #333"><strong>Bill To:</strong><br>' + esc(estimate.bill_to_name) + '<br>' + esc(estimate.bill_to_address || '').replace(/,/g, '<br>') + '</td></tr></table><table style="width:100%;border-collapse:collapse"><thead><tr style="background:#e8e8e8"><th style="border:1px solid #333;padding:8px;width:5%">#</th><th style="border:1px solid #333;padding:8px;text-align:left;width:39%">Item & Description</th><th style="border:1px solid #333;padding:8px;width:10%">Qty</th><th style="border:1px solid #333;padding:8px;width:8%">Unit</th><th style="border:1px solid #333;padding:8px;width:15%;text-align:right">Rate</th><th style="border:1px solid #333;padding:8px;width:23%;text-align:right">Amount</th></tr></thead><tbody>' + rows + '</tbody></table><table style="width:100%;border-collapse:collapse"><tr><td style="width:44%;padding:10px;border:1px solid #333;vertical-align:top" rowspan="' + rowspanVal + '"><strong>Total Qty:</strong> ' + kg.toFixed(2) + ' kg<br><strong>In Words:</strong> ' + numToWords(Math.abs(total)) + '</td><td style="border:1px solid #333;padding:6px 10px;width:33%">Sub Total</td><td style="border:1px solid #333;padding:6px 10px;text-align:right;width:23%">' + fmt(sub) + '</td></tr><tr><td style="border:1px solid #333;padding:6px 10px">Advance</td><td style="border:1px solid #333;padding:6px 10px;text-align:right">' + fmt(adv) + '</td></tr><tr><td style="border:1px solid #333;padding:6px 10px">Previous Balance</td><td style="border:1px solid #333;padding:6px 10px;text-align:right">' + fmt(prevBal) + '</td></tr><tr><td style="border:1px solid #333;padding:6px 10px">Rounding</td><td style="border:1px solid #333;padding:6px 10px;text-align:right">' + fmt(rnd) + '</td></tr><tr style="background:#e8e8e8;font-weight:bold"><td style="border:1px solid #333;padding:8px 10px">TOTAL</td><td style="border:1px solid #333;padding:8px 10px;text-align:right">₹' + fmt(total) + '</td></tr><tr><td colspan="2" style="border:1px solid #333;padding:15px;text-align:center"><div style="height:40px"></div><div style="border-top:1px solid #333;padding-top:5px;font-size:10px">Authorized Signature</div></td></tr></table></div></body></html>';
}

// Open estimate preview modal with PDF view
async function openEstimatePreview(id) {
  var estimate = await ipcRenderer.invoke('get-estimate', id);
  if (!estimate) return;

  // Generate preview HTML directly from estimate data
  var printHTML = generatePreviewHTML(estimate);

  // Show preview modal with buttons
  var previewModal = document.getElementById('estimate-preview-modal');
  if (previewModal) {
    previewModal.dataset.estimateId = id;
    var previewFrame = document.getElementById('estimate-preview-frame');
    if (previewFrame) {
      previewFrame.srcdoc = printHTML;
    }
    previewModal.classList.add('active');
  }
}

// Mark estimate as completed (set advanced_payment = total so pending = 0)
async function markEstimateCompleted(id) {
  var estimate = await ipcRenderer.invoke('get-estimate', id);
  if (!estimate) return;

  var total = parseFloat(estimate.total) || 0;
  var currentAdvance = parseFloat(estimate.advanced_payment) || 0;
  var pending = total - currentAdvance;

  if (pending <= 0) {
    alert('This estimate is already completed.');
    return;
  }

  if (confirm('Mark estimate ' + estimate.estimate_number + ' as Completed?\n\nThis will set the advance payment to ₹' + total.toFixed(2) + ' (full amount).')) {
    // Update the estimate with advanced_payment = total
    var updatedData = {
      id: estimate.id,
      estimate_number: estimate.estimate_number,
      estimate_date: estimate.estimate_date,
      bill_to_name: estimate.bill_to_name,
      bill_to_address: estimate.bill_to_address || '',
      sub_total: estimate.sub_total,
      advanced_payment: total, // Set advance to total amount
      previous_balance: estimate.previous_balance || 0,
      rounding: estimate.rounding || 0,
      total: estimate.total,
      total_in_words: estimate.total_in_words,
      items: estimate.items
    };

    try {
      await ipcRenderer.invoke('update-estimate', updatedData);
      loadDashboard();
    } catch (e) {
      alert('Error updating estimate: ' + e.message);
    }
  }
}

// Export functions
window.loadDashboard = loadDashboard;
window.setupDashboardListeners = setupDashboardListeners;
window.viewEstimateDetails = viewEstimateDetails;
window.deleteEstimate = deleteEstimate;
window.deleteAllEstimates = deleteAllEstimates;
window.openEstimatePreview = openEstimatePreview;
window.markEstimateCompleted = markEstimateCompleted;
