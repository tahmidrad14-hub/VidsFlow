// content/storage.js
// Thin wrapper around chrome.storage.local with defaults and debounced writes.

(function (global) {
  const DEFAULTS = {
    panelPosition: { x: 24, y: 24 },
    panelVisible: false, // Defaults to minimized state
    settings: {
      generationTimeoutMs: 180000,
      randomDelayMs: 0,
      autoDownload: false,
      downloadFilenamePattern: 'vids-image-{index}-{timestamp}',
      downloadFolder: 'VidsImages',
      restoreQueue: true
    },
    queue: [],       // [{ id, text, state }]
    queueStatus: 'IDLE',
    currentIndex: 0
  };

  let writeTimer = null;
  let pending = {};

  function get(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (res) => resolve(res || {}));
    });
  }

  function set(obj) {
    return new Promise((resolve) => {
      chrome.storage.local.set(obj, () => resolve());
    });
  }

  async function loadAll() {
    const data = await get(Object.keys(DEFAULTS));
    const merged = {};
    for (const k of Object.keys(DEFAULTS)) {
      merged[k] = data[k] === undefined ? DEFAULTS[k] : data[k];
    }
    // merge settings deeply
    merged.settings = { ...DEFAULTS.settings, ...(data.settings || {}) };
    return merged;
  }

  function debouncedSet(obj, ms = 250) {
    pending = { ...pending, ...obj };
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      const toWrite = pending;
      pending = {};
      writeTimer = null;
      set(toWrite);
    }, ms);
  }

  async function savePanelPosition(x, y) {
    debouncedSet({ panelPosition: { x, y } });
  }

  async function savePanelVisible(v) {
    debouncedSet({ panelVisible: !!v });
  }

  async function saveQueue(queue, queueStatus, currentIndex) {
    debouncedSet({ queue, queueStatus, currentIndex });
  }

  async function saveSettings(settings) {
    debouncedSet({ settings });
  }

  global.VidsStorage = {
    DEFAULTS,
    get,
    set,
    loadAll,
    savePanelPosition,
    savePanelVisible,
    saveQueue,
    saveSettings
  };
})(typeof window !== 'undefined' ? window : globalThis);