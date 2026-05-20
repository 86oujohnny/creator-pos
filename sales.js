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
}
// ==== 結帳 =====
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

  const stockItems = getStockItemsFromSale(currentSale);

  const hasEnoughStock = stockItems.every(item =>
    canDecreaseStock(item.productId, item.variant, item.quantity)
  );

  if (!hasEnoughStock) {
    alert("庫存不足，無法結帳");
    return;
  }

  stockItems.forEach(item => {
    decreaseStock(item.productId, item.variant, item.quantity);
  });

  const total = calculateSaleTotal(currentSale);

  money += total;
  moneyText.textContent = money;

  salesLog.push({
  items: [...currentSale],
  total: total,
  time: new Date().toLocaleString(),
  stockSnapshot: createStockSnapshot()
});

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

  renderAll();
  console.log("已清空本次銷售");
}