/* app.js — core typing test engine: timing, WPM/accuracy, rendering, results, PB, leaderboard */

(function () {
  "use strict";

  const S = window.TypingStorage;
  const settings = S.loadSettings();

  // ---------- DOM ----------
  const el = {
    wordsDisplay: document.getElementById("wordsDisplay"),
    hiddenInput: document.getElementById("hiddenInput"),
    caret: document.getElementById("caret"),
    typingArea: document.getElementById("typingArea"),

    wpmLive: document.getElementById("wpmLive"),
    accLive: document.getElementById("accLive"),
    timeLive: document.getElementById("timeLive"),
    progressBar: document.getElementById("progressBar"),

    durationChips: document.querySelectorAll("[data-duration]"),
    difficultyChips: document.querySelectorAll("[data-difficulty]"),

    restartBtn: document.getElementById("restartBtn"),
    startOverlay: document.getElementById("startOverlay"),

    resultsPanel: document.getElementById("resultsPanel"),
    resWpm: document.getElementById("resWpm"),
    resAcc: document.getElementById("resAcc"),
    resRaw: document.getElementById("resRaw"),
    resChars: document.getElementById("resChars"),
    resTime: document.getElementById("resTime"),
    resBestBadge: document.getElementById("resBestBadge"),
    resChart: document.getElementById("resChart"),
    tryAgainBtn: document.getElementById("tryAgainBtn"),
    saveScoreBtn: document.getElementById("saveScoreBtn"),

    leaderboardList: document.getElementById("leaderboardList"),
    bestsGrid: document.getElementById("bestsGrid"),

    soundToggle: document.getElementById("soundToggle"),
    volumeSlider: document.getElementById("volumeSlider"),

    playerNameInput: document.getElementById("playerNameInput"),
    shortcutsHint: document.getElementById("shortcutsHint"),
  };

  // ---------- State ----------
  let state = resetState();

  function resetState() {
    return {
      words: "",
      chars: [],            // {char, status: 'pending'|'correct'|'incorrect'}
      cursor: 0,
      startTime: null,
      timer: null,
      timeLeft: settings.duration,
      totalTyped: 0,
      correctTyped: 0,
      incorrectTyped: 0,
      wpmSamples: [],        // for chart: {t, wpm}
      running: false,
      finished: false,
    };
  }

  // ---------- Init ----------
  function init() {
    applySettingsToUI();
    buildNewText();
    bindEvents();
    renderBests();
    renderLeaderboard();
    el.soundToggle.checked = settings.soundEnabled;
    el.volumeSlider.value = settings.soundVolume;
    window.soundEngine.setEnabled(settings.soundEnabled);
    window.soundEngine.setVolume(settings.soundVolume);
    el.playerNameInput.value = S.getProfile().name || "Guest";
  }

  function applySettingsToUI() {
    el.durationChips.forEach(chip => {
      chip.classList.toggle("active", Number(chip.dataset.duration) === settings.duration);
    });
    el.difficultyChips.forEach(chip => {
      chip.classList.toggle("active", chip.dataset.difficulty === settings.difficulty);
    });
  }

  function buildNewText() {
    state = resetState();
    const wordCount = Math.max(80, Math.ceil(settings.duration / 60) * 60);
    state.words = window.generateText(settings.difficulty, wordCount);
    state.chars = state.words.split("").map(c => ({ char: c, status: "pending" }));
    state.timeLeft = settings.duration;
    renderWords();
    updateLiveStats(0, 100, formatTime(state.timeLeft));
    el.progressBar.style.width = "0%";
    el.resultsPanel.classList.remove("visible");
    el.startOverlay.classList.remove("hidden");
    el.hiddenInput.value = "";
    focusInput();
  }

  function focusInput() { el.hiddenInput.focus(); }

  // ---------- Rendering ----------
  function renderWords() {
    const frag = document.createDocumentFragment();
    state.chars.forEach((c, i) => {
      const span = document.createElement("span");
      span.className = "char " + c.status;
      span.dataset.index = i;
      span.textContent = c.char === " " ? "\u00A0" : c.char;
      frag.appendChild(span);
    });
    el.wordsDisplay.innerHTML = "";
    el.wordsDisplay.appendChild(frag);
    positionCaret();
  }

  function positionCaret() {
    const target = el.wordsDisplay.querySelector(`.char[data-index="${state.cursor}"]`)
      || el.wordsDisplay.lastElementChild;
    if (!target) return;
    const areaRect = el.typingArea.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    el.caret.style.top = (r.top - areaRect.top) + "px";
    el.caret.style.left = (r.left - areaRect.left) + "px";
    el.caret.style.height = r.height + "px";

    // autoscroll: keep caret line roughly centered within the viewport window
    const lineHeight = r.height;
    const relativeTop = r.top - areaRect.top;
    if (relativeTop > lineHeight * 2.4) {
      el.wordsDisplay.scrollTop += lineHeight * 1.2;
    }
  }

  function updateCharClass(index) {
    const span = el.wordsDisplay.querySelector(`.char[data-index="${index}"]`);
    if (span) span.className = "char " + state.chars[index].status;
  }

  // ---------- Core typing logic ----------
  function onInput(e) {
    if (state.finished) return;
    const val = e.target.value;
    if (val.length === 0) return;

    if (!state.running) startTest();

    const lastChar = val[val.length - 1];

    if (e.inputType === "deleteContentBackward") {
      if (state.cursor > 0) {
        state.cursor--;
        state.chars[state.cursor].status = "pending";
        updateCharClass(state.cursor);
        positionCaret();
      }
      e.target.value = "";
      return;
    }

    if (state.cursor >= state.chars.length) { e.target.value = ""; return; }

    const expected = state.chars[state.cursor].char;
    state.totalTyped++;

    if (lastChar === expected) {
      state.chars[state.cursor].status = "correct";
      state.correctTyped++;
      window.soundEngine.keyPress();
    } else {
      state.chars[state.cursor].status = "incorrect";
      state.incorrectTyped++;
      window.soundEngine.keyError();
      el.typingArea.classList.add("shake");
      setTimeout(() => el.typingArea.classList.remove("shake"), 150);
    }
    updateCharClass(state.cursor);
    state.cursor++;
    positionCaret();
    e.target.value = "";

    updateLiveStatsFromState();

    if (state.cursor >= state.chars.length) {
      extendTextIfNeeded();
    }
  }

  function extendTextIfNeeded() {
    // append more text so the test can keep going until time runs out
    const more = window.generateText(settings.difficulty, 60);
    const startIdx = state.chars.length;
    const moreChars = (" " + more).split("").map(c => ({ char: c, status: "pending" }));
    state.chars = state.chars.concat(moreChars);
    state.words += " " + more;
    const frag = document.createDocumentFragment();
    moreChars.forEach((c, i) => {
      const span = document.createElement("span");
      span.className = "char pending";
      span.dataset.index = startIdx + i;
      span.textContent = c.char === " " ? "\u00A0" : c.char;
      frag.appendChild(span);
    });
    el.wordsDisplay.appendChild(frag);
  }

  function preventPaste(e) {
    e.preventDefault();
    flashNotice("Pasting is disabled to keep results fair.");
  }

  function flashNotice(msg) {
    let n = document.getElementById("noticeToast");
    if (!n) {
      n = document.createElement("div");
      n.id = "noticeToast";
      n.className = "toast";
      document.body.appendChild(n);
    }
    n.textContent = msg;
    n.classList.add("show");
    clearTimeout(n._t);
    n._t = setTimeout(() => n.classList.remove("show"), 1800);
  }

  // ---------- Timer / lifecycle ----------
  function startTest() {
    state.running = true;
    state.startTime = Date.now();
    el.startOverlay.classList.add("hidden");
    window.soundEngine.start();
    state.timer = setInterval(tick, 1000);
  }

  function tick() {
    state.timeLeft--;
    if (state.timeLeft <= 3 && state.timeLeft > 0) window.soundEngine.countdown();
    const elapsedMin = (Date.now() - state.startTime) / 60000;
    const wpmNow = elapsedMin > 0 ? Math.round((state.correctTyped / 5) / elapsedMin) : 0;
    state.wpmSamples.push({ t: settings.duration - state.timeLeft, wpm: wpmNow });
    updateLiveStatsFromState();
    if (state.timeLeft <= 0) finishTest();
  }

  function updateLiveStatsFromState() {
    const elapsedMin = state.startTime ? (Date.now() - state.startTime) / 60000 : 0;
    const wpm = elapsedMin > 0 ? Math.round((state.correctTyped / 5) / elapsedMin) : 0;
    const acc = state.totalTyped > 0 ? Math.round((state.correctTyped / state.totalTyped) * 100) : 100;
    updateLiveStats(wpm, acc, formatTime(state.timeLeft));
    const pct = Math.min(100, Math.round(((settings.duration - state.timeLeft) / settings.duration) * 100));
    el.progressBar.style.width = pct + "%";
  }

  function updateLiveStats(wpm, acc, timeStr) {
    el.wpmLive.textContent = wpm;
    el.accLive.textContent = acc + "%";
    el.timeLive.textContent = timeStr;
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function finishTest() {
    clearInterval(state.timer);
    state.running = false;
    state.finished = true;
    el.hiddenInput.blur();

    const elapsedMin = settings.duration / 60;
    const grossWords = state.totalTyped / 5;
    const netWpm = Math.max(0, Math.round((state.correctTyped / 5) / elapsedMin));
    const rawWpm = Math.round(grossWords / elapsedMin);
    const accuracy = state.totalTyped > 0 ? Math.round((state.correctTyped / state.totalTyped) * 100) : 100;

    window.soundEngine.finish();

    const result = {
      wpm: netWpm,
      raw: rawWpm,
      accuracy,
      correct: state.correctTyped,
      incorrect: state.incorrectTyped,
      duration: settings.duration,
      difficulty: settings.difficulty,
      date: new Date().toISOString(),
    };

    showResults(result);

    const key = `${settings.duration}_${settings.difficulty}`;
    const isNewBest = S.updateBestIfHigher(key, result);
    if (isNewBest) {
      window.soundEngine.newBest();
      el.resBestBadge.classList.remove("hidden");
    } else {
      el.resBestBadge.classList.add("hidden");
    }
    S.pushHistory(result);
    renderBests();

    window._lastResult = result;
  }

  function showResults(result) {
    el.resultsPanel.classList.add("visible");
    el.resWpm.textContent = result.wpm;
    el.resAcc.textContent = result.accuracy + "%";
    el.resRaw.textContent = result.raw;
    el.resChars.textContent = `${result.correct}/${result.incorrect}`;
    el.resTime.textContent = formatTime(result.duration);
    drawChart(state.wpmSamples);
  }

  function drawChart(samples) {
    const canvas = el.resChart;
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.clientWidth * devicePixelRatio;
    const h = canvas.height = canvas.clientHeight * devicePixelRatio;
    ctx.clearRect(0, 0, w, h);
    if (samples.length < 2) return;
    const maxWpm = Math.max(...samples.map(s => s.wpm), 10);
    const stepX = w / (samples.length - 1);

    ctx.beginPath();
    samples.forEach((s, i) => {
      const x = i * stepX;
      const y = h - (s.wpm / maxWpm) * (h * 0.85) - 4;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#00e5a0";
    ctx.lineWidth = 2 * devicePixelRatio;
    ctx.lineJoin = "round";
    ctx.stroke();

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "rgba(0,229,160,0.25)");
    grad.addColorStop(1, "rgba(0,229,160,0)");
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  function renderBests() {
    const bests = S.getBests();
    const keys = Object.keys(bests);
    el.bestsGrid.innerHTML = "";
    if (keys.length === 0) {
      el.bestsGrid.innerHTML = `<p class="muted">No personal bests yet — finish a test to set one.</p>`;
      return;
    }
    keys.sort((a, b) => bests[b].wpm - bests[a].wpm).forEach(k => {
      const [dur, diff] = k.split("_");
      const b = bests[k];
      const card = document.createElement("div");
      card.className = "best-card";
      card.innerHTML = `
        <div class="best-top">
          <span class="best-wpm">${b.wpm}<small>wpm</small></span>
          <span class="tag tag-${diff}">${diff}</span>
        </div>
        <div class="best-meta">${formatTime(Number(dur))} · ${b.accuracy}% acc</div>
      `;
      el.bestsGrid.appendChild(card);
    });
  }

  function renderLeaderboard() {
    const board = S.getLocalLeaderboard();
    el.leaderboardList.innerHTML = "";
    if (board.length === 0) {
      el.leaderboardList.innerHTML = `<li class="muted">No scores saved yet. Save one from your results!</li>`;
      return;
    }
    board.slice(0, 10).forEach((entry, i) => {
      const li = document.createElement("li");
      li.className = "lb-row" + (i < 3 ? " lb-top" + (i + 1) : "");
      li.innerHTML = `
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-name">${escapeHTML(entry.name)}</span>
        <span class="lb-wpm">${entry.wpm} wpm</span>
        <span class="lb-acc">${entry.accuracy}%</span>
      `;
      el.leaderboardList.appendChild(li);
    });
  }

  function escapeHTML(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  // ---------- Events ----------
  function bindEvents() {
    el.hiddenInput.addEventListener("input", onInput);
    el.hiddenInput.addEventListener("paste", preventPaste);
    el.hiddenInput.addEventListener("drop", e => e.preventDefault());
    el.hiddenInput.addEventListener("contextmenu", e => e.preventDefault());

    el.typingArea.addEventListener("click", focusInput);

    el.durationChips.forEach(chip => chip.addEventListener("click", () => {
      settings.duration = Number(chip.dataset.duration);
      S.saveSettings(settings);
      applySettingsToUI();
      buildNewText();
    }));

    el.difficultyChips.forEach(chip => chip.addEventListener("click", () => {
      settings.difficulty = chip.dataset.difficulty;
      S.saveSettings(settings);
      applySettingsToUI();
      buildNewText();
    }));

    el.restartBtn.addEventListener("click", buildNewText);
    el.tryAgainBtn.addEventListener("click", buildNewText);

    el.saveScoreBtn.addEventListener("click", () => {
      const result = window._lastResult;
      if (!result) return;
      const name = el.playerNameInput.value.trim() || "Guest";
      S.saveProfile({ ...S.getProfile(), name });
      S.addToLocalLeaderboard({ name, wpm: result.wpm, accuracy: result.accuracy, difficulty: result.difficulty, date: result.date });
      renderLeaderboard();
      flashNotice("Score saved to leaderboard!");
    });

    el.soundToggle.addEventListener("change", () => {
      settings.soundEnabled = el.soundToggle.checked;
      S.saveSettings(settings);
      window.soundEngine.setEnabled(settings.soundEnabled);
    });
    el.volumeSlider.addEventListener("input", () => {
      settings.soundVolume = Number(el.volumeSlider.value);
      S.saveSettings(settings);
      window.soundEngine.setVolume(settings.soundVolume);
    });

    document.addEventListener("keydown", (e) => {
      // Tab -> restart test (prevent leaving page focus)
      if (e.key === "Tab") {
        e.preventDefault();
        buildNewText();
        return;
      }
      // Esc -> stop / reset
      if (e.key === "Escape") {
        buildNewText();
        return;
      }
      // don't steal focus while typing name in input
      if (document.activeElement === el.playerNameInput) return;
      focusInput();
    });

    window.addEventListener("resize", () => {
      if (state.finished) drawChart(state.wpmSamples);
      positionCaret();
    });
  }

  init();
})();
