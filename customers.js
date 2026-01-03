// Customer Management

let customers = [];

// Load all customers with their payment stats
async function loadCustomers() {
  customers = await ipcRenderer.invoke('get-customers');
  const estimates = await ipcRenderer.invoke('get-estimates');

  // Calculate stats for each customer
  const customerStats = customers.map(customer => {
    const custEstimates = estimates.filter(e => e.bill_to_name === customer.name);

    const stats = {
      ...customer,
      totalEstimates: custEstimates.length,
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0
    };

    custEstimates.forEach(est => {
      const total = parseFloat(est.total) || 0;
      const advanced = parseFloat(est.advanced_payment) || 0;

      stats.totalAmount += total;
      stats.paidAmount += advanced;
      stats.pendingAmount += (total - advanced);
    });

    return stats;
  });

  renderCustomersTable(customerStats);
}

function renderCustomersTable(customerStats) {
  const tbody = document.getElementById('customers-tbody');

  if (customerStats.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><h3>No customers yet</h3><p>Add your first customer</p></td></tr>';
    return;
  }

  tbody.innerHTML = customerStats.map(customer => `
    <tr>
      <td style="text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><strong>${customer.name}</strong></td>
      <td style="text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${customer.address || ''}">${(customer.address || '').substring(0, 50)}${customer.address && customer.address.length > 50 ? '...' : ''}</td>
      <td style="text-align: center;">${customer.totalEstimates}</td>
      <td style="text-align: right;">₹${customer.totalAmount.toFixed(2)}</td>
      <td style="text-align: right; color: #48bb78;">₹${customer.paidAmount.toFixed(2)}</td>
      <td style="text-align: right; color: ${customer.pendingAmount > 0 ? '#f56565' : '#48bb78'}; font-weight: 600;">₹${customer.pendingAmount.toFixed(2)}</td>
      <td style="text-align: center; white-space: nowrap;">
        <button class="btn btn-edit btn-small" onclick="editCustomer(${customer.id})">Edit</button>
        <button class="btn btn-danger btn-small" onclick="deleteCustomer(${customer.id})">Del</button>
      </td>
    </tr>
  `).join('');
}

// Open Customer Modal
function openCustomerModal(customer = null) {
  const modal = document.getElementById('customer-modal');
  const title = document.getElementById('customer-modal-title');

  // Get all input elements
  const nameInput = document.getElementById('modal-customer-name');
  const addressInput = document.getElementById('modal-customer-address');
  const cityInput = document.getElementById('modal-customer-city');
  const stateInput = document.getElementById('modal-customer-state');
  const countryInput = document.getElementById('modal-customer-country');
  const phoneInput = document.getElementById('modal-customer-phone');
  const emailInput = document.getElementById('modal-customer-email');
  const vehicleInput = document.getElementById('modal-customer-vehicle');
  const gstnInput = document.getElementById('modal-customer-gstn');
  const balanceInput = document.getElementById('modal-customer-opening-balance');

  // Ensure all inputs are editable (remove any readonly/disabled attributes)
  const allInputs = [nameInput, addressInput, cityInput, stateInput, countryInput, phoneInput, emailInput, vehicleInput, gstnInput, balanceInput];
  allInputs.forEach(input => {
    if (input) {
      input.removeAttribute('readonly');
      input.removeAttribute('disabled');
    }
  });

  if (customer) {
    title.textContent = 'Edit Customer';
    document.getElementById('modal-customer-id').value = customer.id;
    nameInput.value = customer.name;
    addressInput.value = customer.address || '';
    cityInput.value = customer.city || '';
    stateInput.value = customer.state || 'Tamil Nadu';
    countryInput.value = customer.country || 'India';
    phoneInput.value = customer.phone || '';
    emailInput.value = customer.email || '';
    vehicleInput.value = customer.vehicle || '';
    gstnInput.value = customer.gstn || '';
    balanceInput.value = customer.opening_balance || '';
  } else {
    title.textContent = 'Add Customer';
    document.getElementById('modal-customer-id').value = '';
    nameInput.value = '';
    addressInput.value = '';
    cityInput.value = '';
    stateInput.value = 'Tamil Nadu';
    countryInput.value = 'India';
    phoneInput.value = '';
    emailInput.value = '';
    vehicleInput.value = '';
    gstnInput.value = '';
    balanceInput.value = '';
  }

  modal.classList.add('active');

  // Focus on the name input after modal is visible
  setTimeout(() => nameInput.focus(), 100);
}

function closeCustomerModal() {
  document.getElementById('customer-modal').classList.remove('active');
}

// Save Customer
async function saveCustomer() {
  const id = document.getElementById('modal-customer-id').value;
  const customer = {
    name: document.getElementById('modal-customer-name').value,
    address: document.getElementById('modal-customer-address').value || '',
    city: document.getElementById('modal-customer-city').value || '',
    state: document.getElementById('modal-customer-state').value || 'Tamil Nadu',
    country: document.getElementById('modal-customer-country').value || 'India',
    phone: document.getElementById('modal-customer-phone').value || '',
    email: document.getElementById('modal-customer-email').value || '',
    vehicle: document.getElementById('modal-customer-vehicle').value || '',
    gstn: document.getElementById('modal-customer-gstn').value || '',
    opening_balance: parseFloat(document.getElementById('modal-customer-opening-balance').value) || 0
  };

  if (!customer.name) {
    alert('Please enter customer name');
    return;
  }

  if (id) {
    customer.id = parseInt(id);
    await ipcRenderer.invoke('update-customer', customer);
  } else {
    await ipcRenderer.invoke('add-customer', customer);
  }

  closeCustomerModal();
  loadCustomers();
}

async function editCustomer(id) {
  const customer = customers.find(c => c.id === id);
  if (customer) {
    openCustomerModal(customer);
  }
}

async function deleteCustomer(id) {
  if (confirm('Are you sure you want to delete this customer? This will not delete their estimates.')) {
    await ipcRenderer.invoke('delete-customer', id);
    loadCustomers();
  }
}

async function viewCustomerDetails(id) {
  const customer = customers.find(c => c.id === id);
  const estimates = await ipcRenderer.invoke('get-estimates');
  const custEstimates = estimates.filter(e => e.bill_to_name === customer.name);

  let totalAmount = 0;
  let paidAmount = 0;

  custEstimates.forEach(est => {
    totalAmount += parseFloat(est.total) || 0;
    paidAmount += parseFloat(est.advanced_payment) || 0;
  });

  const pendingAmount = totalAmount - paidAmount;

  const details = `
Customer: ${customer.name}
Address: ${customer.address || 'N/A'}
Phone: ${customer.phone || 'N/A'}
Email: ${customer.email || 'N/A'}

═══════════════════════════════════
PAYMENT SUMMARY
═══════════════════════════════════
Total Estimates: ${custEstimates.length}
Total Amount: ₹${totalAmount.toFixed(2)}
Advanced Payments: ₹${paidAmount.toFixed(2)}
Pending Amount: ₹${pendingAmount.toFixed(2)}

Recent Estimates:
${custEstimates.slice(0, 5).map(e =>
  `- ${e.estimate_number}: ₹${parseFloat(e.total).toFixed(2)} (Paid: ₹${parseFloat(e.advanced_payment || 0).toFixed(2)})`
).join('\n')}
  `;

  alert(details.trim());
}

// Setup Customer Event Listeners
function setupCustomerListeners() {
  const addBtn = document.getElementById('add-customer-btn');
  const saveBtn = document.getElementById('save-customer-btn');

  if (addBtn) {
    addBtn.addEventListener('click', () => openCustomerModal());
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', saveCustomer);
  }

  // Close modals
  document.querySelectorAll('.close').forEach(el => {
    el.addEventListener('click', () => {
      closeCustomerModal();
      document.getElementById('email-modal').classList.remove('active');
      document.getElementById('print-preview-modal').classList.remove('active');
    });
  });
}

// Export functions
window.loadCustomers = loadCustomers;
window.setupCustomerListeners = setupCustomerListeners;
window.editCustomer = editCustomer;
window.deleteCustomer = deleteCustomer;
window.viewCustomerDetails = viewCustomerDetails;
