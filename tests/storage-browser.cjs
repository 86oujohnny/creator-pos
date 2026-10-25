const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const root = path.resolve(__dirname, "..");
const legacy = {
  creatorPOS_money: "120",
  creatorPOS_salesLog: JSON.stringify([{ id: "old", status: "active", total: 120, items: [
    { productId: "acrylic_stand", name: "壓克力飯友", variant: "好運守", singlePrice: 120, bundleCount: 3, bundlePrice: 300 }
  ] }]),
  creatorPOS_stock: '{"acrylic_stand":{"好運守":37}}',
  creatorPOS_productPrices: '{"omamori":99,"fox_card_holder":250}'
};
const server = http.createServer((request, response) => {
  const name = new URL(request.url, "http://localhost").pathname.replace(/^\/creator-pos\//, "") || "index.html";
  const file = path.resolve(root, name);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end(); return;
  }
  response.setHeader("Content-Type", ({ ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".jpg": "image/jpeg" })[path.extname(file)] || "text/plain");
  response.end(fs.readFileSync(file));
});

(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/creator-pos/`;
  const browser = await chromium.launch({ headless: true });
  try {
    async function context(seed = {}, initialFailure = null, unsupported = false) {
      const c = await browser.newContext();
      await c.addInitScript(({ seed, initialFailure, unsupported }) => {
        if (location.protocol !== "http:") return;
        const original = Storage.prototype.setItem;
        if (localStorage.getItem("__test_seeded") === null) {
          for (const [key, value] of Object.entries(seed)) original.call(localStorage, key, value);
          original.call(localStorage, "__test_seeded", "1");
        }
        window.__storageFault = { writes: initialFailure };
        Storage.prototype.setItem = function(key, value) {
          const mode = window.__storageFault.writes;
          if (key === "creatorPOS_state" && mode &&
              (mode === "always" || !localStorage.getItem("__test_failure_used"))) {
            original.call(localStorage, "__test_failure_used", "1");
            throw new DOMException("Injected storage failure", "QuotaExceededError");
          }
          return original.call(this, key, value);
        };
        if (unsupported) Object.defineProperty(navigator, "locks", { value: undefined });
      }, { seed, initialFailure, unsupported });
      c.on("page", page => {
        page.on("dialog", dialog => dialog.accept());
        page.on("pageerror", error => {
          console.error("Unexpected browser error:", error.message);
          process.exitCode = 1;
        });
      });
      return c;
    }
    const ready = page => page.waitForFunction(() => canWriteData());
    const state = page => page.evaluate(() => JSON.parse(localStorage.getItem("creatorPOS_state")));
    const card = page => page.locator("#productArea > div").filter({ has: page.getByRole("heading", { name: "御守", exact: true }) });
    const suite = page => card(page).getByRole("button", { name: "伊布家族完整一套 900元", exact: true });

    for (const mode of ["once", "always"]) {
      const c = await context(legacy, mode), page = await c.newPage(); await page.goto(url);
      await page.waitForFunction(() => storageError.includes("載入失敗"));
      assert.equal(await page.locator("#posControls").evaluate(e => e.disabled), true);
      assert.equal(await page.locator("#checkoutButton").isDisabled(), true);
      assert.equal(await page.evaluate(() => localStorage.getItem("creatorPOS_state")), null);
      await page.reload();
      if (mode === "once") {
        await ready(page); assert.equal((await state(page)).money, 120);
        assert.equal((await state(page)).stock.omamori["好運守"], 37);
      } else await page.waitForFunction(() => storageError.includes("載入失敗"));
      for (const [key, value] of Object.entries(legacy)) assert.equal(await page.evaluate(key => localStorage.getItem(key), key), value);
      await c.close();
    }
    console.log("PASS initialization write failure, reload and safe recovery (once/persistent)");

    {
      const c = await context(), page = await c.newPage(); await page.goto(url); await ready(page);
      const old = await state(page);
      await suite(page).click(); await page.evaluate(() => { window.__storageFault.writes = "always"; });
      await page.locator("#checkoutButton").click(); await page.locator("#checkoutButton").click();
      assert.deepEqual(await state(page), old);
      assert.deepEqual(await page.evaluate(() => [money, salesLog.length, currentSale.length, products.find(p => p.id === "omamori").variants[1].stock]), [0, 0, 1, 100]);
      assert.ok((await page.locator("#storageStatus").textContent()).includes("儲存失敗"));
      await page.evaluate(() => { window.__storageFault.writes = null; });
      await page.locator("#checkoutButton").dblclick();
      assert.equal((await state(page)).money, 900); assert.equal((await state(page)).salesLog.length, 1);
      await page.reload(); await ready(page); assert.equal((await state(page)).stock.omamori["伊布御守"], 99);
      const failedImages = await page.locator("#productArea img").evaluateAll(async images => {
        const failed = [];
        for (const image of images) {
          try { await image.decode(); } catch {
            failed.push({ src: image.src, complete: image.complete, width: image.naturalWidth });
          }
        }
        return failed;
      });
      assert.deepEqual(failedImages, []);
      assert.equal(await page.locator("#productArea img").count(), 61);
      assert.equal(await page.locator("#productManagerList input:visible").count(), 0);
      await c.close();
    }
    console.log("PASS checkout persistent failure/retry/double click/reload; images and hidden price controls");

    {
      const c = await context(), a = await c.newPage(), b = await c.newPage();
      await Promise.all([a.goto(url), b.goto(url)]);
      await Promise.all([a.waitForFunction(() => !lockRequestPending), b.waitForFunction(() => !lockRequestPending)]);
      const ownership = await Promise.all([a.evaluate(() => canWriteData()), b.evaluate(() => canWriteData())]);
      assert.equal(ownership.filter(Boolean).length, 1);
      const owner = ownership[0] ? a : b, blocked = ownership[0] ? b : a;
      assert.equal(await blocked.locator("#posControls").evaluate(e => e.disabled), true);
      assert.equal(await blocked.locator("#checkoutButton").isDisabled(), true);
      await owner.evaluate(() => commitLocalChange(() => { products.find(p => p.id === "omamori").variants[1].stock = 1; saveData(); }));
      await card(owner).getByRole("button", { name: /^伊布御守/ }).click(); await owner.locator("#checkoutButton").click();
      const committed = await state(owner);
      await blocked.evaluate(() => {
        checkoutCurrentSale(); undoLastSale(); resetAllData();
        updateProductPrice(products.find(p => p.id === "omamori"), { value: "1" });
        deleteCustomProduct(products[0]); addCustomProductFromForm({ preventDefault() {} });
        try { saveData(); } catch {}
        try { saveProductAdminData(); } catch {}
        dispatchEvent(new Event("beforeunload"));
      });
      assert.deepEqual(await state(blocked), committed);
      await owner.locator("#releaseStorageButton").click();
      await blocked.waitForFunction(async () => !(await navigator.locks.query()).held.length);
      await blocked.locator("#retryStorageButton").click(); await ready(blocked);
      assert.equal(await blocked.locator("#money").textContent(), "120");
      assert.equal(await blocked.evaluate(() => products.find(p => p.id === "omamori").variants[1].stock), 0);
      await card(blocked).getByRole("button", { name: /^伊布御守/ }).click(); await blocked.locator("#checkoutButton").click();
      assert.deepEqual(await state(blocked), committed);
      await owner.locator("#retryStorageButton").click();
      await owner.waitForFunction(() => !lockRequestPending); assert.equal(await owner.evaluate(() => canWriteData()), false);
      await blocked.close(); await owner.locator("#retryStorageButton").click(); await ready(owner);
      await owner.reload(); await ready(owner);
      assert.deepEqual(await state(owner), committed);
      await owner.evaluate(() => dispatchEvent(new Event("pagehide")));
      await owner.waitForFunction(async () => !(await navigator.locks.query()).held.length);
      await owner.evaluate(() => dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
      await ready(owner);
      assert.equal(await owner.evaluate(() => currentSale.length), 0);
      await c.close();
    }
    console.log("PASS real Web Locks race, blocked write entry points, handoff, stale reload, close, refresh and persisted pageshow");

    {
      const c = await context(legacy), page = await c.newPage(); await page.goto(url); await ready(page);
      const original = (await state(page)).salesLog[0];
      await page.locator("#salesLogList button").click();
      await card(page).getByRole("button", { name: /^伊布御守/ }).click();
      await card(page).getByRole("button", { name: /^火伊布御守/ }).click();
      assert.equal(await page.locator("#currentSaleTotal").textContent(), "300");
      assert.deepEqual((await state(page)).salesLog[0], original);
      await page.locator("#clearCurrentSaleButton").click(); assert.deepEqual((await state(page)).salesLog[0], original);
      await page.locator("#salesLogList button").click();
      await card(page).getByRole("button", { name: /^伊布御守/ }).click();
      await card(page).getByRole("button", { name: /^火伊布御守/ }).click();
      await page.locator("#checkoutButton").click(); await page.reload(); await ready(page);
      assert.equal((await state(page)).money, 300); assert.equal((await state(page)).stock.omamori["好運守"], 37);
      await c.close();
    }
    console.log("PASS legacy charm edit/cancel/history protection, 300 checkout and correct stock");

    {
      const c = await context(), page = await c.newPage();
      await page.goto(url); await ready(page);
      const productCard = name => page.locator("#productArea > div").filter({ has: page.getByRole("heading", { name, exact: true }) });
      const sticker = () => productCard("滴膠貼紙").getByRole("button");
      const opener = () => productCard("毛絨徽章開瓶器").getByRole("button");
      await page.locator("#exportCsvButton").click();
      assert.match(await page.locator("#csvExportStatus").textContent(), /沒有銷售紀錄/);
      for (let i = 0; i < 3; i++) {
        await page.locator("#startRaffleButton").click();
        await sticker().click();
        await page.locator("#finishRaffleButton").click();
        assert.equal(await page.locator("#currentSaleTotal").textContent(), String([250, 500, 600][i]));
      }
      await page.getByRole("button", { name: "編輯摸彩", exact: true }).first().click();
      await page.locator("#raffleContentsList button").click(); await opener().click();
      await page.locator("#finishRaffleButton").click();
      await page.getByRole("button", { name: "編輯摸彩", exact: true }).first().click();
      await sticker().click(); await page.locator("#cancelRaffleButton").click();
      assert.equal(await page.locator("#currentSaleTotal").textContent(), "600");
      await page.evaluate(() => { window.__storageFault.writes = "always"; });
      await page.locator("#checkoutButton").click();
      assert.equal((await state(page)).money, 0);
      assert.equal(await page.locator("#currentSaleList > li").count(), 3);
      await page.evaluate(() => { window.__storageFault.writes = null; });
      await page.locator("#checkoutButton").click();
      await page.reload(); await ready(page);
      const committed = await state(page);
      assert.equal(committed.money, 600);
      assert.equal(committed.stock.epoxy_sticker, 98);
      assert.equal(committed.stock.plush_badge_bottle_opener, 99);
      await page.evaluate(() => {
        const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
        window.__csvUrls = { created: [], revoked: [] };
        URL.createObjectURL = blob => { const url = create(blob); window.__csvUrls.created.push(url); return url; };
        URL.revokeObjectURL = url => { window.__csvUrls.revoked.push(url); revoke(url); };
      });
      const downloaded = page.waitForEvent("download");
      await page.locator("#exportCsvButton").click();
      const download = await downloaded;
      assert.equal(download.suggestedFilename(), "sales_log.csv");
      await download.saveAs("/tmp/creator-pos-review.csv");
      const content = fs.readFileSync(await download.path(), "utf8");
      assert.ok(content.startsWith("\uFEFF"));
      assert.match(content, /"摸彩內容"/);
      assert.match(content, /"毛絨徽章開瓶器"/);
      assert.match(content, /"600"/);
      assert.equal((content.match(/"訂單合計"/g) || []).length, 1);
      assert.equal((content.match(/"600"/g) || []).length, 2);
      assert.deepEqual(await page.evaluate(() => window.__csvUrls.revoked), []);
      assert.equal(await page.locator("#csvDownloadLink").getAttribute("target"), null);
      const repeated = page.waitForEvent("download");
      await page.locator("#csvDownloadLink").click(); await repeated;
      const replaced = page.waitForEvent("download");
      await page.locator("#exportCsvButton").click();await replaced;
      assert.equal(await page.evaluate(() => window.__csvUrls.created.length), 2);
      assert.equal(await page.evaluate(() => window.__csvUrls.revoked.length), 1);
      assert.equal(await page.evaluate(() => window.__csvUrls.revoked[0] === window.__csvUrls.created[0]), true);
      assert.equal(await page.locator("#csvDownloadLink").getAttribute("href"), await page.evaluate(() => window.__csvUrls.created[1]));
      await page.evaluate(() => { URL.createObjectURL = () => { throw Error("test download failure"); }; });
      await page.locator("#exportCsvButton").click();
      assert.match(await page.locator("#csvExportStatus").textContent(), /匯出失敗.*test download failure/);
      assert.deepEqual(await state(page), committed);
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.screenshot({ path: "/tmp/creator-pos-raffle-desktop.png" });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: "/tmp/creator-pos-raffle-mobile.png" });
      await c.close();
    }
    console.log("PASS raffle UI 250/500/600, edit/cancel, atomic retry/reload, exact stock, real CSV download/retry/error and responsive layout");

    {
      const c = await context(), page = await c.newPage();await page.goto(url);await ready(page);
      const sticker = () => page.locator("#productArea > div").filter({ has: page.getByRole("heading", { name: "滴膠貼紙", exact: true }) }).getByRole("button");
      await page.locator("#startRaffleButton").click();await sticker().click();await page.locator("#finishRaffleButton").click();
      await page.locator("#checkoutButton").click();
      await page.locator("#salesLogList button").click();
      await page.getByRole("button", { name: "編輯摸彩", exact: true }).click();
      await sticker().click();await page.locator("#finishRaffleButton").click();
      await page.locator("#checkoutButton").click();
      assert.equal((await state(page)).stock.epoxy_sticker, 98);
      await page.locator("#salesLogList button").click();
      await page.locator("#currentSaleList").getByRole("button", { name: "刪除", exact: true }).click();
      await page.locator("#checkoutButton").click();await page.reload();await ready(page);
      const final = await state(page);assert.equal(final.money, 0);assert.equal(final.stock.epoxy_sticker, 100);
      const exported = page.waitForEvent("download");await page.locator("#exportCsvButton").click();
      const download = await exported;await download.saveAs("/tmp/creator-pos-review-refund.csv");
      const text = fs.readFileSync(await download.path(), "utf8");
      assert.match(text, /"已替換"/);assert.match(text, /"已退貨"/);
      assert.equal((text.match(/"訂單合計"/g) || []).length, 2);
      assert.deepEqual(await state(page), final);
      await c.close();
    }
    console.log("PASS paid raffle edit, full refund, stock restoration and actual refund-only audit CSV download");

    {
      const c = await context(), page = await c.newPage();await page.goto(url);await ready(page);
      const productCard = name => page.locator("#productArea > div").filter({ has: page.getByRole("heading", { name, exact: true }) });
      for (let i=0;i<3;i++) {
        await page.locator("#startRaffleButton").click();
        await productCard("滴膠貼紙").getByRole("button").click();
        await page.locator("#finishRaffleButton").click();
      }
      await productCard("毛絨徽章開瓶器").getByRole("button").click();
      assert.equal(await page.locator("#currentSaleTotal").textContent(),"700");
      await page.locator("#checkoutButton").click();await page.reload();await ready(page);
      assert.deepEqual(await page.evaluate(()=>Object.fromEntries(getProductStatisticsRows().map(row=>[row.productId,row.revenue]))),{raffle:600,plush_badge_bottle_opener:100});
      await page.locator("#productStatisticsArea").getByText("摸彩：600 元，3 個",{exact:true}).waitFor();
      await page.locator("#productStatisticsArea").getByText("毛絨徽章開瓶器：100 元，1 個",{exact:true}).waitFor();
      await page.locator("#productStatisticsArea").screenshot({path:"/tmp/creator-pos-statistics.png"});
      const saved = await state(page);
      await page.evaluate(()=>{products.forEach(p=>{p.price=9999;p.bundlePrice=1});renderProductStatistics()});
      assert.equal(await page.evaluate(()=>getProductStatisticsRows().reduce((sum,row)=>sum+row.revenue,0)),700);
      assert.deepEqual(await state(page),saved);
      await page.locator("#salesLogList button").click();
      await page.locator("#currentSaleList").getByRole("button",{name:"刪除",exact:true}).first().click();
      await page.locator("#checkoutButton").click();
      assert.deepEqual(await page.evaluate(()=>Object.fromEntries(getProductStatisticsRows().map(row=>[row.productId,row.revenue]))),{raffle:500,plush_badge_bottle_opener:100});
      await page.locator("#salesLogList button").click();
      while (await page.locator("#currentSaleList > li").count()) {
        await page.locator("#currentSaleList").getByRole("button",{name:"刪除",exact:true}).first().click();
      }
      await page.locator("#checkoutButton").click();await page.reload();await ready(page);
      assert.equal((await state(page)).money,0);
      assert.deepEqual(await page.evaluate(()=>getProductStatisticsRows()),[]);
      await c.close();
    }
    console.log("PASS statistics UI: raffle 600/opener 100, reload, catalog changes, edited 500/100 and refunded zero");

    for (const seed of [
      { ...legacy, creatorPOS_productPricesMigrationVersion: "2" },
      { ...legacy, creatorPOS_salesLog: "{" }
    ]) {
      const c = await context(seed), page = await c.newPage(); await page.goto(url);
      await page.waitForFunction(() => storageError.includes("載入失敗"));
      assert.equal(await page.evaluate(() => localStorage.getItem("creatorPOS_state")), null); await c.close();
    }
    {
      const c = await context({}, null, true), page = await c.newPage(); await page.goto(url);
      await page.waitForFunction(() => storageError.includes("不支援"));
      assert.equal(await page.locator("#posControls").evaluate(e => e.disabled), true);
      assert.equal(await page.evaluate(() => localStorage.getItem("creatorPOS_state")), null); await c.close();
    }
    console.log("PASS future/corrupt data and unsupported Web Locks fail closed");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
