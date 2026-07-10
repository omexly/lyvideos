// Admin Dashboard - Frontend Logic
let token = localStorage.getItem('token') || null;
let socket = null;

// Auth check
if (!token) {
  alert('يجب تسجيل الدخول كمدير للوصول لهذه الصفحة.');
  window.location.href = '/';
}

// DOM Elements
const statsOnline = document.getElementById('stats-online');
const statsRooms = document.getElementById('stats-rooms');
const statsRegistered = document.getElementById('stats-registered');
const statsReports = document.getElementById('stats-reports');
const reportsList = document.getElementById('reports-list');

const banUsernameInput = document.getElementById('ban-username');
const banSubmitBtn = document.getElementById('ban-submit-btn');
const unbanUsernameInput = document.getElementById('unban-username');
const unbanSubmitBtn = document.getElementById('unban-submit-btn');

// Toast Notification helper
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

function showToast(message, type = 'success') {
  toastMessage.textContent = message;
  toast.className = 'toast-notification show';
  if (type === 'danger') {
    toast.classList.add('danger');
  }
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 4000);
}

// Fetch Admin Stats
async function fetchStats() {
  try {
    const res = await fetch('/api/admin/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      if (res.status === 403 || res.status === 401) {
        alert('غير مصرح لك بالوصول! هذه الصفحة للمدراء فقط.');
        window.location.href = '/';
      }
      return;
    }
    const data = await res.json();
    statsOnline.textContent = data.onlineUsers;
    statsRooms.textContent = data.activeRooms;
    statsRegistered.textContent = data.totalRegistered;
    statsReports.textContent = data.reportsCount;
  } catch (err) {
    console.error('Error fetching stats:', err);
  }
}

// Fetch active Reports
async function fetchReports() {
  try {
    const res = await fetch('/api/admin/reports', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const reports = await res.json();
    
    reportsList.innerHTML = '';
    if (reports.length === 0) {
      reportsList.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted);">لا توجد بلاغات حالياً.</td>
        </tr>
      `;
      return;
    }

    reports.forEach(report => {
      const row = document.createElement('tr');
      const time = new Date(report.timestamp).toLocaleString('ar-LY', { hour12: true });

      row.innerHTML = `
        <td style="font-weight: 600; color: #a5f3fc;">${report.reporter}</td>
        <td style="font-weight: 600; color: #fda4af;">${report.reported}</td>
        <td>${report.reason}</td>
        <td style="color: var(--text-muted); font-size: 0.8rem;">${time}</td>
        <td>
          <button class="btn-danger btn-sm" onclick="banUserFromReport('${report.reported}', '${report._id || report.id}')" style="padding: 4px 8px; font-size: 0.8rem; border-radius: 4px; margin-left: 5px;">
            <i class="fa-solid fa-ban"></i> حظر
          </button>
          <button class="btn-secondary btn-sm" onclick="dismissReport('${report._id || report.id}')" style="padding: 4px 8px; font-size: 0.8rem; border-radius: 4px;">
            تجاهل
          </button>
        </td>
      `;
      reportsList.appendChild(row);
    });
  } catch (err) {
    console.error('Error fetching reports:', err);
  }
}

// Ban User
async function banUser(username) {
  if (!username) return;
  try {
    const res = await fetch('/api/admin/ban', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || `تم حظر المستخدم ${username} بنجاح.`, 'danger');
      fetchStats();
      fetchReports();
    } else {
      showToast(data.error || 'خطأ في عملية الحظر', 'danger');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالخادم', 'danger');
  }
}

// Unban User
async function unbanUser(username) {
  if (!username) return;
  try {
    const res = await fetch('/api/admin/unban', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || `تم إلغاء حظر المستخدم ${username} بنجاح.`);
      fetchStats();
    } else {
      showToast(data.error || 'خطأ في إلغاء الحظر', 'danger');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالخادم', 'danger');
  }
}

// Dismiss Report
async function dismissReport(reportId) {
  try {
    const res = await fetch('/api/admin/dismiss-report', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ reportId })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'تم تجاهل البلاغ.');
      fetchStats();
      fetchReports();
    } else {
      showToast(data.error || 'حدث خطأ ما', 'danger');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالخادم', 'danger');
  }
}

// Ban User from Report list
window.banUserFromReport = async function(username, reportId) {
  if (confirm(`هل أنت متأكد من حظر المستخدم ${username}؟ سيتم حذف البلاغ تلقائياً.`)) {
    await banUser(username);
    await dismissReport(reportId);
  }
};

window.dismissReport = async function(reportId) {
  if (confirm('هل أنت متأكد من تجاهل هذا البلاغ؟')) {
    await dismissReport(reportId);
  }
};

// Event Listeners for actions forms
banSubmitBtn.addEventListener('click', () => {
  const username = banUsernameInput.value.trim();
  if (username) {
    banUser(username);
    banUsernameInput.value = '';
  }
});

unbanSubmitBtn.addEventListener('click', () => {
  const username = unbanUsernameInput.value.trim();
  if (username) {
    unbanUser(username);
    unbanUsernameInput.value = '';
  }
});

// Setup Live WebSockets connection for real-time dashboard updates
function setupAdminSockets() {
  socket = io();
  
  socket.on('connect', () => {
    console.log('Admin socket connected');
  });

  // Listen for new reports notifications
  socket.on('new-report-notification', (report) => {
    showToast(`بلاغ جديد ضد ${report.reported}: ${report.reason}`, 'danger');
    // Refresh stats and list
    fetchStats();
    fetchReports();
  });
}

// --- User Management Logic ---
let allUsers = [];
const usersList = document.getElementById('users-list');
const userSearchInput = document.getElementById('user-search-input');

const vipModal = document.getElementById('vip-modal');
const closeVipModal = document.getElementById('close-vip-modal');
const cancelVipBtn = document.getElementById('cancel-vip-btn');
const vipForm = document.getElementById('vip-form');
const vipTargetUsername = document.getElementById('vip-target-username');
const vipModalUserTitle = document.getElementById('vip-modal-user-title');
const vipIsVipCheckbox = document.getElementById('vip-is-vip');
const vipDurationGroup = document.getElementById('vip-duration-group');
const vipDurationSelect = document.getElementById('vip-duration');
const vipHasStarCheckbox = document.getElementById('vip-has-star');

// Fetch and display all users
async function fetchUsers() {
  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    allUsers = await res.json();
    displayUsers(allUsers);
  } catch (err) {
    console.error('Error fetching users:', err);
  }
}

// Render users into the table
function displayUsers(users) {
  usersList.innerHTML = '';
  if (users.length === 0) {
    usersList.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted);">لا يوجد مستخدمين مطابقين للبحث.</td>
      </tr>
    `;
    return;
  }

  users.forEach(u => {
    const row = document.createElement('tr');
    
    // Status Badge
    let statusBadge = '<span class="action-badge" style="background: rgba(255,255,255,0.05); color: #fff;">عضو عادي</span>';
    if (u.isAdmin) {
      statusBadge = '<span class="action-badge" style="background: rgba(168, 85, 247, 0.2); color: #a855f7; border: 1px solid rgba(168, 85, 247, 0.4);">مدير</span>';
    } else if (u.isBanned) {
      statusBadge = '<span class="action-badge danger">محظور (Banned)</span>';
    } else if (u.isVIP) {
      statusBadge = '<span class="action-badge success">VIP نشط</span>';
    }

    // Expiry Date representation
    let expiryText = '-';
    if (u.isVIP && u.vipExpiry) {
      expiryText = new Date(u.vipExpiry).toLocaleDateString('ar-LY');
    }

    // Star status
    const starIcon = u.hasVipStar 
      ? '<span class="text-warning" style="font-weight: 700;"><i class="fa-solid fa-star"></i> نعم</span>' 
      : '<span style="color: var(--text-muted);">لا</span>';

    row.innerHTML = `
      <td style="font-weight: 600;">${u.username}</td>
      <td>${u.country} / ${u.gender === 'male' ? 'ذكر' : u.gender === 'female' ? 'أنثى' : 'آخر'}</td>
      <td>${statusBadge}</td>
      <td>${expiryText}</td>
      <td>${starIcon}</td>
      <td>
        <button class="btn-primary btn-sm" onclick="openVipModalForUser('${u.username}', ${u.isVIP}, '${u.vipExpiry}', ${u.hasVipStar})" style="padding: 4px 8px; font-size: 0.8rem; border-radius: 4px; margin-left: 5px; cursor: pointer;">
          <i class="fa-solid fa-crown"></i> تعديل VIP
        </button>
        ${u.isBanned 
          ? `<button class="btn-success btn-sm" onclick="quickUnban('${u.username}')" style="padding: 4px 8px; font-size: 0.8rem; border-radius: 4px; cursor: pointer;"><i class="fa-solid fa-user-check"></i> إلغاء الحظر</button>`
          : `<button class="btn-danger btn-sm" onclick="quickBan('${u.username}')" style="padding: 4px 8px; font-size: 0.8rem; border-radius: 4px; cursor: pointer;"><i class="fa-solid fa-ban"></i> حظر</button>`
        }
      </td>
    `;
    usersList.appendChild(row);
  });
}

// User Search Handler
userSearchInput.addEventListener('input', (e) => {
  const term = e.target.value.trim().toLowerCase();
  if (!term) {
    displayUsers(allUsers);
    return;
  }
  const filtered = allUsers.filter(u => u.username.toLowerCase().includes(term));
  displayUsers(filtered);
});

// Open VIP Modal
window.openVipModalForUser = function(username, isVIP, vipExpiry, hasVipStar) {
  vipTargetUsername.value = username;
  vipModalUserTitle.textContent = `اسم المستخدم: ${username}`;
  vipIsVipCheckbox.checked = isVIP;
  vipHasStarCheckbox.checked = hasVipStar;
  
  toggleVipDurationFields();
  vipModal.classList.add('open');
};

function toggleVipDurationFields() {
  if (vipIsVipCheckbox.checked) {
    vipDurationGroup.style.display = 'block';
    vipStarGroup.style.display = 'block';
  } else {
    vipDurationGroup.style.display = 'none';
    vipStarGroup.style.display = 'none';
  }
}

vipIsVipCheckbox.addEventListener('change', toggleVipDurationFields);

const closeModalFunc = () => {
  vipModal.classList.remove('open');
};

closeVipModal.addEventListener('click', closeModalFunc);
cancelVipBtn.addEventListener('click', closeModalFunc);

// Submit VIP Update Form
vipForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = vipTargetUsername.value;
  const isVIP = vipIsVipCheckbox.checked;
  const vipDuration = vipDurationSelect.value;
  const hasVipStar = vipHasStarCheckbox.checked;

  try {
    const res = await fetch('/api/admin/update-vip', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, isVIP, vipDuration, hasVipStar })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'تم تحديث اشتراك VIP بنجاح.');
      closeModalFunc();
      fetchUsers();
      fetchStats();
    } else {
      showToast(data.error || 'حدث خطأ في عملية التحديث.', 'danger');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالخادم', 'danger');
  }
});

// Quick Ban/Unban helpers
window.quickBan = async function(username) {
  if (confirm(`هل تريد حظر المستخدم ${username}؟`)) {
    await banUser(username);
    fetchUsers();
  }
};

window.quickUnban = async function(username) {
  if (confirm(`هل تريد إلغاء حظر المستخدم ${username}؟`)) {
    await unbanUser(username);
    fetchUsers();
  }
};

// Initialize admin panel
fetchStats();
fetchReports();
fetchUsers();
setupAdminSockets();

// Periodically refresh stats and user list
setInterval(() => {
  fetchStats();
  fetchUsers();
}, 10000);

