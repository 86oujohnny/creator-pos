const CUSTOM_PRODUCTS_STORAGE_KEY = "creatorPOS_customProducts";
const PRODUCT_PRICES_STORAGE_KEY = "creatorPOS_productPrices";
const PRODUCT_PRICES_MIGRATION_KEY = "creatorPOS_productPricesMigrationVersion";
const PRODUCT_PRICES_MIGRATION_VERSION = 1;
const ENABLE_PRICE_EDIT = false;

function createCustomProduct(name, price) {
  return {
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name,
    price,
    variants: [],
    trackStock: false,
    isCustomProduct: true
  };
}

function loadProductAdminData(savedPrices, customProducts) {
  products.forEach(product => {
    if (savedPrices[product.id] !== undefined) {
      const price = Number(savedPrices[product.id]);

      if (Number.isFinite(price) && price > 0) {
        product.price = price;
      }
    }
  });

  customProducts.forEach(savedProduct => {
    const id = typeof savedProduct.id === "string"
      ? savedProduct.id.trim()
      : "";
    const name = typeof savedProduct.name === "string"
      ? savedProduct.name.trim()
      : "";

    if (!id || !name) {
      return;
    }

    if (products.some(product => product.id === id)) {
      return;
    }

    const overridePrice = Number(savedPrices[id]);
    const savedProductPrice = Number(savedProduct.price);
    const price = Number.isFinite(overridePrice) && overridePrice > 0
      ? overridePrice
      : savedProductPrice;

    if (!Number.isFinite(price) || price <= 0) {
      return;
    }

    products.push({
      id,
      name,
      price,
      variants: [],
      trackStock: false,
      isCustomProduct: true
    });
  });
}

function saveProductAdminData() {
  saveData();
}

function addCustomProductFromForm(event) {
  event.preventDefault();
  const previousCount = products.length;
  const committed = commitLocalChange(addCustomProductDraft);
  if (committed && products.length > previousCount) {
    customProductNameInput.value = "";
    customProductPriceInput.value = "";
  }
  return committed;
}

function addCustomProductDraft() {
  const name = customProductNameInput.value.trim();
  const priceText = customProductPriceInput.value.trim();
  const price = Number(priceText);

  if (!name) {
    alert("請輸入商品名稱");
    return;
  }

  if (!priceText || !Number.isFinite(price) || price <= 0) {
    alert("請輸入有效價格");
    return;
  }

  products.push(createCustomProduct(name, price));
  saveProductAdminData();

  renderAll();
}

function updateProductPrice(product, priceInput) {
  return commitLocalChange(() => updateProductPriceDraft(product, priceInput));
}

function updateProductPriceDraft(product, priceInput) {
  const priceText = priceInput.value.trim();
  const price = Number(priceText);

  if (!priceText || !Number.isFinite(price) || price <= 0) {
    alert("請輸入有效價格");
    return;
  }

  product.price = price;
  saveProductAdminData();
  renderAll();
}

function deleteCustomProduct(product) {
  return commitLocalChange(() => deleteCustomProductDraft(product));
}

function deleteCustomProductDraft(product) {
  const confirmed = confirm(`確定刪除商品「${product.name}」嗎？`);

  if (!confirmed) {
    return;
  }

  const index = products.findIndex(item => item.id === product.id);

  if (index !== -1) {
    products.splice(index, 1);
  }

  saveProductAdminData();
  renderAll();
}

function renderProductManager() {
  if (!productManagerList) return;

  productManagerList.innerHTML = "";

  products.forEach(product => {
    if (product.hiddenFromProductButtons) {
      return;
    }

    const li = document.createElement("li");
    const nameSpan = document.createElement("span");
    const priceInput = document.createElement("input");
    const saveButton = document.createElement("button");

    nameSpan.textContent = product.name;

    priceInput.type = "number";
    priceInput.min = "0";
    priceInput.step = "1";
    priceInput.value = product.price;
    priceInput.style.display = ENABLE_PRICE_EDIT ? "" : "none";

    saveButton.type = "button";
    saveButton.textContent = ENABLE_PRICE_EDIT
      ? "儲存價格"
      : "價格修改已停用";
    saveButton.style.display = ENABLE_PRICE_EDIT ? "" : "none";
    saveButton.disabled = !ENABLE_PRICE_EDIT;
    saveButton.addEventListener("click", () => {
      updateProductPrice(product, priceInput);
    });

    li.appendChild(nameSpan);
    li.appendChild(priceInput);
    li.appendChild(saveButton);

    if (product.isCustomProduct) {
      const deleteButton = document.createElement("button");

      deleteButton.type = "button";
      deleteButton.textContent = "刪除";
      deleteButton.addEventListener("click", () => {
        deleteCustomProduct(product);
      });

      li.appendChild(deleteButton);
    }

    productManagerList.appendChild(li);
  });
}
