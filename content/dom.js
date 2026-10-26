// content/dom.js
(function (global) {
  const VIDS_IMAGE_BUTTON_SELECTOR = 'button.image-synthesis-creation-button[aria-label="Create"]';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function waitFor(fn, { timeout = 15000, interval = 150 } = {}) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        let val; try { val = fn(); } catch (_) {}
        if (val) return resolve(val);
        if (Date.now() - start > timeout) return reject(new Error('waitFor timeout'));
        setTimeout(tick, interval);
      };
      tick();
    });
  }

  function getAllDocuments() {
    const docs = [document];
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try { if (iframe.contentDocument) docs.push(iframe.contentDocument); } catch (e) {}
    }
    return docs;
  }

  function queryAllAcrossDocs(selector) {
    let results = [];
    for (const doc of getAllDocuments()) {
      try { results = results.concat(Array.from(doc.querySelectorAll(selector))); } catch (e) {}
    }
    return results;
  }

  // Physical click purely via JS (no debugger needed)
  function jsClick(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }

  // ---------- Panel & Create button ----------
  function findCreateButton() {
    const btns = queryAllAcrossDocs(VIDS_IMAGE_BUTTON_SELECTOR);
    if (btns.length > 0) return btns[0];
    const fallback = queryAllAcrossDocs('button[aria-label="Create"]');
    if (fallback.length > 0) return fallback[0];
    return null;
  }

  function isCreateEnabled(btn) {
    if (!btn) return false;
    if (btn.disabled) return false;
    if (btn.getAttribute('aria-disabled') === 'true') return false;
    if (btn.classList.contains('goog-button-disabled')) return false;
    return true;
  }

  function waitForCreateEnabled(timeout = 45000) {
    return waitFor(() => {
      const b = findCreateButton();
      return b && isCreateEnabled(b) ? b : null;
    }, { timeout, interval: 300 });
  }

  function isPanelAvailable() {
    return !!(findPromptField() || findCreateButton());
  }

  // ---------- Prompt field ----------
  function findPromptField() {
    const inputs = queryAllAcrossDocs('textarea, input[type="text"], [contenteditable="true"]');
    for (const el of inputs) {
      if (!isVisible(el)) continue;
      const label = (el.getAttribute('aria-label') || '') + ' ' + (el.getAttribute('placeholder') || '') + ' ' + (el.textContent || '');
      if (/prompt|describe|image/i.test(label)) return el;
    }
    return null; 
  }

  async function setPromptText(el, text) {
    if (!el) throw new Error('Prompt field not found');
    
    // 1. Focus the field
    try { el.focus(); } catch(_) {}

    // 2. Create a fake ClipboardEvent to simulate a real paste
    // Google Docs listens for this specifically!
    try {
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', text);
      
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer
      });

      // Dispatch the paste event
      el.dispatchEvent(pasteEvent);
    } catch (e) {
      console.warn('ClipboardEvent not supported, falling back', e);
      // Fallback to standard JS
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        el.textContent = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
      }
    }

    // 3. If the paste event didn't take, force the value as a backup
    const actual = el.value !== undefined ? el.value : el.textContent;
    if (actual.trim() !== text.trim()) {
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        el.textContent = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
      }
    }

    // 4. Wait a moment for React to enable Create button
    await sleep(1000);
    return true;
  }

  async function ensureLandscape16x9() {
    return { alreadySelected: true, method: 'skipped' };
  }

  async function clickCreateButton() {
    // Try to find the button element directly
    const btn = findCreateButton();
    if (btn && isCreateEnabled(btn)) {
      btn.click();
    } else {
      // Fallback: click at coordinates using pure JS
      jsClick(1780, 864);
    }
    return true;
  }

  // ---------- Image baseline / completion detection ----------
  function collectImageUrls() {
    const urls = new Set();
    for (const doc of getAllDocuments()) {
      for (const img of doc.querySelectorAll('img')) {
        if (!isVisible(img)) continue;
        const src = img.currentSrc || img.src;
        if (src && /^https?:|^blob:|^data:image/.test(src)) urls.add(src);
      }
    }
    return urls;
  }

  function snapshotImageBaseline() { return collectImageUrls(); }
  
  function detectNewImage(baseline) {
    const added = [];
    for (const u of collectImageUrls()) if (!baseline.has(u)) added.push(u);
    return added.filter((u) => u.startsWith('blob:') || u.startsWith('data:image') || u.length > 40);
  }

  function detectGenerationStarted(baseline, timeout = 15000) {
    return waitFor(() => {
      if (detectNewImage(baseline).length > 0) return 'new-image';
      const btn = findCreateButton();
      if (btn && !isCreateEnabled(btn)) return 'create-disabled';
      const p = document.querySelector('[role="progressbar"], progress, [aria-busy="true"]');
      if (p && isVisible(p)) return 'progress';
      return null;
    }, { timeout, interval: 250 });
  }

  async function waitForGenerationComplete(baseline, timeoutMs = 180000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (detectNewImage(baseline).length > 0) {
        await sleep(400);
        if (detectNewImage(baseline).length > 0) return detectNewImage(baseline)[0];
      }
      await sleep(500);
    }
    throw new Error('GENERATION_TIMEOUT');
  }

  global.VidsDOM = {
    findCreateButton, isCreateEnabled, waitForCreateEnabled, findPromptField, setPromptText,
    ensureLandscape16x9, isPanelAvailable, snapshotImageBaseline, detectNewImage, 
    detectGenerationStarted, waitForGenerationComplete, sleep,
    clickCreateButton
  };
})(typeof window !== 'undefined' ? window : globalThis);