// OME TV Premium - Frontend Logic
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let socket = null;
let token = localStorage.getItem('token') || null;
let userProfile = null;
let isMatching = false;
let isInitiator = false;
let isMutedMic = false;
let isMutedCam = false;

// WebRTC STUN Servers Configuration
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
};

// DOM Elements
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const nextBtn = document.getElementById('next-btn');
const reportBtn = document.getElementById('report-btn');
const toggleCamBtn = document.getElementById('toggle-cam');
const toggleMicBtn = document.getElementById('toggle-mic');
const remoteUsernameEl = document.getElementById('remote-username');
const remoteFlagEl = document.getElementById('remote-flag');
const remoteVipTag = document.getElementById('remote-vip-tag');
const searchingLoader = document.getElementById('searching-loader');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

// Auth DOM Elements
const authModal = document.getElementById('auth-modal');
const openAuthBtn = document.getElementById('open-auth-btn');
const closeAuthModal = document.getElementById('close-auth-modal');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const userProfileArea = document.getElementById('user-profile');
const authButtonsArea = document.getElementById('auth-buttons');
const usernameDisplay = document.getElementById('username-display');
const userBadge = document.getElementById('user-badge');
const adminBtn = document.getElementById('admin-btn');
const logoutBtn = document.getElementById('logout-btn');
const upgradeVipBtn = document.getElementById('upgrade-vip-btn');
const vipPromoBanner = document.getElementById('vip-promo');

// Filters DOM Elements
const genderLock = document.getElementById('gender-lock');
const countryLock = document.getElementById('country-lock');
const countryFilter = document.getElementById('country-filter');

// Report DOM Elements
const reportModal = document.getElementById('report-modal');
const closeReportModal = document.getElementById('close-report-modal');
const reportOptButtons = document.querySelectorAll('.report-opt-btn');

// Initialize WebSockets
function initSocket() {
  if (socket) return;
  
  socket = io();

  // Socket Events
  socket.on('connect', () => {
    console.log('Connected to signaling server');
  });

  socket.on('match-found', async (data) => {
    console.log('Match found:', data);
    isInitiator = data.initiator;
    
    // Update partner UI info
    remoteUsernameEl.textContent = `${data.partner.username} (${getCountryNameAr(data.partner.country)})`;
    remoteFlagEl.textContent = getCountryFlag(data.partner.country);
    
    if (data.partner.isVIP) {
      remoteVipTag.classList.remove('hidden');
    } else {
      remoteVipTag.classList.add('hidden');
    }

    // Enable chat and report
    chatInput.removeAttribute('disabled');
    chatSendBtn.removeAttribute('disabled');
    reportBtn.removeAttribute('disabled');
    nextBtn.removeAttribute('disabled');
    
    // Hide search loader
    searchingLoader.classList.add('hidden');
    
    appendSystemMessage(`تم الاتصال بـ ${data.partner.username}`);

    // Set up WebRTC Connection
    await setupPeerConnection();
  });

  socket.on('signal', async (data) => {
    if (!peerConnection) return;

    try {
      if (data.sdp) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        if (data.sdp.type === 'offer') {
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          socket.emit('signal', { sdp: answer });
        }
      } else if (data.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    } catch (err) {
      console.error('Error handling WebRTC signal:', err);
    }
  });

  socket.on('message', (msg) => {
    appendChatBubble(msg.sender, msg.text, 'remote');
  });

  socket.on('partner-disconnected', () => {
    appendSystemMessage('قطع الشريك الاتصال. جاري البحث عن شريك جديد...');
    cleanupPeerConnection();
    
    // Show search loader & clear partner info
    searchingLoader.classList.remove('hidden');
    remoteUsernameEl.textContent = 'جاري البحث عن شريك...';
    remoteFlagEl.textContent = '🌐';
    remoteVipTag.classList.add('hidden');
    
    // Disable inputs
    chatInput.setAttribute('disabled', 'true');
    chatSendBtn.setAttribute('disabled', 'true');
    reportBtn.setAttribute('disabled', 'true');
  });

  socket.on('banned', (msg) => {
    alert(msg || 'تم حظرك من قبل المدير!');
    logout();
  });

  socket.on('report-submitted', () => {
    alert('تم تقديم بلاغك بنجاح للمراجعة من قبل الإدارة.');
  });

  socket.on('trigger-next', () => {
    nextBtn.click();
  });
}

// Set up WebRTC Peer Connection
async function setupPeerConnection() {
  cleanupPeerConnection();

  peerConnection = new RTCPeerConnection(rtcConfig);

  // Send ICE Candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && socket) {
      socket.emit('signal', { candidate: event.candidate });
    }
  };

  // Add tracks
  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }

  // Receive tracks
  peerConnection.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      
      // Add border glow to show active connection
      document.getElementById('remote-video-container').classList.add('connected');
    }
  };

  // Create offer if initiator
  if (isInitiator) {
    try {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('signal', { sdp: offer });
    } catch (err) {
      console.error('Error creating SDP Offer:', err);
    }
  }
}

// Clean up WebRTC Connection
function cleanupPeerConnection() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
  document.getElementById('remote-video-container').classList.remove('connected');
}

// Get Camera and Mic Permission
async function getMediaStream() {
  if (localStream) return true;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user'
      },
      audio: true
    });
    localVideo.srcObject = localStream;
    document.querySelector('.local-card').classList.add('connected');
    return true;
  } catch (err) {
    console.error('Error accessing camera/microphone:', err);
    alert('برجاء السماح بالوصول للكاميرا والميكروفون للتمكن من الدردشة!');
    return false;
  }
}

// UI Controls Matchmaking
async function startChat() {
  const hasMedia = await getMediaStream();
  if (!hasMedia) return;

  initSocket();

  isMatching = true;
  startBtn.classList.add('hidden');
  stopBtn.classList.remove('hidden');
  nextBtn.removeAttribute('disabled');
  
  searchingLoader.classList.remove('hidden');
  remoteUsernameEl.textContent = 'جاري البحث عن شريك...';
  remoteFlagEl.textContent = '🌐';
  remoteVipTag.classList.add('hidden');

  // Emit matchmaking request
  emitStartMatching();
}

function emitStartMatching() {
  if (!socket) return;
  
  // Get selected filters
  const genderVal = document.querySelector('input[name="gender-filter"]:checked').value;
  const countryVal = countryFilter.value;

  socket.emit('start-matching', {
    token: token,
    filters: {
      gender: genderVal,
      country: countryVal
    }
  });
}

function stopChat() {
  isMatching = false;
  startBtn.classList.remove('hidden');
  stopBtn.classList.add('hidden');
  nextBtn.setAttribute('disabled', 'true');
  reportBtn.setAttribute('disabled', 'true');
  
  searchingLoader.classList.add('hidden');
  remoteUsernameEl.textContent = 'اضغط بدء الدردشة للبدء';
  remoteFlagEl.textContent = '🌐';
  remoteVipTag.classList.add('hidden');
  
  chatInput.setAttribute('disabled', 'true');
  chatSendBtn.setAttribute('disabled', 'true');

  cleanupPeerConnection();

  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

function nextPartner() {
  if (!socket || !isMatching) return;

  // Set disabled state temporarily to prevent spamming
  nextBtn.setAttribute('disabled', 'true');
  reportBtn.setAttribute('disabled', 'true');
  chatInput.setAttribute('disabled', 'true');
  chatSendBtn.setAttribute('disabled', 'true');

  cleanupPeerConnection();

  // Show searching loader
  searchingLoader.classList.remove('hidden');
  remoteUsernameEl.textContent = 'جاري البحث عن شريك...';
  remoteFlagEl.textContent = '🌐';
  remoteVipTag.classList.add('hidden');

  socket.emit('next');
}

// Toggle Camera / Mic
toggleCamBtn.addEventListener('click', () => {
  if (!localStream) return;
  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    isMutedCam = !isMutedCam;
    videoTrack.enabled = !isMutedCam;
    toggleCamBtn.classList.toggle('muted', isMutedCam);
    toggleCamBtn.querySelector('i').className = isMutedCam ? 'fa-solid fa-video-slash' : 'fa-solid fa-video';
  }
});

toggleMicBtn.addEventListener('click', () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    isMutedMic = !isMutedMic;
    audioTrack.enabled = !isMutedMic;
    toggleMicBtn.classList.toggle('muted', isMutedMic);
    toggleMicBtn.querySelector('i').className = isMutedMic ? 'fa-solid fa-microphone-slash' : 'fa-solid fa-microphone';
  }
});

// Matchmaking triggers
startBtn.addEventListener('click', startChat);
stopBtn.addEventListener('click', stopChat);
nextBtn.addEventListener('click', nextPartner);

// Chat Input & Send logic
function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || !socket) return;

  socket.emit('send-message', text);
  appendChatBubble('أنت', text, 'local');
  chatInput.value = '';
}

chatSendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});

// Appending chat bubbles
function appendChatBubble(sender, text, type) {
  const bubble = document.createElement('div');
  bubble.classList.add('chat-bubble', type);
  
  const senderSpan = document.createElement('span');
  senderSpan.classList.add('bubble-sender');
  senderSpan.textContent = sender;
  
  const textNode = document.createTextNode(text);
  
  bubble.appendChild(senderSpan);
  bubble.appendChild(textNode);
  
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendSystemMessage(text) {
  const msg = document.createElement('div');
  msg.classList.add('system-message');
  msg.textContent = text;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Authentication Modal Logic
openAuthBtn.addEventListener('click', () => {
  authModal.classList.add('open');
});

closeAuthModal.addEventListener('click', () => {
  authModal.classList.remove('open');
});

tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
});

tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
});

// Login Form Submit
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const usernameVal = document.getElementById('login-username').value;
  const passwordVal = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.textContent = '';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameVal, password: passwordVal })
    });
    const data = await res.json();
    if (res.ok) {
      token = data.token;
      localStorage.setItem('token', token);
      userProfile = data.user;
      authSuccess();
    } else {
      errorEl.textContent = data.error || 'خطأ في عملية الدخول';
    }
  } catch (err) {
    errorEl.textContent = 'خطأ في الاتصال بالخادم';
  }
});

// Register Form Submit
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const usernameVal = document.getElementById('reg-username').value;
  const passwordVal = document.getElementById('reg-password').value;
  const genderVal = document.getElementById('reg-gender').value;
  const countryVal = document.getElementById('reg-country').value;
  const errorEl = document.getElementById('register-error');
  errorEl.textContent = '';

  if (passwordVal.length < 6) {
    errorEl.textContent = 'يجب ألا تقل كلمة المرور عن 6 أحرف!';
    return;
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameVal, password: passwordVal, gender: genderVal, country: countryVal })
    });
    const data = await res.json();
    if (res.ok) {
      token = data.token;
      localStorage.setItem('token', token);
      userProfile = data.user;
      authSuccess();
    } else {
      errorEl.textContent = data.error || 'خطأ في إنشاء الحساب';
    }
  } catch (err) {
    errorEl.textContent = 'خطأ في الاتصال بالخادم';
  }
});

// Auth success handler
function authSuccess() {
  authModal.classList.remove('open');
  updateUIForUser();
  if (isMatching) {
    // If matching, re-verify filters/identity on socket
    emitStartMatching();
  }
}

// Update UI based on User Profile
function updateUIForUser() {
  if (userProfile) {
    authButtonsArea.classList.add('hidden');
    userProfileArea.classList.remove('hidden');
    usernameDisplay.textContent = userProfile.username;

    if (userProfile.isVIP) {
      userBadge.classList.remove('hidden');
      vipPromoBanner.classList.add('hidden');
      // Unlock filters
      genderLock.classList.add('hidden');
      countryLock.classList.add('hidden');
    } else {
      userBadge.classList.add('hidden');
      vipPromoBanner.classList.remove('hidden');
      // Lock filters
      genderLock.classList.remove('hidden');
      countryLock.classList.remove('hidden');
    }

    if (userProfile.isAdmin) {
      adminBtn.classList.remove('hidden');
    } else {
      adminBtn.classList.add('hidden');
    }
  } else {
    authButtonsArea.classList.remove('hidden');
    userProfileArea.classList.add('hidden');
    vipPromoBanner.classList.remove('hidden');
    // Lock filters for guests
    genderLock.classList.remove('hidden');
    countryLock.classList.remove('hidden');
    adminBtn.classList.add('hidden');
  }
}

// Auto Login
async function autoLogin() {
  if (!token) {
    updateUIForUser();
    return;
  }
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      userProfile = await res.json();
      updateUIForUser();
    } else {
      logout();
    }
  } catch (err) {
    console.error('Auto login error:', err);
    updateUIForUser();
  }
}

// Logout
function logout() {
  localStorage.removeItem('token');
  token = null;
  userProfile = null;
  stopChat();
  updateUIForUser();
}

logoutBtn.addEventListener('click', logout);

// Redirect Admin Button
adminBtn.addEventListener('click', () => {
  window.location.href = '/admin.html';
});

// Mock Upgrade to VIP
upgradeVipBtn.addEventListener('click', async () => {
  if (!token) {
    authModal.classList.add('open');
    return;
  }

  try {
    const res = await fetch('/api/auth/upgrade-vip', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await res.json();
    if (res.ok) {
      userProfile.isVIP = true;
      updateUIForUser();
      alert('مبروك! تم ترقية حسابك إلى VIP لتجربة الفلاتر بنجاح 👑');
    } else {
      alert(data.error || 'خطأ في عملية الترقية');
    }
  } catch (err) {
    alert('خطأ في الاتصال بالخادم');
  }
});

// Report Modal Logic
reportBtn.addEventListener('click', () => {
  reportModal.classList.add('open');
});

closeReportModal.addEventListener('click', () => {
  reportModal.classList.remove('open');
});

reportOptButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const reason = btn.getAttribute('data-reason');
    if (socket) {
      socket.emit('report-user', reason);
    }
    reportModal.classList.remove('open');
  });
});

// Helper functions for flag icons & names
function getCountryFlag(code) {
  const flags = {
    'LY': '🇱🇾', 'EG': '🇪🇬', 'SA': '🇸🇦', 'DZ': '🇩🇿', 'MA': '🇲🇦',
    'TN': '🇹🇳', 'IQ': '🇮🇶', 'AE': '🇦🇪', 'US': '🇺🇸', 'GB': '🇬🇧',
    'FR': '🇫🇷', 'DE': '🇩🇪', 'TR': '🇹🇷', 'Unknown': '🌐'
  };
  return flags[code] || '🌐';
}

function getCountryNameAr(code) {
  const names = {
    'LY': 'ليبيا', 'EG': 'مصر', 'SA': 'السعودية', 'DZ': 'الجزائر', 'MA': 'المغرب',
    'TN': 'تونس', 'IQ': 'العراق', 'AE': 'الإمارات', 'US': 'أمريكا', 'GB': 'بريطانيا',
    'FR': 'فرنسا', 'DE': 'ألمانيا', 'TR': 'تركيا', 'Unknown': 'مجهول'
  };
  return names[code] || code || 'مجهول';
}

// Start auto login verification
autoLogin();
