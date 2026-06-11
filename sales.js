// ===== 賣出當前款式 =====
function addToCurrentSale(product, variant) {
  console.log("addToCurrentSale 被呼叫", product.id, variant);
  console.log("luckyBagMode =", luckyBagMode);
  console.log("gashaponMode =", gashaponMode);

  if (luckyBagMode) {
  if (product.id === "lucky_bag") {
    alert("福袋裡不能再放福袋");
    return;
  }

  if (product.id === "gashapon") {
    alert("福袋裡不能放扭蛋");
    return;
  }

  const isSpecialBundle =
    variant &&
    typeof variant === "object" &&
    Array.isArray(variant.variants);

  luckyBagContents.push({
    productId: product.id,
    name: product.name,
    type: isSpecialBundle ? "special_bundle" : "normal",
    variant: isSpecialBundle ? variant.name : (variant || "預設"),
    singlePrice: isSpecialBundle ? variant.price : product.price,
    bundleCount: product.bundleCount,
    bundlePrice: product.bundlePrice,
    specialBundles: product.specialBundles,
    isSpecialBundle: isSpecialBundle,
    bundleItems: isSpecialBundle ? [...variant.variants] : null,
    isFixedPrice: product.isFixedPrice || false
  });

  renderAll();
  console.log("福袋內容：", luckyBagContents);
  return;
}

  if (gashaponMode) {
    alert("扭蛋模式請點選扭蛋獎項，不要點商品");
    return;
  }

  const isSpecialBundle =
  variant &&
  typeof variant === "object" &&
  Array.isArray(variant.variants);

currentSale.push({
  productId: product.id,
  name: product.name,
  type: isSpecialBundle ? "special_bundle" : "normal",
  variant: isSpecialBundle ? variant.name : variant,
  singlePrice: isSpecialBundle ? variant.price : product.price,
  bundleCount: isSpecialBundle ? null : product.bundleCount,
  bundlePrice: isSpecialBundle ? null : product.bundlePrice,
  specialBundles: isSpecialBundle ? null : product.specialBundles,
  isSpecialBundle: isSpecialBundle,
  bundleItems: isSpecialBundle ? [...variant.variants] : null,
  isFixedPrice: isSpecialBundle ? true : (product.isFixedPrice || false),
  contents: isSpecialBundle
    ? variant.variants.map(variantName => ({
        productId: product.id,
        name: product.name,
        variant: variantName,
        singlePrice: product.price
      }))
    : null
});

  renderAll();
}
// ===== 取得銷售中的庫存項目（包含福袋內容） =====
function getStockItemsFromSale(saleItems) {
  const stockMap = {};

  function addStockItem(item) {
    if (item.contents) {
      item.contents.forEach(content => {
        addStockItem(content);
      });
      return;
    }

    if (item.bundleItems) {
      item.bundleItems.forEach(variantName => {
        addStockItem({
          productId: item.productId,
          name: item.name,
          variant: variantName,
          singlePrice: item.singlePrice
        });
      });
      return;
    }

    const product = products.find(p => p.id === item.productId);

    if (!product || product.trackStock === false) {
      return;
    }

    const key = `${item.productId}||${item.variant}`;

    if (!stockMap[key]) {
      stockMap[key] = {
        productId: item.productId,
        variant: item.variant,
        quantity: 0
      };
    }

    stockMap[key].quantity += 1;
  }

  saleItems.forEach(item => {
    addStockItem(item);
  });

  return Object.values(stockMap);
}// ===== 驗證庫存：恢復舊訂單後是否足以扣除新訂單 =====
function canDecreaseNewStockAfterRestoringOld(newStockItems, oldStockItems) {
  // 建立恢復數量的對應表
  const restoreMap = {};
  oldStockItems.forEach(item => {
    const key = `${item.productId}||${item.variant}`;
    restoreMap[key] = (restoreMap[key] || 0) + item.quantity;
  });
  
  // 檢查每個新訂單項目在恢復後是否足夠
  return newStockItems.every(item => {
    const product = products.find(p => p.id === item.productId);
    if (product.trackStock === false) return true;
    
    const key = `${item.productId}||${item.variant}`;
    const restoreQty = restoreMap[key] || 0;
    
    if (Array.isArray(product.variants) && product.variants.length > 0) {
      const variant = product.variants.find(v => v.name === item.variant);
      if (!variant) return false;
      
      const availableStock = variant.stock + restoreQty;
      return availableStock >= item.quantity;
    } else {
      const availableStock = (product.stock ?? 0) + restoreQty;
      return availableStock >= item.quantity;
    }
  });
}
// ===== 為舊的銷售紀錄補充 id 和 status（向後相容） =====
function ensureSalesLogHasIds() {
  let idCounter = 0;
  salesLog.forEach(sale => {
    if (!sale.id) {
      sale.id = `sale_${Date.now()}_${idCounter++}`;
    }
    if (!sale.status) {
      sale.status = "active";
    }
  });
}
// ===== 編輯已結帳的訂單（輕量級 - 只複製項目和設置追蹤） =====
function editSale(saleIndex, sale) {
  // 檢查：已有其他訂單在編輯
  if (editingSaleId) {
    alert("目前已有訂單正在編輯，請先完成結帳");
    return;
  }

  // 檢查：currentSale 不能有項目
  if (currentSale.length > 0) {
    alert("請先完成或刪除目前的銷售項目");
    return;
  }

  // 檢查：舊訂單不能已被替換
  if (sale.status === "inactive") {
    alert("無法編輯已替換的訂單");
    return;
  }

  // 1. 複製項目到 currentSale 供編輯（不修改任何持久化狀態）
  currentSale = JSON.parse(JSON.stringify(sale.items));
  
  // 2. 設置編輯追蹤（不持久化）
  editingSaleId = sale.id;

  // 3. 重新渲染以顯示項目
  renderAll();
}// ==== 結帳 =====
function checkoutCurrentSale() {
  if (luckyBagMode) {
    alert("目前還在編輯福袋，請先按完成福袋");
    return;
  }
  if (gashaponMode) {
  alert("目前還在記錄扭蛋，請先按完成扭蛋");
  return;
  }

  if (currentSale.length === 0) {
    alert("本次銷售是空的");
    return;
  }

  // ===== 驗證階段（無狀態改變） =====
  
  const newStockItems = getStockItemsFromSale(currentSale);
  
  let oldSale = null;
  let oldSaleIndex = -1;
  let oldStockItems = [];
  
  // 如果在編輯，驗證舊訂單存在
  if (editingSaleId) {
    oldSaleIndex = salesLog.findIndex(sale => sale.id === editingSaleId);
    if (oldSaleIndex === -1) {
      alert("無法找到要編輯的訂單");
      return;
    }
    oldSale = salesLog[oldSaleIndex];
    oldStockItems = getStockItemsFromSale(oldSale.items);
  }
  
  // 驗證新訂單庫存（考慮編輯情況）
  let hasEnoughStock;
  if (editingSaleId) {
    // 新訂單庫存必須在恢復舊訂單後仍然充足
    hasEnoughStock = canDecreaseNewStockAfterRestoringOld(newStockItems, oldStockItems);
  } else {
    // 正常新訂單，直接檢查
    hasEnoughStock = newStockItems.every(item =>
      canDecreaseStock(item.productId, item.variant, item.quantity)
    );
  }

  if (!hasEnoughStock) {
    alert("庫存不足，無法結帳");
    return;
  }

  // ===== 驗證通過，開始改變狀態 =====
  
  if (editingSaleId) {
    // 1. 標記舊訂單為已替換
    oldSale.status = "inactive";
    oldSale.editedAt = new Date().toLocaleString();
    
    // 2. 恢復舊訂單的庫存
    oldStockItems.forEach(item => {
      increaseStock(item.productId, item.variant, item.quantity);
    });
    
    // 3. 從 money 中減去舊訂單的總額
    money -= oldSale.total;
    if (money < 0) money = 0;
  }

  // 4. 扣除新訂單的庫存
  newStockItems.forEach(item => {
    decreaseStock(item.productId, item.variant, item.quantity);
  });

  const total = calculateSaleTotal(currentSale);

  money += total;
  moneyText.textContent = money;

  // 5. 生成新訂單 ID 和狀態
  const newSaleId = `sale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const newSale = {
    id: newSaleId,
    items: [...currentSale],
    total: total,
    time: new Date().toLocaleString(),
    stockSnapshot: createStockSnapshot(),
    status: "active"
  };

  // 6. 如果是編輯舊訂單，建立連結並清空編輯追蹤
  if (editingSaleId) {
    newSale.replaces = editingSaleId;
    salesLog[oldSaleIndex].replacedBy = newSaleId;
    editingSaleId = null;
  }

  salesLog.push(newSale);

  saveData();

  currentSale = [];
  renderAll();
}
// ===== 撤銷上次銷售 =====
function undoLastSale() {
  const lastSale = salesLog.pop();

  if (!lastSale) {
    alert("沒有可以撤銷的紀錄");
    return;
  }

  const stockItems = getStockItemsFromSale(lastSale.items);

  stockItems.forEach(item => {
    increaseStock(item.productId, item.variant, item.quantity);
  });

  money -= lastSale.total;

  if (money < 0) {
    money = 0;
  }

  moneyText.textContent = money;

  saveData();
  renderAll();

  console.log("撤銷：", lastSale);
}
// ==== 檢查是否可以扣庫存 =====
function canDecreaseStock(productId, variantName, quantity = 1) {
  const product = products.find(product => product.id === productId);

  if (!product) return false;

  if (product.trackStock === false) return true;

  if (variantName === "無款式") {
    return product.stock >= quantity;
  }

  const variant = product.variants?.find(
  variant => variant.name === variantName
 );

  if (!variant) return false;

  return variant.stock >= quantity;
}
// ==== 增加庫存（例如撤銷銷售時） =====
function increaseStock(productId, variantName, quantity = 1) {
  const product = products.find(product => product.id === productId);

  if (!product || product.trackStock === false) return;

  if (variantName === "無款式") {
    product.stock += quantity;
    return;
  }

  const variant = product.variants?.find(
  variant => variant.name === variantName
);

  if (!variant) return;

  variant.stock += quantity;
}
// ==== 真正扣庫存 =====
function decreaseStock(productId, variantName, quantity = 1) {
  const product = products.find(product => product.id === productId);

  if (!product || product.trackStock === false) return;

  if (variantName === "無款式") {
    product.stock -= quantity;
    return;
  }

  const variant = product.variants?.find(
  variant => variant.name === variantName
);

  if (!variant) return;

  variant.stock -= quantity;
}

// ===== 計算銷售總額 =====
function clearCurrentSale() {
  currentSale = [];

  luckyBagMode = false;
  luckyBagContents = [];

  gashaponMode = false;
  gashaponResults = [];

  editingSaleId = null;

  renderAll();
  console.log("已清空本次銷售");
}
