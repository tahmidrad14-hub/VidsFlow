// tests/dom.test.js
// Pure-Node tests for DOM logic using minimal mock objects.
// Run with: node tests/dom.test.js

const assert = require('assert');

// Minimal fake DOM helpers for testing the pure helpers in dom.js.
// We import the module and exercise its exported pure functions where possible.

// Load dom.js in a fake global
global.window = global;
global.document = {
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ setAttribute(){}, addEventListener(){}, appendChild(){}, style:{}, classList:{add(){},remove(){},toggle(){}} }),
  execCommand: () => false,
  getComputedStyle: () => ({ visibility: 'visible', display: 'block', opacity: '1', backgroundImage: 'none' }),
  addEventListener: () => {},
  readyState: 'complete',
  documentElement: { appendChild(){} },
  body: {}
};
global.chrome = { runtime: { getURL: (p) => p, lastError: null, sendMessage: (m,cb)=>cb&&cb({ok:true}) }, storage: { local: { get: (k,cb)=>cb({}), set: (o,cb)=>cb&&cb() } } };
global.HTMLTextAreaElement = function(){};
global.HTMLInputElement = function(){};
Object.defineProperty(global.HTMLTextAreaElement.prototype, 'value', { get(){return this._v||''}, set(v){this._v=v} });
Object.defineProperty(global.HTMLInputElement.prototype, 'value', { get(){return this._v||''}, set(v){this._v=v} });

require('../content/dom.js');
const D = global.VidsDOM;
assert.ok(D, 'VidsDOM exported');

// Test: LANDSCAPE_HINTS matching through textOf logic
// We can't easily call internal textOf, so verify exported ensureLandscape16x9 throws
// when no trigger exists.
(async () => {
  let threw = false;
  try { await D.ensureLandscape16x9(); } catch (e) { threw = true; assert.strictEqual(e.message, 'ASPECT_TRIGGER_NOT_FOUND'); }
  assert.ok(threw, 'ensureLandscape16x9 should throw ASPECT_TRIGGER_NOT_FOUND with no DOM');

  // Test: detectNewImage against baseline with no images
  const baseline = D.snapshotImageBaseline();
  assert.ok(baseline instanceof Set, 'baseline is a Set');
  assert.strictEqual(D.detectNewImage(baseline).length, 0, 'no new images');

  // Test: findCreateButton returns null
  assert.strictEqual(D.findCreateButton(), null);

  console.log('dom.test.js: PASS');
})().catch((e) => { console.error(e); process.exit(1); });