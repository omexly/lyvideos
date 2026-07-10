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

// Initialize admin panel
fetchStats();
fetchReports();
setupAdminSockets();

// Periodically refresh stats (every 10 seconds)
setInterval(fetchStats, 10000);
