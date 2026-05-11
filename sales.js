// ===== 賣出當前款式 =====
function addToCurrentSale(product, variant) {
  if (luckyBagMode) {
    if (product.id === "lucky_bag") {
      alert("福袋裡不能再放福袋");
      return;
    }

    luckyBagContents.push({
      productId: product.id,
      name: product.name,
      variant: variant,
      singlePrice: product.price
    });
    renderAll();
    console.log("福袋內容：", luckyBagContents);
    return;
  }

  currentSale.push({
    productId: product.id,
    name: product.name,
    variant: variant,
    singlePrice: product.price,
    bundleCount: product.bundleCount,
    bundlePrice: product.bundlePrice,
    specialBundles: product.specialBundles,
    isFixedPrice: product.isFixedPrice || false
  });

  renderAll();

  console.log("本次銷售：", currentSale);
}
// ==== 結帳 =====
function checkoutCurrentSale() {
  if (luckyBagMode) {
    alert("目前還在編輯福袋，請先按完成福袋");
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

  if (variantName === "無款式") {
    return product.stock >= quantity;
  }

  const variant = product.variants.find(
    variant => variant.name === variantName
  );

  if (!variant) return false;

  return variant.stock >= quantity;
}
// ==== 增加庫存（例如撤銷銷售時） =====
function increaseStock(productId, variantName, quantity = 1) {
  const product = products.find(product => product.id === productId);

  if (!product) return;

  if (variantName === "無款式") {
    product.stock += quantity;
    return;
  }

  const variant = product.variants.find(
    variant => variant.name === variantName
  );

  if (!variant) return;

  variant.stock += quantity;
}
// ==== 真正扣庫存 =====
function decreaseStock(productId, variantName, quantity = 1) {
  const product = products.find(product => product.id === productId);

  if (variantName === "無款式") {
    product.stock -= quantity;
    return;
  }

  const variant = product.variants.find(
    variant => variant.name === variantName
  );

  variant.stock -= quantity;
}
// ===== 從銷售項目中取得需要扣庫存的商品清單 =====
function getStockItemsFromSale(saleItems) {
  const stockItems = [];

  saleItems.forEach(item => {
    if (item.contents) {
      item.contents.forEach(content => {
        stockItems.push({
          productId: content.productId,
          variant: content.variant,
          quantity: 1
        });
      });

      return;
    }

    if (item.productId === "lucky_bag") {
      return;
    }

    stockItems.push({
      productId: item.productId,
      variant: item.variant,
      quantity: 1
    });
  });

  return stockItems;
}
// ===== 計算銷售總額 =====
function clearCurrentSale() {
  currentSale = [];
  luckyBagMode = false;
  luckyBagContents = [];
  renderAll();
  console.log("已清空本次銷售");
}