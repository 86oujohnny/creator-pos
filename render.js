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
  renderLuckyBagContents();
  updateLuckyBagUI();
  renderStock();
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

    li.textContent = `第 ${index + 1} 筆：${itemText}，共 ${sale.total} 元`;

    salesLogList.appendChild(li);
  });
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
      currentSale.push({
        productId: `${product.id}_${bundle.name}`,
        name: `${product.name} - ${bundle.name}`,
        variant: "套組",
        singlePrice: bundle.price,
        isFixedPrice: true,
        contents: bundle.variants.map(variantName => ({
          productId: product.id,
          name: product.name,
          variant: variantName,
          singlePrice: product.price
        }))
      });

      renderAll();
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