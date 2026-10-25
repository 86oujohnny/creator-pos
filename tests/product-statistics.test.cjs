const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");

function app(sales) {
  const context = vm.createContext({});
  for (const file of ["products.js", "state.js", "bundle.js", "render.js", "storage.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  }
  const run = code => vm.runInContext(code, context);
  run(`salesLog=${JSON.stringify(sales)}`);
  const rows = () => JSON.parse(run("JSON.stringify(getProductStatisticsRows())"));
  return { run, rows };
}
function item(id, price, extra = {}) {
  return { productId: id, name: id, variant: "無款式", singlePrice: price, ...extra };
}
function draws(count, id = "raffle") {
  return Array.from({ length: count }, () => item(id, id === "raffle" ? 250 : 550, {
    isFixedPrice: true, bundleCount: 3, bundlePrice: id === "raffle" ? 600 : 1500,
    contents: [item("expensive_prize", 5000)]
  }));
}
function coupon(value, excluded = []) {
  return item("gashapon", 650, {
    isFixedPrice: true, bundleCount: 2, bundlePrice: 1200,
    gashaponResult: { rewardType: "coupon", maxValue: value, excluded }
  });
}
function revenues(rows) { return Object.fromEntries(rows.map(row => [row.productId, row.revenue])); }
function sum(rows) { return rows.reduce((total, row) => total + row.revenue, 0); }

test("three and six raffle draws keep their discounts away from the 100 opener", () => {
  for (const [count, raffleRevenue, total] of [[3,600,700],[6,1200,1300]]) {
    const a = app([{ total, items: [...draws(count), item("opener",100)] }]);
    const rows=a.rows();
    assert.deepEqual(revenues(rows), { raffle: raffleRevenue, opener:100 });
    assert.equal(rows.find(row=>row.productId==="raffle").quantity,count);
    assert.equal(rows.some(row=>row.productId==="expensive_prize"),false);
    assert.equal(sum(rows),total);
  }
});

test("lucky bag, omamori quantity discount and explicit/individual sets retain their own subtotals", () => {
  const set = { name:"完整一套",price:900,variants:["A","B","C","D","E","F","G","H","I"] };
  const scenarios = [
    { items:draws(3,"lucky_bag"), id:"lucky_bag", revenue:1500, quantity:3 },
    { items:["A","B","C"].map(variant=>item("omamori",120,{variant,bundleCount:3,bundlePrice:300})), id:"omamori", revenue:300, quantity:3 },
    { items:set.variants.map(variant=>item("omamori",120,{variant,bundleCount:3,bundlePrice:300,specialBundles:[set]})), id:"omamori", revenue:900, quantity:9 },
    { items:[item("omamori",900,{isFixedPrice:true,isSpecialBundle:true,contents:set.variants.map(variant=>item("omamori",120,{variant}))})], id:"omamori", revenue:900, quantity:1 },
    // Eleven clips normally cost 760 with quantity discounts; the distinct set costs 650.
    { items:[...set.variants,"J","K"].map(variant=>item("butt_clip",80,{
      variant,bundleCount:3,bundlePrice:200,specialBundles:[{price:650,variants:[...set.variants,"J","K"]}]
    })), id:"butt_clip", revenue:650, quantity:11 }
  ];
  for (const scenario of scenarios) {
    const total=scenario.revenue+100;
    const rows=app([{total,items:[...scenario.items,item("opener",100)]}]).rows();
    assert.deepEqual(revenues(rows),{[scenario.id]:scenario.revenue,opener:100});
    assert.equal(rows.find(row=>row.productId===scenario.id).quantity,scenario.quantity);
    assert.equal(sum(rows),total);
  }
});

test("coupon discounts only eligible products, not raffle/lucky bag/gashapon or excluded names", () => {
  const items=[...draws(3),...draws(1,"lucky_bag"),item("a",100),item("b",200),
    item("excluded",300,{name:"狐番賞"}),coupon(90,["狐番賞"])];
  const rows=app([{total:2310,items}]).rows();
  assert.deepEqual(revenues(rows),{raffle:600,lucky_bag:550,a:70,b:140,excluded:300,gashapon:650});
  assert.equal(sum(rows),2310);
});

test("coupon exclusion supports product id, variant and type from snapshots", () => {
  for (const [extra, exclusion] of [[{},"excluded"],[{variant:"排除款"},"排除款"],[{type:"excluded_type"},"excluded_type"]]) {
    const rows=app([{total:850,items:[item("excluded",200,extra),item("a",100),coupon(100,[exclusion])]}]).rows();
    assert.deepEqual(revenues(rows),{excluded:200,a:0,gashapon:650});
    assert.equal(sum(rows),850);
  }
  const rows=app([{total:850,items:[item("mixed",100,{variant:"red"}),item("mixed",100,{variant:"blue"}),item("other",100),coupon(100,["blue"])]}]).rows();
  assert.deepEqual(revenues(rows),{mixed:150,other:50,gashapon:650});
});

test("multiple coupons with different exclusions do not spread discounts to excluded products", () => {
  const rows=app([{total:1400,items:[item("a",100),item("b",200),coupon(50,["b"]),coupon(50,["a"])]}]).rows();
  assert.deepEqual(revenues(rows),{a:50,b:150,gashapon:1200});
  assert.equal(sum(rows),1400);
  const capped=app([{total:1200,items:[item("a",100),item("b",200),coupon(800),coupon(800)]}]).rows();
  assert.deepEqual(revenues(capped),{a:0,b:0,gashapon:1200});
  assert.equal(sum(capped),1200);
  const discounted=["A","B","C"].map(variant=>item("omamori",120,{variant,bundleCount:3,bundlePrice:300}));
  const mixed=app([{total:950,items:[...discounted,item("other",100),coupon(100)]}]).rows();
  assert.deepEqual(revenues(mixed),{omamori:225,other:75,gashapon:650});
  assert.equal(sum(mixed),950);
});

test("fractional allocations conserve unrounded revenue across active orders", () => {
  const rows=app([
    {total:947,items:[item("a",100),item("b",200),coupon(3)]},
    {total:699,items:[...draws(3),item("opener",100),coupon(651)]},
    {status:"inactive",refunded:true,total:999,items:[item("a",999)]}
  ]).rows();
  // Second order's 651 coupon can consume only the eligible opener's 100.
  // Its stored total is intentionally inconsistent: do not charge the raffle for the remainder.
  const rev=revenues(rows);
  assert.equal(rev.a,99);assert.equal(rev.b,198);
  assert.equal(rev.raffle,600);assert.equal(rev.opener,0);assert.equal(rev.gashapon,1300);
  assert.equal(rev["legacy:revenue_adjustment"],-551);
  assert.equal(sum(rows),1646);
  const thirds=app([{total:949,items:[item("a",100),item("b",200),coupon(1)]}]).rows();
  assert.ok(Math.abs(revenues(thirds).a-(100-1/3))<1e-12);
  assert.ok(Math.abs(revenues(thirds).b-(200-2/3))<1e-12);
  assert.equal(sum(thirds),949);
  const repeated=app(Array.from({length:100},()=>({total:941,items:[item("a",101),item("b",203),coupon(13)]}))).rows();
  assert.equal(repeated.some(row=>row.productId==="legacy:revenue_adjustment"),false);
  assert.equal(sum(repeated),94100);
});

test("overlapping legacy coupon scopes never force a discount onto an excluded product", () => {
  const rows=app([{total:1200,items:[item("a",100),item("b",100),coupon(100,["b"]),coupon(100,["b","other"])]}]).rows();
  assert.deepEqual(revenues(rows),{a:0,b:100,gashapon:1200,"legacy:revenue_adjustment":-100});
  assert.equal(sum(rows),1200);
});

test("replacement/refund and changed or deleted catalog products leave active historical snapshots intact", () => {
  const a=app([
    {id:"old",status:"inactive",total:700,items:[...draws(3),item("opener",100)]},
    {id:"new",status:"active",replaces:"old",total:1300,items:[...draws(6),item("opener",100)]},
    {id:"refund",status:"inactive",refunded:true,total:550,items:draws(1,"lucky_bag")}
  ]);
  const before=a.run("JSON.stringify(salesLog)");const expected={raffle:1200,opener:100};
  assert.deepEqual(revenues(a.rows()),expected);
  a.run('products.forEach(p=>{p.price=9999;p.bundlePrice=1});products.splice(0)');
  assert.deepEqual(revenues(a.rows()),expected);
  assert.equal(a.run("JSON.stringify(salesLog)"),before);
  a.run('salesLog[1].status="inactive";salesLog[1].refunded=true');
  assert.deepEqual(a.rows(),[]);
});

test("legacy missing promotion data and authoritative zero totals use an explicit adjustment, not new catalog prices", () => {
  const rows=app([{total:400,items:[item("old",120),item("old",120),item("old",120),item("other",100)]}]).rows();
  assert.deepEqual(revenues(rows),{old:360,other:100,"legacy:revenue_adjustment":-60});
  assert.equal(rows.find(row=>row.productId==="legacy:revenue_adjustment").quantity,0);
  assert.equal(sum(rows),400);
  const zero=app([{total:0,items:[item("old",100)]}]).rows();
  assert.equal(sum(zero),0);
  assert.equal(zero.find(row=>row.productId==="old").quantity,1);
  const noPrices=app([{total:50,items:[{name:"舊商品"}]}]).rows();
  assert.equal(sum(noPrices),50);
  assert.equal(noPrices.find(row=>row.name==="舊商品").quantity,1);
  const noTotal=app([{items:[...draws(3),item("opener",100)]}]).rows();
  assert.deepEqual(revenues(noTotal),{raffle:600,opener:100});
});
