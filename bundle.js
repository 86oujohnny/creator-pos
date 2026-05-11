// ===== 計算銷售總額 =====
function calculateSaleTotal(items) {
  const fixedItems = items.filter(item => item.isFixedPrice);
  const normalItems = items.filter(item => !item.isFixedPrice);

  return (
    calculateGroupedItemsTotal(fixedItems) +
    calculateNormalItemsTotal(normalItems)
  );
}
// ===== 計算固定價格商品總和（例如福袋） =====
function calculateGroupedItemsTotal(items) {
  let total = 0;
  const groups = groupItemsByProduct(items);

  groups.forEach(group => {
    total += calculateQuantityBundleTotal(group);
  });

  return total;
}
// ===== 計算一般商品總和 =====
function calculateNormalItemsTotal(items) {
  let total = 0;
  const groups = groupItemsByProduct(items);

  groups.forEach(group => {
    total += applySpecialBundles(group);
    total += calculateQuantityBundleTotal(group);
  });

  return total;
}
// ===== 將商品依照 productId 分組 =====
function groupItemsByProduct(items) {
  const groups = {};

  items.forEach(item => {
    if (!groups[item.productId]) {
      groups[item.productId] = [];
    }

    groups[item.productId].push({ ...item });
  });

  return Object.values(groups);
}
// ===== 計算特殊組合優惠（例如伊布全套） =====
function applySpecialBundles(group) {
  let total = 0;
  const firstItem = group[0];

  if (!firstItem.specialBundles) {
    return total;
  }

  firstItem.specialBundles.forEach(bundle => {
    while (hasCompleteBundle(group, bundle)) {
      total += bundle.price;
      removeBundleItemsFromGroup(group, bundle);
    }
  });

  return total;
}
function hasCompleteBundle(group, bundle) {
  const groupVariants = group.map(item => item.variant);

  return bundle.variants.every(variantName =>
    groupVariants.includes(variantName)
  );
}
// ===== 移除已經計算過特殊組合優惠的商品 =====
function removeBundleItemsFromGroup(group, bundle) {
  bundle.variants.forEach(variant => {
    const index = group.findIndex(
      item => item.variant === variant
    );

    if (index !== -1) {
      group.splice(index, 1);
    }
  });
}
// ===== 計算數量優惠 =====
function calculateQuantityBundleTotal(group) {
  const firstItem = group[0];

  if (firstItem.bundleCount && firstItem.bundlePrice) {
    const bundleGroups = Math.floor(group.length / firstItem.bundleCount);
    const remainingItems = group.length % firstItem.bundleCount;

    return (
      bundleGroups * firstItem.bundlePrice +
      remainingItems * firstItem.singlePrice
    );
  }

  return group.length * firstItem.singlePrice;
}