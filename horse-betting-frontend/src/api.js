import API_BASE from './config';

// The session (token + player id) is kept in localStorage so players stay logged in.
const SESSION_KEY = 'lekours.session';
let authToken = null;

export const loadSession = () => {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (session?.token) {
      authToken = session.token;
      return session;
    }
  } catch { /* storage unavailable */ }
  return null;
};

export const saveSession = (session) => {
  authToken = session?.token || null;
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* storage unavailable */ }
};

// fetch() against the API with the auth token attached.
export const apiFetch = (path, { headers, ...options } = {}) =>
  fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...headers,
    },
  });
