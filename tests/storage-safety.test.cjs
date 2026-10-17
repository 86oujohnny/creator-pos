const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.join(__dirname, "..");
const STATE_KEY = "creatorPOS_state";

function harness(saved = new Map(), faults = {}) {
  const events = {};
  const messages = [];
  const app = vm.createContext({
    console: { log() {}, warn() {} }, USE_FIREBASE: false,
    moneyText: {}, renderAll() {}, alert: message => messages.push(message), confirm: () => true,
    window: { addEventListener: (name, callback) => { events[name] = callback; } },
    localStorage: {
      getItem(key) { if (faults.read?.(key)) throw Error("read failed"); return saved.get(key) ?? null; },
      setItem(key, value) { if (faults.write?.(key)) throw Error("write failed"); saved.set(key, String(value)); }
    }
  });
  for (const file of ["products.js", "state.js", "bundle.js", "sales.js", "productAdmin.js", "storage.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), app);
  }
  const run = source => vm.runInContext(source, app);
  run('if(typeof hasWriteLock!=="undefined")hasWriteLock=true;globalThis.charm=products.find(p=>p.id==="omamori")');
  return { app, saved, events, messages, run, load: () => run("loadLocalData()") };
}
function seed() {
  return new Map([
    ["creatorPOS_money", "120"],
    ["creatorPOS_salesLog", JSON.stringify([{ id: "old", status: "active", total: 120, items: [{ productId: "acrylic_stand", name: "壓克力飯友", variant: "好運守", singlePrice: 120, bundleCount: 3, bundlePrice: 300 }] }])],
    ["creatorPOS_stock", '{"acrylic_stand":{"好運守":37}}'],
    ["creatorPOS_customProducts", '[{"id":"custom_a","name":"A","price":55}]'],
    ["creatorPOS_productPrices", '{"omamori":99,"fox_card_holder":250,"puji":177}'],
    ["creatorPOS_settings", '{"theme":"light"}']
  ]);
}

test("failed initialization and unload never replace existing records", () => {
  const saved = seed(), before = [...saved];
  let once = true;
  const h = harness(saved, { write: () => once ? (once = false, true) : false });
  assert.throws(() => h.load());
  try { h.events.beforeunload?.(); } catch {}
  assert.deepEqual([...saved], before);
});

test("checkout failure and retry commit one sale with matching stock and money", () => {
  const faults = {}, h = harness(new Map(), faults); h.load();
  h.run('addToCurrentSale(charm,charm.specialBundles[0])');
  let fail = true; faults.write = () => fail;
  try { h.run("checkoutCurrentSale()"); } catch {}
  assert.equal(h.run("money"), 0);
  assert.equal(h.run("salesLog.length"), 0);
  assert.equal(h.run("charm.variants[1].stock"), 100);
  fail = false; h.run("checkoutCurrentSale();checkoutCurrentSale()");
  assert.equal(h.run("money"), 900);
  assert.equal(h.run("salesLog.length"), 1);
  assert.equal(h.run("charm.variants[1].stock"), 99);
});

test("a tab without write ownership cannot checkout or save on unload", () => {
  const h = harness(); h.load();
  h.run('addToCurrentSale(charm,charm.specialBundles[0]);if(typeof hasWriteLock!=="undefined")hasWriteLock=false');
  const before = [...h.saved];
  h.run("checkoutCurrentSale()");
  try { h.events.beforeunload?.(); } catch {}
  assert.deepEqual([...h.saved], before);
  assert.equal(h.run("money"), 0);
});

test("legacy lucky charm edit qualifies for omamori without changing original history", () => {
  const h = harness(seed());h.load();
  const original = h.run("JSON.stringify(salesLog[0])");
  h.run('editSale(0,salesLog[0]);addToCurrentSale(charm,"伊布御守");addToCurrentSale(charm,"火伊布御守")');
  assert.equal(h.run("JSON.stringify(salesLog[0])"), original);
  assert.equal(h.run("calculateSaleTotal(currentSale)"), 300);
  h.run("checkoutCurrentSale()");
  assert.equal(h.run("money"), 300);
  assert.equal(h.run("charm.variants[0].stock"), 37);
});

test("invalid versions migrate safely; future versions cannot be overwritten", () => {
  for (const marker of [null, "garbage", "NaN", "{}", "-1", "1.5", ""]) {
    const saved = seed(); if (marker !== null) saved.set("creatorPOS_productPricesMigrationVersion", marker);
    const h = harness(saved); h.load();
    assert.equal(h.run("charm.price"), 120, String(marker));
  }
  const saved = seed(); saved.set("creatorPOS_productPricesMigrationVersion", "2");
  const h = harness(saved), before = [...saved];
  assert.throws(() => h.load());
  try { h.events.beforeunload?.(); } catch {}
  assert.deepEqual([...saved], before);
});

test("every legacy read and the sole migration write can fail without data loss", () => {
  for (const key of [STATE_KEY, "creatorPOS_money", "creatorPOS_salesLog", "creatorPOS_stock",
    "creatorPOS_productPrices", "creatorPOS_productPricesMigrationVersion", "creatorPOS_customProducts"]) {
    for (const persistent of [false, true]) {
      const saved = seed(), before = [...saved]; let calls = 0;
      const h = harness(saved, { read: candidate => candidate === key && (++calls === 1 || persistent) });
      assert.throws(() => h.load(), key);
      assert.equal(h.run("canWriteData()"), false);
      assert.throws(() => h.run("saveLocalData()"));
      assert.deepEqual([...saved], before);
      if (!persistent) { h.load(); assert.equal(h.run("money"), 120); }
    }
  }
  for (const persistent of [false, true]) {
    const saved = seed(), before = [...saved]; let calls = 0;
    const faults = { write: key => key === STATE_KEY && (++calls === 1 || persistent) };
    const h = harness(saved, faults); assert.throws(() => h.load());
    assert.deepEqual([...saved], before);
    if (persistent) assert.throws(() => h.load());
    else { h.load(); assert.equal(h.run("money"), 120); }
  }
});

test("malformed stored data and future schemas block saving instead of defaulting", () => {
  for (const [key, value] of [
    ["creatorPOS_salesLog", "{"], ["creatorPOS_salesLog", "null"],
    ["creatorPOS_stock", "[]"], ["creatorPOS_money", "NaN"],
    ["creatorPOS_customProducts", "{}"], ["creatorPOS_productPrices", "null"],
    [STATE_KEY, "{"], [STATE_KEY, '{"schemaVersion":2}']
  ]) {
    const saved = seed(); saved.set(key, value); const before = [...saved];
    const h = harness(saved); assert.throws(() => h.load(), key);
    assert.equal(h.run("canWriteData()"), false);
    assert.deepEqual([...saved], before);
  }
});

test("edit, full refund, undo, reset and admin writes all rollback on failed commit", () => {
  for (const operation of ["edit", "refund", "undo", "reset", "price", "delete", "add"]) {
    for (const persistent of [false, true]) {
      const faults = {}, h = harness(seed(), faults); h.load();
      if (operation === "edit" || operation === "refund") {
        h.run("editSale(0,salesLog[0])");
        h.run(operation === "edit" ? 'addToCurrentSale(charm,"伊布御守")' : "currentSale=[]");
      }
      h.app.customProductNameInput = {value: "New"};
      h.app.customProductPriceInput = {value: "55"};
      const commands = {
        edit: "checkoutCurrentSale()", refund: "checkoutCurrentSale()", undo: "undoLastSale()",
        reset: "resetAllData()", price: 'updateProductPrice(charm,{value:"135"})',
        delete: 'deleteCustomProduct(products.find(p=>p.id==="custom_a"))',
        add: 'addCustomProductFromForm({preventDefault(){}})'
      };
      const before = h.run("JSON.stringify(captureRuntime())"), durable = h.saved.get(STATE_KEY);
      let attempts = 0; faults.write = key => key === STATE_KEY && (++attempts === 1 || persistent);
      h.run(commands[operation]);
      assert.equal(h.run("JSON.stringify(captureRuntime())"), before, operation);
      assert.equal(h.saved.get(STATE_KEY), durable, operation);
      const reopened = harness(h.saved); reopened.load();
      assert.equal(reopened.run("money"), 120, operation);
      if (persistent) {
        h.run(commands[operation]); assert.equal(h.saved.get(STATE_KEY), durable);
      } else {
        h.run(commands[operation]);
        const next = harness(h.saved); next.load();
        assert.equal(next.run("money"), JSON.parse(h.saved.get(STATE_KEY)).money);
        if (operation === "edit") assert.equal(next.run("money"), 240);
        if (["refund", "undo", "reset"].includes(operation)) assert.equal(next.run("money"), 0);
        if (operation === "price") assert.equal(next.run("charm.price"), 135);
      }
    }
  }
});

test("one envelope write contains all state; old keys remain untouched", () => {
  const saved = seed(), legacy = [...saved], writes = [];
  const h = harness(saved, { write: key => { writes.push(key); return false; } }); h.load();
  h.run('addToCurrentSale(charm,charm.specialBundles[0]);checkoutCurrentSale()');
  assert.deepEqual(writes, [STATE_KEY, STATE_KEY]);
  for (const [key, value] of legacy) assert.equal(saved.get(key), value);
  const data = JSON.parse(saved.get(STATE_KEY));
  assert.equal(data.money, 1020);
  assert.equal(data.salesLog.length, 2);
  assert.equal(data.stock.omamori["伊布御守"], 99);
  assert.equal(data.priceMigrationVersion, 1);
  assert.equal(data.customProducts[0].id, "custom_a");
});

test("reopening after a committed checkout cannot repeat the previous cart", () => {
  const h = harness(); h.load();
  h.run('addToCurrentSale(charm,charm.specialBundles[0]);checkoutCurrentSale()');
  const reopened = harness(h.saved); reopened.load();
  reopened.run("checkoutCurrentSale()");
  assert.equal(reopened.run("money"), 900);
  assert.equal(reopened.run("salesLog.length"), 1);
  assert.equal(reopened.run("charm.variants[1].stock"), 99);
});

test("changed durable revision requires reload, and cancelled legacy edit preserves history", () => {
  const h = harness(seed());h.load(); const historical = h.run("JSON.stringify(salesLog)");
  h.run("editSale(0,salesLog[0]);clearCurrentSale()");
  assert.equal(h.run("JSON.stringify(salesLog)"), historical);
  const modified = JSON.parse(h.saved.get(STATE_KEY)); modified.revision++;
  h.saved.set(STATE_KEY, JSON.stringify(modified));
  h.run('addToCurrentSale(charm,"伊布御守");checkoutCurrentSale()');
  assert.equal(h.run("canWriteData()"), false);
  assert.equal(h.run("money"), 120);
  h.load(); assert.equal(h.run("currentSale.length"), 0);
});

test("independent oracle covers quantities 0-20, order, mixed products and explicit sets", () => {
  const h = harness(); h.load(); let random = 217, cases = 0;
  const next = count => { random = (random * 1664525 + 1013904223) >>> 0; return random % count; };
  for (let count = 0; count <= 20; count++) {
    for (let trial = 0; trial < 60; trial++) {
      h.run("currentSale=[]"); const variants = Array(10).fill(0);
      for (let i = 0; i < count; i++) {
        const variant = trial === 0 ? 1 : trial === 1 ? (i % 9) + 1 : next(10);
        variants[variant]++; h.run(`addToCurrentSale(charm,charm.variants[${variant}].name)`);
      }
      const fullSets = Math.min(...variants.slice(1)), remainder = count - 9 * fullSets;
      const expected = 900 * fullSets + 300 * Math.floor(remainder / 3) + 120 * (remainder % 3);
      assert.equal(h.run("calculateSaleTotal([...currentSale].reverse())"), expected);
      for (let sets = 0; sets < 3; sets++) {
        if (sets) h.run("addToCurrentSale(charm,charm.specialBundles[0])");
        assert.equal(h.run("calculateSaleTotal(currentSale)"), expected + 900 * sets);
        h.run('addToCurrentSale(products.find(p=>p.id==="fox_card_holder"),"無款式")');
        assert.equal(h.run("calculateSaleTotal(currentSale)"), expected + 900 * sets + 280);
        h.run("currentSale.pop()"); cases++;
      }
    }
  }
  assert.equal(cases, 3780);
});

test("set stock boundaries, cancel, repeated checkout and undo preserve per-variant counts", () => {
  for (const stock of [0, 1, 2]) {
    const h = harness(); h.load();
    h.run(`charm.variants.forEach(v=>v.stock=2);charm.variants[1].stock=${stock};saveLocalData()`);
    h.run('addToCurrentSale(charm,charm.specialBundles[0]);clearCurrentSale();addToCurrentSale(charm,charm.specialBundles[0]);addToCurrentSale(charm,charm.specialBundles[0]);checkoutCurrentSale();checkoutCurrentSale()');
    assert.equal(h.run("salesLog.length"), stock === 2 ? 1 : 0);
    assert.equal(h.run("charm.variants[0].stock"), 2);
    assert.equal(h.run("charm.variants[1].stock"), stock === 2 ? 0 : stock);
    if (stock === 2) {
      h.run("undoLastSale();undoLastSale()");
      assert.equal(h.run("charm.variants.every(v=>v.stock===2)"), true);
      assert.equal(h.run("money"), 0);
    }
  }
});
