const CUSTOM_PRODUCTS_STORAGE_KEY = "creatorPOS_customProducts";
const PRODUCT_PRICES_STORAGE_KEY = "creatorPOS_productPrices";

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

function loadProductAdminData() {
  const parsedPrices = parseLocalJson(PRODUCT_PRICES_STORAGE_KEY, {});
  const savedPrices =
    parsedPrices &&
    typeof parsedPrices === "object" &&
    !Array.isArray(parsedPrices)
      ? parsedPrices
      : {};

  products.forEach(product => {
    if (savedPrices[product.id] !== undefined) {
      const price = Number(savedPrices[product.id]);

      if (Number.isFinite(price) && price > 0) {
        product.price = price;
      }
    }
  });

  const parsedCustomProducts = parseLocalJson(CUSTOM_PRODUCTS_STORAGE_KEY, []);
  const customProducts = Array.isArray(parsedCustomProducts)
    ? parsedCustomProducts
    : [];

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
  const customProducts = products
    .filter(product => product.isCustomProduct)
    .map(product => ({
      id: product.id,
      name: product.name,
      price: product.price
    }));

  const productPrices = {};

  products.forEach(product => {
    productPrices[product.id] = product.price;
  });

  localStorage.setItem(
    CUSTOM_PRODUCTS_STORAGE_KEY,
    JSON.stringify(customProducts)
  );

  localStorage.setItem(
    PRODUCT_PRICES_STORAGE_KEY,
    JSON.stringify(productPrices)
  );
}

function addCustomProductFromForm(event) {
  event.preventDefault();

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

  customProductNameInput.value = "";
  customProductPriceInput.value = "";

  renderAll();
}

function updateProductPrice(product, priceInput) {
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
    priceInput.style.display = "none";

    saveButton.type = "button";
    saveButton.textContent = "價格修改已停用";
    saveButton.style.display = "none";
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
