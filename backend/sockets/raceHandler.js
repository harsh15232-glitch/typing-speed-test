const { generateText } = require("../utils/words");
const { verifySocketToken } = require("../middleware/auth");
const User = require("../models/User");
const Race = require("../models/Race");

const MIN_PLAYERS_TO_START = 2;
const MAX_PLAYERS_PER_ROOM = 6;
const QUICK_MATCH_WAIT_MS = 12000;
const COUNTDOWN_SECONDS = 5;

/** In-memory room store. Shape:
 * { code, duration, difficulty, text, status, players: Map<socketId, PlayerState>, hostId, timers: {} }
 */
const rooms = new Map();
const quickMatchQueue = []; // [{socketId, duration, difficulty, joinedAt}]

function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? makeRoomCode() : code;
}

function publicPlayers(room) {
  return Array.from(room.players.values()).map((p) => ({
    socketId: p.socketId,
    username: p.username,
    progress: p.progress,
    wpm: p.wpm,
    accuracy: p.accuracy,
    finished: p.finished,
    place: p.place,
  }));
}

function createRoom(duration, difficulty) {
  const code = makeRoomCode();
  const room = {
    code,
    duration,
    difficulty,
    text: generateText(difficulty, Math.max(120, Math.ceil(duration / 60) * 60)),
    status: "waiting", // waiting | countdown | racing | finished
    players: new Map(),
    hostId: null,
    finishOrder: [],
  };
  rooms.set(code, room);
  return room;
}

function attachRaceHandlers(io) {
  io.use((socket, next) => {
    // optional auth: guests allowed, but decode token if present for identity
    const token = socket.handshake.auth?.token;
    if (token) {
      const payload = verifySocketToken(token);
      if (payload) socket.userId = payload.sub;
    }
    socket.guestName = socket.handshake.auth?.guestName || "Guest";
    next();
  });

  io.on("connection", (socket) => {
    socket.on("quickMatch", async ({ duration = 60, difficulty = "medium" } = {}) => {
      const username = await resolveUsername(socket);
      leaveAllRooms(socket, io);

      quickMatchQueue.push({ socketId: socket.id, socket, username, duration, difficulty, joinedAt: Date.now() });
      socket.emit("matchmaking:waiting", { position: quickMatchQueue.length });
      tryMatch(io, duration, difficulty);
    });

    socket.on("createRoom", async ({ duration = 60, difficulty = "medium" } = {}) => {
      const username = await resolveUsername(socket);
      leaveAllRooms(socket, io);
      const room = createRoom(duration, difficulty);
      room.hostId = socket.id;
      addPlayerToRoom(room, socket, username);
      socket.join(room.code);
      socket.emit("room:joined", { code: room.code, players: publicPlayers(room), isHost: true, duration, difficulty });
    });

    socket.on("joinRoom", async ({ code }) => {
      const room = rooms.get((code || "").toUpperCase());
      if (!room) return socket.emit("errorMsg", { message: "Room not found." });
      if (room.status !== "waiting") return socket.emit("errorMsg", { message: "Race already in progress." });
      if (room.players.size >= MAX_PLAYERS_PER_ROOM) return socket.emit("errorMsg", { message: "Room is full." });

      const username = await resolveUsername(socket);
      leaveAllRooms(socket, io);
      addPlayerToRoom(room, socket, username);
      socket.join(room.code);
      io.to(room.code).emit("room:playersUpdate", { players: publicPlayers(room) });
      socket.emit("room:joined", { code: room.code, players: publicPlayers(room), isHost: room.hostId === socket.id, duration: room.duration, difficulty: room.difficulty });
    });

    socket.on("startRace", ({ code }) => {
      const room = rooms.get(code);
      if (!room || room.hostId !== socket.id) return;
      if (room.players.size < 1) return;
      beginCountdown(io, room);
    });

    socket.on("progress", ({ code, progress, wpm, accuracy }) => {
      const room = rooms.get(code);
      if (!room || room.status !== "racing") return;
      const player = room.players.get(socket.id);
      if (!player || player.finished) return;
      player.progress = Math.min(100, Math.max(0, progress));
      player.wpm = wpm || 0;
      player.accuracy = accuracy != null ? accuracy : player.accuracy;
      socket.to(room.code).emit("race:progress", {
        socketId: socket.id, progress: player.progress, wpm: player.wpm, accuracy: player.accuracy,
      });
    });

    socket.on("finish", async ({ code, wpm, accuracy }) => {
      const room = rooms.get(code);
      if (!room || room.status !== "racing") return;
      const player = room.players.get(socket.id);
      if (!player || player.finished) return;

      player.finished = true;
      player.progress = 100;
      player.wpm = wpm || player.wpm;
      player.accuracy = accuracy != null ? accuracy : player.accuracy;
      room.finishOrder.push(player);
      player.place = room.finishOrder.length;

      io.to(room.code).emit("race:playerFinished", {
        socketId: socket.id, place: player.place, wpm: player.wpm, accuracy: player.accuracy,
      });

      if (player.userId) updateUserRaceStats(player.userId, player.place === 1).catch(() => {});

      const allFinished = Array.from(room.players.values()).every((p) => p.finished);
      if (allFinished) finishRace(io, room);
    });

    socket.on("leaveRoom", () => leaveAllRooms(socket, io));

    socket.on("disconnect", () => {
      // remove from quick match queue
      const qIdx = quickMatchQueue.findIndex((q) => q.socketId === socket.id);
      if (qIdx !== -1) quickMatchQueue.splice(qIdx, 1);
      leaveAllRooms(socket, io);
    });
  });
}

async function resolveUsername(socket) {
  if (socket.userId) {
    try {
      const user = await User.findById(socket.userId).select("username");
      if (user) return user.username;
    } catch { /* fall through to guest */ }
  }
  return socket.guestName || "Guest";
}

function addPlayerToRoom(room, socket, username) {
  room.players.set(socket.id, {
    socketId: socket.id,
    userId: socket.userId || null,
    username,
    progress: 0,
    wpm: 0,
    accuracy: 100,
    finished: false,
    place: null,
  });
}

function leaveAllRooms(socket, io) {
  for (const [code, room] of rooms) {
    if (room.players.has(socket.id)) {
      room.players.delete(socket.id);
      socket.leave(code);
      if (room.players.size === 0) {
        clearTimeout(room.countdownTimer);
        rooms.delete(code);
      } else {
        if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
        io.to(code).emit("room:playersUpdate", { players: publicPlayers(room) });
      }
    }
  }
}

function tryMatch(io, duration, difficulty) {
  const eligible = quickMatchQueue.filter((q) => q.duration === duration && q.difficulty === difficulty);
  const oldestWait = eligible.length ? Date.now() - eligible[0].joinedAt : 0;

  if (eligible.length >= MAX_PLAYERS_PER_ROOM || (eligible.length >= MIN_PLAYERS_TO_START && oldestWait >= QUICK_MATCH_WAIT_MS)) {
    const chosen = eligible.slice(0, MAX_PLAYERS_PER_ROOM);
    chosen.forEach((q) => {
      const i = quickMatchQueue.indexOf(q);
      if (i !== -1) quickMatchQueue.splice(i, 1);
    });

    const room = createRoom(duration, difficulty);
    chosen.forEach((q) => {
      addPlayerToRoom(room, q.socket, q.username);
      q.socket.join(room.code);
    });
    room.hostId = chosen[0].socketId;

    io.to(room.code).emit("room:joined", { code: room.code, players: publicPlayers(room), duration, difficulty, matched: true });
    beginCountdown(io, room);
  } else if (eligible.length >= MIN_PLAYERS_TO_START) {
    // schedule a re-check for when the wait threshold elapses
    setTimeout(() => tryMatch(io, duration, difficulty), QUICK_MATCH_WAIT_MS - oldestWait + 50);
  }
}

function beginCountdown(io, room) {
  if (room.status !== "waiting") return;
  room.status = "countdown";
  let secondsLeft = COUNTDOWN_SECONDS;
  io.to(room.code).emit("race:countdown", { seconds: secondsLeft });

  room.countdownTimer = setInterval(() => {
    secondsLeft--;
    if (secondsLeft > 0) {
      io.to(room.code).emit("race:countdown", { seconds: secondsLeft });
    } else {
      clearInterval(room.countdownTimer);
      room.status = "racing";
      room.startTime = Date.now();
      io.to(room.code).emit("race:start", {
        text: room.text, duration: room.duration, startTime: room.startTime,
      });
      room.raceTimeout = setTimeout(() => finishRace(io, room), room.duration * 1000 + 3000);
    }
  }, 1000);
}

function finishRace(io, room) {
  if (room.status === "finished") return;
  clearTimeout(room.raceTimeout);
  room.status = "finished";

  // anyone unfinished gets ranked by progress descending, after finishers
  const unfinished = Array.from(room.players.values()).filter((p) => !p.finished)
    .sort((a, b) => b.progress - a.progress || b.wpm - a.wpm);
  let place = room.finishOrder.length;
  unfinished.forEach((p) => { place++; p.place = place; });

  const results = Array.from(room.players.values())
    .sort((a, b) => (a.place || 999) - (b.place || 999))
    .map((p) => ({ socketId: p.socketId, username: p.username, wpm: p.wpm, accuracy: p.accuracy, place: p.place }));

  io.to(room.code).emit("race:allFinished", { results });

  Race.create({
    roomCode: room.code,
    duration: room.duration,
    difficulty: room.difficulty,
    participants: results.map((r) => ({ username: r.username, wpm: r.wpm, accuracy: r.accuracy, place: r.place })),
  }).catch((e) => console.error("[race] save failed:", e.message));

  setTimeout(() => rooms.delete(room.code), 30000);
}

async function updateUserRaceStats(userId, won) {
  const inc = won ? { "stats.racesPlayed": 1, "stats.racesWon": 1 } : { "stats.racesPlayed": 1 };
  await User.findByIdAndUpdate(userId, { $inc: inc });
}

module.exports = { attachRaceHandlers };
