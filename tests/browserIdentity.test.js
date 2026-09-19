const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { randomUUID } = require("node:crypto");
const source = readFileSync(path.join(__dirname, "../public/js/browser-identity.js"), "utf8");
const key = "daily_web_browser_id";

function load(storage = new Map(), blocked = "", crypto = { randomUUID }) {
  const window = {
    crypto,
    localStorage: {
      getItem(name) { if (blocked === "read") throw new Error("Storage denied"); return storage.get(name) ?? null; },
      setItem(name, value) { if (blocked === "write") throw new Error("Storage full"); storage.set(name, value); },
    },
  };
  vm.runInNewContext(source, { window });
  return window.DailyWebBrowserIdentity.getBrowserId;
}

test("browser identity is one UUID persisted across calls, tabs and normal future visits", () => {
  const storage = new Map();
  const getBrowserId = load(storage);
  const id = getBrowserId();
  assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(getBrowserId(), id);
  assert.equal(load(storage)(), id);
  assert.deepEqual([...storage.entries()], [[key, id]]);
});

test("cleared/corrupt storage produces a new ID, uppercase UUID is normalized", () => {
  const storage = new Map();
  const getBrowserId = load(storage);
  const first = getBrowserId();
  storage.clear();
  const second = getBrowserId();
  assert.notEqual(second, first);
  storage.set(key, "not-a-uuid");
  assert.notEqual(getBrowserId(), second);
  storage.set(key, first.toUpperCase());
  assert.equal(getBrowserId(), first);
});

test("blocked reads or writes use document-only identity without breaking callers", () => {
  for (const blocked of ["read", "write"]) {
    const storage = new Map();
    const getBrowserId = load(storage, blocked);
    const id = getBrowserId();
    assert.equal(getBrowserId(), id);
    assert.notEqual(load(storage, blocked)(), id);
    assert.equal(storage.size, 0);
  }
});

test("unavailable secure UUID API skips identity rather than using a weak fallback", () => {
  const getBrowserId = load(new Map(), "", {});
  assert.equal(getBrowserId(), null);
  assert.equal(getBrowserId(), null);
});
