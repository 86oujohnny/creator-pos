// ==== 扭蛋模式 =====
function startGashapon() {

  if (luckyBagMode) {
    alert("編輯福袋時不能編輯扭蛋");
    return;
  }

  gashaponMode = true;
  gashaponResults = [];

  renderAll();

  alert("已開始記錄扭蛋結果，請點選客人抽到的徽章");
}

// ===== 加入扭蛋結果 =====
function addGashaponResult(prize) {
  if (!gashaponMode) return;

  gashaponResults.push({
    prizeId: prize.id,
    name: prize.name,
    rewardType: prize.rewardType,
    reward: prize.reward,
    maxValue: prize.maxValue || null,
    allowTopUp: prize.allowTopUp || false,
    excluded: prize.excluded || []
  });

  renderAll();
}

// ===== 完成扭蛋編輯 =====
function finishGashapon() {
  const gashaponProduct = products.find(product => product.id === "gashapon");

  if (!gashaponProduct) {
    alert("找不到扭蛋商品設定");
    return;
  }

  if (gashaponResults.length === 0) {
    alert("尚未選擇扭蛋結果");
    return;
  }

  gashaponResults.forEach(result => {
    currentSale.push({
      productId: gashaponProduct.id,
      name: gashaponProduct.name,
      type: "gashapon",
      variant: result.name,
      singlePrice: gashaponProduct.price,
      bundleCount: gashaponProduct.bundleCount,
      bundlePrice: gashaponProduct.bundlePrice,
      isFixedPrice: true,
      trackStock: false,
      gashaponResult: result
    });
  });
  gashaponMode = false;
  gashaponResults = [];

  renderAll();
  alert("扭蛋結果已加入本次銷售");
}

// ===== 取消扭蛋 =====
function cancelGashapon() {
  const confirmed = confirm("確定取消這次扭蛋紀錄嗎？");

  if (!confirmed) return;

  gashaponMode = false;
  gashaponResults = [];

  renderAll();

  alert("已取消扭蛋紀錄");
}

// ===== 顯示可選扭蛋獎項 =====
function renderGashaponPool() {
  if (!gashaponPoolArea) return;

  gashaponPoolArea.innerHTML = "";

  const gashaponProduct = products.find(product => product.id === "gashapon");

  if (!gashaponProduct || !gashaponProduct.prizes) return;

  if (!gashaponMode) {
    gashaponPoolArea.textContent = "扭蛋模式關閉";
    return;
  }

  gashaponProduct.prizes.forEach(prize => {
    const button = document.createElement("button");

    button.textContent = `${prize.name}：${prize.reward}`;

    button.addEventListener("click", () => {
      addGashaponResult(prize);
    });

    gashaponPoolArea.appendChild(button);
  });
}

// ===== 顯示目前已選扭蛋結果 =====
function renderGashaponResults() {
  if (!gashaponResultList) return;

  gashaponResultList.innerHTML = "";

  gashaponResults.forEach((result, index) => {
    const li = document.createElement("li");

    li.textContent = `${result.name} - ${result.reward}`;

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "刪除";

    deleteButton.addEventListener("click", () => {
      gashaponResults.splice(index, 1);
      renderAll();
    });

    li.appendChild(deleteButton);
    gashaponResultList.appendChild(li);
  });
}

// ===== 更新扭蛋 UI =====
function updateGashaponUI() {
  if (gashaponModeText) {
    gashaponModeText.textContent =
      gashaponMode ? "開啟" : "關閉";
  }

  if (startGashaponButton) {
    startGashaponButton.style.display =
      gashaponMode ? "none" : "inline-block";
  }

  if (cancelGashaponButton) {
    cancelGashaponButton.style.display =
      gashaponMode ? "inline-block" : "none";
  }

  if (finishGashaponButton) {
    finishGashaponButton.style.display =
      gashaponMode ? "inline-block" : "none";
  }

  if (gashaponPoolArea) {
    gashaponPoolArea.style.display =
      gashaponMode ? "block" : "none";
  }
}
