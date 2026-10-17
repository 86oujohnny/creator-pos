````md
## Version
Current version: `1.0`

Creator POS v1.0
- Paid order editing
- Full refund support
- Undo protection
- Audit history
- CSV export

refactor storage for local and future cloud data
add product image display and change layout
change stock amount to 100
add new type of purchase type "gashapon"
# Creator POS

簡易同人場 POS 系統。  
A simple POS system designed for artist alley / convention booths.

---

## 功能 Features

- 商品銷售 Product sales
- 庫存管理 Inventory management
- 福袋模式 Lucky bag mode
- 特殊套組優惠 Special bundle pricing
- CSV 匯出 CSV export
- localStorage 儲存 Local browser storage

---

## 使用方式 Usage

本機使用（需要支援 Web Locks 的瀏覽器）：
Local use (requires a browser with Web Locks support):

```sh
python3 -m http.server 8000
````

開啟 `http://localhost:8000/`。正式環境請使用 HTTPS；不支援安全分頁鎖定時會禁止寫入。

Or use GitHub Pages:

```txt
https://86oujohnny.github.io/creator-pos/
```

---

## 技術 Technologies

* HTML
* CSS
* Vanilla JavaScript

## 資料安全與測試

修復版使用單一交易狀態與 Web Locks 單一可寫分頁。部署前必須關閉所有舊版收銀分頁；新版本開始記錄交易後不可直接降版讀取舊儲存 key。

執行 `npm ci`、`npx playwright install chromium` 後，可使用 `npm test` 與 `npm run test:browser`。瀏覽器測試只使用隔離的本機測試環境。

完整修復報告、相容性與部署注意事項：[Storage Safety Review](docs/reviews/2026-10-17-storage-safety.md)。

---

## 專案結構 Project Structure

```txt
products.js
render.js
sales.js
storage.js
luckyBag.js
bundle.js
script.js
```

---

## 備註 Notes

此專案目前使用 localStorage 儲存資料。
目前資料只會保存在目前裝置的瀏覽器中。

This project currently uses localStorage for persistence.
Data is stored only in the current browser/device.

```
```
