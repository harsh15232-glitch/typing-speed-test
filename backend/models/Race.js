const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  username: String,
  wpm: Number,
  accuracy: Number,
  place: Number,
}, { _id: false });

const raceSchema = new mongoose.Schema({
  roomCode: String,
  duration: Number,
  difficulty: String,
  participants: [participantSchema],
  finishedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("Race", raceSchema);
