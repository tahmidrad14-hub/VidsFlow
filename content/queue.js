// content/queue.js
// Sequential queue engine. Only one prompt is processed at a time.

(function (global) {
  const STATES = {
    IDLE: 'IDLE',
    PREPARING: 'PREPARING',
    READY: 'READY',
    GENERATING: 'GENERATING',
    VERIFYING: 'VERIFYING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    PAUSED: 'PAUSED'
  };

  class QueueEngine {
    constructor({ dom, storage, onUpdate }) {
      this.dom = dom;
      this.storage = storage;
      this.onUpdate = onUpdate || (() => {});
      this.queue = [];
      this.status = STATES.IDLE;
      this.currentIndex = 0;
      this.settings = { ...storage.DEFAULTS.settings };
      this._running = false;
      this._stopRequested = false;
      this._pauseRequested = false;
      this._loopPromise = null;
      this._clickGuard = { clicked: false };
    }

    async init() {
      const all = await this.storage.loadAll();
      this.settings = all.settings;
      if (all.restoreQueue && Array.isArray(all.queue)) {
        this.queue = all.queue.map((q, i) => ({
          id: q.id || `p_${i}_${Date.now()}`,
          text: q.text,
          state: q.state === STATES.GENERATING || q.state === STATES.PREPARING ? STATES.PENDING : (q.state || 'PENDING')
        }));
        this.status = all.queueStatus === 'RUNNING' ? STATES.PAUSED : (all.queueStatus || STATES.IDLE);
        this.currentIndex = all.currentIndex || 0;
      }
      this._emit();
    }

    setSettings(s) { this.settings = { ...this.settings, ...s }; this.storage.saveSettings(this.settings); }

    setQueue(prompts) {
      if (this._running) throw new Error('Cannot replace queue while running');
      this.queue = prompts.map((text, i) => ({ id: `p_${i}_${Date.now()}`, text, state: 'PENDING' }));
      this.currentIndex = 0; this.status = STATES.IDLE; this._persist(); this._emit();
    }

    addPrompt(text) {
      if (this._running) throw new Error('Cannot modify queue while running');
      this.queue.push({ id: `p_${this.queue.length}_${Date.now()}`, text, state: 'PENDING' });
      this._persist(); this._emit();
    }

    removePrompt(id) {
      if (this._running) throw new Error('Cannot modify queue while running');
      this.queue = this.queue.filter((q) => q.id !== id); this._persist(); this._emit();
    }

    clearQueue() {
      if (this._running) throw new Error('Cannot clear while running');
      this.queue = []; this.currentIndex = 0; this.status = STATES.IDLE; this._persist(); this._emit();
    }

    clearCompleted() {
      if (this._running) throw new Error('Cannot clear while running');
      const before = this.queue.length;
      this.queue = this.queue.filter((q) => q.state !== STATES.COMPLETED);
      if (this.queue.length !== before) { this._persist(); this._emit(); }
    }

    pause() { 
      this._pauseRequested = true; 
      if (this.status === STATES.IDLE) this.status = STATES.PAUSED; 
      this._persist(); this._emit(); 
      this._log('Queue paused by user'); 
    }

    resume() {
      if (this._running) return;
      if (!this.queue.some((q) => q.state === 'PENDING' || q.state === STATES.FAILED)) { this._log('Nothing to resume'); return; }
      this._pauseRequested = false; this._stopRequested = false; this.status = STATES.PREPARING; this._persist(); this._emit();
      this._log('Queue resumed'); 
      this._start();
    }

    stop() { 
      this._stopRequested = true; 
      this._pauseRequested = false; 
      this._log('Stop requested'); 
    }

    retryFailed() {
      if (this._running) return;
      let count = 0;
      for (const q of this.queue) if (q.state === STATES.FAILED) { q.state = 'PENDING'; count++; }
      if (count) { this._persist(); this._emit(); this._log(`Retry reset ${count} failed prompt(s) to Pending`); }
    }

    async start() {
      if (this._running) { this._log('Already running'); return; }
      if (!this.queue.length) { this._log('Queue is empty'); return; }

      this._stopRequested = false; this._pauseRequested = false;
      this.status = STATES.PREPARING; this._persist(); this._emit();
      this._log('Queue started'); this._start();
    }

    _start() {
      if (this._running) return;
      this._running = true;
      this._loopPromise = this._loop().finally(() => { this._running = false; this._loopPromise = null; });
      return this._loopPromise;
    }

    async _loop() {
      while (!this._stopRequested && !this._pauseRequested) {
        const idx = this.queue.findIndex((q) => q.state === 'PENDING' || q.state === STATES.FAILED);
        if (idx === -1) {
          this.status = STATES.IDLE; this._persist(); this._emit(); this._log('Queue finished');
          return;
        }
        this.currentIndex = idx;
        const item = this.queue[idx];
        try { await this._processOne(item); }
        catch (err) {
          if (err && err.message === 'PAUSED') { 
            this.status = STATES.PAUSED; this._persist(); this._emit(); 
            return; 
          }
          if (err && err.message === 'STOPPED') { 
            this.status = STATES.IDLE; this._persist(); this._emit(); 
            return; 
          }
          const msg = (err && err.message) || String(err);
          this._log(`Prompt #${idx + 1} failed: ${msg}`, 'error');
          item.state = STATES.FAILED; this.status = STATES.PAUSED; this._persist(); this._emit();
          return;
        }
      }
      this.status = this._stopRequested ? STATES.IDLE : STATES.PAUSED; this._persist(); this._emit();
    }

    async _checkInterrupts() {
      if (this._stopRequested) throw new Error('STOPPED');
      if (this._pauseRequested) throw new Error('PAUSED');
    }

    async _processOne(item) {
      const dom = this.dom;
      const s = this.settings;
      item.state = STATES.PREPARING; this.status = STATES.PREPARING; this._persist(); this._emit();
      this._log(`Preparing prompt #${this.currentIndex + 1}`);

      await this._checkInterrupts();

      if (!dom.isPanelAvailable()) throw new Error('IMAGE_PANEL_UNAVAILABLE');

      const field = dom.findPromptField();
      if (!field) throw new Error('PROMPT_FIELD_NOT_FOUND');
      
      const baseline = dom.snapshotImageBaseline();

      this._log('Entering prompt');
      await dom.setPromptText(field, item.text);
      
      await this._checkInterrupts();

      this._log('Clicking Create');
      await dom.clickCreateButton();

      this.status = STATES.GENERATING; item.state = STATES.GENERATING; this._persist(); this._emit();

      try {
        const effect = await dom.detectGenerationStarted(baseline, 20000);
        this._log(`Generation started (${effect})`);
      } catch (e) {
        throw new Error('CLICK_HAD_NO_EFFECT_OR_GENERATION_NOT_STARTED');
      }

      await this._checkInterrupts();

      this.status = STATES.VERIFYING; this._persist(); this._emit();
      this._log('Waiting for generation to complete');
      let url;
      try { url = await dom.waitForGenerationComplete(baseline, s.generationTimeoutMs); }
      catch (e) { throw new Error('GENERATION_TIMEOUT_OR_FAILED:' + e.message); }
      this._log('New image detected', 'ok');

      if (!dom.detectNewImage(baseline).length) throw new Error('IMAGE_VERIFICATION_FAILED');
      this._log('Image verified', 'ok');

      if (s.autoDownload && url) {
        try {
          const filename = buildFilename(s.downloadFilenamePattern, this.currentIndex + 1, Date.now(), url);
          const folder = (s.downloadFolder || '').replace(/^\/+|\/+$/g, '');
          const fullPath = folder ? `${folder}/${filename}` : filename;
          const res = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'DOWNLOAD_IMAGE', payload: { url, filename: fullPath } }, (r) => {
              if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
              else resolve(r || { ok: false, error: 'no response' });
            });
          });
          if (res.ok) this._log(`Download started (id ${res.downloadId})`, 'ok');
          else this._log(`Download failed: ${res.error}`, 'warn');
        } catch (de) { this._log(`Download error: ${de.message}`, 'warn'); }
      }

      item.state = STATES.COMPLETED; this.status = STATES.IDLE; this._persist(); this._emit();
      this._log(`Prompt #${this.currentIndex + 1} completed`, 'ok');

      if (s.randomDelayMs > 0) {
        const d = Math.floor(Math.random() * s.randomDelayMs);
        this._log(`Random delay ${d}ms`); await dom.sleep(d);
      }
    }

    _persist() { this.storage.saveQueue(this.queue, this.status, this.currentIndex); }
    _emit() {
      this.onUpdate({ queue: this.queue, status: this.status, currentIndex: this.currentIndex, settings: this.settings, running: this._running });
    }
    _log(message, level = 'info') { this.onUpdate({ log: { message, level, ts: Date.now() } }); }
  }

  function buildFilename(pattern, index, ts, url) {
    const d = new Date(ts); const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    let ext = 'png';
    const m = /\.(png|jpe?g|webp|gif)(\?|$)/i.exec(url || '');
    if (m) ext = m[1].toLowerCase().replace('jpeg', 'jpg');
    return String(pattern || 'vids-image-{index}-{timestamp}')
      .replace('{index}', String(index).padStart(3, '0'))
      .replace('{timestamp}', dateStr)
      .replace('{date}', dateStr)
      + (pattern && pattern.includes('.') ? '' : `.${ext}`);
  }

  global.VidsQueue = { QueueEngine, STATES, buildFilename };
})(typeof window !== 'undefined' ? window : globalThis);