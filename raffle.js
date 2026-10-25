function startRaffle(index = null) {
  if (!canWriteData() || raffleMode) return;
  if (luckyBagMode || gashaponMode) {
    alert("請先完成或取消福袋／扭蛋");
    return;
  }
  if (index !== null && currentSale[index]?.type !== "raffle") return;
  raffleEditingIndex = index;
  raffleContents = index === null ? [] : JSON.parse(JSON.stringify(currentSale[index].contents));
  raffleMode = true;
  renderAll();
}

function addToRaffle(product, variant) {
  if (!canWriteData() || !raffleMode) return;
  if (["raffle", "lucky_bag", "gashapon"].includes(product.id)) {
    alert("摸彩內容不能放摸彩、福袋或扭蛋");
    return;
  }
  const isSpecialBundle = variant && typeof variant === "object" && Array.isArray(variant.variants);
  raffleContents.push({
    productId: product.id,
    name: product.name,
    type: isSpecialBundle ? "special_bundle" : "normal",
    variant: isSpecialBundle ? variant.name : variant,
    singlePrice: isSpecialBundle ? variant.price : product.price,
    isSpecialBundle: Boolean(isSpecialBundle),
    bundleItems: isSpecialBundle ? [...variant.variants] : null
  });
  renderAll();
}

function finishRaffle() {
  if (!canWriteData() || !raffleMode) return;
  if (!raffleContents.length) {
    alert("摸彩內容是空的");
    return;
  }
  const product = products.find(p => p.id === "raffle");
  const item = {
    productId: product.id, name: product.name, type: "raffle", variant: "摸彩",
    singlePrice: product.price, bundleCount: product.bundleCount, bundlePrice: product.bundlePrice,
    isFixedPrice: true, trackStock: false,
    contents: JSON.parse(JSON.stringify(raffleContents))
  };
  if (raffleEditingIndex === null) currentSale.push(item);
  else currentSale[raffleEditingIndex] = item;
  raffleMode = false;
  raffleContents = [];
  raffleEditingIndex = null;
  renderAll();
}

function cancelRaffle() {
  if (!canWriteData() || !raffleMode || !confirm("確定取消這次摸彩編輯嗎？")) return;
  raffleMode = false;
  raffleContents = [];
  raffleEditingIndex = null;
  renderAll();
}

function renderRaffle() {
  const list = document.getElementById("raffleContentsList");
  list.replaceChildren();
  raffleContents.forEach((item, index) => {
    const li = document.createElement("li");
    li.textContent = `${item.name} - ${item.variant}`;
    const remove = document.createElement("button");
    remove.textContent = "刪除";
    remove.addEventListener("click", () => {
      if (!canWriteData() || !raffleMode) return;
      raffleContents.splice(index, 1);
      renderRaffle();
    });
    li.appendChild(remove);
    list.appendChild(li);
  });
  document.getElementById("raffleModeText").textContent = raffleMode ? "開啟" : "關閉";
  const start = document.getElementById("startRaffleButton");
  start.classList.toggle("mode-active", raffleMode);
  start.disabled = raffleMode;
  document.getElementById("finishRaffleButton").hidden = !raffleMode;
  document.getElementById("cancelRaffleButton").hidden = !raffleMode;
}
