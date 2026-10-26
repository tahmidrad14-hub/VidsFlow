// content/floating-ui.js
(function (global) {
  const HOST_ID = 'vids-image-queue-host';

  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) e.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (typeof c === 'string') e.appendChild(document.createTextNode(c));
      else if (c) e.appendChild(c);
    }
    return e;
  }

  class FloatingUI {
    constructor({ storage, onAction, settings, initialPosition, initialVisible }) {
      this.storage = storage;
      this.onAction = onAction;
      this.settings = settings || {};
      this.pos = initialPosition || { x: 24, y: 24 };
      this.visible = initialVisible !== false;
      this._logLines = [];
      this._state = { queue: [], status: 'IDLE', currentIndex: 0, running: false };
      this._build();
      this._bindViewport();
    }

    _build() {
      const existing = document.getElementById(HOST_ID);
      if (existing) existing.remove();

      const host = document.createElement('div');
      host.id = HOST_ID;
      host.style.cssText = 'position: fixed !important; top: 0 !important; left: 0 !important; width: 0 !important; height: 0 !important; z-index: 2147483647 !important; pointer-events: none !important;';
      document.documentElement.appendChild(host);
      this.host = host;

      const shadow = host.attachShadow({ mode: 'open' });
      this.shadow = shadow;

      const style = document.createElement('style');
      style.textContent = `
        .viq-panel {
          position: fixed !important; width: 380px !important; height: 560px !important;
          min-width: 320px !important; min-height: 260px !important;
          display: flex; flex-direction: column !important;
          background: #1e1e2e !important; color: #e6e6f0 !important;
          border: 1px solid #3a3a52 !important; border-radius: 10px !important;
          box-shadow: 0 12px 40px rgba(0,0,0,0.45) !important;
          font-family: system-ui, sans-serif !important; font-size: 13px !important;
          overflow: hidden !important; box-sizing: border-box !important;
          pointer-events: auto !important;
        }
        .viq-panel.viq-dragging { cursor: grabbing !important; }
        
        /* Header styling */
        .viq-header {
          position: relative !important;
          display: flex !important; align-items: center !important; justify-content: space-between !important;
          padding: 8px 10px !important; background: #26263a !important;
          border-bottom: 1px solid #3a3a52 !important; cursor: grab !important;
          user-select: none !important; flex: 0 0 auto !important;
        }
        
        .viq-header-left { display: flex !important; align-items: center !important; gap: 6px !important; z-index: 2 !important; }
        .viq-header-right { display: flex !important; align-items: center !important; z-index: 2 !important; }

        /* The perfectly centered title */
        .viq-title { 
          position: absolute !important; 
          left: 50% !important; 
          transform: translateX(-50%) !important;
          font-weight: 700 !important; 
          font-size: 15px !important; 
          color: #fff !important;
          letter-spacing: 0.5px !important;
          white-space: nowrap !important; 
          z-index: 1 !important;
        }
        
        .viq-status-dot { width: 8px !important; height: 8px !important; border-radius: 50% !important; background: #8a8aa0 !important; display: inline-block !important; }
        .viq-status-dot.viq-connected { background: #3ddc84 !important; box-shadow: 0 0 6px #3ddc84 !important; }
        .viq-status-dot.viq-disconnected { background: #ff5252 !important; }
        
        .viq-icon-btn { background: transparent !important; border: 1px solid transparent !important; color: #c8c8e0 !important; cursor: pointer !important; border-radius: 4px !important; padding: 2px 6px !important; font-size: 13px !important; line-height: 1 !important; }
        .viq-icon-btn:hover { background: #3a3a52 !important; border-color: #4a4a68 !important; }
        
        /* Round X Button */
        .viq-mini-btn { 
          background: #3a3a52 !important; 
          border: 1px solid #4a4a68 !important; 
          color: #c8c8e0 !important; 
          cursor: pointer !important; 
          border-radius: 50% !important; 
          width: 20px !important; 
          height: 20px !important; 
          display: flex !important; 
          align-items: center !important; 
          justify-content: center !important; 
          font-size: 10px !important; 
          padding: 0 !important; 
          flex-shrink: 0 !important;
        }
        .viq-mini-btn:hover { 
          background: #6a2a3a !important; 
          color: #ff8080 !important;
          border-color: #8a3a4a !important;
        }

        .viq-body { flex: 1 1 auto !important; overflow-y: auto !important; padding: 8px !important; display: flex !important; flex-direction: column !important; gap: 8px !important; }
        
        /* The Minimized Button */
        .viq-floating-tab {
          position: fixed !important;
          background: #4a5cf0 !important;
          color: #fff !important;
          padding: 10px 16px !important;
          border-radius: 8px !important;
          font-family: system-ui, sans-serif !important;
          font-size: 14px !important;
          font-weight: 700 !important;
          cursor: grab !important;
          box-shadow: 0 6px 20px rgba(0,0,0,0.4) !important;
          user-select: none !important;
          pointer-events: auto !important;
          z-index: 2147483647 !important;
          display: none;
        }
        .viq-floating-tab:hover { background: #5a6cf0 !important; }
        .viq-floating-tab.viq-dragging { cursor: grabbing !important; }
        
        .viq-section { background: #26263a !important; border: 1px solid #343450 !important; border-radius: 8px !important; padding: 8px !important; display: flex !important; flex-direction: column !important; }
        .viq-section-title { font-weight: 600 !important; font-size: 12px !important; color: #a8a8ff !important; margin-bottom: 6px !important; text-transform: uppercase !important; letter-spacing: 0.4px !important; }
        .viq-prompt-editor { width: 100% !important; box-sizing: border-box !important; background: #1a1a2a !important; color: #e6e6f0 !important; border: 1px solid #3a3a52 !important; border-radius: 6px !important; padding: 6px !important; font-family: inherit !important; font-size: 12px !important; resize: vertical !important; min-height: 60px !important; }
        .viq-row { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; margin-top: 6px !important; }
        .viq-btn { background: #3a3a58 !important; color: #e6e6f0 !important; border: 1px solid #4a4a68 !important; border-radius: 6px !important; padding: 5px 9px !important; font-size: 12px !important; cursor: pointer !important; white-space: nowrap !important; }
        .viq-btn:hover { background: #4a4a70 !important; }
        .viq-btn.viq-primary { background: #4a5cf0 !important; border-color: #5a6cf0 !important; }
        .viq-btn.viq-primary:hover { background: #5a6cf0 !important; }
        .viq-btn.viq-danger { background: #6a2a3a !important; border-color: #8a3a4a !important; }
        .viq-btn.viq-danger:hover { background: #8a3a4a !important; }
        .viq-controls { display: flex !important; flex-wrap: wrap !important; gap: 6px !important; }
        .viq-count { margin-top: 6px !important; font-size: 11px !important; color: #b0b0c8 !important; }
        .viq-prompt-list { margin-top: 6px !important; max-height: 160px !important; overflow-y: auto !important; border-top: 1px solid #343450 !important; padding-top: 4px !important; }
        .viq-prompt-row { display: flex !important; align-items: center !important; gap: 6px !important; padding: 3px 2px !important; border-bottom: 1px solid #2a2a40 !important; font-size: 11px !important; }
        .viq-prompt-idx { color: #8a8aa8 !important; min-width: 30px !important; }
        .viq-prompt-state { min-width: 78px !important; font-weight: 600 !important; font-size: 10px !important; padding: 1px 4px !important; border-radius: 3px !important; background: #33334d !important; text-align: center !important; }
        .viq-state-pending .viq-prompt-state { color: #b0b0c8 !important; }
        .viq-state-preparing .viq-prompt-state, .viq-state-generating .viq-prompt-state, .viq-state-verifying .viq-prompt-state { color: #ffd166 !important; }
        .viq-state-completed .viq-prompt-state { color: #3ddc84 !important; }
        .viq-state-failed .viq-prompt-state { color: #ff6b6b !important; }
        .viq-state-paused .viq-prompt-state { color: #ffa94d !important; }
        .viq-prompt-text { flex: 1 !important; color: #d0d0e0 !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
        .viq-progress-info { display: flex !important; flex-direction: column !important; gap: 5px !important; }
        .viq-current { font-size: 11px !important; color: #d0d0e0 !important; word-break: break-word !important; }
        .viq-progress-bar { height: 8px !important; background: #1a1a2a !important; border-radius: 4px !important; overflow: hidden !important; border: 1px solid #343450 !important; }
        .viq-progress-fill { height: 100% !important; width: 0% !important; background: linear-gradient(90deg, #4a5cf0, #3ddc84) !important; transition: width 0.3s !important; }
        .viq-stats { font-size: 11px !important; color: #b0b0c8 !important; }
        .viq-log { max-height: 140px !important; overflow-y: auto !important; font-family: ui-monospace, monospace !important; font-size: 10.5px !important; background: #1a1a2a !important; border-radius: 4px !important; padding: 4px !important; border: 1px solid #343450 !important; }
        .viq-log-line { padding: 1px 2px !important; white-space: pre-wrap !important; word-break: break-word !important; }
        .viq-log-info { color: #b8b8d0 !important; } .viq-log-ok { color: #7be09a !important; } .viq-log-warn { color: #ffcf6b !important; } .viq-log-error { color: #ff8080 !important; }
        .viq-resize-handle { position: absolute !important; right: 0 !important; bottom: 0 !important; width: 14px !important; height: 14px !important; cursor: nwse-resize !important; background: linear-gradient(135deg, transparent 50%, #5a5a80 50%) 0 0/6px 6px no-repeat, linear-gradient(135deg, transparent 50%, #5a5a80 50%) 4px 4px/6px 6px no-repeat !important; }
        .viq-more { font-size: 11px !important; color: #8a8aa8 !important; padding: 4px !important; text-align: center !important; }
      `;
      shadow.appendChild(style);

      // 1. Create the Minimized Blue Tab
      const tab = el('div', { class: 'viq-floating-tab', text: 'VidsFlow' });
      tab.addEventListener('mousedown', (e) => this._onDragStart(e, tab));
      tab.addEventListener('touchstart', (e) => this._onDragStart(e.touches[0], tab), { passive: true });
      tab.addEventListener('click', (e) => {
        if (this._dragged) {
          this._dragged = false;
          return;
        }
        e.preventDefault();
        this.show();
      });
      shadow.appendChild(tab);
      this.floatingTab = tab;

      // 2. Create the Main Panel
      const panel = el('div', { class: 'viq-panel', part: 'panel' });
      panel.style.cssText += `left: ${this.pos.x}px !important; top: ${this.pos.y}px !important;`;
      this.panel = panel;
      shadow.appendChild(panel);

      // Set initial visibility state
      if (this.visible) {
        this.panel.style.setProperty('display', 'flex', 'important');
        this.floatingTab.style.setProperty('display', 'none', 'important');
      } else {
        this.panel.style.setProperty('display', 'none', 'important');
        this.floatingTab.style.setProperty('display', 'block', 'important');
        this.floatingTab.style.left = `${this.pos.x}px`;
        this.floatingTab.style.top = `${this.pos.y}px`;
      }

      const header = el('div', { class: 'viq-header' });
      
      // Left Side (Status)
      const headerLeft = el('div', { class: 'viq-header-left' });
      this.statusDot = el('span', { class: 'viq-status-dot', title: 'Connection status' });
      // We keep a hidden statusText so the background connection checks don't crash
      this.statusText = el('span', { class: 'viq-status-text', text: 'Not detected', style: 'display: none;' });
      headerLeft.appendChild(this.statusDot);
      headerLeft.appendChild(this.statusText);
      
      // Center Title
      const title = el('div', { class: 'viq-title', text: 'VidsFlow' });
      
      // Right Side (Minimize Button)
      const headerRight = el('div', { class: 'viq-header-right' });
      const hideBtn = el('button', { class: 'viq-icon-btn', title: 'Minimize', text: '—' });
      hideBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); this.hide(); };
      headerRight.appendChild(hideBtn);
      
      header.append(headerLeft, title, headerRight);
      panel.appendChild(header);
      
      header.addEventListener('mousedown', (e) => this._onDragStart(e, panel));
      header.addEventListener('touchstart', (e) => this._onDragStart(e.touches[0], panel), { passive: true });

      const body = el('div', { class: 'viq-body' });
      panel.appendChild(body);

      this._buildPromptSection(body);
      this._buildQueueControls(body);
      this._buildProgress(body);
      this._buildLog(body);

      const resize = el('div', { class: 'viq-resize-handle', title: 'Resize' });
      panel.appendChild(resize);
      this._bindResize(resize);
    }

    _buildPromptSection(body) {
      const sec = el('div', { class: 'viq-section' });
      const ta = el('textarea', { class: 'viq-prompt-editor', rows: '4', placeholder: 'One prompt per line...' });
      const row = el('div', { class: 'viq-row' });
      
      const addBtn = el('button', { class: 'viq-btn', text: 'Add Prompts' });
      addBtn.addEventListener('click', () => {
        const text = ta.value;
        if (!text.trim()) return;
        const lines = text.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim().length > 0);
        if (lines.length) this.onAction({ type: 'ADD_PROMPTS', prompts: lines });
        ta.value = '';
      });
      
      const importBtn = el('button', { class: 'viq-btn', text: 'Import .txt' });
      const fileInput = el('input', { type: 'file', accept: '.txt,text/plain', style: 'display:none' });
      importBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async () => {
        const f = fileInput.files && fileInput.files[0];
        if (!f) return;
        const text = await f.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length) this.onAction({ type: 'ADD_PROMPTS', prompts: lines });
        fileInput.value = '';
      });
      
      const clearBtn = el('button', { class: 'viq-btn viq-danger', text: 'Clear Queue' });
      clearBtn.addEventListener('click', () => {
        if (confirm('Clear the entire queue?')) this.onAction({ type: 'CLEAR_QUEUE' });
      });
      
      row.append(addBtn, importBtn, clearBtn, fileInput);
      this.countEl = el('div', { class: 'viq-count', text: 'Total: 0' });
      this.promptList = el('div', { class: 'viq-prompt-list' });
      
      sec.append(el('div', { class: 'viq-section-title', text: 'Prompts' }), ta, row, this.countEl, this.promptList);
      body.appendChild(sec);
    }

    _buildQueueControls(body) {
      const sec = el('div', { class: 'viq-section viq-controls' });
      const mk = (text, action, cls = '') => {
        const b = el('button', { class: `viq-btn ${cls}`.trim(), text });
        b.addEventListener('click', () => this.onAction({ type: action }));
        return b;
      };
      sec.append(
        mk('Start', 'START', 'viq-primary'),
        mk('Pause', 'PAUSE'),
        mk('Resume', 'RESUME'),
        mk('Stop', 'STOP', 'viq-danger'),
        mk('Retry Failed', 'RETRY_FAILED'),
        mk('Clear Completed', 'CLEAR_COMPLETED')
      );
      body.appendChild(sec);
    }

    _buildProgress(body) {
      const sec = el('div', { class: 'viq-section' });
      this.currentEl = el('div', { class: 'viq-current', text: 'Idle' });
      const barOuter = el('div', { class: 'viq-progress-bar' });
      this.barFill = el('div', { class: 'viq-progress-fill' });
      barOuter.appendChild(this.barFill);
      this.statsEl = el('div', { class: 'viq-stats' });
      const info = el('div', { class: 'viq-progress-info' });
      info.append(this.currentEl, barOuter, this.statsEl);
      sec.append(el('div', { class: 'viq-section-title', text: 'Progress' }), info);
      body.appendChild(sec);
    }

    _buildLog(body) {
      const sec = el('div', { class: 'viq-section' });
      this.logEl = el('div', { class: 'viq-log' });
      sec.append(el('div', { class: 'viq-section-title', text: 'Activity Log' }), this.logEl);
      body.appendChild(sec);
    }

    _bindViewport() {
      this._onResize = () => this._clampToViewport();
      window.addEventListener('resize', this._onResize);
    }

    _clampToViewport() {
      if (!this.panel) return;
      const rect = this.panel.getBoundingClientRect();
      const maxX = Math.max(0, window.innerWidth - Math.min(rect.width, window.innerWidth));
      const maxY = Math.max(0, window.innerHeight - Math.min(rect.height, window.innerHeight));
      let { x, y } = this.pos;
      x = Math.min(Math.max(0, x), maxX);
      y = Math.min(Math.max(0, y), maxY);
      if (x !== this.pos.x || y !== this.pos.y) {
        this.pos = { x, y };
        this.panel.style.left = `${x}px`;
        this.panel.style.top = `${y}px`;
        this.floatingTab.style.left = `${x}px`;
        this.floatingTab.style.top = `${y}px`;
        this.storage.savePanelPosition(x, y);
      }
    }

    _onDragStart(e, targetEl) {
      if (!e) return;
      const target = e.target;
      if (target && target.closest && target.closest('button, input, textarea, select, a, [contenteditable="true"]')) return;
      
      e.preventDefault?.();
      const rect = targetEl.getBoundingClientRect();
      this._dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this._dragged = false;
      targetEl.classList.add('viq-dragging');
      
      const onMove = (ev) => {
        this._dragged = true;
        const p = ev.touches ? ev.touches[0] : ev;
        let x = p.clientX - this._dragOffset.x;
        let y = p.clientY - this._dragOffset.y;
        const r = targetEl.getBoundingClientRect();
        x = Math.min(Math.max(0, x), window.innerWidth - r.width);
        y = Math.min(Math.max(0, y), window.innerHeight - r.height);
        
        this.pos = { x, y };
        targetEl.style.left = `${x}px`;
        targetEl.style.top = `${y}px`;
      };
      
      const onUp = () => {
        targetEl.classList.remove('viq-dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        
        if (this._dragged) {
          this.storage.savePanelPosition(this.pos.x, this.pos.y);
        }
      };
      
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
    }

    _bindResize(handle) {
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const w0 = this.panel.offsetWidth, h0 = this.panel.offsetHeight, x0 = e.clientX, y0 = e.clientY;
        const onMove = (ev) => {
          const w = Math.max(320, w0 + (ev.clientX - x0));
          const h = Math.max(240, h0 + (ev.clientY - y0));
          this.panel.style.width = `${w}px`;
          this.panel.style.height = `${h}px`;
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          this._clampToViewport();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    }

    hide() {
      this.visible = false;
      this.panel.style.setProperty('display', 'none', 'important');
      this.floatingTab.style.setProperty('display', 'block', 'important');
      this.floatingTab.style.left = `${this.pos.x}px`;
      this.floatingTab.style.top = `${this.pos.y}px`;
      this.storage.savePanelVisible(false);
    }

    show() {
      this.visible = true;
      this.panel.style.setProperty('display', 'flex', 'important');
      this.floatingTab.style.setProperty('display', 'none', 'important');
      this.storage.savePanelVisible(true);
      this._clampToViewport();
    }

    resetPosition() {
      this.pos = { x: 24, y: 24 };
      this.panel.style.left = '24px';
      this.panel.style.top = '24px';
      this.floatingTab.style.left = '24px';
      this.floatingTab.style.top = '24px';
      this.storage.savePanelPosition(24, 24);
    }

    updateConnection(connected) {
      if (!this.statusDot) return;
      this.statusDot.classList.toggle('viq-connected', !!connected);
      this.statusDot.classList.toggle('viq-disconnected', !connected);
      if (this.statusText) {
        this.statusText.textContent = connected ? 'Connected' : 'Not detected';
      }
    }

    appendLog(entry) {
      const line = el('div', { class: `viq-log-line viq-log-${entry.level || 'info'}` });
      line.textContent = `[${new Date(entry.ts || Date.now()).toLocaleTimeString()}] ${entry.message}`;
      this.logEl.appendChild(line);
      this._logLines.push(line);
      while (this._logLines.length > 300) this._logLines.shift().remove();
      this.logEl.scrollTop = this.logEl.scrollHeight;
    }

    renderState(state) {
      this._state = { ...this._state, ...state };
      const { queue, status, currentIndex, running } = this._state;
      const total = queue.length;
      const completed = queue.filter((q) => q.state === 'COMPLETED').length;
      const failed = queue.filter((q) => q.state === 'FAILED').length;
      const pending = queue.filter((q) => q.state === 'PENDING').length;
      
      this.countEl.textContent = `Total: ${total}  •  Pending: ${pending}  •  Completed: ${completed}  •  Failed: ${failed}`;
      const pct = total ? Math.round((completed / total) * 100) : 0;
      this.barFill.style.width = `${pct}%`;
      
      const cur = queue[currentIndex];
      this.currentEl.textContent = cur ? `#${currentIndex + 1}/${total} [${cur.state}] ${cur.text.slice(0, 120)}` : 'Idle';
      this.statsEl.textContent = `Status: ${status}${running ? ' (running)' : ''}  •  ${pct}%`;
      
      this.promptList.innerHTML = '';
      queue.slice(0, 200).forEach((q, i) => {
        const row = el('div', { class: `viq-prompt-row viq-state-${(q.state || 'PENDING').toLowerCase()}` });
        const del = el('button', { class: 'viq-mini-btn', text: '✕', title: 'Remove' });
        del.addEventListener('click', () => {
          if (confirm('Remove this prompt?')) this.onAction({ type: 'REMOVE_PROMPT', id: q.id });
        });
        row.append(
          el('span', { class: 'viq-prompt-idx', text: `#${i + 1}` }),
          el('span', { class: 'viq-prompt-state', text: q.state || 'PENDING' }),
          el('span', { class: 'viq-prompt-text', text: q.text.slice(0, 80) }),
          del
        );
        this.promptList.appendChild(row);
      });
      if (queue.length > 200) {
        this.promptList.appendChild(el('div', { class: 'viq-more', text: `…and ${queue.length - 200} more` }));
      }
    }
  }

  global.VidsFloatingUI = { FloatingUI, HOST_ID };
})(typeof window !== 'undefined' ? window : globalThis);