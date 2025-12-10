const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  key: { type: String, default: 'admin_settings', unique: true },
  password: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Admin', adminSchema);
