// tests/queue.test.js
const assert = require('assert');
global.window = global;

global.chrome = {
  runtime: { lastError: null, sendMessage: (m, cb) => cb && cb({ ok: true, downloadId: 1 }) },
  storage: { local: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() } }
};

require('../content/storage.js');
require('../content/queue.js');
const { buildFilename, STATES, QueueEngine } = global.VidsQueue;

// --- filename tests ---
const fn = buildFilename('vids-image-{index}-{timestamp}', 3, new Date('2024-01-02T03:04:05Z').getTime(), 'https://x/y.webp');
assert.ok(/^vids-image-003-\d{8}-\d{6}\.webp$/.test(fn), 'filename pattern: ' + fn);
const fn2 = buildFilename('image-{index}', 1, Date.now(), 'blob:abc');
assert.ok(fn2.startsWith('image-001.'), 'ext appended: ' + fn2);

(async () => {
  // Mock DOM that models a real re-render: every waitForCreateEnabled returns
  // a FRESH button object. findCreateButton returns the most recent one.
  // Each button tracks its own disabled state and click count.
  let totalClicks = 0;
  const clickedButtons = new Set();
  const pending = [];

  function makeButton() {
    const b = {
      disabled: false,
      _clicks: 0,
      click() { if (b.disabled) return; b.disabled = true; b._clicks++; totalClicks++; clickedButtons.add(b); }
    };
    return b;
  }

  const mockDom = {
    isPanelAvailable: () => true,
    ensureLandscape16x9: async () => ({ alreadySelected: false, method: 'test' }),
    findPromptField: () => ({ tag: 'TEXTAREA' }),
    setPromptText: async () => true,
    snapshotImageBaseline: () => new Set(),
    waitForCreateEnabled: async () => { const b = makeButton(); pending.push(b); return b; },
    findCreateButton: () => pending[pending.length - 1] || null,
    isCreateEnabled: (b) => !!b && !b.disabled,
    isVidsBusy: () => false,
    detectGenerationStarted: async () => 'create-disabled',
    waitForGenerationComplete: async () => 'https://x/y.png',
    detectNewImage: () => ['https://x/y.png'],
    sleep: async () => {}
  };

  const mockStorage = {
    DEFAULTS: global.VidsStorage.DEFAULTS,
    loadAll: async () => ({ settings: { ...global.VidsStorage.DEFAULTS.settings, generationTimeoutMs: 1000 }, restoreQueue: false }),
    saveQueue: () => {},
    saveSettings: () => {}
  };

  const engine = new QueueEngine({ dom: mockDom, storage: mockStorage, onUpdate: () => {} });
  await engine.init();
  engine.setQueue(['a', 'b']);
  await engine.start();
  await new Promise((r) => setTimeout(r, 50));

  // Exactly one Create click per prompt, and each prompt's click landed on
  // its own (freshly rendered) button. This is the assertion that would have
  // caught the old identity-based WeakSet guard: on a real re-render the
  // buttons differ, so a same-object guard would either falsely block prompt
  // 2 (if the DOM reused the node) or silently not exist (if it didn't).
  assert.strictEqual(totalClicks, 2, 'exactly one Create click per prompt, got ' + totalClicks);
  assert.strictEqual(clickedButtons.size, 2, 'each prompt clicked its own button');
  assert.strictEqual(engine.queue[0].state, STATES.COMPLETED, 'prompt 1 completed');
  assert.strictEqual(engine.queue[1].state, STATES.COMPLETED, 'prompt 2 completed');

  console.log('queue.test.js: PASS');
})().catch((e) => { console.error(e); process.exit(1); });