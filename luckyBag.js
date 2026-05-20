// ==== 福袋模式 =====
function startLuckyBag() {
  if (gashaponMode) {
    alert("目前正在記錄扭蛋，請先完成或取消扭蛋");
    return;
  }

  luckyBagMode = true;
  luckyBagContents = [];

  renderAll();

  alert("已開始編輯福袋，接下來點商品會加入福袋內容，不會計價");
}
// ===== 完成福袋編輯 =====
function finishLuckyBag() {
  const luckyBagProduct = products.find(product => product.id === "lucky_bag");

  if (!luckyBagProduct) {
    alert("找不到福袋商品設定");
    return;
  }

  if (luckyBagContents.length === 0) {
    alert("福袋內容是空的");
    return;
  }

  currentSale.push({
  productId: luckyBagProduct.id,
  name: luckyBagProduct.name,
  variant: "福袋",
  singlePrice: luckyBagProduct.price,
  bundleCount: luckyBagProduct.bundleCount,
  bundlePrice: luckyBagProduct.bundlePrice,
  isFixedPrice: true,
  trackStock: false,
  contents: [...luckyBagContents]
});
  luckyBagContents = [];
  luckyBagMode = false;
  renderAll();
  alert("福袋已加入本次銷售");
}
// 關閉福袋模式

function cancelLuckyBag() {
  const confirmed = confirm("確定取消這包福袋嗎？");

  if (!confirmed) {
    return;
  }

  luckyBagMode = false;
  luckyBagContents = [];

  renderAll();

  alert("已取消福袋編輯");
}

// ===== 顯示目前福袋內容 =====
function renderLuckyBagContents() {
  if (!luckyBagContentsList) return;

  luckyBagContentsList.innerHTML = "";

  luckyBagContents.forEach((item, index) => {
    const li = document.createElement("li");

    li.textContent = `${item.name} - ${item.variant}`;

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "刪除";

    deleteButton.addEventListener("click", () => {
      luckyBagContents.splice(index, 1);
      renderLuckyBagContents();
    });

    li.appendChild(deleteButton);
    luckyBagContentsList.appendChild(li);
  });
}
// ===== 開始福袋按鈕何時出現 =====
function updateLuckyBagUI() {
  if (luckyBagModeText) {
    luckyBagModeText.textContent =
      luckyBagMode ? "開啟" : "關閉";
  }
   if (startLuckyBagButton) {
    startLuckyBagButton.style.display =
      luckyBagMode ? "none" : "inline-block";
  }

  if (cancelLuckyBagButton) {
    cancelLuckyBagButton.style.display =
      luckyBagMode ? "inline-block" : "none";
  }

  if (finishLuckyBagButton) {
    finishLuckyBagButton.style.display =
      luckyBagMode ? "inline-block" : "none";
  }
}
 
