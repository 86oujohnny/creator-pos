/*
money：目前總營收
currentSale：這一筆還沒結帳的商品
salesLog：今天已結帳的紀錄
luckyBagMode：現在是不是正在編輯福袋
luckyBagContents：目前這包福袋裡放了什麼
isResettingData：避免重置時 beforeunload 又偷偷存回舊資料 
*/
let money = 0; 
let currentSale = [];
let salesLog = [];
let luckyBagMode = false;
let luckyBagContents = [];
let isResettingData = false;
let gashaponMode = false;
let gashaponResults = [];