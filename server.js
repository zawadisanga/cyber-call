const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Database initialization
const DB_PATH = path.join(__dirname, 'DB');

// Initialize databases
function initDatabases() {
  const dbFiles = {
    'user.json': [],
    'global-users.json': [],
    'call-history.json': [],
    'blocked-users.json': [],
    'country-codes.json': [
      { code: "US", name: "United States", flag: "🇺🇸" },
      { code: "GB", name: "United Kingdom", flag: "🇬🇧" },
      { code: "IN", name: "India", flag: "🇮🇳" },
      { code: "JP", name: "Japan", flag: "🇯🇵" },
      { code: "CN", name: "China", flag: "🇨🇳" },
      { code: "DE", name: "Germany", flag: "🇩🇪" },
      { code: "FR", name: "France", flag: "🇫🇷" },
      { code: "CA", name: "Canada", flag: "🇨🇦" },
      { code: "AU", name: "Australia", flag: "🇦🇺" },
      { code: "BR", name: "Brazil", flag: "🇧🇷" },
      { code: "RU", name: "Russia", flag: "🇷🇺" },
      { code: "ZA", name: "South Africa", flag: "🇿🇦" },
      { code: "NG", name: "Nigeria", flag: "🇳🇬" },
      { code: "PK", name: "Pakistan", flag: "🇵🇰" },
      { code: "BD", name: "Bangladesh", flag: "🇧🇩" },
      { code: "MX", name: "Mexico", flag: "🇲🇽" },
      { code: "ID", name: "Indonesia", flag: "🇮🇩" },
      { code: "EG", name: "Egypt", flag: "🇪🇬" }
    ]
  };

  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(DB_PATH, { recursive: true });
  }

  for (const [file, defaultData] of Object.entries(dbFiles)) {
    const filePath = path.join(DB_PATH, file);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
      console.log(`Created ${file}`);
    }
  }
}

initDatabases();

// Helper functions
function readDB(file) {
  const data = fs.readFileSync(path.join(DB_PATH, file));
  return JSON.parse(data);
}

function writeDB(file, data) {
  fs.writeFileSync(path.join(DB_PATH, file), JSON.stringify(data, null, 2));
}

// Active users and rooms
const activeUsers = new Map();
const callRooms = new Map();

// Socket.io connections
io.on('connection', (socket) => {
  console.log('New user connected:', socket.id);

  socket.on('user-online', (userData) => {
    const { userId, username, country } = userData;
    activeUsers.set(socket.id, { userId, username, country, socketId: socket.id });
    
    // Update global users list
    const globalUsers = readDB('global-users.json');
    const existingUser = globalUsers.find(u => u.userId === userId);
    
    if (!existingUser) {
      globalUsers.push({
        userId,
        username,
        country: country || 'Unknown',
        online: true,
        avatar: `https://ui-avatars.com/api/?name=${username}&background=00f3ff&color=fff`
      });
      writeDB('global-users.json', globalUsers);
    } else {
      existingUser.online = true;
      writeDB('global-users.json', globalUsers);
    }
    
    // Broadcast updated user list
    io.emit('update-users', globalUsers.filter(u => u.userId !== userId));
  });

  socket.on('get-users', () => {
    const globalUsers = readDB('global-users.json');
    const currentUser = activeUsers.get(socket.id);
    const otherUsers = globalUsers.filter(u => u.userId !== currentUser?.userId);
    socket.emit('users-list', otherUsers);
  });

  socket.on('search-users', (query) => {
    const globalUsers = readDB('global-users.json');
    const filtered = globalUsers.filter(u => 
      u.username.toLowerCase().includes(query.toLowerCase()) ||
      u.country.toLowerCase().includes(query.toLowerCase())
    );
    socket.emit('search-results', filtered);
  });

  // WebRTC Signaling
  socket.on('call-user', (data) => {
    const { calleeId, callerId, callerName, signalData } = data;
    const calleeSocket = findSocketByUserId(calleeId);
    
    if (calleeSocket) {
      io.to(calleeSocket).emit('incoming-call', {
        callerId,
        callerName,
        signal: signalData
      });
    }
  });

  socket.on('answer-call', (data) => {
    const { callerId, signal } = data;
    const callerSocket = findSocketByUserId(callerId);
    
    if (callerSocket) {
      io.to(callerSocket).emit('call-answered', { signal });
    }
  });

  socket.on('reject-call', (data) => {
    const { callerId } = data;
    const callerSocket = findSocketByUserId(callerId);
    
    if (callerSocket) {
      io.to(callerSocket).emit('call-rejected');
    }
  });

  socket.on('end-call', (data) => {
    const { roomId, userId } = data;
    io.to(roomId).emit('call-ended');
    
    // Save call history
    const callHistory = readDB('call-history.json');
    callHistory.push({
      userId,
      calleeId: data.calleeId,
      duration: data.duration || 0,
      timestamp: new Date().toISOString()
    });
    writeDB('call-history.json', callHistory);
  });

  socket.on('join-call-room', (data) => {
    const { roomId, userId, username } = data;
    socket.join(roomId);
    
    if (!callRooms.has(roomId)) {
      callRooms.set(roomId, []);
    }
    
    const room = callRooms.get(roomId);
    if (!room.find(u => u.userId === userId)) {
      room.push({ userId, username, socketId: socket.id });
      callRooms.set(roomId, room);
    }
    
    io.to(roomId).emit('room-users-update', room);
  });

  socket.on('leave-call-room', (data) => {
    const { roomId, userId } = data;
    socket.leave(roomId);
    
    const room = callRooms.get(roomId);
    if (room) {
      const updatedRoom = room.filter(u => u.userId !== userId);
      if (updatedRoom.length === 0) {
        callRooms.delete(roomId);
      } else {
        callRooms.set(roomId, updatedRoom);
        io.to(roomId).emit('room-users-update', updatedRoom);
      }
    }
  });

  socket.on('send-message', (data) => {
    const { to, from, message, type } = data;
    const targetSocket = findSocketByUserId(to);
    
    if (targetSocket) {
      io.to(targetSocket).emit('new-message', {
        from,
        message,
        type: type || 'text',
        timestamp: new Date().toISOString()
      });
    }
  });

  socket.on('typing', (data) => {
    const { to, from } = data;
    const targetSocket = findSocketByUserId(to);
    
    if (targetSocket) {
      io.to(targetSocket).emit('user-typing', { from });
    }
  });

  socket.on('block-user', (data) => {
    const { userId, blockUserId } = data;
    const blockedUsers = readDB('blocked-users.json');
    
    blockedUsers.push({
      userId,
      blockedUserId,
      timestamp: new Date().toISOString()
    });
    
    writeDB('blocked-users.json', blockedUsers);
  });

  socket.on('disconnect', () => {
    const user = activeUsers.get(socket.id);
    if (user) {
      // Update global users list
      const globalUsers = readDB('global-users.json');
      const userIndex = globalUsers.findIndex(u => u.userId === user.userId);
      if (userIndex !== -1) {
        globalUsers[userIndex].online = false;
        writeDB('global-users.json', globalUsers);
      }
      
      activeUsers.delete(socket.id);
      io.emit('user-offline', { userId: user.userId });
    }
    console.log('User disconnected:', socket.id);
  });
});

function findSocketByUserId(userId) {
  for (const [socketId, user] of activeUsers.entries()) {
    if (user.userId === userId) {
      return socketId;
    }
  }
  return null;
}

// API Routes
app.post('/api/signup', async (req, res) => {
  const { username, password, country } = req.body;
  
  const users = readDB('user.json');
  const existingUser = users.find(u => u.username === username);
  
  if (existingUser) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  
  const userId = uuidv4();
  const hashedPassword = await bcrypt.hash(password, 10);
  
  users.push({
    userId,
    username,
    password: hashedPassword,
    country: country || 'Unknown',
    createdAt: new Date().toISOString()
  });
  
  writeDB('user.json', users);
  
  res.json({ success: true, userId, username });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  const users = readDB('user.json');
  const user = users.find(u => u.username === username);
  
  if (!user) {
    return res.status(400).json({ error: 'User not found' });
  }
  
  const validPassword = await bcrypt.compare(password, user.password);
  
  if (!validPassword) {
    return res.status(400).json({ error: 'Invalid password' });
  }
  
  res.json({ 
    success: true, 
    userId: user.userId, 
    username: user.username,
    country: user.country 
  });
});

app.get('/api/users', (req, res) => {
  const globalUsers = readDB('global-users.json');
  res.json(globalUsers);
});

app.get('/api/countries', (req, res) => {
  const countries = readDB('country-codes.json');
  res.json(countries);
});

app.get('/api/call-history/:userId', (req, res) => {
  const callHistory = readDB('call-history.json');
  const userHistory = callHistory.filter(h => h.userId === req.params.userId);
  res.json(userHistory);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`CyberCall Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT}`);
});
