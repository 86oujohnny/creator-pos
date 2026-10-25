// ===== 初始化 =====
startStorageSession();
document.getElementById("retryStorageButton").addEventListener("click", startStorageSession);
document.getElementById("releaseStorageButton").addEventListener("click", releaseStorageSession);

undoButton?.addEventListener("click", undoLastSale);
checkoutButton?.addEventListener("click", checkoutCurrentSale);
clearCurrentSaleButton?.addEventListener("click", clearCurrentSale);
exportCsvButton?.addEventListener("click", exportSalesLogToCSV);
resetAllDataButton?.addEventListener("click", resetAllData);
startLuckyBagButton?.addEventListener("click", startLuckyBag);
finishLuckyBagButton?.addEventListener("click", finishLuckyBag);
cancelLuckyBagButton?.addEventListener("click", cancelLuckyBag);
document.getElementById("startRaffleButton").addEventListener("click", () => startRaffle());
document.getElementById("finishRaffleButton").addEventListener("click", finishRaffle);
document.getElementById("cancelRaffleButton").addEventListener("click", cancelRaffle);
startGashaponButton?.addEventListener("click", startGashapon);
finishGashaponButton?.addEventListener("click", finishGashapon);
cancelGashaponButton?.addEventListener("click", cancelGashapon);
customProductForm?.addEventListener("submit", addCustomProductFromForm);
/*
products.js  商品資料，要最早
state.js     money/currentSale/salesLog/luckyBagMode
dom.js       HTML 元素
bundle.js    算錢邏輯
render.js    畫面更新，會用 products/state/dom/bundle
luckyBag.js  福袋功能，會用 state/render/products
sales.js     加商品/結帳/撤銷，會用 bundle/storage/render
productAdmin.js 商品管理，會用 products/dom/render/storage
storage.js   save/load/CSV 會用 products/state/dom
script.js    最後初始化、綁按鈕
*/
