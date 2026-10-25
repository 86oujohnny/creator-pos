/* Render functions 
商品按鈕
本次銷售
銷售紀錄
福袋內容 renderLuckyBagContents -> luckyBag.js
福袋按鈕狀態 updateLuckyBagUI -> luckyBag.js
庫存區
Create special bundle buttons
Create product card
Create variant buttons
*/
function renderAll() {
  if (stagingTransaction) return;
  renderProductButtons();
  renderCurrentSale();
  renderSalesLog();
  renderProductStatistics();
  renderLuckyBagContents();
  updateLuckyBagUI();
  renderRaffle();
  renderStock();
  renderGashaponPool();
  renderGashaponResults();
  updateGashaponUI();
  renderProductManager();
  updateStorageUI();
}
// ===== 什麼時候重新建立整個商品區 =====
function renderProductButtons() {
  if (!productArea) return;

  productArea.innerHTML = "";

  products.forEach(product => {
    if (product.hiddenFromProductButtons) {
      return;
    }

    createProductCard(product);
  });
}
//  ==== 顯示當前銷售內容 =====
function renderCurrentSale() {
  if (!currentSaleList || !currentSaleTotal) return;
  currentSaleList.innerHTML = "";

  currentSale.forEach((item, index) => {
    const li = document.createElement("li");

    li.textContent = `${item.name} - ${item.variant}：${item.singlePrice}元`;
    if (item.contents) {
      const contentsText = item.contents
       .map(content => `${content.name}-${content.variant}`)
       .join("、");

      li.textContent += `｜內容：${contentsText}`;
    }
    const deleteButton = document.createElement("button");
    deleteButton.textContent = "刪除";

    deleteButton.addEventListener("click", () => {
      if (!canWriteData()) return;
      if (raffleMode) {
        alert("請先完成或取消摸彩編輯");
        return;
      }
      currentSale.splice(index, 1);
      renderAll();
    });

    li.appendChild(deleteButton);
    if (item.type === "raffle") {
      const editButton = document.createElement("button");
      editButton.textContent = "編輯摸彩";
      editButton.addEventListener("click", () => startRaffle(index));
      li.appendChild(editButton);
    }
    currentSaleList.appendChild(li);
  });

  const total = calculateSaleTotal(currentSale);
  currentSaleTotal.textContent = total;
}
// ===== 顯示銷售紀錄 =====
function renderSalesLog() {
  if (!salesLogList) return;
  salesLogList.innerHTML = "";

  salesLog.forEach((sale, index) => {
    const li = document.createElement("li");

    const itemText = sale.items
      .map(item => `${item.name}-${item.variant}`)
      .join("、");

    // 建立顯示文本
    let displayText = `第 ${index + 1} 筆：${itemText}，共 ${sale.total} 元`;
    
    // 添加狀態指示
    if (sale.status === "inactive") {
      displayText += sale.refunded
        ? " [已退貨]"
        : " [已替換]";
      li.style.opacity = "0.5";
      li.style.textDecoration = "line-through";
    }
    
    li.textContent = displayText;
    
    // 僅為 active 訂單添加編輯按鈕
    if (sale.status !== "inactive") {
      const editButton = document.createElement("button");
      editButton.textContent = "編輯";
      editButton.style.marginLeft = "10px";
      editButton.addEventListener("click", () => editSale(index, sale));
      li.appendChild(editButton);
    }

    salesLogList.appendChild(li);
  });
}

function getStatisticsSnapshot(item, productKey) {
  const price = Number(item.singlePrice);
  const validPrice = value => value !== null && value !== undefined && value !== "" &&
    Number.isFinite(Number(value)) && Number(value) >= 0;
  return {
    ...item, productId: productKey,
    singlePrice: Number.isFinite(price) && price >= 0 ? price : 0,
    bundleCount: Number.isSafeInteger(item.bundleCount) && item.bundleCount > 0 ? item.bundleCount : null,
    bundlePrice: validPrice(item.bundlePrice) ? Number(item.bundlePrice) : null,
    // Incomplete legacy promotions must not be reconstructed from the live catalog.
    specialBundles: (Array.isArray(item.specialBundles) ? item.specialBundles : []).filter(bundle =>
      bundle && validPrice(bundle.price) && Array.isArray(bundle.variants) && bundle.variants.length &&
      bundle.variants.every(variant => typeof variant === "string" && variant.length) &&
      new Set(bundle.variants).size === bundle.variants.length
    ).map(bundle => ({ ...bundle, price: Number(bundle.price) })),
    gashaponResult: item.gashaponResult ? {
      ...item.gashaponResult,
      maxValue: validPrice(item.gashaponResult.maxValue) ? Number(item.gashaponResult.maxValue) : 0,
      excluded: Array.isArray(item.gashaponResult.excluded) ? item.gashaponResult.excluded : []
    } : null
  };
}

function getStatisticsSubtotal(items) {
  return calculateGroupedItemsTotal(items.filter(item => item.isFixedPrice)) +
    calculateNormalItemsTotal(items.filter(item => !item.isFixedPrice));
}

function reconcileStatisticsRounding(rows, total) {
  const sum = rows.reduce((value, row) => value + row.revenue, 0);
  if (sum === total) return true;
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(total), Math.abs(sum)) * Math.max(1, rows.length) * 8;
  if (!rows.length || Math.abs(total - sum) > tolerance) return false;
  // Keep full precision; absorb only machine error into a fractional row, not an excluded integer price.
  let index = rows.length - 1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (!Number.isInteger(rows[i].revenue)) { index = i; break; }
  }
  const [last] = rows.splice(index, 1);
  last.revenue = total - rows.reduce((value, row) => value + row.revenue, 0);
  rows.push(last);
  return true;
}

function getSaleStatistics(sale) {
  const groups = new Map();
  (Array.isArray(sale.items) ? sale.items : []).forEach(item => {
    if (!item || typeof item !== "object") return;
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!item.productId && !name) return;
    const key = item.productId || `legacy:${name}`;
    if (!groups.has(key)) groups.set(key, {
      items: [], row: { productId: key, name: name || "未知商品", quantity: 0, revenue: 0 }
    });
    const group = groups.get(key);
    group.items.push(getStatisticsSnapshot(item, key));
    group.row.quantity += 1;
  });
  const entries = [...groups.values()];
  const items = entries.flatMap(group => group.items);
  entries.forEach(group => { group.row.revenue = getStatisticsSubtotal(group.items); });
  const subtotal = entries.reduce((total, group) => total + group.row.revenue, 0);
  const savedTotal = sale.total === null || sale.total === undefined || sale.total === ""
    ? NaN : Number(sale.total);
  const total = Number.isFinite(savedTotal) && savedTotal >= 0 ? savedTotal : calculateSaleTotal(items);
  let couponBudget = Math.min(calculateCouponDiscount(items), Math.max(0, subtotal - total));
  const remainingByExclusion = new Map();

  items.forEach(item => {
    const coupon = item.gashaponResult;
    if (coupon?.rewardType !== "coupon" || couponBudget <= 0) return;
    const key = createExcludedKey(coupon.excluded);
    if (!remainingByExclusion.has(key)) {
      remainingByExclusion.set(key, calculateCouponEligibleTotal(items, coupon.excluded));
    }
    const requested = Math.min(coupon.maxValue, remainingByExclusion.get(key), couponBudget);
    remainingByExclusion.set(key, remainingByExclusion.get(key) - requested);
    couponBudget -= requested;
    const eligible = entries.map(group => ({
      row: group.row,
      weight: Math.min(group.row.revenue, calculateCouponEligibleTotal(group.items, coupon.excluded))
    })).filter(group => group.weight > 0);
    const eligibleTotal = eligible.reduce((sum, group) => sum + group.weight, 0);
    const discount = Math.min(requested, eligibleTotal);
    let allocated = 0;
    eligible.forEach((group, index) => {
      const share = index === eligible.length - 1 ? discount - allocated : discount * group.weight / eligibleTotal;
      group.row.revenue -= share;
      allocated += share;
    });
  });

  const rows = entries.map(group => group.row);
  const difference = total - rows.reduce((sum, row) => sum + row.revenue, 0);
  if (!reconcileStatisticsRounding(rows, total)) {
    // Preserve the receipt total without inventing discounts on excluded/unknown products.
    rows.push({ productId: "legacy:revenue_adjustment", name: "歷史營收調整（未能歸屬）", quantity: 0, revenue: difference });
  }
  return rows;
}

function getProductStatisticsRows() {
  const stats = new Map();
  let total = 0;
  getActiveSalesLog().forEach(sale => {
    const saleRows = getSaleStatistics(sale);
    total += saleRows.reduce((sum, row) => sum + row.revenue, 0);
    saleRows.forEach(row => {
      if (!stats.has(row.productId)) stats.set(row.productId, { ...row });
      else {
        const previous = stats.get(row.productId);
        previous.quantity += row.quantity;
        previous.revenue += row.revenue;
      }
    });
  });
  const rows = [...stats.values()];
  reconcileStatisticsRounding(rows, total);
  return rows;
}

function createStatisticsList(rows, sortFn, formatFn) {
  const list = document.createElement("ol");

  rows
    .slice()
    .sort(sortFn)
    .forEach(row => {
      const li = document.createElement("li");

      li.textContent = formatFn(row);
      list.appendChild(li);
    });

  return list;
}

function formatStatisticsRevenue(revenue) {
  return Math.round(revenue);
}

function renderProductStatistics() {
  if (!productStatisticsArea) return;

  productStatisticsArea.innerHTML = "";

  const rows = getProductStatisticsRows();

  if (rows.length === 0) {
    productStatisticsArea.textContent = "尚無商品銷售統計";
    return;
  }

  const hotSummary = document.createElement("p");
  const topByQuantity = rows
    .slice()
    .sort((a, b) =>
      b.quantity - a.quantity ||
      b.revenue - a.revenue ||
      a.name.localeCompare(b.name)
    )[0];
  const topByRevenue = rows
    .slice()
    .sort((a, b) =>
      b.revenue - a.revenue ||
      b.quantity - a.quantity ||
      a.name.localeCompare(b.name)
    )[0];

  hotSummary.textContent =
    `熱賣：${topByQuantity.name} ${topByQuantity.quantity} 個` +
    `｜營收最高：${topByRevenue.name} ${formatStatisticsRevenue(topByRevenue.revenue)} 元`;

  const quantityHeading = document.createElement("h3");
  quantityHeading.textContent = "銷售數量排行";

  const quantityList = createStatisticsList(
    rows,
    (a, b) =>
      b.quantity - a.quantity ||
      b.revenue - a.revenue ||
      a.name.localeCompare(b.name),
    row => `${row.name}：${row.quantity} 個，${formatStatisticsRevenue(row.revenue)} 元`
  );

  const revenueHeading = document.createElement("h3");
  revenueHeading.textContent = "銷售營收排行";

  const revenueList = createStatisticsList(
    rows,
    (a, b) =>
      b.revenue - a.revenue ||
      b.quantity - a.quantity ||
      a.name.localeCompare(b.name),
    row => `${row.name}：${formatStatisticsRevenue(row.revenue)} 元，${row.quantity} 個`
  );

  productStatisticsArea.appendChild(hotSummary);
  productStatisticsArea.appendChild(quantityHeading);
  productStatisticsArea.appendChild(quantityList);
  productStatisticsArea.appendChild(revenueHeading);
  productStatisticsArea.appendChild(revenueList);
}


// ==== 顯示庫存狀態 =====
function renderStock() {
  if (!stockArea) return;

  stockArea.innerHTML = "";

  products.forEach(product => {
    if (product.hiddenFromProductButtons) {
      return;
    }

    const div = document.createElement("div");
    div.innerHTML = `<h3>${product.name}</h3>`;

    if (
    Array.isArray(product.variants) &&
    product.variants.length > 0
    ) {
      product.variants.forEach(variant => {
        const p = document.createElement("p");
        p.textContent = `${variant.name}：${variant.stock}`;
        div.appendChild(p);
      });
    } else {
      const p = document.createElement("p");
      p.textContent = `庫存：${product.stock ?? "未設定"}`;
      div.appendChild(p);
    }

    stockArea.appendChild(div);
  });
}


// ===== 建立商品卡片 =====
function createSpecialBundleButtons(card, product) {
  if (!product.specialBundles) return;

  product.specialBundles.forEach(bundle => {
    const specialButton = document.createElement("button");
    specialButton.textContent = `${bundle.name} ${bundle.price}元`;

    specialButton.addEventListener("click", () => {
      addToCurrentSale(product, bundle);
    });

    card.appendChild(specialButton);
  });
}
// ===== 建立商品款式按鈕 =====
function createVariantButtons(card, product) {
  if (
  Array.isArray(product.variants) &&
  product.variants.length > 0
  ) {
    product.variants.forEach(variant => {
      const button = document.createElement("button");

button.classList.add("variant-button");

button.innerHTML = `
  ${
    variant.image
      ? `
      <img
        src="${variant.image}"
        class="variant-image"
        alt="${variant.name}"
      >
      `
      : ""
  }
			
  <div>
    ${variant.name}
  </div>

  <div>
    庫存 ${variant.stock}
  </div>
`;

      button.addEventListener("click", () => {
        addToCurrentSale(product, variant.name);
      });

      card.appendChild(button);
    });
  } else {
  const button = document.createElement("button");

  button.textContent =
    `${product.name}（庫存 ${product.stock ?? "未設定"}）`;

  button.addEventListener("click", () => {
    addToCurrentSale(product, "無款式");
  });

  card.appendChild(button);
}
}


// ==== 建立整個商品區 =====
function createProductCard(product) {
  const card = document.createElement("div");

  card.innerHTML = `
  <h3>${product.name}</h3>

  <p>價格：${product.price}元</p>

  ${
    product.image
      ? `
      <img
        src="${product.image}"
        alt="${product.name}"
        class="product-image"
      >
      `
      : ""
  }

  ${
    product.bundlePrice
      ? `<p>優惠：${product.bundleCount}個 ${product.bundlePrice}元</p>`
      : ""
  }
`;

  createSpecialBundleButtons(card, product);
  createVariantButtons(card, product);

  productArea.appendChild(card);
}
