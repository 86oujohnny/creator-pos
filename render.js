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
  renderProductButtons();
  renderCurrentSale();
  renderSalesLog();
  renderProductStatistics();
  renderLuckyBagContents();
  updateLuckyBagUI();
  renderStock();
  renderGashaponPool();
  renderGashaponResults();
  updateGashaponUI();
  renderProductManager();
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
      currentSale.splice(index, 1);
      renderAll();
    });

    li.appendChild(deleteButton);
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

function getProductStatisticsRows() {
  const statsByProductId = {};
  const activeSalesLog = getActiveSalesLog();

  activeSalesLog.forEach(sale => {
    const saleItems = Array.isArray(sale.items) ? sale.items : [];
    const saleStatsByProductId = {};
    const grossByProductId = {};
    let grossTotal = 0;

    saleItems.forEach(item => {
      if (!item || typeof item !== "object") {
        return;
      }

      const productId = item.productId || null;
      const trimmedName = typeof item.name === "string"
        ? item.name.trim()
        : "";

      if (!productId && !trimmedName) {
        return;
      }

      const name = trimmedName || "未知商品";
      const productKey = productId || `legacy:${name}`;
      const itemGross = Number(item.singlePrice) || 0;

      if (!saleStatsByProductId[productKey]) {
        saleStatsByProductId[productKey] = {
          productId: productKey,
          name,
          quantity: 0,
          revenue: 0
        };
      }

      saleStatsByProductId[productKey].quantity += 1;
      grossByProductId[productKey] =
        (grossByProductId[productKey] || 0) + itemGross;
      grossTotal += itemGross;
    });

    if (grossTotal <= 0) {
      return;
    }

    const savedSaleTotal = Number(sale.total);
    const saleTotal = Number.isFinite(savedSaleTotal) && savedSaleTotal > 0
      ? savedSaleTotal
      : calculateSaleTotal(saleItems);

    if (!Number.isFinite(saleTotal) || saleTotal <= 0) {
      return;
    }

    // TODO: Coupon discounts currently use proportional revenue allocation.
    Object.keys(grossByProductId).forEach(productKey => {
      const ratio = grossByProductId[productKey] / grossTotal;
      saleStatsByProductId[productKey].revenue += saleTotal * ratio;
    });

    Object.keys(saleStatsByProductId).forEach(productKey => {
      if (!statsByProductId[productKey]) {
        statsByProductId[productKey] = saleStatsByProductId[productKey];
        return;
      }

      statsByProductId[productKey].quantity +=
        saleStatsByProductId[productKey].quantity;
      statsByProductId[productKey].revenue +=
        saleStatsByProductId[productKey].revenue;
    });
  });

  return Object.values(statsByProductId);
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
