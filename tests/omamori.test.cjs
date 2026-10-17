const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.join(__dirname, "..");

function createApp() {
  const saved = new Map();
  const app = vm.createContext({
    console: { log() {}, warn() {} },
    window: { addEventListener() {} },
    localStorage: {
      getItem: key => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, String(value))
    },
    renderAll() {}
  });
  for (const file of ["products.js", "state.js", "bundle.js", "sales.js", "productAdmin.js", "storage.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), app);
  }
  vm.runInContext(`
    globalThis.catalog = products;
    globalThis.charm = products.find(p => p.id === "omamori");
    globalThis.fullSet = charm.specialBundles[0];
    globalThis.makeItems = names => names.map(variant => ({
      productId: charm.id, variant, singlePrice: charm.price,
      bundleCount: charm.bundleCount, bundlePrice: charm.bundlePrice,
      specialBundles: charm.specialBundles
    }));
    globalThis.getSale = () => currentSale;
  `, app);
  return app;
}

test("omamori quantity discounts and complete sets do not double count", () => {
  const app = createApp();
  const names = [...app.fullSet.variants];
  for (const [variants, expected] of [
    [[], 0], [[names[0]], 120], [[names[0], names[0]], 240],
    [Array(3).fill("好運守"), 300], [Array(4).fill("好運守"), 420],
    [names, 900], [[...names, ...names], 1800],
    [[...names, "好運守"], 1020],
    [[...names, "好運守", names[0], names[0]], 1200],
    [Array(9).fill(names[0]), 900],
    [[...names.slice(0, 8), "好運守", "好運守"], 1020]
  ]) {
    const items = app.makeItems(variants);
    const before = JSON.stringify(items);
    assert.equal(app.calculateSaleTotal(items), expected);
    assert.equal(JSON.stringify(items), before);
  }
  // Nine duplicates also cost 900 via three quantity discounts, but are not a full set.
  assert.equal(app.hasCompleteBundle(app.makeItems(Array(9).fill(names[0])), app.fullSet), false);
  assert.equal(app.hasCompleteBundle(app.makeItems([...names.slice(0, 8), "好運守"]), app.fullSet), false);
  const group = app.makeItems([...names, "好運守"]);
  assert.equal(app.applySpecialBundles(group), 900);
  assert.equal(group.length, 1);
  assert.equal(group[0].variant, "好運守");
});

test("individual selection and explicit full set buttons preserve stock contents", () => {
  const app = createApp();
  for (const variant of app.fullSet.variants) app.addToCurrentSale(app.charm, variant);
  app.addToCurrentSale(app.charm, app.fullSet);
  app.addToCurrentSale(app.charm, "好運守");
  assert.equal(app.calculateSaleTotal(app.getSale()), 1920);
  const stock = app.getStockItemsFromSale(app.getSale());
  assert.equal(stock.length, 10);
  for (const item of stock) {
    assert.equal(item.quantity, item.variant === "好運守" ? 1 : 2);
    assert.equal(app.canDecreaseStock(item.productId, item.variant, item.quantity), true);
  }
});

test("lucky charm migration preserves stock and routes historical returns", () => {
  const app = createApp();
  assert.equal(app.catalog.find(p => p.id === "acrylic_stand").variants.some(v => v.name === "好運守"), false);
  app.applyStockSnapshot({ acrylic_stand: { "好運守": 37 } });
  assert.equal(app.charm.variants[0].stock, 37);
  app.applyStockSnapshot({ acrylic_stand: { "好運守": 37 }, omamori: { "好運守": 29 } });
  assert.equal(app.charm.variants[0].stock, 29);
  const oldItem = { productId: "acrylic_stand", name: "壓克力飯友", variant: "好運守", singlePrice: 120 };
  const [stock] = app.getStockItemsFromSale([{ contents: [oldItem] }]);
  assert.equal(stock.productId, "omamori");
  app.increaseStock(stock.productId, stock.variant, stock.quantity);
  assert.equal(app.charm.variants[0].stock, 30);
  assert.equal(oldItem.productId, "acrylic_stand");
  assert.equal(app.canDecreaseNewStockAfterRestoringOld([stock], [stock]), true);
  app.decreaseStock(stock.productId, stock.variant, stock.quantity);
  assert.equal(app.charm.variants[0].stock, 29);
});

test("new prices survive saved overrides and all catalog image references exist", () => {
  const app = createApp();
  app.localStorage.setItem("creatorPOS_productPrices", JSON.stringify({ omamori: 99, fox_card_holder: 250, eevee_card_holder: 260 }));
  app.loadProductAdminData();
  assert.equal(app.charm.price, 120);
  assert.equal(app.catalog.find(p => p.id === "fox_card_holder").price, 280);
  assert.equal(app.catalog.find(p => p.id === "eevee_card_holder").price, 260);
  for (const product of app.catalog) {
    for (const item of [product, ...(product.variants || [])]) {
      if (item.image) assert.equal(fs.existsSync(path.join(root, item.image)), true, item.image);
    }
  }
});
