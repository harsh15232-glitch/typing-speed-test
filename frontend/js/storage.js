/* storage.js — wraps localStorage for settings, personal bests, and local leaderboard */

const LS_KEYS = {
  SETTINGS: "tst_settings_v1",
  BESTS: "tst_personal_bests_v1",
  LEADERBOARD: "tst_local_leaderboard_v1",
  HISTORY: "tst_history_v1",
  PROFILE: "tst_profile_v1"
};

const DEFAULT_SETTINGS = {
  duration: 60,          // seconds: 60,180,300,420,600,900 (1,3,5,7,10,15 min)
  difficulty: "medium",  // easy | medium | hard | quotes
  soundEnabled: true,
  soundVolume: 0.4,
  theme: "dark",
  caretStyle: "smooth"
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEYS.SETTINGS);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings(settings) {
  localStorage.setItem(LS_KEYS.SETTINGS, JSON.stringify(settings));
}

function getBests() {
  try {
    const raw = localStorage.getItem(LS_KEYS.BESTS);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// key = `${duration}_${difficulty}`
function updateBestIfHigher(key, result) {
  const bests = getBests();
  const current = bests[key];
  if (!current || result.wpm > current.wpm) {
    bests[key] = result;
    localStorage.setItem(LS_KEYS.BESTS, JSON.stringify(bests));
    return true; // new PB
  }
  return false;
}

function getHistory() {
  try {
    const raw = localStorage.getItem(LS_KEYS.HISTORY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function pushHistory(entry) {
  const history = getHistory();
  history.unshift(entry);
  localStorage.setItem(LS_KEYS.HISTORY, JSON.stringify(history.slice(0, 50)));
}

function getLocalLeaderboard() {
  try {
    const raw = localStorage.getItem(LS_KEYS.LEADERBOARD);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function addToLocalLeaderboard(entry) {
  const board = getLocalLeaderboard();
  board.push(entry);
  board.sort((a, b) => b.wpm - a.wpm);
  localStorage.setItem(LS_KEYS.LEADERBOARD, JSON.stringify(board.slice(0, 100)));
}

function getProfile() {
  try {
    const raw = localStorage.getItem(LS_KEYS.PROFILE);
    return raw ? JSON.parse(raw) : { name: "Guest", avatarSeed: Math.random().toString(36).slice(2) };
  } catch { return { name: "Guest" }; }
}

function saveProfile(profile) {
  localStorage.setItem(LS_KEYS.PROFILE, JSON.stringify(profile));
}

window.TypingStorage = {
  loadSettings, saveSettings, getBests, updateBestIfHigher,
  getHistory, pushHistory, getLocalLeaderboard, addToLocalLeaderboard,
  getProfile, saveProfile
};
