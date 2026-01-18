// Dashboard functionality

// Format currency in Indian format (with commas for lakhs/crores)
function formatIndianCurrency(amount) {
  const num = parseFloat(amount) || 0;
  return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Format estimate number to 3 digits (EST-001 format)
function formatEstimateNumber(estNum) {
  if (!estNum) return estNum;
  // Extract number from EST-XXXXXX format and convert to 3 digits
  const match = estNum.match(/EST-(\d+)/);
  if (match) {
    const num = parseInt(match[1]);
    return `EST-${String(num).padStart(3, '0')}`;
  }
  return estNum;
}

let currentFilter = 'all';
let currentPaymentStatus = 'all';
let customFrom = null;
let customTo = null;

// Load Dashboard
async function loadDashboard() {
  const estimates = await ipcRenderer.invoke('get-estimates');
  let filtered = filterEstimates(estimates, currentFilter, customFrom, customTo);

  // Calculate statistics for ALL filtered estimates (before payment status filter)
  const stats = calculateStats(filtered);

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

  return estimates.filter(est => {
    const total = parseFloat(est.total) || 0;
    const advanced = parseFloat(est.advanced_payment) || 0;
    const pending = total - advanced;

    switch (status) {
      case 'completed':
        return pending <= 0; // Fully paid
      case 'partial':
        return advanced > 0 && pending > 0; // Some payment made, but not complete
      case 'pending':
        return advanced === 0 && pending > 0; // No payment yet
      default:
        return true;
    }
  });
}

function filterEstimates(estimates, filter, from, to) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return estimates.filter(est => {
    const estDate = new Date(est.estimate_date);
    estDate.setHours(0, 0, 0, 0);

    switch (filter) {
      case 'today':
        return estDate.getTime() === now.getTime();

      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return estDate >= weekAgo && estDate <= now;

      case 'month':
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return estDate >= monthAgo && estDate <= now;

      case 'custom':
        if (from && to) {
          const fromDate = new Date(from);
          const toDate = new Date(to);
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
  const stats = {
    count: estimates.length,
    pendingCount: 0,
    partialCount: 0,
    completedCount: 0
  };

  estimates.forEach(est => {
    const total = parseFloat(est.total) || 0;
    const advanced = parseFloat(est.advanced_payment) || 0;
    const pending = total - advanced;

    if (pending <= 0) {
      // Fully paid - completed
      stats.completedCount++;
    } else if (advanced > 0 && pending > 0) {
      // Some payment made - partial
      stats.partialCount++;
    } else {
      // No payment yet - pending
      stats.pendingCount++;
    }
  });

  return stats;
}

let currentSearchTerm = '';

function loadDashboardEstimates(estimates) {
  const tbody = document.getElementById('dashboard-estimates');

  // Filter by search term
  let filtered = estimates;
  if (currentSearchTerm) {
    const searchLower = currentSearchTerm.toLowerCase();
    filtered = estimates.filter(est =>
      est.bill_to_name.toLowerCase().includes(searchLower) ||
      est.estimate_number.toLowerCase().includes(searchLower)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><h3>No estimates found</h3><p>${currentSearchTerm ? 'Try a different search term' : 'Create your first estimate'}</p></td></tr>`;
    return;
  }

  // Show ALL estimates (not just 10)
  tbody.innerHTML = filtered.map(est => {
    const total = parseFloat(est.total) || 0;
    const advanced = parseFloat(est.advanced_payment) || 0;
    const pending = total - advanced;

    let status, statusClass;
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

    // Format date as DD/MM/YYYY
    const dateObj = new Date(est.estimate_date);
    const formattedDate = dateObj.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    const displayEstNum = formatEstimateNumber(est.estimate_number);

    return `
      <tr>
        <td style="white-space: nowrap; font-size: 12px;">${formattedDate}</td>
        <td style="white-space: nowrap;"><a href="#" class="estimate-link" onclick="openEstimatePreview(${est.id}); return false;"><strong>${displayEstNum}</strong></a></td>
        <td style="max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px;" title="${est.bill_to_name}">${est.bill_to_name}</td>
        <td style="text-align: right; white-space: nowrap; font-size: 12px;">₹${total.toFixed(2)}</td>
        <td style="text-align: right; color: #48bb78; white-space: nowrap; font-size: 12px;">₹${advanced.toFixed(2)}</td>
        <td style="text-align: right; color: ${pending > 0 ? '#f56565' : '#48bb78'}; font-weight: 600; white-space: nowrap; font-size: 12px;">₹${pending.toFixed(2)}</td>
        <td style="text-align: center;"><span class="status-badge ${statusClass}" style="font-size: 10px; padding: 3px 6px;">${status}</span></td>
        <td style="text-align: center;">
          <div style="margin-bottom: 3px;">
            <button class="btn btn-small btn-edit" onclick="editEstimate(${est.id})" style="padding: 4px 8px; font-size: 11px;">Edit</button>
            <button class="btn btn-small" onclick="downloadEstimatePDF(${est.id})" style="background: #38a169; color: white; padding: 4px 8px; font-size: 11px;">PDF</button>
            <button class="btn btn-small" onclick="printEstimateFromDashboard(${est.id})" style="background: #3182ce; color: white; padding: 4px 8px; font-size: 11px;">Print</button>
          </div>
          <div>
            ${status !== 'Completed' ? `<button class="btn btn-small" onclick="markEstimateCompleted(${est.id})" style="background: #9f7aea; color: white; padding: 4px 8px; font-size: 11px;">Completed</button>` : ''}
            <button class="btn btn-small btn-danger" onclick="deleteEstimate(${est.id})" style="padding: 4px 8px; font-size: 11px;">Del</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Mark estimate as completed (set advanced_payment = total)
async function markEstimateCompleted(id) {
  const estimate = await ipcRenderer.invoke('get-estimate', id);
  if (!estimate) return;

  if (confirm(`Mark estimate ${estimate.estimate_number} as COMPLETED?\n\nThis will set Advanced Payment = Total (₹${parseFloat(estimate.total).toFixed(2)})`)) {
    await ipcRenderer.invoke('mark-estimate-completed', id);
    loadDashboard();
  }
}

// Delete single estimate
async function deleteEstimate(id) {
  const estimate = await ipcRenderer.invoke('get-estimate', id);
  if (!estimate) return;

  if (confirm(`Delete estimate ${estimate.estimate_number}?\n\nCustomer: ${estimate.bill_to_name}\nTotal: ₹${parseFloat(estimate.total).toFixed(2)}\n\nThis cannot be undone!`)) {
    await ipcRenderer.invoke('delete-estimate', id);
    loadDashboard();
  }
}

// Delete all estimates
async function deleteAllEstimates() {
  const estimates = await ipcRenderer.invoke('get-estimates');

  if (estimates.length === 0) {
    alert('No estimates to delete');
    return;
  }

  const confirmMsg = `⚠️ WARNING ⚠️\n\nDelete ALL ${estimates.length} estimates?\n\nThis will permanently delete:\n- All estimate data\n- All payment records\n\nThis CANNOT be undone!\n\nAre you absolutely sure?`;

  if (confirm(confirmMsg)) {
    const doubleConfirm = confirm('Final confirmation: Delete everything?');
    if (doubleConfirm) {
      await ipcRenderer.invoke('delete-all-estimates');
      loadDashboard();
      alert('All estimates deleted successfully');
    }
  }
}

// Search functionality
function setupSearch() {
  const searchInput = document.getElementById('estimate-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearchTerm = e.target.value;
      loadDashboard();
    });
  }
}

async function viewEstimateDetails(id) {
  const estimate = await ipcRenderer.invoke('get-estimate', id);
  if (!estimate) return;

  const pending = parseFloat(estimate.total || 0) - parseFloat(estimate.advanced_payment || 0);
  const itemsText = estimate.items.map(item =>
    `  - ${item.item_name} (${item.quantity} ${item.unit} @ ₹${item.rate}) = ₹${item.amount.toFixed(2)}`
  ).join('\n');

  const details = `
ESTIMATE: ${estimate.estimate_number}
Date: ${new Date(estimate.estimate_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}

CUSTOMER:
${estimate.bill_to_name}
${estimate.bill_to_address || ''}

ITEMS:
${itemsText}

TOTALS:
Sub Total: ₹${parseFloat(estimate.sub_total).toFixed(2)}
Advanced Payment: ₹${parseFloat(estimate.advanced_payment || 0).toFixed(2)}
Rounding: ₹${parseFloat(estimate.rounding || 0).toFixed(2)}
──────────────────
Total: ₹${parseFloat(estimate.total).toFixed(2)}
Pending: ₹${pending.toFixed(2)}

Status: ${pending > 0 ? 'PENDING PAYMENT' : 'COMPLETED'}
  `;

  alert(details.trim());
}

// Setup Dashboard Event Listeners
function setupDashboardListeners() {
  // Setup search
  setupSearch();

  // Payment status filter buttons
  document.querySelectorAll('.status-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const status = e.currentTarget.dataset.status;

      // Update active state
      document.querySelectorAll('.status-filter-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');

      currentPaymentStatus = status;
      loadDashboard();
    });
  });

  // Delete all button
  const deleteAllBtn = document.getElementById('delete-all-estimates-btn');
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', deleteAllEstimates);
  }

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const filter = e.currentTarget.dataset.filter;

      // Update active state
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');

      currentFilter = filter;

      // Show/hide custom date range
      const customRange = document.getElementById('custom-date-range');
      if (filter === 'custom') {
        customRange.style.display = 'flex';
      } else {
        customRange.style.display = 'none';
        loadDashboard();
      }
    });
  });

  // Custom filter apply
  const applyBtn = document.getElementById('apply-custom-filter');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      customFrom = document.getElementById('filter-from').value;
      customTo = document.getElementById('filter-to').value;

      if (customFrom && customTo) {
        loadDashboard();
      } else {
        alert('Please select both From and To dates');
      }
    });
  }
}

// Edit estimate - load into new estimate form
async function editEstimate(id) {
  const estimate = await ipcRenderer.invoke('get-estimate', id);
  if (!estimate) return;

  // Set editing mode - this tells saveEstimate to update instead of create
  editingEstimateId = id;

  // Switch to new estimate view
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.view === 'new-estimate') btn.classList.add('active');
  });
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('new-estimate-view').classList.add('active');

  // Fill form with estimate data
  document.getElementById('estimate-number').value = estimate.estimate_number;
  document.getElementById('estimate-date').value = estimate.estimate_date;
  document.getElementById('bill-to-name').value = estimate.bill_to_name;
  document.getElementById('bill-to-address').value = estimate.bill_to_address || '';
  document.getElementById('advanced-payment').value = estimate.advanced_payment || '';
  document.getElementById('previous-balance').value = estimate.previous_balance || '';
  document.getElementById('rounding').value = estimate.rounding || '';

  // Load items
  currentEstimateItems = estimate.items.map(item => ({
    item_name: item.item_name,
    description: item.description || '',
    hsn_code: item.hsn_code || '',
    quantity: item.quantity,
    unit: item.unit,
    rate: item.rate,
    amount: item.amount
  }));

  renderItemsTable();
  updateTotals();
}

// Download PDF from dashboard
async function downloadEstimatePDF(id) {
  const estimate = await ipcRenderer.invoke('get-estimate', id);
  if (!estimate) return;

  // Store current items and load estimate items temporarily
  const savedItems = [...currentEstimateItems];
  const savedNumber = document.getElementById('estimate-number').value;
  const savedDate = document.getElementById('estimate-date').value;
  const savedName = document.getElementById('bill-to-name').value;
  const savedAddress = document.getElementById('bill-to-address').value;
  const savedAdvance = document.getElementById('advanced-payment').value;
  const savedPrevBalance = document.getElementById('previous-balance').value;
  const savedRounding = document.getElementById('rounding').value;

  // Set estimate data
  document.getElementById('estimate-number').value = estimate.estimate_number;
  document.getElementById('estimate-date').value = estimate.estimate_date;
  document.getElementById('bill-to-name').value = estimate.bill_to_name;
  document.getElementById('bill-to-address').value = estimate.bill_to_address || '';
  document.getElementById('advanced-payment').value = estimate.advanced_payment || '';
  document.getElementById('previous-balance').value = estimate.previous_balance || '';
  document.getElementById('rounding').value = estimate.rounding || '';

  currentEstimateItems = estimate.items.map(item => ({
    item_name: item.item_name,
    description: item.description || '',
    hsn_code: item.hsn_code || '',
    quantity: item.quantity,
    unit: item.unit,
    rate: item.rate,
    amount: item.amount
  }));

  // Generate and download PDF
  await downloadPDF();

  // Restore original data
  document.getElementById('estimate-number').value = savedNumber;
  document.getElementById('estimate-date').value = savedDate;
  document.getElementById('bill-to-name').value = savedName;
  document.getElementById('bill-to-address').value = savedAddress;
  document.getElementById('advanced-payment').value = savedAdvance;
  document.getElementById('previous-balance').value = savedPrevBalance;
  document.getElementById('rounding').value = savedRounding;
  currentEstimateItems = savedItems;
}

// Print from dashboard
async function printEstimateFromDashboard(id) {
  const estimate = await ipcRenderer.invoke('get-estimate', id);
  if (!estimate) return;

  // Store current items and load estimate items temporarily
  const savedItems = [...currentEstimateItems];
  const savedNumber = document.getElementById('estimate-number').value;
  const savedDate = document.getElementById('estimate-date').value;
  const savedName = document.getElementById('bill-to-name').value;
  const savedAddress = document.getElementById('bill-to-address').value;
  const savedAdvance = document.getElementById('advanced-payment').value;
  const savedPrevBalance = document.getElementById('previous-balance').value;
  const savedRounding = document.getElementById('rounding').value;

  // Set estimate data
  document.getElementById('estimate-number').value = estimate.estimate_number;
  document.getElementById('estimate-date').value = estimate.estimate_date;
  document.getElementById('bill-to-name').value = estimate.bill_to_name;
  document.getElementById('bill-to-address').value = estimate.bill_to_address || '';
  document.getElementById('advanced-payment').value = estimate.advanced_payment || '';
  document.getElementById('previous-balance').value = estimate.previous_balance || '';
  document.getElementById('rounding').value = estimate.rounding || '';

  currentEstimateItems = estimate.items.map(item => ({
    item_name: item.item_name,
    description: item.description || '',
    hsn_code: item.hsn_code || '',
    quantity: item.quantity,
    unit: item.unit,
    rate: item.rate,
    amount: item.amount
  }));

  // Print
  await printEstimate();

  // Restore original data
  document.getElementById('estimate-number').value = savedNumber;
  document.getElementById('estimate-date').value = savedDate;
  document.getElementById('bill-to-name').value = savedName;
  document.getElementById('bill-to-address').value = savedAddress;
  document.getElementById('advanced-payment').value = savedAdvance;
  document.getElementById('previous-balance').value = savedPrevBalance;
  document.getElementById('rounding').value = savedRounding;
  currentEstimateItems = savedItems;
}

// Open estimate preview modal with PDF view
async function openEstimatePreview(id) {
  const estimate = await ipcRenderer.invoke('get-estimate', id);
  if (!estimate) return;

  // Store current items and load estimate items temporarily
  const savedItems = [...currentEstimateItems];
  const savedNumber = document.getElementById('estimate-number').value;
  const savedDate = document.getElementById('estimate-date').value;
  const savedName = document.getElementById('bill-to-name').value;
  const savedAddress = document.getElementById('bill-to-address').value;
  const savedAdvance = document.getElementById('advanced-payment').value;
  const savedPrevBalance = document.getElementById('previous-balance').value;
  const savedRounding = document.getElementById('rounding').value;

  // Set estimate data
  document.getElementById('estimate-number').value = estimate.estimate_number;
  document.getElementById('estimate-date').value = estimate.estimate_date;
  document.getElementById('bill-to-name').value = estimate.bill_to_name;
  document.getElementById('bill-to-address').value = estimate.bill_to_address || '';
  document.getElementById('advanced-payment').value = estimate.advanced_payment || '';
  document.getElementById('previous-balance').value = estimate.previous_balance || '';
  document.getElementById('rounding').value = estimate.rounding || '';

  currentEstimateItems = estimate.items.map(item => ({
    item_name: item.item_name,
    description: item.description || '',
    hsn_code: item.hsn_code || '',
    quantity: item.quantity,
    unit: item.unit,
    rate: item.rate,
    amount: item.amount
  }));

  // Show preview modal with buttons
  const previewModal = document.getElementById('estimate-preview-modal');
  if (previewModal) {
    // Store estimate ID for actions
    previewModal.dataset.estimateId = id;

    // Generate print HTML for preview
    const printHTML = generatePrintHTML();
    const previewFrame = document.getElementById('estimate-preview-frame');
    if (previewFrame) {
      previewFrame.srcdoc = printHTML;
    }

    previewModal.classList.add('active');
  } else {
    // Fallback - show print preview
    showPrintPreview();
  }

  // Restore original data after preview is shown
  setTimeout(() => {
    document.getElementById('estimate-number').value = savedNumber;
    document.getElementById('estimate-date').value = savedDate;
    document.getElementById('bill-to-name').value = savedName;
    document.getElementById('bill-to-address').value = savedAddress;
    document.getElementById('advanced-payment').value = savedAdvance;
    document.getElementById('previous-balance').value = savedPrevBalance;
    document.getElementById('rounding').value = savedRounding;
    currentEstimateItems = savedItems;
  }, 100);
}

// Export functions
window.loadDashboard = loadDashboard;
window.setupDashboardListeners = setupDashboardListeners;
window.viewEstimateDetails = viewEstimateDetails;
window.deleteEstimate = deleteEstimate;
window.deleteAllEstimates = deleteAllEstimates;
window.editEstimate = editEstimate;
window.downloadEstimatePDF = downloadEstimatePDF;
window.printEstimateFromDashboard = printEstimateFromDashboard;
window.openEstimatePreview = openEstimatePreview;
window.markEstimateCompleted = markEstimateCompleted;
