// content/content.js
// Entry point. Wires storage, DOM, queue engine, and floating UI.
// Ensures only one instance runs per page and re-binds after SPA navigations.

(function () {
  if (window.__vidsImageQueueInitialized) return;
  window.__vidsImageQueueInitialized = true;

  const { VidsStorage, VidsDOM, VidsQueue, VidsFloatingUI } = window;
  if (!VidsStorage || !VidsDOM || !VidsQueue || !VidsFloatingUI) {
    console.error('[Vids Image Queue] Core modules missing');
    return;
  }

  let ui = null;
  let engine = null;

  async function boot() {
    const all = await VidsStorage.loadAll();
    const settings = all.settings;

    engine = new VidsQueue.QueueEngine({
      dom: VidsDOM,
      storage: VidsStorage,
      onUpdate: (update) => {
        if (update.log) {
          if (ui) ui.appendLog(update.log);
          return;
        }
        if (ui) ui.renderState(update);
      }
    });
    await engine.init();

    ui = new VidsFloatingUI.FloatingUI({
      storage: VidsStorage,
      settings,
      initialPosition: all.panelPosition,
      initialVisible: all.panelVisible !== false,
      onAction: handleAction
    });

    // Initial render
    ui.renderState({
      queue: engine.queue,
      status: engine.status,
      currentIndex: engine.currentIndex,
      settings: engine.settings,
      running: false
    });
    ui.appendLog({ message: 'Dashboard initialized', level: 'info', ts: Date.now() });

    // Connection check loop
    setInterval(() => {
      if (!ui) return;
      const connected = VidsDOM.isPanelAvailable();
      ui.updateConnection(connected);
    }, 2000);
    ui.updateConnection(VidsDOM.isPanelAvailable());

    // Observe DOM mutations to re-detect panel availability (Vids is a SPA)
    const mo = new MutationObserver(() => {
      if (!ui) return;
      ui.updateConnection(VidsDOM.isPanelAvailable());
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  async function handleAction(action) {
    if (!engine) return;
    try {
      switch (action.type) {
        case 'ADD_PROMPTS':
          for (const p of action.prompts) engine.addPrompt(p);
          ui.appendLog({ message: `Added ${action.prompts.length} prompt(s)`, level: 'info', ts: Date.now() });
          break;
        case 'REMOVE_PROMPT':
          engine.removePrompt(action.id);
          break;
        case 'CLEAR_QUEUE':
          engine.clearQueue();
          ui.appendLog({ message: 'Queue cleared', level: 'warn', ts: Date.now() });
          break;
        case 'CLEAR_COMPLETED':
          engine.clearCompleted();
          break;
        case 'START':
          engine.start();
          break;
        case 'PAUSE':
          engine.pause();
          break;
        case 'RESUME':
          engine.resume();
          break;
        case 'STOP':
          engine.stop();
          break;
        case 'RETRY_FAILED':
          engine.retryFailed();
          break;
        case 'SET_SETTINGS':
          engine.setSettings(action.settings);
          break;
        default:
          ui.appendLog({ message: `Unknown action: ${action.type}`, level: 'warn', ts: Date.now() });
      }
    } catch (e) {
      ui.appendLog({ message: `Action error: ${e.message}`, level: 'error', ts: Date.now() });
    }
  }

  // Wait until body exists
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();