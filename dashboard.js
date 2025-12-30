// Dashboard functionality

let currentFilter = 'all';
let currentPaymentStatus = 'all';
let customFrom = null;
let customTo = null;

// Load Dashboard
async function loadDashboard() {
  const estimates = await ipcRenderer.invoke('get-estimates');
  let filtered = filterEstimates(estimates, currentFilter, customFrom, customTo);

  // Filter by payment status
  filtered = filterByPaymentStatus(filtered, currentPaymentStatus);

  // Calculate statistics
  const stats = calculateStats(filtered);

  // Update stat cards
  document.getElementById('total-estimates').textContent = stats.count;
  document.getElementById('total-amount').textContent = `₹${stats.totalAmount.toFixed(2)}`;
  document.getElementById('advanced-payment-total').textContent = `₹${stats.advancedPayment.toFixed(2)}`;
  document.getElementById('pending-amount').textContent = `₹${stats.pendingAmount.toFixed(2)}`;

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
    totalAmount: 0,
    advancedPayment: 0,
    pendingAmount: 0
  };

  estimates.forEach(est => {
    const total = parseFloat(est.total) || 0;
    const advanced = parseFloat(est.advanced_payment) || 0;

    stats.totalAmount += total;
    stats.advancedPayment += advanced;
    stats.pendingAmount += (total - advanced);
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

    return `
      <tr>
        <td>${new Date(est.estimate_date).toLocaleDateString('en-IN')}</td>
        <td><strong>${est.estimate_number}</strong></td>
        <td>${est.bill_to_name}</td>
        <td>₹${total.toFixed(2)}</td>
        <td style="color: #48bb78;">₹${advanced.toFixed(2)}</td>
        <td style="color: ${pending > 0 ? '#f56565' : '#48bb78'}; font-weight: 600;">₹${pending.toFixed(2)}</td>
        <td><span class="status-badge ${statusClass}">${status}</span></td>
        <td>
          <button class="btn btn-small btn-edit" onclick="viewEstimateDetails(${est.id})">View</button>
          <button class="btn btn-small btn-danger" onclick="deleteEstimate(${est.id})">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
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
Date: ${new Date(estimate.estimate_date).toLocaleDateString('en-IN')}

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

// Export functions
window.loadDashboard = loadDashboard;
window.setupDashboardListeners = setupDashboardListeners;
window.viewEstimateDetails = viewEstimateDetails;
window.deleteEstimate = deleteEstimate;
window.deleteAllEstimates = deleteAllEstimates;
