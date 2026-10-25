// ===== 計算銷售總額 =====
function calculateSaleTotal(items) {
  const fixedItems = items.filter(item => item.isFixedPrice);
  const normalItems = items.filter(item => !item.isFixedPrice);

  const subtotal =
    calculateGroupedItemsTotal(fixedItems) +
    calculateNormalItemsTotal(normalItems);

  const couponDiscount = calculateCouponDiscount(items);

  return Math.max(0, subtotal - couponDiscount);
}

function calculateCouponEligibleTotal(items, excluded = []) {
  return getCouponPriceSlots(items).filter(slot => isCouponSlotEligible(slot, excluded))
    .reduce((sum, slot) => sum + slot.capacity, 0);
}

function isCouponSlotEligible(slot, excluded) {
  return !["gashapon", "lucky_bag", "raffle"].includes(slot.productId) &&
    !slot.eligibilityItems.some(item => isExcludedFromCoupon(item, excluded));
}

function isExcludedFromCoupon(item, excluded) {
  return excluded.some(excludedValue =>
    item.productId === excludedValue ||
    item.name === excludedValue ||
    item.variant === excludedValue ||
    item.type === excludedValue
  );
}

function calculateCouponDiscount(items) {
  return allocateCouponDiscount(items).discount;
}

// Price promotions once, before testing coupon eligibility. Removing excluded
// variants and repricing the remainder would incorrectly discard their discount.
function getCouponPriceSlots(items) {
  const slots = [];
  function distribute(group, amount, parents = []) {
    group = [...group].sort((a, b) => JSON.stringify([a.productId, a.name, a.variant, a.type, a.singlePrice])
      .localeCompare(JSON.stringify([b.productId, b.name, b.variant, b.type, b.singlePrice])));
    const weights = group.map(item => Math.max(0, Number(item.singlePrice) || 0));
    const sum = weights.reduce((a, b) => a + b, 0);
    let allocated = 0;
    group.forEach((item, index) => {
      const capacity = index === group.length - 1 ? amount - allocated :
        amount * (sum ? weights[index] / sum : 1 / group.length);
      allocated += capacity;
      // Explicit sets share their price across member snapshots, never their
      // retail value; raffle/lucky-bag contents do not earn separate revenue.
      if (item.isSpecialBundle && Array.isArray(item.contents) && item.contents.length) {
        const members = item.contents.map(member => ({ ...item, ...member,
          productId: item.productId, isSpecialBundle: false, contents: null }));
        distribute(members, capacity, [...parents, item]);
      } else slots.push({ item, productId: item.productId, capacity, eligibilityItems: [...parents, item] });
    });
  }
  for (const fixed of [false, true]) {
    for (const group of groupItemsByProduct(items.filter(item => !!item.isFixedPrice === fixed))) {
      const remaining = [...group];
      if (!fixed) {
        for (const bundle of group[0].specialBundles || []) {
          while (hasCompleteBundle(remaining, bundle)) {
            const members = bundle.variants.map(variant => {
              const index = remaining.findIndex(item => item.variant === variant);
              return remaining.splice(index, 1)[0];
            });
            distribute(members, bundle.price);
          }
        }
      }
      const normal = remaining.filter(item => !item.isSpecialBundle);
      remaining.filter(item => item.isSpecialBundle).forEach(item => distribute([item], item.singlePrice));
      if (normal.length) distribute(normal, calculateQuantityBundleTotal(normal));
    }
  }
  return slots;
}

function allocateCouponDiscount(items, limit = Infinity) {
  const coupons = items.map(item => item.gashaponResult).filter(result => result?.rewardType === "coupon");
  coupons.forEach(coupon => {
    if (typeof coupon.maxValue !== "number" || !Number.isFinite(coupon.maxValue) || coupon.maxValue < 0 ||
        (coupon.excluded !== undefined && (!Array.isArray(coupon.excluded) ||
          coupon.excluded.some(value => typeof value !== "string")))) {
      throw new Error("抵用券資料無效，請修正面額與排除品項後再結帳");
    }
  });
  const key = item => JSON.stringify([item.productId, item.name, item.variant, item.type, item.singlePrice]);
  const slots = getCouponPriceSlots(items).sort((a, b) => key(a.item).localeCompare(key(b.item)) || a.capacity - b.capacity);
  const orderedCoupons = coupons.map(coupon => ({ ...coupon, excluded: [...new Set(coupon.excluded || [])].sort() }))
    .sort((a, b) => JSON.stringify(a.excluded).localeCompare(JSON.stringify(b.excluded)) || a.maxValue - b.maxValue);
  const graph = Array.from({ length: 2 + orderedCoupons.length + slots.length }, () => []);
  const source = 0, sink = graph.length - 1;
  function edge(from, to, capacity) {
    const forward = { to, capacity, flow: 0, reverse: graph[to].length };
    const backward = { to: from, capacity: 0, flow: 0, reverse: graph[from].length };
    graph[from].push(forward); graph[to].push(backward);
    return forward;
  }
  function send(arc, amount) {
    arc.flow += amount;
    graph[arc.to][arc.reverse].flow -= amount;
  }
  const supply = orderedCoupons.map((coupon, i) => edge(source, i + 1, coupon.maxValue));
  const demand = slots.map((slot, j) => edge(1 + orderedCoupons.length + j, sink, slot.capacity));
  const links = orderedCoupons.map((coupon, i) => slots.map((slot, j) => isCouponSlotEligible(slot, coupon.excluded)
    ? edge(i + 1, 1 + orderedCoupons.length + j, Math.min(coupon.maxValue, slot.capacity)) : null));
  // Preserve proportional attribution when feasible. Residual paths below can
  // undo these choices, so a broad coupon cannot strand a restricted one.
  let discount = 0;
  orderedCoupons.forEach((coupon, i) => {
    const available = slots.map((slot, j) => links[i][j] ? demand[j].capacity - demand[j].flow : 0);
    const total = available.reduce((a, b) => a + b, 0);
    const amount = Math.min(coupon.maxValue, total, Math.max(0, limit - discount));
    if (!total || !amount) return;
    available.forEach((capacity, j) => {
      if (!capacity) return;
      const share = amount * (capacity / total);
      send(supply[i], share); send(links[i][j], share);
      send(demand[j], share);
      discount += share;
    });
  });
  // Edmonds-Karp on the residual graph: maximum feasible discount, including
  // alternating paths which reassign earlier coupons. No exclusion-key pools.
  while (discount < limit) {
    const previous = Array(graph.length).fill(null), queue = [source];
    previous[source] = [];
    for (let q = 0; q < queue.length && !previous[sink]; q++) {
      const from = queue[q];
      graph[from].forEach(arc => {
        if (!previous[arc.to] && arc.capacity - arc.flow > 0) {
          previous[arc.to] = [from, arc]; queue.push(arc.to);
        }
      });
    }
    if (!previous[sink]) break;
    let amount = limit - discount;
    for (let node = sink; node !== source;) {
      const [from, arc] = previous[node]; amount = Math.min(amount, arc.capacity - arc.flow); node = from;
    }
    for (let node = sink; node !== source;) {
      const [from, arc] = previous[node]; send(arc, amount); node = from;
    }
    discount += amount;
  }
  const allocations = slots.map((slot, j) => ({ ...slot, discount: demand[j].flow }));
  return { discount: allocations.reduce((sum, slot) => sum + slot.discount, 0), allocations,
    couponUsage: supply.map((arc, i) => ({ maxValue: orderedCoupons[i].maxValue,
      excluded: orderedCoupons[i].excluded, used: arc.flow,
      allocations: links[i].map(arc => arc ? arc.flow : 0) })) };
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
  let total = 0;

  group.forEach(item => {
    if (item.isSpecialBundle) {
      total += item.singlePrice;
    }
  });

  const normalGroup = group.filter(item => !item.isSpecialBundle);

  if (normalGroup.length === 0) {
    return total;
  }

  const firstItem = normalGroup[0];

  if (firstItem.bundleCount && firstItem.bundlePrice) {
    const bundleGroups = Math.floor(normalGroup.length / firstItem.bundleCount);
    const remainingItems = normalGroup.length % firstItem.bundleCount;

    return (
      total +
      bundleGroups * firstItem.bundlePrice +
      remainingItems * firstItem.singlePrice
    );
  }

  return total + normalGroup.length * firstItem.singlePrice;
}
