const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {execFileSync}=require("node:child_process");
const {chromium,webkit}=require("playwright");
const root=path.resolve(__dirname,"..");
let oldCache=false;
const cachedSource=execFileSync("git",["show","9846a48861168da6e9341fa8a5361bfb719215b0:storage.js"],{cwd:root});
const cachedHtml=execFileSync("git",["show","9846a48861168da6e9341fa8a5361bfb719215b0:index.html"],{cwd:root});
const cacheRequests=[];
const server=http.createServer((req,res)=>{
  const name=new URL(req.url,"http://localhost").pathname.replace(/^\/creator-pos\//,"")||"index.html";
  const file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.setHeader("Content-Type",({".html":"text/html",".js":"text/javascript",".css":"text/css",".jpg":"image/jpeg"})[path.extname(file)]||"text/plain");
  res.setHeader("Cache-Control",name==="storage.js"?"public, max-age=3600":"no-store");
  if(name==="storage.js") cacheRequests.push(oldCache?"old":"new");
  res.end(oldCache&&name==="storage.js"?cachedSource:oldCache&&name==="index.html"?cachedHtml:fs.readFileSync(file));
});
const results=[];
async function scenario(browser,url,name,body){
  const context=await browser.newContext({acceptDownloads:true});
  context.on("page",page=>page.on("dialog",dialog=>dialog.accept()));
  try{await body(context,url);results.push({name,result:"PASS"});console.log("PASS",name);}
  catch(error){results.push({name,result:"FAIL",error:error.message});console.error("FAIL",name,error.message);}
  finally{await context.close();oldCache=false;}
}
async function ready(context,url){const page=await context.newPage();await page.goto(url);await page.waitForFunction(()=>canWriteData());return page;}
async function seedSale(page){await page.evaluate(()=>{addToCurrentSale(products.find(p=>p.id==="epoxy_sticker"),"無款式");checkoutCurrentSale();});}
async function download(page,action){const pending=page.waitForEvent("download",{timeout:10000});await action();const d=await pending;assert.equal(await d.failure(),null);return d;}
function parseCsv(file){
  return JSON.parse(execFileSync("python3",["-c","import csv,json,sys;rows=list(csv.DictReader(open(sys.argv[1],encoding='utf-8-sig',newline='')));print(json.dumps(rows,ensure_ascii=False))",file],{encoding:"utf8",maxBuffer:30*1024*1024}));
}

(async()=>{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const url=`http://127.0.0.1:${server.address().port}/creator-pos/`;
  const browser=await chromium.launch();
  console.log("ENV",JSON.stringify({browser:browser.version(),origin:url,webkitAvailable:fs.existsSync(webkit.executablePath())}));
  try{
    await scenario(browser,url,"B1 native rapid double-click downloads two real files",async(c,u)=>{
      const p=await ready(c,u);await seedSale(p);const downloads=[];p.on("download",d=>downloads.push(d));
      await p.locator("#exportCsvButton").dblclick();
      await p.waitForFunction(()=>document.querySelector("#csvDownloadLink").href.startsWith("blob:"));
      const deadline=Date.now()+10000;while(downloads.length<2&&Date.now()<deadline) await new Promise(r=>setTimeout(r,25));
      const evidence=[];for(const d of downloads){const failure=await d.failure();evidence.push({failure,bytes:failure?0:fs.statSync(await d.path()).size});}
      console.log("B1 evidence",JSON.stringify(evidence));assert.equal(downloads.length,2);assert.ok(evidence.every(e=>e.failure===null&&e.bytes>0));
      assert.equal(await p.locator("#csvDownloadLink").isVisible(),false);
    });

    await scenario(browser,url,"B2 hidden anchor, 5000 Unicode/quoted orders and overlapping exports",async(c,u)=>{
      const p=await ready(c,u);
      await p.evaluate(()=>{
        const name='中文,"引號"\n第二行';
        const custom=createCustomProduct(name,60);products.push(custom);
        salesLog=Array.from({length:5000},(_,i)=>({id:"bulk_"+i,time:"test",status:i%20===0?"inactive":"active",refunded:i%20===0,total:60,
          items:[{productId:custom.id,name,variant:"無款式",singlePrice:60}]}));money=285000;
      });
      const before=await p.evaluate(()=>localStorage.getItem("creatorPOS_state"));
      const downloads=[];p.on("download",d=>downloads.push(d));
      // A native click starts the first download; issue the next native click before awaiting file completion.
      await p.locator("#exportCsvButton").click();await p.locator("#exportCsvButton").click();
      const deadline=Date.now()+15000;while(downloads.length<2&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));
      assert.equal(downloads.length,2);
      for(let i=0;i<downloads.length;i++){
        assert.equal(await downloads[i].failure(),null);const file=`/tmp/creator-pos-redteam-bulk-${i}.csv`;await downloads[i].saveAs(file);
        const rows=parseCsv(file);assert.equal(rows.length,10000);
        assert.equal(rows.filter(r=>r["類型"]==="訂單合計").length,5000);
        assert.equal(rows.reduce((sum,r)=>sum+Number(r["該筆總額"]||0),0),285000);
        assert.equal(rows.reduce((sum,r)=>sum+Number(r["銷售數量"]||0),0),4750);
        assert.equal(rows.filter(r=>r["商品"]==='中文,"引號"\n第二行').length,5000);
      }
      assert.equal(await p.evaluate(()=>localStorage.getItem("creatorPOS_state")),before);
    });

    await scenario(browser,url,"B3 empty/refund-only exports and URL failure remain retryable",async(c,u)=>{
      const p=await ready(c,u);await p.locator("#exportCsvButton").click();
      assert.match(await p.locator("#csvExportStatus").textContent(),/沒有銷售紀錄/);
      await seedSale(p);await p.locator("#salesLogList button").click();
      await p.locator("#currentSaleList").getByRole("button",{name:"刪除",exact:true}).click();
      await p.locator("#checkoutButton").click();
      const d=await download(p,()=>p.locator("#exportCsvButton").click());
      const file="/tmp/creator-pos-redteam-refund.csv";await d.saveAs(file);const rows=parseCsv(file);
      assert.equal(rows.reduce((sum,r)=>sum+Number(r["該筆總額"]||0),0),0);assert.ok(rows.some(r=>r["訂單狀態"]==="已退貨"));
      await p.evaluate(()=>{window.__originalCreate=URL.createObjectURL;URL.createObjectURL=()=>{throw Error("Injected URL creation failure")};});
      await p.locator("#exportCsvButton").click();assert.match(await p.locator("#csvExportStatus").textContent(),/Injected URL creation failure/);
      await p.evaluate(()=>{URL.createObjectURL=window.__originalCreate;});
      await download(p,()=>p.locator("#exportCsvButton").click());
    });

    await scenario(browser,url,"B4 lucky bag move, form boundaries, mode cancellation and mobile hit targets",async(c,u)=>{
      const p=await ready(c,u);
      assert.deepEqual(await p.evaluate(()=>{const ids=[...document.querySelectorAll("[id]")].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);}),[]);
      for(const viewport of [{width:1024,height:768},{width:390,height:844}]){
        await p.setViewportSize(viewport);
        assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        for(const id of ["checkoutButton","startLuckyBagButton"]){
          await p.locator("#"+id).scrollIntoViewIfNeeded();
          assert.equal(await p.locator("#"+id).evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))&&!e.closest("form")&&e.closest("fieldset").id==="posControls";}),true);
        }
      }
      assert.equal(await p.locator("#checkoutButton").evaluate(e=>e.nextElementSibling.textContent),"福袋模式：關閉｜一袋 550 元，三袋 1,500 元");
      await p.locator("#startLuckyBagButton").click();
      await p.evaluate(()=>{startRaffle();startGashapon();});
      assert.deepEqual(await p.evaluate(()=>[luckyBagMode,raffleMode,gashaponMode]),[true,false,false]);
      await p.locator("#cancelLuckyBagButton").click();await p.locator("#startRaffleButton").click();
      await p.locator("#clearCurrentSaleButton").click();
      assert.deepEqual(await p.evaluate(()=>[luckyBagMode,raffleMode,gashaponMode,raffleEditingIndex]),[false,false,false,null]);
    });

    await scenario(browser,url,"B5 cached pre-hide storage.js must not restore the removed success message",async(c,u)=>{
      const initialRequests=cacheRequests.length;oldCache=true;
      const first=await ready(c,u);await seedSale(first);await first.close();
      oldCache=false;
      const second=await ready(c,u);
      await download(second,()=>second.locator("#exportCsvButton").click());
      const evidence={requests:cacheRequests.slice(initialRequests),message:await second.locator("#csvExportStatus").textContent(),visible:await second.locator("#csvExportStatus").isVisible()};
      console.log("B5 evidence",JSON.stringify(evidence));
      assert.equal(evidence.visible,false);
      assert.equal(evidence.message,"");
      assert.deepEqual(evidence.requests,["old","new"]);
      assert.equal(await second.locator("#csvDownloadLink").isVisible(),false);
      assert.equal(await second.locator("#csvDownloadLink").textContent(),"");
    });

    await scenario(browser,url,"B6 locked raffle draft cannot overwrite a new writer and is discarded on handoff",async(c,u)=>{
      const owner=await ready(c,u);
      await owner.evaluate(()=>{startRaffle();addToCurrentSale(products.find(p=>p.id==="epoxy_sticker"),"無款式");});
      const next=await c.newPage();await next.goto(u);await next.waitForFunction(()=>!lockRequestPending);
      assert.equal(await next.locator("#posControls").evaluate(e=>e.disabled),true);
      assert.equal(await next.locator("#checkoutButton").isDisabled(),true);
      await owner.locator("#releaseStorageButton").click();
      await owner.waitForFunction(async()=>!(await navigator.locks.query()).held.length);
      await next.locator("#retryStorageButton").click();await next.waitForFunction(()=>canWriteData());
      await next.evaluate(()=>{addToCurrentSale(products.find(p=>p.id==="plush_badge_bottle_opener"),"無款式");checkoutCurrentSale();});
      const before=await next.evaluate(()=>localStorage.getItem("creatorPOS_state"));
      await owner.evaluate(()=>{finishRaffle();checkoutCurrentSale();try{saveData()}catch{}});
      assert.equal(await owner.evaluate(()=>localStorage.getItem("creatorPOS_state")),before);
      await next.close();await owner.locator("#retryStorageButton").click();await owner.waitForFunction(()=>canWriteData());
      assert.deepEqual(await owner.evaluate(()=>[money,raffleMode,raffleContents.length,raffleEditingIndex,currentSale.length]),[100,false,0,null,0]);
      await owner.locator("#checkoutButton").click();
      assert.equal(await owner.evaluate(()=>localStorage.getItem("creatorPOS_state")),before);
    });

    console.log("WEBKIT",fs.existsSync(webkit.executablePath())?"available; separate run required":"SKIP: executable missing; no Safari claim");
  }finally{await browser.close();}
  fs.writeFileSync("/tmp/creator-pos-redteam-browser-results.json",JSON.stringify(results,null,2));
  if(results.some(r=>r.result==="FAIL")) process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
