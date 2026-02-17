import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true,
});

// Add token from localStorage as fallback
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('huemot_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('huemot_token');
      localStorage.removeItem('huemot_user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default api;
