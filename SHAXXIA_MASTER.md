# SHAXXIA MASTER

Last updated: 2026-09-09

## 1. Project identity

SHAXXIA is a separate ecommerce project from Metaprom AI. Do not touch `robertometaprom/metaprom-clean` or the Metaprom AI Vercel project unless explicitly requested.

Customer-facing brand:
- SHAXXIA
- PARFUMS & BEAUTY
- Customer advisor: SAX
- SAX tagline: `Tu asesora personal de perfumes y belleza`
- Marketing line: `¿No sabes cuál elegir? Pregúntale a SAX.`

Production:
- URL: `https://ufra-sync-poc.vercel.app`
- GitHub repo: `robertometaprom/ufra-sync-poc`
- Branch: `main`
- Vercel project: `ufra-sync-poc`
- GitHub integration auto-deploys `main`.
- Vercel Hobby guardrail: avoid unnecessary standalone `api/*.js` functions. Prefer extending existing functions.

## 2. Architecture

`SUPPLIER -> CONNECTOR -> NORMALIZED CATALOG -> PRICING ENGINE -> STOREFRONT -> ORDER ENGINE -> LIVE SUPPLIER VERIFICATION -> FULFILLMENT`

Core principles:
- Own database is the fast search/index layer.
- Supplier remains source of truth for current availability and cost.
- Customer search uses local DB, not live supplier calls.
- Before accepting an order/payment, re-verify supplier SKU availability and current cost live.
- Sold out => block purchase.
- Material supplier cost change => revalidate sale price.
- Keep architecture multi-provider / multi-store ready.

Supplier #1: UFRA / Universo de Fragancias (`https://www.ufra.com.mx`).
Future fulfillment provider #1: PyeM (`https://www.pyem.com.mx/`). Shipping/freight must be recalculated server-side before payment.

## 3. Supabase

Separate project:
- Name: `UFRA Commerce`
- Project ID: `yfbuxelsdpucmtxnuazv`
- Region: `us-west-1`

Primary tables include `suppliers`, `stores`, `products`, `supplier_products`, `store_suppliers`, `pricing_rules`, `store_products`, `sync_runs`, `fulfillment_providers`, `orders`, `order_items`, `product_images`.

Never place service-role keys, OAuth client secrets, Stripe secrets, webhook secrets, or other private credentials in this file/source control.

Customer-order security:
- `orders.user_id uuid` links authenticated orders to `auth.users(id)`.
- Index `orders_user_id_created_at_idx`.
- RLS policy `customers_select_own_orders` allows authenticated users to SELECT only their own orders.
- `order_items` intentionally has no customer SELECT policy because it contains `supplier_cost_snapshot`.
- Supplier cost must never be exposed to customers.
- Customer order backend also filters by verified `user_id` and returns safe summary fields only.

## 4. Catalog — CURRENT KNOWN-GOOD

The old 1,693-product state was incomplete because sync/audit targeted only Fragancias. Source was expanded to full UFRA catalog at `https://ufra.com.mx/categorias.html`, bringing Fragancias + Belleza into SHAXXIA.

Current verified state after full sync/backfills:
- `supplier_products`: **2,239**
- Full-catalog UFRA discovery confirmed through page 98; UFRA publishes no next page after 98.
- Main catalog source and auditor both use full catalog.
- Full sync previously processed 2,208 with 0 errors; subsequent catalog drift/current DB total is 2,239.

Relevant commits:
- `6b7505d1e0a282f70567e00681a8103626f42a63` — expand UFRA sync to full catalog
- `9d40fdcad379e75731536e5c2cddf7151d702c99` — audit full UFRA catalog
- `b09fd327795347316e38438cd36853866f917a42` — resumable catalog sync

Customer visibility floor remains:
- Sale price <= 300 MXN: hidden
- Sale price >= 301 MXN: visible

## 5. Pricing — CLOSED / KNOWN-GOOD

Active pricing rule:
- multiplier: **1.35**
- fixed markup: 0
- round sale price upward to nearest 10 MXN
- compare-at / normal price shown only when `supplier_list_price >= sale price * 1.10`

Current verified list-price state:
- Total supplier products: **2,239**
- Valid `supplier_list_price > supplier_price`: **2,185**
- Without valid list/discount pair: **54**
- Of those 54, **37 are Christian Dior; all 37 Dior products in current catalog lack a list-price pair**, strongly indicating supplier presentation/policy rather than a general parser failure.
- Remaining 17 are isolated products/brands.
- Do not invent a normal/list price. If no valid compare-at price exists, customer UI shows only `Precio`.

Customer-facing presentation:
- With valid compare-at: `Precio normal` + `Precio con descuento`.
- Normal price is NOT struck through.
- Without valid compare-at: `Precio` only.
- User explicitly approved this presentation in production.

UFRA parser lessons:
- Prefer visible labeled `Precio especial` for current supplier price.
- Prefer visible labeled `Precio habitual` for list price.
- Markup/structured-data fallbacks come second.
- Empty JSON-LD price must resolve to null, not zero.

Relevant commits:
- `f772f6e8a2f8f55713eda7b18c23341d52716215` — normalize UFRA special/list prices
- `1522c4de5dc169900bbb0661480edeaf1ae43a4b` — checkout live pricing prioritizes final/special price
- `5e64364e8a94111a600d9be274e7732e7d6d5fe9` — final parser priority / empty-price fix
- `4ef5e2d9b0ac90b827ec3043979e2b267d9e7c22` — safe targeted single-product sync
- `c5027d33b943f45f96b73d54038aaa479fcde066` — full-catalog list-price backfill
- `1d647423048fbf64c51865727aad3be334c06878` — storefront normal/discount labels
- `0c0ca522e080f1c9eaed0870a47bad34f23230c0` — product-detail normal/discount labels

Business rule: SHAXXIA pricing is based on captured UFRA supplier price and the active pricing rule. Any additional negotiated/volume supplier discount is operating margin/cushion and must NOT automatically lower customer price unless the business rule is explicitly changed later.

## 6. Product galleries — CLOSED / KNOWN-GOOD

Original 1,693-product fragrance catalog already had enriched galleries. The 546 products added by full-catalog expansion initially had no `product_images` rows.

`api/product-images.js` + `gallery-sync.html` were hardened so the backfill:
- skips products that already have galleries,
- fetches UFRA only for missing galleries,
- deduplicates source images,
- stores HD gallery images,
- remains checkpointed/restartable.

Backfill completion on 2026-09-09:
- Products reviewed: **2,239**
- Already had gallery: **1,693**
- New images found during run: **2,114**
- Run-level errors: 2
- Final DB gallery images: **8,571**
- Products with 2+ gallery images: **2,236**
- Products with exactly 1 gallery image: **1**
- Products with 0 gallery images: **2**
- Average gallery size: **3.83** images/product

Three residual exceptions:
- SKU `19066` ARMAF ODYSSEY MANDARIN SKY 200ML BODY MIST — 0 gallery rows
- SKU `1G5Y02000` ESTEE LAUDER BASE DE MAQUILLAJE DOUBLE WEAR STAY IN PLACE — 0 gallery rows
- SKU `1G5Y41000` ESTEE LAUDER DOUBLE WEAR 4C3 SOFTAN 30ML — 1 gallery row

These residual cases do not block launch; storefront can still use primary catalog image.

Relevant commits:
- `3906a8d48a98bb0b773c7e376596d3135ba1ca5a` — backend skips existing galleries
- `9eb4e3cc4dfe25f04e9c6ec505e185b591522cee` — missing-gallery backfill UI

## 7. Traditional storefront search — WORKING

- Visible storefront search searches the full visible catalog, not only current 24-product page.
- Matches product name, brand and supplier SKU.
- Case-insensitive and accent-insensitive.
- Search applies before pagination; pagination remains 24 products/page.
- Existing customer visibility/pricing rules remain enforced.
- No new Vercel serverless function added.

Relevant commits:
- `b563eddf632252b23281db11979fa9a0e2b1e115` — global catalog query
- `53d9c7e5c78d03530d813d4c7bf2f66d9f33c980` — storefront search wiring
- `22f575bac9d84639c35cbcaeb8eae03ecdbb3782` — visible header search
- `b457812a9aba2d73c862706636c93572ae8b1eaf` — Enter/click submit behavior

## 8. SAX advisor — KNOWN-GOOD

SAX is the female customer-facing advisor. Do not expose internal term `Director`.

Implementation:
- `api/director.js`
- `api/director-search.js`

Behavior:
- Real catalog products only.
- Explicit brand/product availability preflight exists.
- Style/olfactory descriptors such as floral/dulce/fresco/elegante/vainilla must not be passed as literal `q` terms because search helper uses literal substring matching.
- For style recommendations, search by gender/budget/type then reason over returned real products.
- Short follow-ups preserve prior context.

Known-good commits:
- `61a5c5adef9adc4ceb64f3c236cb3a07935e6afc`
- `da25c617a0d71db6df3fc68a95d1e6dc12072eb3`
- `8d321e4fa399182dcd1a9510b0e3332e30723891`
- Two-pane UX: `b7eb380b8bfbc16cc40ad490a4ee24e99c468e2f`, `dd8ceb3e3eea73b999c7a7f824db2990eacac15d`, `e40768ffa5cbd24df69d2ef59b6ed8064ed68b09`.

Known minor UX issue: SAX may emit Markdown `**` while UI uses `textContent`. Safest future fix is prompting SAX not to emit Markdown; do not switch blindly to unsafe innerHTML.

## 9. Root storefront guardrail

`api/home.js` fetches `/index.html`, injects runtime CSS/JS, and serves root.

Routing fix: `4d75edaec7c41cda39937bdbfbd9f6c9208e87df`.

Hard guardrail:
- Never replace `index.html` blindly or with placeholder content.
- Prior accidental corruption commit `d7a89ff6d77623ea4bb235d693d3c4892bbf273d` was reverted immediately.
- Prefer surgical runtime changes in `api/home.js`; if editing `index.html`, fetch complete current file first.

## 10. Authentication — WORKING

Supabase Auth supports:
- Email/password signup/login
- Email confirmation
- Customer display name
- Google login
- Identity linking between email and Google for same verified email

Storefront:
- Header shows customer name.
- Account can edit/save display name.
- Signed modal includes `Mis pedidos`.
- Session localStorage key: `shaxx_auth_v1`.
- `window.SHAXXIA_AUTH` exposes access-token/user helpers.

Important commits:
- `388dbbb13ab7300c45e7acbe4958111a52c507b1`
- `9ac2181140d12b6384a9dfe19fdb4119c0efdbe6`
- `98ceef53c4868504337b9ef93b22c4ebeb3df452`
- `7efcba264d5c706c21a7cd46357a6d74a35bf5fd`

Google OAuth production flow was manually validated 2026-09-06. Existing email user linked rather than duplicating.

## 11. Stripe / checkout — TEST MODE WORKING

Separate SHAXXIA Stripe context. Current endpoint `api/create-checkout-session.js` handles both checkout-session creation and webhook behavior due Vercel Hobby function limit.

Webhook endpoint: `https://ufra-sync-poc.vercel.app/api/create-checkout-session`
Events: `checkout.session.completed`, `payment_intent.payment_failed`.

Behavior:
- Order created before Stripe as pending.
- Supplier stock and cost revalidated live before order creation.
- Sale price revalidated from live UFRA final/special price.
- Stripe total reconstructed server-side from persisted order items.
- Webhook marks successful order paid.
- Authenticated orders require same verified Supabase identity for Stripe session.
- Guest orders remain supported with `user_id = null`.

Relevant commits:
- `eadf733` — consolidate webhook
- `04e88e2` — remove standalone webhook / restore deploy
- `45efc060c513c50b346cd3e8e967494f89fa827f` — checkout success messaging
- `2f8c1fd913a0ab53ad0521ea288285906d100291` — protect authenticated order checkout
- `dc0c4b7c5f2e928901a53e344f19ee6a56661b56` — authenticated Bearer token into Stripe session

Do not create another standalone Stripe webhook function unless plan/function constraints deliberately change.

## 12. Customer orders / Mis pedidos — P0 COMPLETE

Completed and manually validated 2026-09-06.

- Authenticated checkout sends Supabase Bearer token.
- Backend validates token before assigning `orders.user_id`.
- Guest checkout remains supported with `user_id = null`.
- Authenticated `GET /api/create-order` serves customer order list.
- Query explicitly filters by verified `user_id`.
- Customer response excludes supplier cost/order-item secrets.
- Own-user RLS is defense-in-depth.
- `orders.html` provides `Mis pedidos`.
- Authenticated Stripe-session creation rejects authenticated orders belonging to another identity.

Relevant commits:
- `1723dd2487db33bb7292857bf1e614b23f2c1c41`
- `f2b81bd8db73e57aa02b9309317cab9a0459778b`
- `1cfa4ec4c489efd0c0a712e58ef4d1b540a84275`
- `7efcba264d5c706c21a7cd46357a6d74a35bf5fd`
- `2f8c1fd913a0ab53ad0521ea288285906d100291`
- `dc0c4b7c5f2e928901a53e344f19ee6a56661b56`

Manual validation: two separate customer accounts, two Stripe test payments, each account saw its own order correctly.

Guest-order rule: never reclaim/link historical guest orders merely by unverified email matching. Future reclaim requires verified ownership.

## 13. Transactional email — REQUIRED BEFORE LIVE LAUNCH

Blocked until custom production domain exists.

After domain:
- Configure transactional sender such as `pedidos@<domain>`.
- Send confirmation only after webhook confirms `payment_status=paid`.
- Include order number, products, total, delivery address and order link where applicable.
- Make idempotent; store marker such as `confirmation_email_sent_at`.
- Later add shipment/tracking/delivered notifications.

## 14. Security / hard guardrails

1. Never commit secrets.
2. Never expose supplier cost in customer APIs/UI.
3. Never trust client-supplied prices or totals.
4. Verify supplier availability/cost server-side before accepting order/payment.
5. Validate auth access token server-side before assigning order ownership.
6. Preserve guest checkout.
7. Do not infer authenticated identity from email alone.
8. Keep `order_items.supplier_cost_snapshot` inaccessible to customer direct SELECT.
9. Avoid unnecessary Vercel serverless functions.
10. Preserve the last known-good critical flows. If a risky change breaks generation/order/checkout/payment or another critical flow, revert immediately to the exact known-good commit/deployment rather than stacking speculative fixes.
11. Do not touch Metaprom AI from SHAXXIA work unless explicitly requested.

## 15. Sync/backfill operational notes

Main catalog sync:
- `sync.html`
- browser-orchestrated batches
- resumable checkpoint in localStorage
- UFRA can intermittently return 502; successful prior batches remain committed.

List-price backfill:
- `list-prices-sync.html`
- backend `api/list-prices.js`
- full catalog source `https://ufra.com.mx/categorias.html`
- completed through UFRA page 98.

Gallery backfill:
- `gallery-sync.html`
- backend `api/product-images.js`
- skips existing galleries and is resumable.
- completed across all 2,239 products on 2026-09-09.

## 16. Launch dependencies / roadmap

Core catalog, pricing, search, galleries, auth, customer orders and Stripe TEST are now substantially working.

Remaining launch dependencies, in practical order:
1. **Shipping/freight model** — checkout currently uses `$0 prueba`; define real customer shipping rules and server-side calculation. PyeM is the intended first fulfillment/shipping provider unless business decision changes.
2. **Fulfillment handoff + tracking** — define how paid SHAXXIA order becomes supplier/fulfillment shipment and how tracking returns to customer.
3. **Custom domain** — purchase/configure SHAXXIA production domain.
4. **Stripe LIVE** — switch only after shipping/fulfillment and domain readiness are understood; preserve TEST known-good until then.
5. **Transactional email** — configure after domain; paid-only, idempotent confirmation and later tracking notifications.
6. **Policies/legal/support** — shipping, returns/refunds, privacy, terms, contact/support.

Secondary/non-blocking:
- automate/monitor catalog sync cadence
- SAX Markdown polish
- richer `Mis pedidos`
- verified guest-order reclaim
- analytics
- broader filters

## NEXT SESSION START HERE

### P0 SHIPPING / FREIGHT — READ-ONLY FIRST

Do not modify checkout or Stripe immediately.

First:
1. Audit current checkout/order schema and identify exactly where shipping is currently represented as `$0 prueba`.
2. Audit any existing `fulfillment_providers` / shipping-related schema and code.
3. Determine what data SHAXXIA already captures for destination/address and what is available before Stripe session creation.
4. If PyeM integration credentials/API documentation are available, audit them read-only before designing integration. If not available, define the smallest safe shipping-rule layer that can work now and later be replaced by live PyeM quoting.
5. Preserve supplier live verification, order totals, guest checkout, authenticated ownership and Stripe TEST known-good.

Only after the current lifecycle is understood should shipping calculation be changed. Make the smallest safe implementation and keep shipping server-authoritative.