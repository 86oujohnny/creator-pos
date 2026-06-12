function saveData() {
  if (USE_FIREBASE) {
    // 之後放 saveCloudData();
    return;
  }

  saveLocalData();
}

function loadData() {
  if (USE_FIREBASE) {
    // 之後放 loadCloudData();
    return;
  }

  loadLocalData();
}



// ===== 資料儲存與載入 =====
function saveLocalData() {
  localStorage.setItem("creatorPOS_money", money);

  localStorage.setItem(
    "creatorPOS_salesLog",
    JSON.stringify(salesLog)
  );

  localStorage.setItem(
    "creatorPOS_stock",
    JSON.stringify(createStockSnapshot())
  );

  saveProductAdminData();
}

function parseLocalJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);

    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn(`無法讀取 ${key}，改用預設值`, error);
    return fallback;
  }
}
// ===== 在頁面卸載前儲存資料 (例如關閉或重新整理頁面) =====
window.addEventListener("beforeunload", () => {
  if (isResettingData) {
    return;
  }

  saveLocalData();
});
// ===== 頁面載入時讀取資料 =====
function loadLocalData() {
  loadProductAdminData();

  money = Number(localStorage.getItem("creatorPOS_money")) || 0;

  salesLog = parseLocalJson("creatorPOS_salesLog", []);

  const savedStock = parseLocalJson("creatorPOS_stock", null);

  if (savedStock) {
    applyStockSnapshot(savedStock);
  }

  // 為舊的銷售紀錄補充 id 和 status（向後相容）
  if (salesLog && salesLog.length > 0) {
    ensureSalesLogHasIds();
  }

  moneyText.textContent = money;
}
// ===== 套用儲存的庫存快照 =====
function applyStockSnapshot(snapshot) {
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
  return `"${String(cell).replaceAll('"', '""')}"`;
}
// ===== 下載 CSV 檔案 =====
function downloadCsvFile(blob, fileName) {
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

function exportCsvFile(blob) {
  downloadCsvFile(blob, "sales_log.csv");
}

const SALE_TYPE_LABELS = {
  gashapon: "扭蛋",
  lucky_bag: "福袋",
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
  return getSaleItemType(item) === "特殊套組"
    ? "特殊套組內容"
    : "福袋內容";
}
// ===== 匯出銷售紀錄 CSV =====
function exportSalesLogToCSV() {
  const activeSalesLog = getActiveSalesLog();
  
  if (activeSalesLog.length === 0) {
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
      "結帳後庫存"
    ]
  ];

  activeSalesLog.forEach((sale, saleIndex) => {
    sale.items.forEach(item => {
      rows.push([
        saleIndex + 1,
        sale.time,
        getSaleItemType(item),
        item.name,
        item.variant,
        item.singlePrice,
        sale.total,
        "",
        getSnapshotStock(
          sale.stockSnapshot,
          item.productId,
          item.variant
        )
      ]);

      if (item.contents) {
        item.contents.forEach(content => {
          rows.push([
            saleIndex + 1,
            sale.time,
            getContentsRowType(item),
            content.name,
            content.variant,
            content.singlePrice,
            "",
            `${item.name}-${item.variant}`,
            getSnapshotStock(
              sale.stockSnapshot,
              content.productId,
              content.variant
            )
          ]);
        });
      }
    });
  });

  const csvContent = rows
    .map(row => row.map(escapeCsvCell).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;"
  });

  exportCsvFile(blob);
}
// ===== 重置所有資料 =====
function resetAllData() {
  const confirmed = confirm(
    "確定要清空今日所有銷售資料並重置庫存嗎？"
  );

  if (!confirmed) {
    return;
  }

  isResettingData = true;

  localStorage.removeItem("creatorPOS_money");
  localStorage.removeItem("creatorPOS_salesLog");
  localStorage.removeItem("creatorPOS_stock");

  location.reload();
}
