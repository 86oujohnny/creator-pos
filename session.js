let releaseWriteLock = null;
let lockRequestPending = false;

function updateStorageUI() {
  const status = document.getElementById("storageStatus");
  const controls = document.getElementById("posControls");
  const retry = document.getElementById("retryStorageButton");
  const release = document.getElementById("releaseStorageButton");
  controls.disabled = !canWriteData();
  status.textContent = storageError || (canWriteData() ? "此分頁可收銀" : "此分頁已鎖定，尚無寫入權。");
  retry.hidden = canWriteData() || lockRequestPending;
  release.hidden = !hasWriteLock;
}

function initializeWriter() {
  try { loadData(); } catch (error) {
    storageError = `載入失敗：${error.message} 原始資料已保留，請重試。`;
  }
  renderAll();
}

function startStorageSession() {
  if (hasWriteLock) { initializeWriter(); return; }
  if (lockRequestPending) return;
  if (!window.isSecureContext || !navigator.locks) {
    storageError = "此瀏覽器不支援安全的分頁鎖定，已禁止寫入。請改用支援 Web Locks 的 HTTPS 或 localhost 瀏覽器。";
    updateStorageUI();
    return;
  }
  lockRequestPending = true;
  updateStorageUI();
  navigator.locks.request("creatorPOS:writer", { ifAvailable: true }, async lock => {
    lockRequestPending = false;
    if (!lock) {
      storageError = "另一個分頁正在收銀，此分頁已鎖定。請關閉或釋放原分頁後重試。";
      updateStorageUI();
      return;
    }
    hasWriteLock = true;
    const released = new Promise(resolve => { releaseWriteLock = resolve; });
    initializeWriter();
    await released;
  }).catch(error => {
    lockRequestPending = false;
    hasWriteLock = storageInitialized = false;
    storageError = `無法取得分頁鎖定：${error.message}`;
    updateStorageUI();
  });
}

function releaseStorageSession() {
  hasWriteLock = storageInitialized = false;
  storageError = "此分頁已釋放寫入權；重新取得時將載入最新資料。";
  releaseWriteLock?.();
  releaseWriteLock = null;
  updateStorageUI();
}

window.addEventListener("pagehide", releaseStorageSession);
window.addEventListener("pageshow", event => {
  if (event.persisted) startStorageSession();
});
