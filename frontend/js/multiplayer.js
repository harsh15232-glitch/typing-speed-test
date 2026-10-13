/* multiplayer.js — Socket.io client for real-time typing races */

(function () {
  "use strict";

  const el = {
    lobbyView: document.getElementById("lobbyView"),
    raceView: document.getElementById("raceView"),
    mpStatus: document.getElementById("mpStatus"),

    durationChips: document.querySelectorAll("#mpDurationChips .chip"),
    difficultyChips: document.querySelectorAll("#mpDifficultyChips .chip"),
    guestNameInput: document.getElementById("guestNameInput"),

    quickMatchBtn: document.getElementById("quickMatchBtn"),
    createRoomBtn: document.getElementById("createRoomBtn"),
    joinRoomBtn: document.getElementById("joinRoomBtn"),
    roomCodeInput: document.getElementById("roomCodeInput"),

    roomCodeLabel: document.getElementById("roomCodeLabel"),
    startRaceBtn: document.getElementById("startRaceBtn"),
    leaveRoomBtn: document.getElementById("leaveRoomBtn"),
    countdownDisplay: document.getElementById("countdownDisplay"),
    racersList: document.getElementById("racersList"),

    mpStatsStrip: document.getElementById("mpStatsStrip"),
    mpWpmLive: document.getElementById("mpWpmLive"),
    mpAccLive: document.getElementById("mpAccLive"),
    mpTimeLive: document.getElementById("mpTimeLive"),

    mpTypingCard: document.getElementById("mpTypingCard"),
    mpWordsDisplay: document.getElementById("mpWordsDisplay"),
    mpCaret: document.getElementById("mpCaret"),
    mpHiddenInput: document.getElementById("mpHiddenInput"),
    mpTypingArea: document.getElementById("mpTypingArea"),

    mpResultsPanel: document.getElementById("mpResultsPanel"),
    mpResultsList: document.getElementById("mpResultsList"),
    raceAgainBtn: document.getElementById("raceAgainBtn"),
  };

  let selected = { duration: 60, difficulty: "medium" };
  let currentRoom = null; // { code, isHost }
  let isHost = false;
  let race = { chars: [], cursor: 0, correct: 0, total: 0, startTime: null, duration: 60, timer: null, finished: false };

  const savedName = localStorage.getItem("tst_mp_name");
  if (savedName) el.guestNameInput.value = savedName;

  const socket = io(window.APP_CONFIG.SOCKET_URL, {
    auth: {
      token: window.Auth ? window.Auth.getToken() : null,
      guestName: (savedName || "Guest"),
    },
    autoConnect: false,
  });

  // ---------- Lobby controls ----------
  el.durationChips.forEach(chip => chip.addEventListener("click", () => {
    el.durationChips.forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    selected.duration = Number(chip.dataset.duration);
  }));
  el.difficultyChips.forEach(chip => chip.addEventListener("click", () => {
    el.difficultyChips.forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    selected.difficulty = chip.dataset.difficulty;
  }));

  function connectSocket() {
    const name = el.guestNameInput.value.trim() || "Guest";
    localStorage.setItem("tst_mp_name", name);
    socket.auth.guestName = name;
    socket.auth.token = window.Auth ? window.Auth.getToken() : null;
    if (!socket.connected) socket.connect();
  }

  el.quickMatchBtn.addEventListener("click", () => {
    connectSocket();
    setStatus("Searching for opponents…");
    socket.emit("quickMatch", selected);
  });

  el.createRoomBtn.addEventListener("click", () => {
    connectSocket();
    socket.emit("createRoom", selected);
  });

  el.joinRoomBtn.addEventListener("click", () => {
    const code = el.roomCodeInput.value.trim().toUpperCase();
    if (!code) return setStatus("Enter a room code to join.");
    connectSocket();
    socket.emit("joinRoom", { code });
  });

  el.startRaceBtn.addEventListener("click", () => {
    if (currentRoom && isHost) socket.emit("startRace", { code: currentRoom.code });
  });

  el.leaveRoomBtn.addEventListener("click", () => {
    socket.emit("leaveRoom");
    resetToLobby();
  });

  el.raceAgainBtn.addEventListener("click", resetToLobby);

  function setStatus(msg) { el.mpStatus.textContent = msg; }

  function resetToLobby() {
    currentRoom = null;
    isHost = false;
    el.raceView.classList.add("hidden");
    el.lobbyView.classList.remove("hidden");
    el.mpResultsPanel.classList.add("hidden");
    el.mpTypingCard.classList.add("hidden");
    el.mpStatsStrip.classList.add("hidden");
    el.countdownDisplay.classList.add("hidden");
    setStatus("");
  }

  // ---------- Socket events ----------
  socket.on("matchmaking:waiting", () => setStatus("Waiting for more players to join…"));

  socket.on("errorMsg", ({ message }) => setStatus(message));

  socket.on("room:joined", ({ code, players, isHost: hostFlag }) => {
    currentRoom = { code };
    isHost = !!hostFlag;
    el.roomCodeLabel.textContent = code;
    el.startRaceBtn.classList.toggle("hidden", !isHost);
    el.lobbyView.classList.add("hidden");
    el.raceView.classList.remove("hidden");
    renderRacers(players);
    setStatus(isHost ? "You're the host — start when ready." : "Waiting for the host to start the race…");
  });

  socket.on("room:playersUpdate", ({ players }) => renderRacers(players));

  socket.on("race:countdown", ({ seconds }) => {
    el.countdownDisplay.classList.remove("hidden");
    el.countdownDisplay.textContent = seconds > 0 ? seconds : "Go!";
    window.soundEngine.countdown();
  });

  socket.on("race:start", ({ text, duration, startTime }) => {
    el.countdownDisplay.classList.add("hidden");
    el.mpTypingCard.classList.remove("hidden");
    el.mpStatsStrip.classList.remove("hidden");
    startLocalRace(text, duration, startTime);
    window.soundEngine.start();
  });

  socket.on("race:progress", ({ socketId, progress, wpm }) => updateRacerBar(socketId, progress, wpm));

  socket.on("race:playerFinished", ({ socketId, place }) => markRacerFinished(socketId, place));

  socket.on("race:allFinished", ({ results }) => showRaceResults(results));

  // ---------- Racer list rendering ----------
  function renderRacers(players) {
    el.racersList.innerHTML = "";
    players.forEach(p => {
      const row = document.createElement("div");
      row.className = "racer-row";
      row.id = "racer_" + p.socketId;
      const youTag = p.socketId === socket.id ? '<span class="you-tag">YOU</span>' : "";
      row.innerHTML = `
        <div class="racer-top">
          <span class="racer-name">${escapeHTML(p.username)} ${youTag}</span>
          <span class="racer-wpm">${p.wpm || 0} wpm</span>
        </div>
        <div class="racer-track"><div class="racer-fill" style="width:${p.progress || 0}%"></div></div>
      `;
      el.racersList.appendChild(row);
    });
  }

  function updateRacerBar(socketId, progress, wpm) {
    const row = document.getElementById("racer_" + socketId);
    if (!row) return;
    row.querySelector(".racer-fill").style.width = progress + "%";
    row.querySelector(".racer-wpm").textContent = wpm + " wpm";
  }

  function markRacerFinished(socketId, place) {
    const row = document.getElementById("racer_" + socketId);
    if (!row) return;
    row.classList.add("finished");
    if (place === 1) row.classList.add("rank-1");
    const nameEl = row.querySelector(".racer-name");
    nameEl.innerHTML += ` <span class="tag tag-easy">#${place}</span>`;
    if (socketId === socket.id) window.soundEngine.finish();
  }

  function showRaceResults(results) {
    el.mpTypingCard.classList.add("hidden");
    el.mpStatsStrip.classList.add("hidden");
    el.mpResultsPanel.classList.remove("hidden");
    el.mpResultsList.innerHTML = "";
    results.forEach(r => {
      const row = document.createElement("div");
      row.className = "mp-result-row";
      const medal = r.place === 1 ? "🥇" : r.place === 2 ? "🥈" : r.place === 3 ? "🥉" : `#${r.place}`;
      row.innerHTML = `<span>${medal}</span><span>${escapeHTML(r.username)}</span><span>${r.wpm} wpm</span><span>${r.accuracy}%</span>`;
      el.mpResultsList.appendChild(row);
    });
    if (results[0] && results[0].socketId === socket.id) window.soundEngine.newBest();
  }

  // ---------- Local typing engine for the race ----------
  function startLocalRace(text, duration, serverStartTime) {
    race = {
      chars: text.split("").map(c => ({ char: c, status: "pending" })),
      cursor: 0, correct: 0, total: 0,
      startTime: serverStartTime, duration, finished: false,
    };
    renderRaceWords();
    el.mpHiddenInput.value = "";
    el.mpHiddenInput.focus();

    let timeLeft = duration;
    clearInterval(race.timer);
    race.timer = setInterval(() => {
      timeLeft--;
      el.mpTimeLive.textContent = formatTime(Math.max(0, timeLeft));
      if (timeLeft <= 0) {
        clearInterval(race.timer);
        if (!race.finished) submitFinish();
      }
    }, 1000);
    el.mpTimeLive.textContent = formatTime(duration);
  }

  function renderRaceWords() {
    const frag = document.createDocumentFragment();
    race.chars.forEach((c, i) => {
      const span = document.createElement("span");
      span.className = "char " + c.status;
      span.dataset.index = i;
      span.textContent = c.char === " " ? "\u00A0" : c.char;
      frag.appendChild(span);
    });
    el.mpWordsDisplay.innerHTML = "";
    el.mpWordsDisplay.appendChild(frag);
    positionMpCaret();
  }

  function positionMpCaret() {
    const target = el.mpWordsDisplay.querySelector(`.char[data-index="${race.cursor}"]`) || el.mpWordsDisplay.lastElementChild;
    if (!target) return;
    const areaRect = el.mpTypingArea.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    el.mpCaret.style.top = (r.top - areaRect.top) + "px";
    el.mpCaret.style.left = (r.left - areaRect.left) + "px";
    el.mpCaret.style.height = r.height + "px";
  }

  el.mpHiddenInput.addEventListener("paste", e => e.preventDefault());
  el.mpHiddenInput.addEventListener("input", (e) => {
    if (race.finished) return;
    const val = e.target.value;
    if (!val) return;
    const lastChar = val[val.length - 1];

    if (e.inputType === "deleteContentBackward") {
      if (race.cursor > 0) {
        race.cursor--;
        race.chars[race.cursor].status = "pending";
        updateMpCharClass(race.cursor);
        positionMpCaret();
      }
      e.target.value = "";
      return;
    }

    if (race.cursor >= race.chars.length) { e.target.value = ""; return; }
    const expected = race.chars[race.cursor].char;
    race.total++;
    if (lastChar === expected) {
      race.chars[race.cursor].status = "correct";
      race.correct++;
      window.soundEngine.keyPress();
    } else {
      race.chars[race.cursor].status = "incorrect";
      window.soundEngine.keyError();
    }
    updateMpCharClass(race.cursor);
    race.cursor++;
    positionMpCaret();
    e.target.value = "";

    const elapsedMin = (Date.now() - race.startTime) / 60000;
    const wpm = elapsedMin > 0 ? Math.round((race.correct / 5) / elapsedMin) : 0;
    const acc = race.total > 0 ? Math.round((race.correct / race.total) * 100) : 100;
    const progress = Math.round((race.cursor / race.chars.length) * 100);

    el.mpWpmLive.textContent = wpm;
    el.mpAccLive.textContent = acc + "%";

    socket.emit("progress", { code: currentRoom.code, progress, wpm, accuracy: acc });

    if (race.cursor >= race.chars.length && !race.finished) {
      submitFinish(wpm, acc);
    }
  });

  function updateMpCharClass(index) {
    const span = el.mpWordsDisplay.querySelector(`.char[data-index="${index}"]`);
    if (span) span.className = "char " + race.chars[index].status;
  }

  function submitFinish(wpmOverride, accOverride) {
    race.finished = true;
    clearInterval(race.timer);
    const elapsedMin = (Date.now() - race.startTime) / 60000;
    const wpm = wpmOverride != null ? wpmOverride : Math.round((race.correct / 5) / Math.max(elapsedMin, 1 / 60));
    const acc = accOverride != null ? accOverride : (race.total > 0 ? Math.round((race.correct / race.total) * 100) : 100);
    socket.emit("finish", { code: currentRoom.code, wpm, accuracy: acc });
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function escapeHTML(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  document.addEventListener("keydown", (e) => {
    if (!el.raceView.classList.contains("hidden") && !el.mpTypingCard.classList.contains("hidden")) {
      if (document.activeElement !== el.mpHiddenInput && e.key.length === 1) el.mpHiddenInput.focus();
    }
  });
})();
