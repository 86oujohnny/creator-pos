const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");

function harness(saved = new Map(), faults = {}) {
  const messages = [];
  const app = vm.createContext({
    console: { log() {} }, USE_FIREBASE: false, Blob,
    moneyText: {}, renderAll() {}, alert: value => messages.push(value), confirm: () => true,
    localStorage: {
      getItem: key => saved.get(key) ?? null,
      setItem(key, value) { if (faults.write) throw Error("test write failure"); saved.set(key, value); }
    }
  });
  for (const file of ["products.js", "state.js", "bundle.js", "luckyBag.js", "raffle.js", "gashapon.js", "sales.js", "productAdmin.js", "storage.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), app);
  }
  const run = code => vm.runInContext(code, app);
  run('hasWriteLock = true; loadLocalData(); globalThis.sticker = products.find(p => p.id === "epoxy_sticker"); globalThis.opener = products.find(p => p.id === "plush_badge_bottle_opener");');
  const draw = () => run('startRaffle(); addToCurrentSale(sticker, "無款式"); finishRaffle();');
  return { run, draw, saved, messages };
}

test("raffle independent quantity oracle 0-20; prizes never add retail price", () => {
  const h = harness();
  for (let count = 0; count <= 20; count++) {
    h.run("clearCurrentSale()");
    for (let i = 0; i < count; i++) h.draw();
    assert.equal(h.run("calculateSaleTotal(currentSale)"), Math.floor(count / 3) * 600 + count % 3 * 250);
  }
});

test("removing and readding draws preserves the specified 1-7 draw prices", () => {
  const h = harness();
  const expected = [250, 500, 600, 850, 1100, 1200, 1450];
  for (const total of expected) {
    h.draw();
    assert.equal(h.run("calculateSaleTotal(currentSale)"), total);
  }
  for (const total of [1200, 1100, 850, 600, 500, 250, 0]) {
    h.run("currentSale.pop()");
    assert.equal(h.run("calculateSaleTotal(currentSale)"), total);
  }
  h.draw(); assert.equal(h.run("calculateSaleTotal(currentSale)"), 250);
});

test("retail and raffle prizes consume one shared stock pool without overselling", () => {
  const h = harness();
  h.run('commitLocalChange(()=>{sticker.stock=1;saveData()});addToCurrentSale(sticker,"無款式")');
  h.draw();h.run("checkoutCurrentSale()");
  assert.equal(h.run("salesLog.length"), 0);
  assert.equal(h.run("sticker.stock"), 1);
  h.run("commitLocalChange(()=>{sticker.stock=2;saveData()});checkoutCurrentSale();loadLocalData()");
  assert.equal(h.run("money"), 310);
  assert.equal(h.run("sticker.stock"), 0);
  h.run("undoLastSale()");
  assert.equal(h.run("sticker.stock"), 2);
});

test("deleted custom prize keeps its historical name and price and can be refunded", () => {
  const h = harness();
  h.run('const custom=createCustomProduct("自訂獎品",88);products.push(custom);startRaffle();addToCurrentSale(custom,"無款式");finishRaffle();checkoutCurrentSale()');
  const original = h.run("JSON.stringify(salesLog[0])");
  h.run('updateProductPrice(custom,{value:"99"});deleteCustomProduct(custom);loadLocalData()');
  assert.equal(h.run("JSON.stringify(salesLog[0])"), original);
  h.run("editSale(0,salesLog[0]);currentSale=[];checkoutCurrentSale()");
  assert.equal(h.run("money"), 0);
});

test("CSV totals and quantities are not multiplied by raffle parent/content rows", async () => {
  const h = harness();for (let i=0;i<3;i++) h.draw();h.run("checkoutCurrentSale()");
  const text = await h.run("createSalesLogCsv()").text();
  assert.equal((text.match(/"訂單合計"/g) || []).length, 1);
  assert.ok(text.includes('"訂單狀態","銷售數量","出庫數量","原成交總額"'));
  assert.equal((text.match(/"600"/g) || []).length, 2); // One net total and one historical total, both on the summary.
  const detailLines = text.split(/\r?\n/).filter(line => line.includes('"摸彩"') || line.includes('"摸彩內容"'));
  assert.equal(detailLines.filter(line => line.endsWith(',"有效","1","0",""')).length, 3);
  assert.equal(detailLines.filter(line => line.endsWith(',"有效","0","1",""')).length, 3);
  assert.equal(detailLines.some(line => line.includes('"600"')), false);
});

test("CSV retains replacement and refund audit rows with zero effective totals/quantities", async () => {
  const h = harness();h.draw();h.run('checkoutCurrentSale();editSale(0,salesLog[0]);startRaffle(0);raffleContents=[];addToCurrentSale(opener,"無款式");finishRaffle();checkoutCurrentSale();editSale(1,salesLog[1]);currentSale=[];checkoutCurrentSale()');
  const before = h.saved.get("creatorPOS_state");
  const text = await h.run("createSalesLogCsv()").text();
  assert.equal((text.match(/"訂單合計"/g) || []).length, 2);
  assert.ok(text.includes('"已替換"'));
  assert.ok(text.includes('"已退貨"'));
  for (const id of h.run("salesLog.map(s=>s.id)")) assert.ok(text.includes(`"${id}"`));
  assert.equal(text.includes('"有效"'), false);
  assert.equal((text.match(/,"0","(?:被?取代：[^"]*)?","","已(?:替換|退貨)","0","0","250"/g) || []).length, 2);
  assert.equal(text.split(/\r?\n/).filter(line => /,"已(?:替換|退貨)","0","0",""$/.test(line)).length, 4);
  assert.equal(h.run("money"), 0);
  assert.equal(h.saved.get("creatorPOS_state"), before);
});

test("raffle edit/refund write failures preserve the full cart, history and shared stock", () => {
  const faults = {}, h = harness(new Map(), faults);h.draw();h.run("checkoutCurrentSale()");
  h.run('editSale(0,salesLog[0]);startRaffle(0);raffleContents=[];addToCurrentSale(opener,"無款式");finishRaffle()');
  let before = h.saved.get("creatorPOS_state"), runtime = h.run("JSON.stringify(captureRuntime())");
  faults.write = true;h.run("checkoutCurrentSale();checkoutCurrentSale()");
  assert.equal(h.saved.get("creatorPOS_state"), before);
  assert.equal(h.run("JSON.stringify(captureRuntime())"), runtime);
  faults.write = false;h.run("checkoutCurrentSale();loadLocalData()");
  assert.equal(h.run("money"), 250);
  assert.equal(h.run("sticker.stock"), 100);
  assert.equal(h.run("opener.stock"), 99);
  h.run("editSale(1,salesLog[1]);currentSale=[]");
  before = h.saved.get("creatorPOS_state");runtime = h.run("JSON.stringify(captureRuntime())");
  faults.write = true;h.run("checkoutCurrentSale();checkoutCurrentSale()");
  assert.equal(h.saved.get("creatorPOS_state"), before);
  assert.equal(h.run("JSON.stringify(captureRuntime())"), runtime);
  faults.write = false;h.run("checkoutCurrentSale();checkoutCurrentSale();loadLocalData()");
  assert.equal(h.run("money"), 0);
  assert.equal(h.run("opener.stock"), 100);
});

test("missing new-product keys do not reset existing stock, prices or custom products", () => {
  const h = harness();const old = JSON.parse(h.saved.get("creatorPOS_state"));
  for (const id of ["raffle", "epoxy_sticker", "plush_badge_bottle_opener"]) {
    delete old.stock[id];delete old.prices[id];
  }
  old.stock.fox_towel=4;old.prices.fox_towel=777;
  old.customProducts=[{id:"custom_old",name:"舊商品",price:33}];
  const raw=JSON.stringify(old);const saved=new Map([["creatorPOS_state",raw]]);
  const fresh = harness(saved);
  assert.equal(fresh.run('products.find(p=>p.id==="fox_towel").stock'),4);
  assert.equal(fresh.run('products.find(p=>p.id==="fox_towel").price'),777);
  assert.equal(fresh.run('products.find(p=>p.id==="custom_old").price'),33);
  assert.equal(fresh.run("sticker.price"),60);assert.equal(fresh.run("opener.price"),100);
  assert.equal(saved.get("creatorPOS_state"),raw);
});

test("invalid stored stock blocks initialization; zero/null stock cannot fulfil a draw", () => {
  for (const stock of ["", -1, 0.5, "NaN"]) {
    const h = harness();const state=JSON.parse(h.saved.get("creatorPOS_state"));
    state.stock.epoxy_sticker=stock;const raw=JSON.stringify(state);h.saved.set("creatorPOS_state",raw);
    assert.throws(()=>h.run("loadLocalData()"));
    assert.equal(h.run("canWriteData()"),false);
    h.run("checkoutCurrentSale()");assert.equal(h.saved.get("creatorPOS_state"),raw);
  }
  for (const stock of [0,null]) {
    const h = harness();const state=JSON.parse(h.saved.get("creatorPOS_state"));
    state.stock.epoxy_sticker=stock;h.saved.set("creatorPOS_state",JSON.stringify(state));
    h.run("loadLocalData()");h.draw();h.run("checkoutCurrentSale()");
    assert.equal(h.run("salesLog.length"),0);assert.equal(h.run("money"),0);
  }
});

test("new products and six English images; travel bag defaults unchanged", () => {
  const h = harness();
  assert.equal(h.run("sticker.price"), 60);
  assert.equal(h.run("opener.price"), 100);
  assert.equal(h.run('products.find(p => p.id === "fox_travel_bag").price'), 650);
  for (const id of ["eevee_card_holder", "fox_plush_keychain", "fox_towel", "fox_rug", "epoxy_sticker", "plush_badge_bottle_opener"]) {
    assert.ok(fs.existsSync(path.join(root, h.run(`products.find(p => p.id === "${id}").image`))));
  }
  h.run('addToCurrentSale(sticker,"無款式");addToCurrentSale(opener,"無款式");checkoutCurrentSale()');
  assert.equal(h.run("money"), 160);
  assert.equal(h.run("sticker.stock"), 99);
  assert.equal(h.run("opener.stock"), 99);
});

test("edit raffle working copy, cancel, mode exclusivity, empty draft and checkout guard", () => {
  const h = harness();
  h.run("startRaffle();finishRaffle();checkoutCurrentSale();startLuckyBag();startGashapon()");
  assert.equal(h.run("currentSale.length"), 0);
  assert.equal(h.run("luckyBagMode || gashaponMode"), false);
  h.run("cancelRaffle()"); h.draw();
  const original = h.run("JSON.stringify(currentSale[0])");
  h.run('startRaffle(0);raffleContents.splice(0,1);addToCurrentSale(opener,"無款式");cancelRaffle()');
  assert.equal(h.run("JSON.stringify(currentSale[0])"), original);
  h.run('startRaffle(0);raffleContents.splice(0,1);addToCurrentSale(opener,"無款式");finishRaffle();finishRaffle()');
  assert.equal(h.run("currentSale.length"), 1);
  h.run("checkoutCurrentSale()");
  assert.equal(h.run("money"), 250);
  assert.equal(h.run("sticker.stock"), 100);
  assert.equal(h.run("opener.stock"), 99);
});

test("three draws mixed with retail and omamori; save reload edit refund exact stock", () => {
  const h = harness();
  for (let i = 0; i < 3; i++) h.draw();
  h.run('addToCurrentSale(opener,"無款式");const charm = products.find(p=>p.id==="omamori");addToCurrentSale(charm,charm.specialBundles[0]);addToCurrentSale(charm,"好運守");checkoutCurrentSale();loadLocalData()');
  assert.equal(h.run("money"), 1720); // 600 + 100 + 900 + 120
  assert.equal(h.run("sticker.stock"), 97);
  const original = h.run("JSON.stringify(salesLog[0])");
  h.run('editSale(0,salesLog[0]);startRaffle(0);raffleContents=[];addToCurrentSale(opener,"無款式");finishRaffle()');
  assert.equal(h.run("JSON.stringify(salesLog[0])"), original);
  h.run("checkoutCurrentSale();loadLocalData()");
  assert.equal(h.run("money"), 1720);
  assert.equal(h.run("sticker.stock"), 98);
  assert.equal(h.run("opener.stock"), 98);
  h.run("editSale(1,salesLog[1]);currentSale=[];checkoutCurrentSale();loadLocalData()");
  assert.equal(h.run("money"), 0);
  assert.equal(h.run("sticker.stock"), 100);
  assert.equal(h.run("opener.stock"), 100);
});

test("raffle out of stock, atomic failure retry and undo", () => {
  const faults = {}, h = harness(new Map(), faults);
  h.run("commitLocalChange(()=>{sticker.stock=1;saveData()})");
  h.draw();h.draw(); h.run("checkoutCurrentSale()");
  assert.equal(h.run("money"), 0);
  h.run("currentSale.pop()");
  const before = h.saved.get("creatorPOS_state");
  faults.write = true;
  h.run("checkoutCurrentSale();checkoutCurrentSale()");
  assert.equal(h.saved.get("creatorPOS_state"), before);
  assert.equal(h.run("sticker.stock"), 1);
  assert.equal(h.run("currentSale.length"), 1);
  assert.equal(h.run("raffleEditingIndex"), null);
  faults.write = false;
  h.run("checkoutCurrentSale();checkoutCurrentSale();loadLocalData()");
  assert.equal(h.run("money"), 250);
  assert.equal(h.run("sticker.stock"), 0);
  assert.equal(h.run("salesLog.length"), 1);
  h.run("undoLastSale()");
  assert.equal(h.run("money"), 0);
  assert.equal(h.run("sticker.stock"), 1);
});

test("raffle special bundle stock, lock guards and draft reset on reload", () => {
  const h = harness();
  h.run('const charm=products.find(p=>p.id==="omamori");startRaffle();addToCurrentSale(charm,charm.specialBundles[0]);finishRaffle();checkoutCurrentSale()');
  assert.equal(h.run("money"), 250);
  assert.equal(h.run('charm.variants.find(v=>v.name==="好運守").stock'), 100);
  assert.equal(h.run("charm.variants.slice(1).every(v=>v.stock===99)"), true);
  h.run("startRaffle();hasWriteLock=false;addToRaffle(sticker,'無款式');finishRaffle();cancelRaffle()");
  assert.equal(h.run("raffleContents.length"), 0);
  h.run("hasWriteLock=true;loadLocalData()");
  assert.equal(h.run("raffleMode"), false);
});

test("raffle does not share lucky bag quantity discounts or coupon eligibility", () => {
  const h = harness(); h.draw(); h.draw();
  h.run('startLuckyBag();addToCurrentSale(sticker,"無款式");finishLuckyBag()');
  assert.equal(h.run("calculateSaleTotal(currentSale)"), 1050);
  h.run('currentSale.push({productId:"gashapon",singlePrice:650,isFixedPrice:true,gashaponResult:{rewardType:"coupon",maxValue:800}})');
  assert.equal(h.run("calculateSaleTotal(currentSale)"), 1700);
});

test("CSV includes individual stock members of a special bundle inside a raffle", async () => {
  const h = harness();
  h.run('startRaffle();const charm=products.find(p=>p.id==="omamori");addToCurrentSale(charm,charm.specialBundles[0]);finishRaffle();checkoutCurrentSale()');
  const text = await h.run("createSalesLogCsv()").text();
  for (const name of ["伊布御守", "火伊布御守", "水伊布御守", "雷伊布御守", "月伊布御守", "太陽伊布御守", "冰伊布御守", "葉伊布御守", "仙子伊布御守"]) {
    assert.ok(text.includes(`"${name}"`));
  }
  assert.equal((text.match(/"99"/g) || []).length, 9);
});

test("CSV uses historical totals, quotes Chinese and labels raffle content; does not write", async () => {
  const h = harness();h.draw();h.run("checkoutCurrentSale()");
  const before = h.saved.get("creatorPOS_state");
  h.run('salesLog[0].items[0].contents[0].name = \'獎品,"特別"\\n第二行\';sticker.price=999;');
  const text = await h.run("createSalesLogCsv()").text();
  assert.ok(text.includes('"摸彩"'));
  assert.ok(text.includes('"摸彩內容"'));
  assert.ok(text.includes('"獎品,""特別""\n第二行"'));
  assert.ok(text.includes('"250"'));
  assert.ok(text.includes('"60"'));
  assert.equal(h.saved.get("creatorPOS_state"), before);
});
