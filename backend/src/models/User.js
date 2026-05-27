const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: String,
    role: {
      type: String,
      enum: ['admin'],
      default: 'admin',
    },
    provider: {
      type: String,
      enum: ['local', 'google'],
      default: 'local',
    },
    googleSub: String,
    picture: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
