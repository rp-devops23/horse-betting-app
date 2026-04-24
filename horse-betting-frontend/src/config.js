const API_BASE = process.env.NODE_ENV === 'development'
  ? 'http://localhost:5000/api'
  : 'https://horse-betting-app-1.onrender.com/api';

export default API_BASE;
