const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname,"..");

function harness() {
  const saved = new Map(), faults = {write:false}, messages = [];
  const context = vm.createContext({console:{log(){}},USE_FIREBASE:false,Blob,moneyText:{},
    alert:message=>messages.push(message),confirm:()=>true,
    localStorage:{getItem:key=>saved.get(key)??null,setItem(key,value){
      if(faults.write) throw Error("Injected write failure");saved.set(key,String(value));
    }}
  });
  for(const file of ["products.js","state.js","bundle.js","render.js","sales.js","luckyBag.js","raffle.js","gashapon.js","productAdmin.js","storage.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),context);
  }
  const run=source=>vm.runInContext(source,context);
  run('renderAll=()=>{};hasWriteLock=true;loadLocalData();globalThis.opener=products.find(p=>p.id==="plush_badge_bottle_opener");globalThis.sticker=products.find(p=>p.id==="epoxy_sticker");globalThis.charm=products.find(p=>p.id==="omamori")');
  return {run,saved,faults,messages};
}

// Non-default coupon scopes are valid receipt/prize snapshots. No live data or pricing configuration is changed.
test("RT1 different exclusion keys cannot spend the same 100 of eligible merchandise twice",()=>{
  const h=harness();
  h.run(`addToCurrentSale(opener,"無款式");addToCurrentSale(sticker,"無款式");startGashapon();
    addGashaponResult({id:"one",name:"券一",rewardType:"coupon",maxValue:100,excluded:["epoxy_sticker"]});
    addGashaponResult({id:"two",name:"券二",rewardType:"coupon",maxValue:100,excluded:["epoxy_sticker","not_in_order"]});
    finishGashapon();checkoutCurrentSale()`);
  const actual=JSON.parse(h.run('JSON.stringify({money,total:salesLog[0].total,stats:getProductStatisticsRows()})'));
  console.log("RT1 evidence",JSON.stringify(actual));
  // Two draws 1200 + opener 100 + excluded sticker 60 - eligible cap 100 = 1260.
  assert.equal(actual.total,1260);
  assert.equal(actual.money,1260);
  assert.equal(actual.stats.find(row=>row.productId==="epoxy_sticker").revenue,60);
  assert.equal(actual.stats.find(row=>row.productId==="plush_badge_bottle_opener").revenue,0);
  assert.equal(actual.stats.some(row=>row.productId==="legacy:revenue_adjustment"),false);
});

test("RT2 a broad coupon followed by a restricted coupon needs no historical adjustment on a new sale",()=>{
  const h=harness();
  h.run(`globalThis.other=createCustomProduct("B",100);products.push(other);
    addToCurrentSale(opener,"無款式");addToCurrentSale(other,"無款式");startGashapon();
    addGashaponResult({id:"broad",name:"一般券",rewardType:"coupon",maxValue:150,excluded:[]});
    addGashaponResult({id:"narrow",name:"限品券",rewardType:"coupon",maxValue:50,excluded:[other.id]});
    finishGashapon();checkoutCurrentSale()`);
  const actual=JSON.parse(h.run('JSON.stringify({money,total:salesLog[0].total,stats:getProductStatisticsRows()})'));
  console.log("RT2 evidence",JSON.stringify(actual));
  // Allocate the restricted 50 to opener, broad 150 to opener 50 + B 100. All merchandise is covered.
  assert.equal(actual.total,1200);
  assert.equal(actual.stats.find(row=>row.productId==="plush_badge_bottle_opener").revenue,0);
  assert.equal(actual.stats.find(row=>row.productId==="gashapon").revenue,1200);
  assert.equal(actual.stats.find(row=>row.name==="B").revenue,0);
  assert.equal(actual.stats.some(row=>row.productId==="legacy:revenue_adjustment"),false);
});

test("RT3 shared stock across retail, raffle, lucky bag and a set is atomic at 3/4 boundary",()=>{
  const h=harness();
  h.run(`charm.variants.forEach(v=>{v.stock=1});charm.variants[1].stock=3;
    commitLocalChange(()=>saveData());
    addToCurrentSale(charm,"伊布御守");
    startRaffle();addToCurrentSale(charm,"伊布御守");finishRaffle();
    startLuckyBag();addToCurrentSale(charm,"伊布御守");finishLuckyBag();
    addToCurrentSale(charm,charm.specialBundles[0]);`);
  const before=h.saved.get("creatorPOS_state");
  h.run("checkoutCurrentSale();checkoutCurrentSale()");
  assert.equal(h.saved.get("creatorPOS_state"),before);
  assert.equal(h.run("salesLog.length"),0);
  h.run("charm.variants[1].stock=4;commitLocalChange(()=>saveData())");
  const durable=h.saved.get("creatorPOS_state"),memory=h.run("JSON.stringify(captureRuntime())");
  h.faults.write=true;h.run("checkoutCurrentSale();checkoutCurrentSale()");
  assert.equal(h.saved.get("creatorPOS_state"),durable);
  assert.equal(h.run("JSON.stringify(captureRuntime())"),memory);
  h.faults.write=false;h.run("checkoutCurrentSale();checkoutCurrentSale();loadLocalData()");
  assert.equal(h.run("money"),1820);
  assert.equal(h.run("salesLog.length"),1);
  assert.equal(h.run("charm.variants[1].stock"),0);
  h.run("editSale(0,salesLog[0]);currentSale.pop();checkoutCurrentSale();loadLocalData()");
  assert.equal(h.run("money"),920);
  assert.equal(h.run("charm.variants[1].stock"),1);
  h.run("editSale(1,salesLog[1]);currentSale=[];checkoutCurrentSale();loadLocalData()");
  assert.equal(h.run("money"),0);
  assert.equal(h.run("charm.variants[1].stock"),4);
  assert.equal(h.run("getProductStatisticsRows().length"),0);
});

test("RT4 clear/cancel during raffle editing cannot replace the wrong cart index or mutate history",()=>{
  const h=harness();
  h.run(`startRaffle();addToCurrentSale(sticker,"無款式");finishRaffle();checkoutCurrentSale();
    editSale(0,salesLog[0]);startRaffle(0);addToCurrentSale(opener,"無款式")`);
  const historical=h.run("JSON.stringify(salesLog)");
  h.run("clearCurrentSale();finishRaffle();startLuckyBag();cancelLuckyBag();startGashapon();cancelGashapon()");
  assert.equal(h.run("JSON.stringify(salesLog)"),historical);
  assert.equal(h.run("currentSale.length"),0);
  assert.equal(h.run("raffleMode||luckyBagMode||gashaponMode"),false);
  assert.equal(h.run("raffleEditingIndex"),null);
});

test("RT5 invalid coupon checkout is rejected before stock/history/money changes",()=>{
  const h=harness();
  h.run(`addToCurrentSale(opener,"無款式");startGashapon();
    addGashaponResult({id:"invalid",name:"無效券",rewardType:"coupon",maxValue:100,excluded:"invalid"});
    finishGashapon()`);
  const before=h.saved.get("creatorPOS_state"), stock=h.run("opener.stock");
  h.run("checkoutCurrentSale()");
  assert.equal(h.run("salesLog.length"),0);
  assert.equal(h.run("money"),0);
  assert.equal(h.run("opener.stock"),stock);
  assert.equal(h.saved.get("creatorPOS_state"),before);
  assert.ok(h.messages.some(message=>message.includes("抵用券資料無效")));
});

test("RT6 old undercharged receipt stays immutable through stats, edit and full refund",()=>{
  const h=harness();
  h.run(`addToCurrentSale(opener,"無款式");addToCurrentSale(sticker,"無款式");startGashapon();
    addGashaponResult({id:"one",name:"券一",rewardType:"coupon",maxValue:100,excluded:["epoxy_sticker"]});
    addGashaponResult({id:"two",name:"券二",rewardType:"coupon",maxValue:100,excluded:["epoxy_sticker","outside"]});
    finishGashapon();checkoutCurrentSale();
    salesLog[0].total=1200;money=1200;commitLocalChange(()=>saveData());loadLocalData()`);
  const history=h.run("JSON.stringify(salesLog)"),durable=h.saved.get("creatorPOS_state");
  assert.equal(h.run('getProductStatisticsRows().find(r=>r.productId==="legacy:revenue_adjustment").revenue'),-60);
  assert.equal(h.run("JSON.stringify(salesLog)"),history);
  assert.equal(h.saved.get("creatorPOS_state"),durable);
  h.run("editSale(0,salesLog[0]);checkoutCurrentSale()");
  assert.equal(h.run("money"),1260);
  assert.equal(h.run("salesLog[0].total"),1200);
  assert.equal(h.run('getProductStatisticsRows().some(r=>r.productId==="legacy:revenue_adjustment")'),false);
  h.run("editSale(1,salesLog[1]);currentSale=[];checkoutCurrentSale();loadLocalData()");
  assert.equal(h.run("money"),0);
  assert.equal(h.run("getProductStatisticsRows().length"),0);
  assert.equal(h.run("opener.stock"),100);
  assert.equal(h.run("sticker.stock"),100);
});
