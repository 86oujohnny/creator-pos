const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.join(__dirname, "..");

function createApp(saved = new Map()) {
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

test("first price migration updates only the required saved prices", () => {
  const app = createApp();
  const otherData = {
    creatorPOS_stock: '{"acrylic_stand":{"好運守":37}}',
    creatorPOS_salesLog: '[{"id":"existing","total":300}]',
    creatorPOS_money: "300",
    creatorPOS_customProducts: '[{"id":"custom_existing","name":"Custom","price":77}]',
    creatorPOS_settings: '{"theme":"light"}'
  };
  for (const [key, value] of Object.entries(otherData)) app.localStorage.setItem(key, value);
  app.localStorage.setItem("creatorPOS_productPrices", JSON.stringify({ omamori: 99, fox_card_holder: 250, eevee_card_holder: 260, custom_existing: 88, archived_product: 42 }));
  app.loadProductAdminData();
  assert.equal(app.charm.price, 120);
  assert.equal(app.catalog.find(p => p.id === "fox_card_holder").price, 280);
  assert.equal(app.catalog.find(p => p.id === "eevee_card_holder").price, 260);
  assert.equal(app.catalog.find(p => p.id === "custom_existing").price, 88);
  assert.deepEqual(JSON.parse(app.localStorage.getItem("creatorPOS_productPrices")), {
    omamori: 120, fox_card_holder: 280, eevee_card_holder: 260, custom_existing: 88, archived_product: 42
  });
  assert.equal(app.localStorage.getItem("creatorPOS_productPricesMigrationVersion"), "1");
  for (const [key, value] of Object.entries(otherData)) assert.equal(app.localStorage.getItem(key), value);
});

test("admin price changes survive repeated loads and a fresh app instance", () => {
  const saved = new Map();
  const app = createApp(saved);
  app.loadProductAdminData();
  app.updateProductPrice(app.charm, { value: "135" });
  app.updateProductPrice(app.catalog.find(p => p.id === "fox_card_holder"), { value: "310" });
  const savedPrices = app.localStorage.getItem("creatorPOS_productPrices");
  for (const instance of [app, createApp(saved)]) {
    instance.loadProductAdminData();
    instance.loadProductAdminData();
    assert.equal(instance.charm.price, 135);
    assert.equal(instance.catalog.find(p => p.id === "fox_card_holder").price, 310);
    assert.equal(instance.localStorage.getItem("creatorPOS_productPrices"), savedPrices);
    assert.equal(instance.charm.bundleCount, 3);
    assert.equal(instance.charm.bundlePrice, 300);
    assert.equal(instance.fullSet.price, 900);
    assert.equal(instance.fullSet.variants.length, 9);
    assert.equal(instance.fullSet.variants.includes("好運守"), false);
  }
});

test("new users initialize correct prices and migration state", () => {
  const app = createApp();
  app.loadProductAdminData();
  assert.equal(app.charm.price, 120);
  assert.equal(app.catalog.find(p => p.id === "fox_card_holder").price, 280);
  assert.deepEqual(JSON.parse(app.localStorage.getItem("creatorPOS_productPrices")), {
    omamori: 120, fox_card_holder: 280
  });
  assert.equal(app.localStorage.getItem("creatorPOS_productPricesMigrationVersion"), "1");
});

test("all catalog image references exist", () => {
  const app = createApp();
  for (const product of app.catalog) {
    for (const item of [product, ...(product.variants || [])]) {
      if (item.image) assert.equal(fs.existsSync(path.join(root, item.image)), true, item.image);
    }
  }
});
