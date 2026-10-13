const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const bestSchema = new mongoose.Schema({
  duration: Number,
  difficulty: String,
  wpm: Number,
  accuracy: Number,
  date: { type: Date, default: Date.now }
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 20 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  avatarSeed: { type: String, default: () => Math.random().toString(36).slice(2) },

  stats: {
    testsCompleted: { type: Number, default: 0 },
    totalWords: { type: Number, default: 0 },
    avgWpm: { type: Number, default: 0 },
    avgAccuracy: { type: Number, default: 0 },
    highestWpm: { type: Number, default: 0 },
    racesWon: { type: Number, default: 0 },
    racesPlayed: { type: Number, default: 0 },
  },

  bests: [bestSchema],
}, { timestamps: true });

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.methods.toPublicJSON = function () {
  return {
    id: this._id,
    username: this.username,
    avatarSeed: this.avatarSeed,
    stats: this.stats,
    bests: this.bests,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("User", userSchema);
