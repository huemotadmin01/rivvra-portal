import { useState, useEffect, useCallback } from 'react';

const CHROME_STORE_URL = 'https://chromewebstore.google.com/detail/rivvra-linkedin-lead-extr/afmjolicodhklbppiknbbjpjbhfjhipm';
const DISMISS_KEY = 'rivvra_ext_dismissed_at';
const DISMISS_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 days

function checkExtension() {
  return document.documentElement.hasAttribute('data-rivvra-ext');
}

/**
 * Hook to detect if the Rivvra Chrome extension is installed.
 * Uses a DOM attribute set by portal-sync.js content script.
 * Polls every 3s so it auto-detects mid-session installs.
 */
export function useExtensionDetector() {
  const [installed, setInstalled] = useState(() => checkExtension());

  useEffect(() => {
    if (installed) return; // no need to poll once detected

    const id = setInterval(() => {
      if (checkExtension()) {
        setInstalled(true);
        // Clear any dismiss timestamp — extension is now installed
        localStorage.removeItem(DISMISS_KEY);
      }
    }, 3000);

    return () => clearInterval(id);
  }, [installed]);

  // Dismiss banner for 3 days
  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  }, []);

  // Check if banner was recently dismissed
  const isDismissed = useCallback(() => {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    return Date.now() - parseInt(ts, 10) < DISMISS_DURATION;
  }, []);

  return { installed, dismiss, isDismissed, chromeStoreUrl: CHROME_STORE_URL };
}
