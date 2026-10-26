// service-worker.js
let activeSessionTab = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'DOWNLOAD_IMAGE') {
    handleDownload(msg.payload)
      .then((id) => sendResponse({ ok: true, downloadId: id }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  
  if (msg?.type === 'START_SESSION') {
    startSession(sender.tab.id)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg?.type === 'END_SESSION') {
    endSession(sender.tab.id)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  if (msg?.type === 'EXECUTE_BATCH') {
    handleBatch(sender.tab.id, msg.payload.actions)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }

  return false;
});

async function startSession(tabId) {
  if (activeSessionTab === tabId) return;
  await new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, "1.3", () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else { activeSessionTab = tabId; resolve(); }
    });
  });
}

async function endSession(tabId) {
  if (activeSessionTab !== tabId) return;
  await new Promise((resolve) => {
    chrome.debugger.detach({ tabId }, () => {
      activeSessionTab = null;
      resolve();
    });
  });
}

async function handleBatch(tabId, actions) {
  if (activeSessionTab !== tabId) {
    await startSession(tabId);
  }

  for (const action of actions) {
    if (action.type === 'click') {
      await sendCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: action.x, y: action.y, button: 'left', clickCount: 1 });
      await sendCommand(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: action.x, y: action.y, button: 'left', clickCount: 1 });
      await new Promise(r => setTimeout(r, action.delay || 1000));
    } else if (action.type === 'keypress') {
      const keyParams = { key: action.key, code: action.code, windowsVirtualKeyCode: action.keyCode, nativeVirtualKeyCode: action.keyCode };
      await sendCommand(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', ...keyParams });
      await sendCommand(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...keyParams });
      await new Promise(r => setTimeout(r, action.delay || 200));
    }
  }
}

function sendCommand(tabId, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result);
    });
  });
}

function sanitizeFilename(name) {
  return String(name || 'image').replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 180) || 'image';
}

async function handleDownload({ url, filename }) {
  if (!url) throw new Error('No URL provided for download');
  const safeName = sanitizeFilename(filename);
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename: safeName, conflictAction: 'uniquify', saveAs: false }, (id) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (typeof id !== 'number') reject(new Error('Download did not return an id'));
      else resolve(id);
    });
  });
}