# POS Red Team Findings and Storage Safety Fix

Review baseline: merged PR #21, `origin/main` commit `343814e9afde28c295fd7fb92ecc2a9cd5ab40c0`.
The original review and `/tmp/creator-pos-redteam.AYBbfo/attack.cjs` were read before implementation. Five regression tests were added first and all five failed against that baseline. Product images, prices, bundle rules, and `ENABLE_PRICE_EDIT = false` are unchanged.

## Findings, Reproduction, and Resolution

| Finding | Original minimal reproduction and impact | Fix and regression coverage |
| --- | --- | --- |
| P1, introduced: failed startup migration destroys data | With existing orders and stock, fail a price/marker write once, then reload. The old unload handler saved default money=0, orders=[], stock=100 and customProducts=[]. | Strict reads distinguish absence from malformed/unreadable data. Initialization is not writable until all reads, validation and migration commit succeed. No unload/autosave writes remain. Migration has one commit point. Tests cover every legacy read, canonical reads, transient/persistent writes, reload and retry. |
| P1, pre-existing: checkout retry duplicates the sale | Add a 900 full set, fail stock storage, retry checkout: money=1800, two orders, each member deducted twice. | Prepare a synchronous in-memory draft with rendering suppressed, restore prior live state, persist the complete envelope once, then publish the draft. Failure restores the cart, history, money and product stock together. Same path covers edit, refund, undo, reset and product admin changes. |
| P1, pre-existing: stale tabs oversell/lose orders | Open two tabs with one item left and checkout in both. Both succeed but only one order/revenue survives shared-key overwriting. | Exclusive native Web Lock held for the writer session. Other tabs have disabled controls and guarded storage entry points. Close/pagehide/release relinquishes ownership; retry and persisted pageshow reacquire then reload current state before enabling controls. Unsupported locks fail closed. |
| P2, introduced: legacy lucky charm misses discount on edit | Edit an old acrylic_stand/好運守 sale, add 伊布御守 and 火伊布御守: 360 instead of 300. | Normalize only the editable top-level legacy charm copy to current omamori price/discount metadata. Stored original items and original total remain unchanged; status/replacement links change only after successful commit. Cancellation and failed saves preserve history. |
| P2, introduced: invalid migration marker skips migration | With old prices 99/250, markers `garbage`, `NaN`, or `{}` cause `NaN < 1` to be false indefinitely. | Validate missing, malformed, negative and fractional versions as not migrated. Recognized completed versions preserve saved prices. Valid future price versions and unsupported schema versions block all writes without downgrading. |

Functions involved: `loadLocalData`, `readStoredState`, `validateStoredState`, `readMigrationVersion`, `persistState`, `commitLocalChange` in `storage.js`; session ownership in `session.js`; `editSale` and transaction wrappers in `sales.js`; product admin transaction wrappers in `productAdmin.js`.

## Consistency Contract

The sole authoritative key is `creatorPOS_state`, with schema version, revision, price migration version, money, salesLog, stock, prices and customProducts. Every durable operation writes this entire JSON value with one synchronous `localStorage.setItem`. There is no sequence of per-field writes to recover, no separate migration-marker write and no mirror-key updates. A successful call commits all fields; a failed call leaves the previous value intact. Before committing, the writer also compares the current serialized value with its last observed value; unexpected external changes disable writes until reload.

Existing business operations execute as a synchronous draft with `renderAll` suppressed. A snapshot restores the previous live state before persistence. The draft is published only after successful storage. On exception the previous live state and working cart remain available for retry. A crash after the single durable write is recovered by reading that complete committed envelope on restart; an old uncommitted cart is not reloaded, preventing replay. The browser's native storage error contract is relied on; this is not a guarantee against hardware loss, user-cleared browser storage or an extension modifying data.

Initialization reads and validates all old data before any write. It combines legacy prices and their migration marker in the same envelope transaction. Migration failure leaves every legacy key unchanged, leaves the new key absent/unchanged, disables operations and displays retry/release controls. Repeated successful loads do not overwrite user prices. Original historical totals are copied, not recalculated at startup.

Web Locks coordinate contexts sharing the same origin/storage bucket; a localStorage flag is not used as a mutex. The writer holds `creatorPOS:writer` through an unresolved promise. A losing `ifAvailable` request explicitly reports locked state. There is no lock stealing. The writer releases on `pagehide`, explicit release or browser context destruction. A blocked/stale tab must explicitly retry; it cannot publish its old cart. Restored pages reacquire ownership and initialize again. No automatic or unload writes exist.

Specifications: [Web Locks](https://w3c.github.io/web-locks/) and [HTML Web Storage](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface). Web Locks requires a supported secure context; use HTTPS or localhost. Current browser support is feature-detected rather than assumed; missing/denied support blocks writes with a visible error. Chromium is exercised by the browser suite; Firefox/Safari were not executed here.

## Compatibility and Deployment Checklist

- Old per-field keys are retained verbatim as the pre-migration source. Once `creatorPOS_state` exists, they are not used as current transaction data. Unknown unrelated localStorage settings are neither cleared nor rewritten. Unknown legacy price entries are retained in the envelope.
- Do not revert to a pre-envelope build or remove only the envelope key after new sales: that old build would read stale legacy records. A rollback requires exporting/migrating the latest envelope, not merely deploying old JavaScript.
- Before deployment, finish active sales and close **all old-version tabs/windows**, then load the new version once. Old code does not participate in Web Locks and cannot be retroactively fenced. Do not run old and new releases side by side. This PR does not deploy automatically from its feature branch.
- All script query versions are updated together to avoid loading cached old script contracts into the new HTML. Existing open documents still require a full reload; this is not a service-worker application.
- Quota failure may need freeing unrelated browser/device space; never solve initialization failure by clearing POS data. An envelope duplicates legacy data during migration, so enough room is required for the new full record. A full snapshot is appropriate for this existing small offline POS, not an unlimited audit store.
- Valid-but-internally-inconsistent records left by earlier broken releases cannot be reconstructed automatically. This fix preserves them and does not invent missing historical orders.
- There is no cloud synchronization or multi-device mutual exclusion. Separate profiles/private sessions/devices have separate local stores. This fix intentionally supports one writable tab per storage bucket.
- CSV export remains available but is not a full backup/restore mechanism. No import feature was added. Browser storage remains device-local; retaining legacy keys is not an external backup.
- The original price editor stays disabled. Tests call the existing admin function directly to confirm that saved price changes survive restarts without exposing that UI.

## Repeatable Validation

Install development dependencies with `npm ci`, then `npx playwright install chromium` if Chromium is not installed.

```sh
npm test
npm run test:browser
git diff --check
```

`tests/storage-safety.test.cjs` includes the five failing-before/fixed-after regression cases, transient/persistent fault injection for reads and the single write point, all durable business mutations, malformed/future data, legacy history cancellation, revision mismatch, stock boundaries and an independent 3,780-case pricing oracle. `tests/omamori.test.cjs` retains the original seven pricing, stock, image and migration scenarios, adapted to the new authoritative storage format.

`tests/storage-browser.cjs` starts a temporary localhost HTTP server on a random port, launches a fresh isolated Chromium context for each scenario and closes both afterward. It never opens the production site or the user's existing browser profile. It covers migration failure/reload, permanent failure, checkout retry/double-click/reload, real simultaneous Web Locks acquisition, locked direct write entry points, stale-tab handoff, close/reload, persisted-pageshow handling, old charm edit/cancel/commit, unsupported locks, future versions, malformed JSON, 52 image decodes, subpath serving and hidden price controls.

The persisted-pageshow test dispatches the lifecycle event to exercise recovery; it does not claim to force every browser's real BFCache eviction policy. No actual physical disk exhaustion, hardware power-loss simulation, production CDN validation or broad coupon/gashapon discount exploration was performed. These do not substitute for the executed quota/read failure injections.

Recorded result: `npm test` passed **20 tests**, including the original seven scenarios and the 3,780-case oracle. `npm run test:browser` passed all browser scenarios. All root JavaScript syntax checks and `git diff --check` passed. Checkout drafts are not persisted across a reload/ownership handoff, matching the existing unsaved-cart behavior; only completed transactions are durable.

## Result

All five reported defects are covered by passing regression tests. In the tested scope no blocking recurrence remains. The recommendation for this repair is **review the PR, then deploy under the old-tab closure and no-downgrade precautions above**. This work only creates a repair PR; merge and production deployment remain unperformed.
