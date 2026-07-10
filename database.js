const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

let isMongoConnected = false;
let dbData = { users: [], reports: [] };
const JSON_DB_PATH = path.join(__dirname, 'local_db.json');

// Initialize local JSON database if MongoDB is not used or fails
function loadLocalDB() {
  if (fs.existsSync(JSON_DB_PATH)) {
    try {
      const data = fs.readFileSync(JSON_DB_PATH, 'utf8');
      dbData = JSON.parse(data);
      if (!dbData.users) dbData.users = [];
      if (!dbData.reports) dbData.reports = [];
    } catch (e) {
      console.error('Error reading local JSON database:', e);
    }
  } else {
    saveLocalDB();
  }
}

function saveLocalDB() {
  try {
    fs.writeFileSync(JSON_DB_PATH, JSON.stringify(dbData, null, 2), 'utf8');
  } catch (e) {
    console.error('Error writing local JSON database:', e);
  }
}

// In-memory/JSON DB Mock Models
class LocalUserModel {
  static async findOne(query = {}) {
    loadLocalDB();
    const filterQuery = query || {};
    return dbData.users.find(u => {
      for (let key in filterQuery) {
        if (u[key] !== filterQuery[key]) return false;
      }
      return true;
    }) || null;
  }

  static async findById(id) {
    loadLocalDB();
    return dbData.users.find(u => u.id === id || u._id === id) || null;
  }

  static async find(query = {}) {
    loadLocalDB();
    const filterQuery = query || {};
    return dbData.users.filter(u => {
      for (let key in filterQuery) {
        if (u[key] !== filterQuery[key]) return false;
      }
      return true;
    });
  }

  static async create(userData) {
    loadLocalDB();
    const newUser = {
      _id: Date.now().toString(),
      id: Date.now().toString(),
      isVIP: false,
      vipExpiry: null,
      hasVipStar: false,
      isAdmin: false,
      isBanned: false,
      createdAt: new Date(),
      ...userData
    };
    dbData.users.push(newUser);
    saveLocalDB();
    return newUser;
  }

  static async updateOne(query = {}, update = {}) {
    loadLocalDB();
    const user = await this.findOne(query);
    if (!user) return { nModified: 0 };
    
    const fieldsToUpdate = update.$set || update;
    Object.assign(user, fieldsToUpdate);
    saveLocalDB();
    return { nModified: 1 };
  }

  static async findByIdAndUpdate(id, update, options = {}) {
    loadLocalDB();
    const userIndex = dbData.users.findIndex(u => u.id === id || u._id === id);
    if (userIndex === -1) return null;
    
    const fieldsToUpdate = update.$set || update;
    Object.assign(dbData.users[userIndex], fieldsToUpdate);
    saveLocalDB();
    return dbData.users[userIndex];
  }
}

class LocalReportModel {
  static async find(query = {}) {
    loadLocalDB();
    const filterQuery = query || {};
    return dbData.reports.filter(r => {
      for (let key in filterQuery) {
        if (r[key] !== filterQuery[key]) return false;
      }
      return true;
    });
  }

  static async create(reportData) {
    loadLocalDB();
    const newReport = {
      _id: Date.now().toString(),
      id: Date.now().toString(),
      timestamp: new Date(),
      ...reportData
    };
    dbData.reports.push(newReport);
    saveLocalDB();
    return newReport;
  }

  static async deleteOne(query = {}) {
    loadLocalDB();
    const filterQuery = query || {};
    const initialLength = dbData.reports.length;
    dbData.reports = dbData.reports.filter(r => {
      for (let key in filterQuery) {
        if (r[key] === filterQuery[key]) return false;
      }
      return true;
    });
    saveLocalDB();
    return { deletedCount: initialLength - dbData.reports.length };
  }
}

// Define Mongoose Models
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  gender: { type: String, required: true },
  country: { type: String, required: true },
  isVIP: { type: Boolean, default: false },
  vipExpiry: { type: Date, default: null },
  hasVipStar: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const ReportSchema = new mongoose.Schema({
  reporter: { type: String, required: true },
  reported: { type: String, required: true },
  reason: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const MongoUserModel = mongoose.model('User', UserSchema);
const MongoReportModel = mongoose.model('Report', ReportSchema);

// Setup Database Selection
const mongoUri = process.env.MONGODB_URI;

if (mongoUri && mongoUri.trim() !== '') {
  console.log('Connecting to MongoDB...');
  mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000
  })
    .then(() => {
      console.log('MongoDB connected successfully!');
      isMongoConnected = true;
    })
    .catch(err => {
      console.error('MongoDB connection error, falling back to local database:', err.message);
      isMongoConnected = false;
      loadLocalDB();
    });
} else {
  console.log('No MONGODB_URI found. Using local JSON database (local_db.json)...');
  isMongoConnected = false;
  loadLocalDB();
}

// Ensure default local admin exists
(async () => {
  loadLocalDB();
  const adminExists = dbData.users.find(u => u.username === 'admin');
  if (!adminExists) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);
    dbData.users.push({
      _id: 'admin_id',
      id: 'admin_id',
      username: 'admin',
      password: hashedPassword,
      gender: 'other',
      country: 'LY',
      isVIP: true,
      isAdmin: true,
      isBanned: false,
      createdAt: new Date()
    });
    saveLocalDB();
    console.log('Default Local Admin Account Created: admin / admin123');
  }
})();

// Database Wrapper to dynamically switch between Mongo and Local DB
const UserWrapper = {
  findOne: async (query = {}) => {
    return isMongoConnected ? MongoUserModel.findOne(query) : LocalUserModel.findOne(query);
  },
  findById: async (id) => {
    return isMongoConnected ? MongoUserModel.findById(id) : LocalUserModel.findById(id);
  },
  find: async (query = {}) => {
    return isMongoConnected ? MongoUserModel.find(query) : LocalUserModel.find(query);
  },
  create: async (data) => {
    return isMongoConnected ? MongoUserModel.create(data) : LocalUserModel.create(data);
  },
  updateOne: async (query = {}, update = {}) => {
    return isMongoConnected ? MongoUserModel.updateOne(query, update) : LocalUserModel.updateOne(query, update);
  },
  findByIdAndUpdate: async (id, update, options = {}) => {
    return isMongoConnected ? MongoUserModel.findByIdAndUpdate(id, update, options) : LocalUserModel.findByIdAndUpdate(id, update, options);
  }
};

const ReportWrapper = {
  find: async (query = {}) => {
    return isMongoConnected ? MongoReportModel.find(query) : LocalReportModel.find(query);
  },
  create: async (data) => {
    return isMongoConnected ? MongoReportModel.create(data) : LocalReportModel.create(data);
  },
  deleteOne: async (query = {}) => {
    return isMongoConnected ? MongoReportModel.deleteOne(query) : LocalReportModel.deleteOne(query);
  }
};

module.exports = {
  User: UserWrapper,
  Report: ReportWrapper,
  isMongoDB: () => isMongoConnected
};
