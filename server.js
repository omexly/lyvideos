require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Report } = require('./database');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'ometv_super_secret_key_123';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- Authentication Middleware ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    try {
      let user = await User.findById(decoded.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.isBanned) return res.status(403).json({ error: 'Your account has been banned!' });
      
      // Dynamic VIP Expiry Check
      if (user.isVIP && user.vipExpiry && new Date(user.vipExpiry) < new Date()) {
        user.isVIP = false;
        user.hasVipStar = false;
        user.vipExpiry = null;
        await User.findByIdAndUpdate(user._id || user.id, { isVIP: false, hasVipStar: false, vipExpiry: null });
      }

      req.user = user;
      next();
    } catch (dbErr) {
      res.status(500).json({ error: 'Database error' });
    }
  });
};

const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin privileges required' });
  }
  next();
};

// --- Auth Routes ---
app.post('/api/auth/register', async (req, res) => {
  const { username, password, gender, country } = req.body;
  if (!username || !password || !gender || !country) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      username,
      password: hashedPassword,
      gender,
      country,
      isVIP: false,
      vipExpiry: null,
      hasVipStar: false,
      isAdmin: false,
      isBanned: false
    });

    const token = jwt.sign({ id: user._id || user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { username: user.username, gender: user.gender, country: user.country, isVIP: user.isVIP, hasVipStar: user.hasVipStar, vipExpiry: user.vipExpiry, isAdmin: user.isAdmin } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error registering user' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'Your account has been banned!' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ id: user._id || user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { username: user.username, gender: user.gender, country: user.country, isVIP: user.isVIP, hasVipStar: user.hasVipStar, vipExpiry: user.vipExpiry, isAdmin: user.isAdmin } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error logging in' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({
    username: req.user.username,
    gender: req.user.gender,
    country: req.user.country,
    isVIP: req.user.isVIP,
    hasVipStar: req.user.hasVipStar,
    vipExpiry: req.user.vipExpiry,
    isAdmin: req.user.isAdmin
  });
});

app.post('/api/auth/upgrade-vip', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const oneMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const updatedUser = await User.findByIdAndUpdate(userId, { 
      isVIP: true, 
      vipExpiry: oneMonth,
      hasVipStar: true 
    }, { new: true });
    res.json({ 
      message: 'Upgraded to VIP successfully!', 
      isVIP: updatedUser.isVIP,
      hasVipStar: updatedUser.hasVipStar,
      vipExpiry: updatedUser.vipExpiry
    });
  } catch (err) {
    res.status(500).json({ error: 'Error upgrading to VIP' });
  }
});

// --- Admin Routes ---
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const totalUsers = await User.find();
    const reports = await Report.find();
    
    // Calculate current web socket stats
    const onlineSocketsCount = io.sockets.sockets.size;
    const activeRooms = Math.floor(activeConnections.size / 2);

    res.json({
      onlineUsers: onlineSocketsCount,
      activeRooms: activeRooms,
      totalRegistered: totalUsers.length,
      bannedCount: totalUsers.filter(u => u.isBanned).length,
      reportsCount: reports.length
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching stats' });
  }
});

app.get('/api/admin/reports', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const reports = await Report.find({});
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching reports' });
  }
});

app.post('/api/admin/ban', authenticateToken, requireAdmin, async (req, res) => {
  const { username } = req.body;
  try {
    await User.updateOne({ username }, { isBanned: true });
    
    // Disconnect banned user's socket if they are online
    for (let [socketId, socket] of io.sockets.sockets.entries()) {
      if (socket.userData && socket.userData.username === username) {
        socket.emit('banned', 'You have been banned by the admin.');
        socket.disconnect(true);
      }
    }
    
    res.json({ message: `User ${username} has been banned successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Error banning user' });
  }
});

app.post('/api/admin/unban', authenticateToken, requireAdmin, async (req, res) => {
  const { username } = req.body;
  try {
    await User.updateOne({ username }, { isBanned: false });
    res.json({ message: `User ${username} has been unbanned successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Error unbanning user' });
  }
});

app.post('/api/admin/dismiss-report', authenticateToken, requireAdmin, async (req, res) => {
  const { reportId } = req.body;
  try {
    await Report.deleteOne({ _id: reportId, id: reportId });
    res.json({ message: 'Report dismissed successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Error dismissing report' });
  }
});

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({});
    const safeUsers = users.map(u => ({
      id: u._id || u.id,
      username: u.username,
      gender: u.gender,
      country: u.country,
      isVIP: u.isVIP || false,
      vipExpiry: u.vipExpiry || null,
      hasVipStar: u.hasVipStar || false,
      isAdmin: u.isAdmin || false,
      isBanned: u.isBanned || false,
      createdAt: u.createdAt
    }));
    res.json(safeUsers);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching users' });
  }
});

app.post('/api/admin/update-vip', authenticateToken, requireAdmin, async (req, res) => {
  const { username, isVIP, vipDuration, hasVipStar } = req.body;
  try {
    let vipExpiry = null;
    const now = new Date();
    
    if (isVIP) {
      if (vipDuration === '1w') {
        vipExpiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else if (vipDuration === '1m') {
        vipExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      } else if (vipDuration === '6m') {
        vipExpiry = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
      } else if (vipDuration === 'forever') {
        vipExpiry = new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000);
      }
    }

    const updateFields = {
      isVIP: !!isVIP,
      vipExpiry: isVIP ? vipExpiry : null,
      hasVipStar: isVIP ? !!hasVipStar : false
    };

    const user = await User.findOne({ username });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await User.updateOne({ username }, updateFields);
    res.json({ message: `تم تحديث اشتراك VIP للمستخدم ${username} بنجاح.` });
  } catch (err) {
    res.status(500).json({ error: 'Error updating VIP status' });
  }
});

// --- Matchmaking & Signaling logic ---
let matchmakingQueue = [];
const activeConnections = new Map(); // socket.id -> partnerSocket

const tryMatchUser = (socket) => {
  if (activeConnections.has(socket.id)) return; // Already in a match

  const index = matchmakingQueue.findIndex(s => s.id === socket.id);
  if (index === -1) return; // Not in queue

  const myData = socket.userData;

  // Search queue for potential match
  for (let i = 0; i < matchmakingQueue.length; i++) {
    const candidate = matchmakingQueue[i];
    if (candidate.id === socket.id) continue;
    if (activeConnections.has(candidate.id)) continue;

    const candData = candidate.userData;

    // Check matchmaking conditions
    // 1. VIP Filters matching
    let isMatch = true;

    // If I am VIP and have filters
    if (myData.isVIP) {
      if (myData.filters.gender && myData.filters.gender !== 'all' && candData.gender !== myData.filters.gender) {
        isMatch = false;
      }
      if (myData.filters.country && myData.filters.country !== 'all' && candData.country !== myData.filters.country) {
        isMatch = false;
      }
    }

    // If Candidate is VIP and has filters
    if (candData.isVIP && isMatch) {
      if (candData.filters.gender && candData.filters.gender !== 'all' && myData.gender !== candData.filters.gender) {
        isMatch = false;
      }
      if (candData.filters.country && candData.filters.country !== 'all' && myData.country !== candData.filters.country) {
        isMatch = false;
      }
    }

    if (isMatch) {
      // We found a match! Remove both from queue
      matchmakingQueue.splice(index, 1);
      const candIndex = matchmakingQueue.findIndex(s => s.id === candidate.id);
      if (candIndex !== -1) matchmakingQueue.splice(candIndex, 1);

      // Establish pairing
      activeConnections.set(socket.id, candidate);
      activeConnections.set(candidate.id, socket);

      // Notify clients
      socket.emit('match-found', {
        initiator: true,
        partner: {
          username: candData.username,
          gender: candData.gender,
          country: candData.country,
          isVIP: candData.isVIP,
          hasVipStar: candData.hasVipStar || false
        }
      });

      candidate.emit('match-found', {
        initiator: false,
        partner: {
          username: myData.username,
          gender: myData.gender,
          country: myData.country,
          isVIP: myData.isVIP,
          hasVipStar: myData.hasVipStar || false
        }
      });

      console.log(`Matched: ${myData.username} with ${candData.username}`);
      return;
    }
  }
};

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // When a user starts matching
  socket.on('start-matching', async (data) => {
    // data: { token, filters: { gender, country } }
    let userData = {
      username: `Guest_${socket.id.substring(0, 5)}`,
      gender: 'other',
      country: 'Unknown',
      isVIP: false,
      filters: { gender: 'all', country: 'all' }
    };

    if (data.token) {
      try {
        const decoded = jwt.verify(data.token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (user && !user.isBanned) {
          userData = {
            username: user.username,
            gender: user.gender,
            country: user.country,
            isVIP: user.isVIP,
            hasVipStar: user.hasVipStar || false,
            filters: user.isVIP ? (data.filters || { gender: 'all', country: 'all' }) : { gender: 'all', country: 'all' }
          };
        }
      } catch (err) {
        // Invalid token, treat as guest
      }
    }

    socket.userData = userData;

    // Remove from active match if any
    const oldPartner = activeConnections.get(socket.id);
    if (oldPartner) {
      activeConnections.delete(socket.id);
      activeConnections.delete(oldPartner.id);
      oldPartner.emit('partner-disconnected');
      
      // Auto-requeue the partner
      setTimeout(() => {
        tryMatchUser(oldPartner);
      }, 500);
    }

    // Add to matchmaking queue if not already there
    if (!matchmakingQueue.find(s => s.id === socket.id)) {
      matchmakingQueue.push(socket);
    }

    console.log(`${userData.username} entered matchmaking queue.`);
    
    // Attempt match
    tryMatchUser(socket);
  });

  // Relay WebRTC signals
  socket.on('signal', (data) => {
    const partner = activeConnections.get(socket.id);
    if (partner) {
      partner.emit('signal', data);
    }
  });

  // Relay chat messages
  socket.on('send-message', (msgText) => {
    const partner = activeConnections.get(socket.id);
    if (partner) {
      partner.emit('message', {
        text: msgText,
        sender: socket.userData ? socket.userData.username : 'Partner'
      });
    }
  });

  // Stop matching / Next Partner
  socket.on('next', () => {
    const partner = activeConnections.get(socket.id);
    
    // Remove from queue
    const index = matchmakingQueue.findIndex(s => s.id === socket.id);
    if (index !== -1) matchmakingQueue.splice(index, 1);

    if (partner) {
      activeConnections.delete(socket.id);
      activeConnections.delete(partner.id);
      partner.emit('partner-disconnected');
      
      // Auto-requeue the partner
      if (!matchmakingQueue.find(s => s.id === partner.id)) {
        matchmakingQueue.push(partner);
        setTimeout(() => {
          tryMatchUser(partner);
        }, 500);
      }
    }

    // Re-enter matchmaking queue for self
    if (!matchmakingQueue.find(s => s.id === socket.id)) {
      matchmakingQueue.push(socket);
    }
    
    setTimeout(() => {
      tryMatchUser(socket);
    }, 100);
  });

  // Report user
  socket.on('report-user', async (reason) => {
    const partner = activeConnections.get(socket.id);
    if (partner && socket.userData && partner.userData) {
      try {
        await Report.create({
          reporter: socket.userData.username,
          reported: partner.userData.username,
          reason: reason
        });
        
        // Notify admin sockets about the new report
        io.emit('new-report-notification', {
          reporter: socket.userData.username,
          reported: partner.userData.username,
          reason: reason
        });

        socket.emit('report-submitted');
        
        // Automatically next after reporting
        socket.emit('trigger-next');
      } catch (err) {
        console.error('Error creating report:', err);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    
    // Remove from queue
    const index = matchmakingQueue.findIndex(s => s.id === socket.id);
    if (index !== -1) matchmakingQueue.splice(index, 1);

    // Clean up active match
    const partner = activeConnections.get(socket.id);
    if (partner) {
      activeConnections.delete(socket.id);
      activeConnections.delete(partner.id);
      partner.emit('partner-disconnected');

      // Auto-requeue partner
      if (!matchmakingQueue.find(s => s.id === partner.id)) {
        matchmakingQueue.push(partner);
        setTimeout(() => {
          tryMatchUser(partner);
        }, 500);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
