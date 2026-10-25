const POS_STATE_KEY = "creatorPOS_state";
const POS_SCHEMA_VERSION = 1;
const defaultProducts = JSON.parse(JSON.stringify(products));
let hasWriteLock = false;
let storageInitialized = false;
let storageError = "";
let committedRaw = null;
let loadedPrices = {};
let loadedStock = {};
let priceMigrationVersion = 0;
let stateRevision = 0;
let stagingTransaction = false;
let transactionNeedsSave = false;

function canWriteData() {
  return hasWriteLock && storageInitialized;
}

function requireWritable() {
  if (!canWriteData()) throw new Error("資料尚未載入或此分頁沒有寫入權，請重試取得寫入權。");
}

function parseLocalJson(key, fallback) {
  const value = localStorage.getItem(key);
  return value === null ? fallback : JSON.parse(value);
}

function readMigrationVersion(value) {
  const version = value === null || value === undefined || value === "" ? 0 : Number(value);
  if (!Number.isSafeInteger(version) || version < 0) return 0;
  if (version > PRODUCT_PRICES_MIGRATION_VERSION) throw new Error("價格資料版本較新，請更新網站後重試。");
  return version;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateStoredState(data) {
  if (!isRecord(data) || data.schemaVersion !== POS_SCHEMA_VERSION ||
      !Number.isSafeInteger(data.revision) || data.revision < 0 ||
      !Number.isFinite(data.money) || data.money < 0 ||
      !Array.isArray(data.salesLog) || !Array.isArray(data.customProducts) ||
      !isRecord(data.prices) || !isRecord(data.stock)) {
    throw new Error("儲存資料格式或版本無法讀取，原資料已保留。");
  }
  const validPrice = value => Number.isFinite(Number(value)) && Number(value) > 0;
  const validStock = value => value === null || (Number.isSafeInteger(value) && value >= 0);
  const validItem = item => isRecord(item) && typeof item.productId === "string" &&
    Number.isFinite(item.singlePrice) && item.singlePrice >= 0 &&
    (!item.contents || (Array.isArray(item.contents) && item.contents.every(validItem))) &&
    (!item.bundleItems || (Array.isArray(item.bundleItems) && item.bundleItems.every(name => typeof name === "string")));
  if (Object.values(data.prices).some(value => !validPrice(value)) ||
      Object.values(data.stock).some(value => isRecord(value)
        ? Object.values(value).some(stock => stock === null || !validStock(stock)) : !validStock(value)) ||
      data.customProducts.some(p => !isRecord(p) || typeof p.id !== "string" || !p.id.trim() ||
        typeof p.name !== "string" || !p.name.trim() || !validPrice(p.price)) ||
      data.salesLog.some(sale => !isRecord(sale) || !Array.isArray(sale.items) ||
        !sale.items.every(validItem) || !Number.isFinite(sale.total) || sale.total < 0)) {
    throw new Error("價格、訂單或庫存資料無效，原資料已保留。");
  }
  readMigrationVersion(data.priceMigrationVersion);
}

function readStoredState() {
  const raw = localStorage.getItem(POS_STATE_KEY);
  if (raw !== null) {
    const data = JSON.parse(raw);
    validateStoredState(data);
    return { raw, data };
  }
  const moneyValue = localStorage.getItem("creatorPOS_money");
  if (moneyValue !== null && moneyValue.trim() === "") throw new Error("營收資料無效，原資料已保留。");
  const data = {
    schemaVersion: POS_SCHEMA_VERSION, revision: 0,
    priceMigrationVersion: readMigrationVersion(localStorage.getItem(PRODUCT_PRICES_MIGRATION_KEY)),
    money: moneyValue === null ? 0 : Number(moneyValue),
    salesLog: parseLocalJson("creatorPOS_salesLog", []),
    stock: parseLocalJson("creatorPOS_stock", {}),
    prices: parseLocalJson(PRODUCT_PRICES_STORAGE_KEY, {}),
    customProducts: parseLocalJson(CUSTOM_PRODUCTS_STORAGE_KEY, [])
  };
  validateStoredState(data);
  return { raw, data };
}

function restoreProducts(snapshot) {
  const existing = new Map(products.map(product => [product.id, product]));
  products.splice(0, products.length, ...snapshot.map(saved => {
    const product = existing.get(saved.id) || {};
    Object.keys(product).forEach(key => delete product[key]);
    return Object.assign(product, saved);
  }));
}

function captureRuntime() {
  return JSON.parse(JSON.stringify({ products, money, salesLog, currentSale, editingSaleId,
    luckyBagMode, luckyBagContents, gashaponMode, gashaponResults,
    raffleMode, raffleContents, raffleEditingIndex }));
}

function restoreRuntime(state) {
  restoreProducts(state.products);
  ({ money, salesLog, currentSale, editingSaleId, luckyBagMode,
    luckyBagContents, gashaponMode, gashaponResults,
    raffleMode, raffleContents, raffleEditingIndex } = state);
  if (moneyText) moneyText.textContent = money;
}

function createPersistentState() {
  return {
    schemaVersion: POS_SCHEMA_VERSION, revision: stateRevision + 1, priceMigrationVersion,
    money, salesLog, stock: { ...loadedStock, ...createStockSnapshot() },
    prices: { ...loadedPrices, ...Object.fromEntries(products.map(p => [p.id, p.price])) },
    customProducts: products.filter(p => p.isCustomProduct).map(({ id, name, price }) => ({ id, name, price }))
  };
}

function persistState(data) {
  if (!hasWriteLock) throw new Error("此分頁沒有寫入權。");
  if (localStorage.getItem(POS_STATE_KEY) !== committedRaw) {
    storageInitialized = false;
    throw new Error("資料已被其他版本更新，請重新載入後重試。");
  }
  validateStoredState(data);
  const raw = JSON.stringify(data);
  // 唯一提交點；setItem 失敗會保留完整的上一版，不寫入舊版分散 key。
  localStorage.setItem(POS_STATE_KEY, raw);
  committedRaw = raw;
  stateRevision = data.revision;
  loadedPrices = data.prices;
  loadedStock = data.stock;
}

function saveData() {
  if (stagingTransaction) { transactionNeedsSave = true; return; }
  return saveLocalData();
}

function saveLocalData() {
  requireWritable();
  persistState(createPersistentState());
}

function loadData() {
  return loadLocalData();
}

function loadLocalData() {
  storageInitialized = false;
  if (!hasWriteLock) throw new Error("請先取得分頁寫入權。");
  const previous = captureRuntime();
  try {
    const { raw, data } = readStoredState();
    committedRaw = raw;
    stateRevision = data.revision;
    priceMigrationVersion = readMigrationVersion(data.priceMigrationVersion);
    loadedPrices = { ...data.prices };
    loadedStock = data.stock;
    restoreProducts(JSON.parse(JSON.stringify(defaultProducts)));
    if (priceMigrationVersion < PRODUCT_PRICES_MIGRATION_VERSION) {
      loadedPrices.omamori = 120;
      loadedPrices.fox_card_holder = 280;
      priceMigrationVersion = PRODUCT_PRICES_MIGRATION_VERSION;
    }
    loadProductAdminData(loadedPrices, data.customProducts);
    money = data.money;
    salesLog = data.salesLog;
    applyStockSnapshot(data.stock);
    ensureSalesLogHasIds();
    currentSale = [];
    editingSaleId = null;
    luckyBagMode = gashaponMode = false;
    luckyBagContents = [];
    gashaponResults = [];
    raffleMode = false;
    raffleContents = [];
    raffleEditingIndex = null;
    if (raw === null || readMigrationVersion(data.priceMigrationVersion) < PRODUCT_PRICES_MIGRATION_VERSION) {
      persistState(createPersistentState());
    }
    storageInitialized = true;
    storageError = "";
    if (moneyText) moneyText.textContent = money;
  } catch (error) {
    restoreRuntime(previous);
    storageError = `載入失敗：${error.message} 請重試，勿清除瀏覽器資料。`;
    throw error;
  }
}

function commitLocalChange(change) {
  if (!canWriteData()) return false;
  const previous = captureRuntime();
  let next;
  try {
    // 既有操作只產生草稿；提交前還原 live state，成功後才發布草稿。
    stagingTransaction = true;
    transactionNeedsSave = false;
    change();
    next = captureRuntime();
    const data = transactionNeedsSave ? createPersistentState() : null;
    restoreRuntime(previous);
    stagingTransaction = false;
    if (data) persistState(data);
  } catch (error) {
    stagingTransaction = false;
    restoreRuntime(previous);
    storageError = `儲存失敗：${error.message} 本次操作未完成，可安全重試。`;
    renderAll();
    return false;
  }
  restoreRuntime(next);
  storageError = "";
  renderAll();
  return true;
}
// ===== 套用儲存的庫存快照 =====
function applyStockSnapshot(snapshot) {
  // 舊版好運守庫存僅在新分類尚未儲存時搬移。
  const oldLuckyCharmStock = snapshot.acrylic_stand?.["好運守"];
  if (snapshot.omamori?.["好運守"] === undefined && oldLuckyCharmStock !== undefined) {
    products.find(product => product.id === "omamori")
      .variants.find(variant => variant.name === "好運守").stock = oldLuckyCharmStock;
  }

  products.forEach(product => {
    const savedProductStock = snapshot[product.id];

    if (savedProductStock === undefined) {
      return;
    }

    if (
      Array.isArray(product.variants) &&
      product.variants.length > 0
    ) {
      product.variants.forEach(variant => {
        if (savedProductStock[variant.name] !== undefined) {
          variant.stock = savedProductStock[variant.name];
        }
      });
    } else {
      product.stock = savedProductStock;
    }
  });
}
// ===== 建立庫存快照 =====
function createStockSnapshot() {
  const snapshot = {};

  products.forEach(product => {
    if (
      Array.isArray(product.variants) &&
      product.variants.length > 0
    ) {
      snapshot[product.id] = {};

      product.variants.forEach(variant => {
        snapshot[product.id][variant.name] = variant.stock;
      });
    } else {
      snapshot[product.id] = product.stock ?? null;
    }
  });

  return snapshot;
}

// ===== 從庫存快照取得特定商品款式的庫存 =====
function getSnapshotStock(snapshot, productId, variantName) {
  if (!snapshot || snapshot[productId] === undefined) {
    return "";
  }

  const productStock = snapshot[productId];

  if (
    variantName === "無款式" ||
    typeof productStock !== "object" ||
    productStock === null
  ) {
    return productStock ?? "";
  }

  return productStock[variantName] ?? "";
}

// ===== 取得僅包含 active 訂單的銷售紀錄 =====
function getActiveSalesLog() {
  return salesLog.filter(sale => 
    sale.status === undefined || sale.status === "active"
  );
}

// ===== 匯出 CSV 工具函式 =====
function escapeCsvCell(cell) {
  return `"${String(cell ?? "").replaceAll('"', '""')}"`;
}
// ===== 下載 CSV 檔案 =====
let csvDownloadUrl = null;

function downloadCsvFile(blob, fileName) {
  const link = document.getElementById("csvDownloadLink");
  const url = URL.createObjectURL(blob);
  if (csvDownloadUrl) URL.revokeObjectURL(csvDownloadUrl);
  csvDownloadUrl = url;
  link.href = url;
  link.download = fileName;
  link.hidden = false;
  // Keep the URL alive for browsers that defer downloading or require another tap.
  const status = document.getElementById("csvExportStatus");
  status.hidden = false;
  status.textContent = "CSV 已產生；若未開始下載，請點下載連結。";
  link.click();
}

function exportCsvFile(blob) {
  downloadCsvFile(blob, "sales_log.csv");
}

const SALE_TYPE_LABELS = {
  gashapon: "扭蛋",
  lucky_bag: "福袋",
  raffle: "摸彩",
  special_bundle: "特殊套組",
  normal: "一般商品"
};

function getSaleItemType(item) {
  if (item.type) {
    return SALE_TYPE_LABELS[item.type] || item.type;
  }

  if (item.gashaponResult) {
    return "扭蛋";
  }

  if (item.isSpecialBundle || item.bundleItems) {
    return "特殊套組";
  }

  if (item.contents) {
    return "福袋";
  }

  return "一般商品";
}

function getContentsRowType(item) {
  if (getSaleItemType(item) === "摸彩") return "摸彩內容";
  return getSaleItemType(item) === "特殊套組"
    ? "特殊套組內容"
    : "福袋內容";
}

function getCsvSaleStatus(sale) {
  return sale.status === "inactive" ? (sale.refunded ? "已退貨" : "已替換") : "有效";
}

function getCsvStockQuantity(item) {
  if (item.contents || item.bundleItems) return 0;
  return getStockItemsFromSale([item]).reduce((total, stock) => total + stock.quantity, 0);
}

function appendCsvContents(rows, sale, saleIndex, item) {
  const contents = item.contents || (item.bundleItems || []).map(variant => ({
    productId: item.productId, name: item.name, variant, singlePrice: ""
  }));
  contents.forEach(content => {
    rows.push([
      sale.id || saleIndex + 1, sale.time, getContentsRowType(item), content.name,
      content.variant, content.singlePrice, "", `${item.name}-${item.variant}`,
      getSnapshotStock(sale.stockSnapshot, content.productId, content.variant),
      getCsvSaleStatus(sale), 0, sale.status === "inactive" ? 0 : getCsvStockQuantity(content), ""
    ]);
    appendCsvContents(rows, sale, saleIndex, content);
  });
}
// ===== 匯出銷售紀錄 CSV =====
function exportSalesLogToCSV() {
  if (!canWriteData()) return;
  const status = document.getElementById("csvExportStatus");
  const link = document.getElementById("csvDownloadLink");
  status.hidden = true;
  link.hidden = true;
  try {
    const blob = createSalesLogCsv();
    if (blob) exportCsvFile(blob);
    else {
      status.hidden = false;
      status.textContent = "目前沒有銷售紀錄可以匯出，請先完成結帳。";
    }
  } catch (error) {
    status.hidden = false;
    status.textContent = `CSV 匯出失敗：${error.message}。訂單資料未變更，請重試。`;
    alert(status.textContent);
  }
}

function createSalesLogCsv() {
  if (salesLog.length === 0) {
    alert("目前沒有銷售紀錄可以匯出");
    return;
  }

  const rows = [
    [
      "銷售編號",
      "時間",
      "類型",
      "商品",
      "款式",
      "單價",
      "該筆總額",
      "內容來源",
      "結帳後庫存",
      "訂單狀態",
      "銷售數量",
      "出庫數量",
      "原成交總額"
    ]
  ];

  salesLog.forEach((sale, saleIndex) => {
    const active = sale.status !== "inactive";
    // Only summary rows contribute to net revenue; inactive rows remain as an audit trail.
    rows.push([
      sale.id || saleIndex + 1, sale.time, "訂單合計", "", "", "",
      active ? sale.total : 0,
      sale.replaces ? `取代：${sale.replaces}` : sale.replacedBy ? `被取代：${sale.replacedBy}` : "",
      "", getCsvSaleStatus(sale), 0, 0, sale.total
    ]);
    sale.items.forEach(item => {
      rows.push([
        sale.id || saleIndex + 1,
        sale.time,
        getSaleItemType(item),
        item.name,
        item.variant,
        item.singlePrice,
        "",
        "",
        getSnapshotStock(
          sale.stockSnapshot,
          item.productId,
          item.variant
        ),
        getCsvSaleStatus(sale),
        active ? 1 : 0,
        active ? getCsvStockQuantity(item) : 0,
        ""
      ]);

      appendCsvContents(rows, sale, saleIndex, item);
    });
  });

  const csvContent = rows
    .map(row => row.map(escapeCsvCell).join(","))
    .join("\r\n");

  return new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;"
  });

}
// ===== 重置所有資料 =====
function resetAllData() {
  if (!canWriteData()) return;
  const confirmed = confirm(
    "確定要清空今日所有銷售資料並重置庫存嗎？"
  );

  if (!confirmed) {
    return;
  }

  commitLocalChange(() => {
    money = 0;
    salesLog = [];
    const defaults = Object.fromEntries(defaultProducts.map(product => [product.id, product]));
    products.forEach(product => {
      const original = defaults[product.id];
      if (!original) return;
      if (product.variants?.length) {
        product.variants.forEach(variant => {
          variant.stock = original.variants.find(item => item.name === variant.name).stock;
        });
      } else if (original.stock !== undefined) product.stock = original.stock;
    });
    clearCurrentSale();
    saveData();
  });
}
