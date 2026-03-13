// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://brynsa-leads-api.onrender.com';

// Timesheet API (merged into main backend)
export const TIMESHEET_API_URL = import.meta.env.VITE_TIMESHEET_API_URL || `${API_BASE_URL}/api/timesheet`;

// Google OAuth
export const GOOGLE_CLIENT_ID = '33869580923-uhdca5l0cgr8kbsiksofu177p38qedt3.apps.googleusercontent.com';

// Extension communication key (for localStorage sync)
export const AUTH_STORAGE_KEY = 'rivvra_auth';
export const USER_STORAGE_KEY = 'rivvra_user';

// Feature flags
export const FEATURES = {
  GOOGLE_AUTH: true,
  EMAIL_OTP: true,
  QUESTIONNAIRE: true,
};