const loginPanel = document.getElementById('adminLoginPanel');
const dashboardPanel = document.getElementById('adminDashboard');
const loginForm = document.getElementById('adminLoginForm');
const billingForm = document.getElementById('billingForm');
const loginStatus = document.getElementById('loginStatus');
const billingStatus = document.getElementById('billingStatus');
const logoutButton = document.getElementById('logoutButton');
const totalSubmissions = document.getElementById('totalSubmissions');
const emailedSubmissions = document.getElementById('emailedSubmissions');
const totalBills = document.getElementById('totalBills');
const submissionsList = document.getElementById('submissionsList');
const adminIdentity = document.getElementById('adminIdentity');
const passwordToggle = document.getElementById('passwordToggle');
const adminPasswordInput = document.getElementById('adminPassword');

function getApiBaseUrl() {
  const { protocol, hostname, port } = window.location;

  if (protocol === 'file:') {
    return 'http://localhost:3000';
  }

  if (
    (hostname === 'localhost' || hostname === '127.0.0.1') &&
    port &&
    port !== '3000'
  ) {
    return `${window.location.protocol}//${hostname}:3000`;
  }

  return '';
}

const apiBaseUrl = getApiBaseUrl();

function setVisibility(isLoggedIn) {
  loginPanel.hidden = isLoggedIn;
  dashboardPanel.hidden = !isLoggedIn;
}

function renderSubmissions(items) {
  submissionsList.innerHTML = '';

  if (!items.length) {
    submissionsList.innerHTML = '<li class="submission-empty">No enquiries have been received yet.</li>';
    return;
  }

  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'submission-item';
    li.innerHTML = `
      <div class="submission-head">
        <strong>${item.name}</strong>
        <span>${new Date(item.createdAt).toLocaleString('en-IN')}</span>
      </div>
      <p>${item.email} | ${item.phone}</p>
      <p>${item.message}</p>
      <span class="submission-pill ${item.emailed ? 'sent' : 'pending'}">
        ${item.emailed ? 'Email sent' : 'Saved locally'}
      </span>
    `;
    submissionsList.appendChild(li);
  });
}

async function loadDashboard() {
  const response = await fetch(`${apiBaseUrl}/api/admin/dashboard`, {
    credentials: 'include',
  });
  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || 'Unable to load the dashboard.');
  }

  totalSubmissions.textContent = result.summary.totalSubmissions;
  emailedSubmissions.textContent = result.summary.emailedSubmissions;
  totalBills.textContent = result.summary.totalBills;
  renderSubmissions(result.recentSubmissions);
}

async function checkSession() {
  try {
    const response = await fetch(`${apiBaseUrl}/api/admin/me`, {
      credentials: 'include',
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      setVisibility(false);
      return;
    }

    adminIdentity.textContent = result.adminEmail;
    setVisibility(true);
    await loadDashboard();
  } catch (error) {
    console.error(error);
    setVisibility(false);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginStatus.className = 'form-status';
  loginStatus.textContent = 'Signing in...';

  const payload = {
    email: document.getElementById('adminEmail').value.trim(),
    password: document.getElementById('adminPassword').value,
  };

  try {
    const response = await fetch(`${apiBaseUrl}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Login failed.');
    }

    adminIdentity.textContent = payload.email;
    loginStatus.className = 'form-status success';
    loginStatus.textContent = 'Login successful.';
    setVisibility(true);
    await loadDashboard();
    loginForm.reset();
  } catch (error) {
    loginStatus.className = 'form-status error';
    loginStatus.textContent = error.message;
  }
});

billingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  billingStatus.className = 'form-status';
  billingStatus.textContent = 'Generating PDF bill...';

  const payload = {
    billDate: document.getElementById('billDate').value,
    memberName: document.getElementById('memberName').value.trim(),
    memberAddress: document.getElementById('memberAddress').value.trim(),
    carePlanName: document.getElementById('carePlanName').value.trim(),
    membershipDuration: document.getElementById('membershipDuration').value.trim(),
    doctorVisits: document.getElementById('doctorVisits').value.trim(),
    membershipAmount: document.getElementById('membershipAmount').value.trim(),
    escortCharges: document.getElementById('escortCharges').value.trim(),
    totalAmount: document.getElementById('totalAmount').value.trim(),
    modeOfPayment: document.getElementById('modeOfPayment').value.trim(),
    serviceTenure: document.getElementById('serviceTenure').value.trim(),
  };

  try {
    const response = await fetch(`${apiBaseUrl}/api/admin/bills/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const result = await response.json();
      throw new Error(result.message || 'Bill generation failed.');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\..+/, '')
      .replace('T', '_');
    const safeName = (payload.memberName || 'Customer')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    link.download = `${safeName || 'Customer'}_${timestamp}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    billingStatus.className = 'form-status success';
    billingStatus.textContent = 'Bill generated and downloaded successfully.';
    billingForm.reset();
    await loadDashboard();
  } catch (error) {
    billingStatus.className = 'form-status error';
    billingStatus.textContent = error.message;
  }
});

logoutButton.addEventListener('click', async () => {
  await fetch(`${apiBaseUrl}/api/admin/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  setVisibility(false);
});

if (passwordToggle && adminPasswordInput) {
  passwordToggle.addEventListener('click', () => {
    const shouldShow = adminPasswordInput.type === 'password';
    adminPasswordInput.type = shouldShow ? 'text' : 'password';
    passwordToggle.textContent = shouldShow ? 'Hide' : 'Show';
    passwordToggle.setAttribute('aria-pressed', String(shouldShow));
  });
}

checkSession();
