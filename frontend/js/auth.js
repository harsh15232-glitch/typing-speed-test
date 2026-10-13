/* auth.js — thin client for the backend's JWT auth endpoints */

const AUTH_TOKEN_KEY = "tst_auth_token";
const AUTH_USER_KEY = "tst_auth_user";

function getToken() { return localStorage.getItem(AUTH_TOKEN_KEY); }
function getUser() {
  try { return JSON.parse(localStorage.getItem(AUTH_USER_KEY)); } catch { return null; }
}
function setSession(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}
function isLoggedIn() { return !!getToken(); }

async function apiRequest(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${window.APP_CONFIG.API_BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function registerUser({ username, email, password }) {
  const data = await apiRequest("/auth/register", { method: "POST", body: { username, email, password } });
  setSession(data.token, data.user);
  return data.user;
}

async function loginUser({ identifier, password }) {
  const data = await apiRequest("/auth/login", { method: "POST", body: { identifier, password } });
  setSession(data.token, data.user);
  return data.user;
}

function logoutUser() { clearSession(); }

window.Auth = { getToken, getUser, isLoggedIn, registerUser, loginUser, logoutUser, apiRequest };
