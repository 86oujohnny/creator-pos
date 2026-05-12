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
  money = Number(localStorage.getItem("creatorPOS_money")) || 0;

  salesLog =
    JSON.parse(localStorage.getItem("creatorPOS_salesLog")) || [];

  const savedStock =
    JSON.parse(localStorage.getItem("creatorPOS_stock"));

  if (savedStock) {
    applyStockSnapshot(savedStock);
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

  if (variantName === "無款式") {
    return snapshot[productId];
  }

  return snapshot[productId][variantName] ?? "";
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
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function exportCsvFile(blob) {
  const file = new File(
    [blob],
    "sales_log.csv",
    { type: "text/csv;charset=utf-8;" }
  );

  if (
    navigator.canShare &&
    navigator.canShare({ files: [file] })
  ) {
    navigator.share({
      files: [file],
      title: "sales_log"
    }).catch(error => {
      console.log("分享失敗，改用下載", error);
      downloadCsvFile(blob, "sales_log.csv");
    });

    return;
  }

  downloadCsvFile(blob, "sales_log.csv");
}
// ===== 匯出銷售紀錄 CSV =====
function exportSalesLogToCSV() {
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
      "福袋內容",
      "結帳後庫存"
    ]
  ];

  salesLog.forEach((sale, saleIndex) => {
    sale.items.forEach(item => {
      rows.push([
        saleIndex + 1,
        sale.time,
        item.contents ? "福袋" : "一般商品",
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
            "福袋內容",
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