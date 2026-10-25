const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const context = vm.createContext({});
for (const file of ["products.js", "state.js", "bundle.js", "render.js", "storage.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
}
const run = code => vm.runInContext(code, context);
const item = (id, price, extra = {}) => ({ productId: id, name: id, variant: id, singlePrice: price, ...extra });
const coupon = (value, excluded = []) => item("gashapon", 650, {
  isFixedPrice: true, bundleCount: 2, bundlePrice: 1200,
  gashaponResult: { rewardType: "coupon", maxValue: value, excluded }
});
function allocation(items) {
  return JSON.parse(run(`JSON.stringify(allocateCouponDiscount(${JSON.stringify(items)}))`));
}
function rows(items, total) {
  return JSON.parse(run(`JSON.stringify(getSaleStatistics(${JSON.stringify({ items, total })}))`));
}
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function verify(result, expected) {
  close(result.discount, expected);
  result.allocations.forEach(slot => {
    assert.ok(slot.discount >= -1e-10 && slot.discount <= slot.capacity + 1e-10);
  });
  result.couponUsage.forEach(coupon => {
    assert.ok(coupon.used >= -1e-10 && coupon.used <= coupon.maxValue + 1e-10);
    close(coupon.used, coupon.allocations.reduce((a, b) => a + b, 0));
    coupon.allocations.forEach((amount, j) => {
      const slot = result.allocations[j];
      if (["gashapon", "raffle", "lucky_bag"].includes(slot.productId) ||
          coupon.excluded.some(value => slot.eligibilityItems.some(item =>
            [item.productId, item.name, item.variant, item.type].includes(value)))) {
        close(amount, 0);
      }
    });
  });
  close(result.couponUsage.reduce((sum, coupon) => sum + coupon.used, 0), expected);
  result.allocations.forEach((slot, j) => close(slot.discount,
    result.couponUsage.reduce((sum, coupon) => sum + coupon.allocations[j], 0)));
}

// Independent exhaustive oracle: assign each indivisible unit to no coupon or
// any eligible coupon with face value left. Small integral cases only.
function brute(capacities, faces, allowed) {
  const units = capacities.flatMap((count, i) => Array(count).fill(i));
  function visit(index, remaining) {
    if (index === units.length) return 0;
    let best = visit(index + 1, remaining);
    for (let c = 0; c < faces.length; c++) {
      if (!remaining[c] || !allowed[c][units[index]]) continue;
      const next = [...remaining]; next[c]--;
      best = Math.max(best, 1 + visit(index + 1, next));
    }
    return best;
  }
  return visit(0, faces);
}

test("overlapping, disjoint, identical, absent eligibility and order permutations match an exhaustive oracle", () => {
  const capacities = [2, 1, 2], faces = [2, 2, 1];
  // Every combination of three scopes on three products (512 small networks).
  for (let mask = 0; mask < 512; mask++) {
    const allowed = faces.map((_, c) => capacities.map((_, p) => !!(mask & (1 << (c * 3 + p)))));
    const products = capacities.map((capacity, p) => item(`p${p}`, capacity));
    const coupons = faces.map((face, c) => coupon(face, products.filter((_, p) => !allowed[c][p]).map(p => p.productId)));
    const expected = brute(capacities, faces, allowed);
    const a = allocation([...products, ...coupons]); verify(a, expected);
    const b = allocation([...coupons].reverse().concat([...products].reverse())); verify(b, expected);
    const merchandise = result => result.allocations.filter(slot => slot.productId !== "gashapon")
      .map(({ productId, capacity, discount }) => ({ productId, capacity, discount }));
    assert.deepEqual(merchandise(a), merchandise(b));
    const total = 1855 - expected; // three draws 1850 + merchandise 5
    const stats = rows([...products, ...coupons], total);
    assert.equal(stats.some(row => row.productId.startsWith("legacy:")), false);
    close(stats.reduce((sum, row) => sum + row.revenue, 0), total);
  }
  verify(allocation([item("a", 100), coupon(500), coupon(500)]), 100);
  verify(allocation([item("a", 100), coupon(500, ["a"])]), 0);
});

test("alternating residual paths reassign several earlier coupons rather than only sorting restricted ones", () => {
  const products = ["a", "b", "c", "d"].map(id => item(id, 100));
  const coupons = [coupon(100, ["c", "d"]), coupon(100, ["a", "d"]),
    coupon(100, ["a", "b"]), coupon(100, ["b", "c"])];
  verify(allocation([...products, ...coupons]), 400);
  const total = 2400; // four gashapon draws; all four merchandise items covered
  const stats = rows([...products, ...coupons], total);
  assert.equal(stats.some(row => row.productId.startsWith("legacy:")), false);
  products.forEach(p => close(stats.find(row => row.productId === p.productId).revenue, 0));
  close(stats.reduce((sum, row) => sum + row.revenue, 0), total);
});

test("quantity promotions and both explicit/individual sets share discounted capacity with partial exclusions", () => {
  const promotion = { bundleCount: 3, bundlePrice: 300 };
  const variants = ["A", "B", "C"];
  const quantity = variants.map(variant => item("charm", 120, { variant, ...promotion }));
  verify(allocation([...quantity, coupon(500, ["C"])]), 200);
  const full = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const set = { price: 900, variants: full };
  const individual = full.map(variant => item("charm", 120, { variant, ...promotion, specialBundles: [set] }));
  const explicit = [item("charm", 900, { variant: "set", isSpecialBundle: true, isFixedPrice: true,
    contents: full.map(variant => item("charm", 120, { variant })) })];
  for (const merchandise of [individual, explicit]) {
    verify(allocation([...merchandise, coupon(1000, ["A"])]), 800);
    const stats = rows([...merchandise, coupon(1000, ["A"])], 750);
    close(stats.find(row => row.productId === "charm").revenue, 100);
    assert.equal(stats.some(row => row.productId.startsWith("legacy:")), false);
  }
  verify(allocation([...explicit, coupon(1000, ["set"])]), 0);
  verify(allocation([...explicit, coupon(1000, ["charm"])]), 0);
  const mixed = [...quantity, item("other", 100), coupon(100, ["C"])];
  const stats = rows(mixed, 950);
  close(stats.find(row => row.productId === "charm").revenue, 300 - 200 / 3);
  close(stats.find(row => row.productId === "other").revenue, 100 - 100 / 3);
});

test("invalid coupons are rejected; malformed legacy coupons keep an explicit receipt discrepancy", () => {
  for (const invalid of [{ maxValue: "100", excluded: [] }, { maxValue: -1 },
    { maxValue: 100, excluded: "a" }, { maxValue: 100, excluded: [null] }, { excluded: [] }]) {
    const items = [item("a", 100), { ...coupon(100), gashaponResult: { rewardType: "coupon", ...invalid } }];
    assert.throws(() => allocation(items), /抵用券資料無效/);
    const stats = rows(items, 650);
    assert.equal(stats.find(row => row.productId === "a").revenue, 100);
    assert.equal(stats.find(row => row.productId === "legacy:revenue_adjustment").revenue, -100);
  }
});
