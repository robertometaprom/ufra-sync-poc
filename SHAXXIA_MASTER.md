# SHAXXIA MASTER

Last updated: 2026-09-06

## 1. Project identity

SHAXXIA is a separate ecommerce project from Metaprom AI. Do not touch `robertometaprom/metaprom-clean` or the Metaprom AI Vercel project unless explicitly requested.

Customer-facing brand:
- SHAXXIA
- PARFUMS & BEAUTY
- Customer advisor: SAX
- SAX tagline: `Tu asesora personal de perfumes y belleza`
- Marketing line: `¿No sabes cuál elegir? Pregúntale a SAX.`

Current production URL:
- https://ufra-sync-poc.vercel.app

GitHub:
- Repo: `robertometaprom/ufra-sync-poc`
- Branch: `main`

Vercel:
- Project: `ufra-sync-poc`
- GitHub integration auto-deploys from `main`
- Important Hobby-plan constraint: avoid adding unnecessary standalone `api/*.js` functions. A prior standalone Stripe webhook pushed the deployment over the function limit. Prefer consolidating behavior into existing functions.

## 2. Architecture

Commercial architecture:

`SUPPLIER -> CONNECTOR -> NORMALIZED CATALOG -> PRICING ENGINE -> STOREFRONT -> ORDER ENGINE -> LIVE SUPPLIER VERIFICATION -> FULFILLMENT`

Core principles:
- Own database is the fast search/index layer.
- Supplier remains source of truth for current supplier availability and cost.
- Customer search must use the local DB, not live supplier calls.
- Before accepting an order/payment, re-verify supplier SKU availability and current cost live.
- If sold out: block purchase.
- If supplier cost changed materially: revalidate sale price before accepting the order.
- Architecture should remain multi-provider / multi-store ready.

Supplier #1:
- UFRA / Universo de Fragancias
- Public site: https://www.ufra.com.mx

Future fulfillment provider #1:
- PyeM
- https://www.pyem.com.mx/
- Shipping/freight integration can be added later and should be recalculated server-side before payment.

## 3. Supabase

Separate Supabase project:
- Name: `UFRA Commerce`
- Project ID: `yfbuxelsdpucmtxnuazv`
- Region: `us-west-1`
- URL: `https://yfbuxelsdpucmtxnuazv.supabase.co`

Important: never place service-role keys, Google client secrets, Stripe secrets, webhook secrets, or other private credentials in this file or in source control.

Safe public client key currently used by storefront auth:
- `sb_publishable_Oj2nv9h1zLVuiBqEndPgLg_0P64QJhq`

Primary tables:
- suppliers
- stores
- products
- supplier_products
- store_suppliers
- pricing_rules
- store_products
- sync_runs
- fulfillment_providers
- orders
- order_items
- product_images

All relevant tables have RLS enabled.

Known IDs:
- Store ID: `89499b09-a64f-430e-9514-b4af3a229cc6`
- UFRA supplier ID: `0f26408c-1076-42e7-833e-5357cda92625`
- Supplier slug: `ufra`
- Store slug: `ufra-commerce`

Customer-order security state:
- `orders.user_id uuid` links authenticated orders to `auth.users(id)`.
- Index: `orders_user_id_created_at_idx`.
- RLS policy `customers_select_own_orders` allows authenticated users to SELECT only rows where `auth.uid() = user_id`.
- `order_items` intentionally has no customer SELECT policy because it contains `supplier_cost_snapshot` and supplier cost must never be exposed.
- Backend order reads for customer UI also apply an explicit `user_id` filter and return safe summary fields only.

## 4. Catalog state

Known-good catalog state:
- 1,693 products
- 1,693 supplier_products
- 1,693 distinct supplier SKUs
- 1,693 store_products
- Product gallery backfill complete for all 1,693 products
- Each product has 3-9 images
- Average gallery size about 3.81 images
- No duplicate gallery groups
- 1,650 / 1,693 products have `supplier_list_price`
- 43 missing supplier list price; not currently blocking

Customer visibility floor:
- Sale price <= 300 MXN: hidden
- Sale price >= 301 MXN: visible

Known counts at last validation:
- 185 in-stock products <= 300 hidden
- 610 in-stock products 301-900 visible

Pricing:
- Global multiplier: 1.35
- Round sale price up to nearest 10 MXN
- Compare-at price only if supplier list price >= sale price * 1.10
- Customer-facing APIs must never expose supplier cost / supplier_price

Desired filters:
- Hombre / Mujer / Unisex
- Marca
- EDT / EDP / Parfum
- Size
- Price
- Availability

## 5. SAX advisor

SAX is the female customer-facing advisor. Do not expose the internal term `Director` to customers.

Current server implementation:
- `api/director.js`
- Search helper: `api/director-search.js`

Known-good recommendation behavior:
- Real catalog products only
- Brand/product availability preflight exists for explicit availability queries
- Style/olfactory descriptors such as `floral`, `dulce`, `fresco`, `elegante`, `vainilla`, etc. must NOT be passed as literal `q` search terms because `api/director-search.js` uses literal substring matching.
- For style recommendations, SAX should search by gender, budget, type/segment, then reason over returned real products.
- Short follow-ups such as `dulce` or `cualquiera` should preserve prior gender/budget context.

Known-good SAX commits:
- `61a5c5adef9adc4ceb64f3c236cb3a07935e6afc` — availability preflight for brand/product queries
- `da25c617a0d71db6df3fc68a95d1e6dc12072eb3` — director maxDuration 60s
- `8d321e4fa399182dcd1a9510b0e3332e30723891` — style-descriptor search fix; user validated as good

Do not casually disturb `api/director.js`; latest style recommendation state is known-good.

Known UX issue not yet prioritized:
- SAX may emit Markdown `**` while UI renders text with `textContent`, so literal markdown can appear. Safest future fix is prompt SAX not to emit Markdown; do not blindly switch to unsafe innerHTML.

## 6. SAX two-pane UX

Goal: customer reads downward naturally; product cards must not push conversation text upward.

Current design:
- Upper pane: conversation `.sax-feed`, independently scrollable
- Lower pane: `.sax-recommendations`, independently scrollable
- Latest recommendation cards are moved out of conversation into lower pane
- Desktop SAX opens expanded

Relevant commits:
- `b7eb380b8bfbc16cc40ad490a4ee24e99c468e2f` — initial two-pane architecture
- `dd8ceb3e3eea73b999c7a7f824db2990eacac15d` — removed conversation repositioning
- `e40768ffa5cbd24df69d2ef59b6ed8064ed68b09` — restored latest-message downward scroll; user reported it as very good

If future long assistant answers show only the bottom, refine scroll behavior to show the top of the new assistant bubble while never scrolling upward relative to current position.

## 7. Root storefront / api/home.js

`api/home.js` fetches `/index.html`, injects runtime CSS/JS, and serves the storefront root.

Important prior routing issue:
- Login changes in `api/home.js` were deployed but not visible because `/` was effectively serving static index behavior instead of the injected home handler.
- This was fixed by forcing root `/` through `api/home`.

Relevant routing fix:
- `4d75edaec7c41cda39937bdbfbd9f6c9208e87df`

Important guardrail:
- `index.html` is huge because it contains an embedded SAX image as a compressed data URI.
- Never replace it with placeholder content.
- Prior accidental corruption commit: `d7a89ff6d77623ea4bb235d693d3c4892bbf273d`
- It was reverted to known-good state immediately.
- Prefer modifying runtime injection in `api/home.js` when possible; if editing `index.html`, fetch the complete current file first and make a surgical replacement.

## 8. Authentication — CURRENTLY WORKING

Auth is implemented through Supabase Auth and currently supports:
- Email + password signup/login
- Email confirmation
- Customer display name
- Google login
- Identity linking between email and Google when the same verified email is used

Storefront behavior:
- Header shows customer name, not email.
- Existing account can edit/save its display name.
- Signed account modal includes `Mis pedidos`.
- Client session stored locally by storefront auth runtime under `shaxx_auth_v1`.
- `window.SHAXXIA_AUTH` exposes access-token/user helpers on the root storefront.

Important commits:
- `388dbbb13ab7300c45e7acbe4958111a52c507b1` — initial email/password login implementation
- `9ac2181140d12b6384a9dfe19fdb4119c0efdbe6` — customer name handling and explicit confirmation redirect
- `98ceef53c4868504337b9ef93b22c4ebeb3df452` — Google login UI/flow
- `7efcba264d5c706c21a7cd46357a6d74a35bf5fd` — added `Mis pedidos` to signed account UI

Google OAuth configuration:
- Google Cloud project: `SHAXXIA`
- OAuth client: `SHAXXIA Web`
- Authorized JavaScript origin: `https://ufra-sync-poc.vercel.app`
- Authorized Google redirect URI: `https://yfbuxelsdpucmtxnuazv.supabase.co/auth/v1/callback`
- Google provider enabled in Supabase Auth
- Supabase URL Configuration was corrected from localhost to production storefront
- Site URL: `https://ufra-sync-poc.vercel.app`
- Redirect allow list includes production storefront path(s)

Google login validation on 2026-09-06:
- Full flow succeeded: SHAXXIA -> Google -> Supabase -> SHAXXIA
- Existing email user was linked instead of duplicated
- Supabase Authentication Users showed a single user with both `Email` and `Google` providers

Do not store OAuth Client Secret in this master. Google client secrets remain managed in Google Cloud and Supabase dashboard.

## 9. Stripe / checkout — TEST MODE WORKING

Separate Stripe account/context is used for SHAXXIA. Test mode has been validated.

Current architecture:
- `api/create-checkout-session.js` handles both checkout-session creation and Stripe webhook behavior in the same function due Vercel Hobby function limit.

Webhook endpoint:
- `https://ufra-sync-poc.vercel.app/api/create-checkout-session`

Webhook events:
- `checkout.session.completed`
- `payment_intent.payment_failed`

Behavior:
- Order is created before Stripe as `pending_payment` / `pending`.
- Supplier stock and cost are revalidated live before order creation.
- Stripe session total is reconstructed server-side from persisted order items.
- Webhook marks successful order `paid` / `paid`.
- Failed payment intent can mark `payment_status=failed`.
- Authenticated orders require the same verified Supabase identity before a Stripe session can be created.
- Guest orders remain supported with `user_id = null`.

Relevant commits:
- `9134ee4` — added standalone webhook; deployment failed due function limit
- `eadf733` — consolidated Stripe webhook into checkout endpoint
- `04e88e2` — removed standalone webhook; deployment returned Ready
- `45efc060c513c50b346cd3e8e967494f89fa827f` — checkout success page updated for automatic webhook messaging
- `2f8c1fd913a0ab53ad0521ea288285906d100291` — protected authenticated order checkout
- `dc0c4b7c5f2e928901a53e344f19ee6a56661b56` — checkout sends same authenticated Bearer token into Stripe-session creation; Vercel success

Do not create another standalone Stripe webhook API function unless plan limits change or an existing function is removed deliberately.

## 10. Customer orders / Mis pedidos — P0 COMPLETE

Completed on 2026-09-06.

Implementation:
- Authenticated order creation sends Supabase Bearer access token from checkout.
- Backend validates token against Supabase Auth before assigning identity.
- `orders.user_id` stores verified Supabase UID.
- Guest checkout remains supported and stores `user_id = null`.
- Customer order list is served through authenticated `GET /api/create-order`.
- Customer query is explicitly filtered by verified `user_id`.
- Customer response exposes only safe order summary fields; it does not expose `order_items` or `supplier_cost_snapshot`.
- `orders` also has own-user SELECT RLS defense-in-depth.
- `order_items` intentionally remains inaccessible directly to customers.
- `orders.html` provides customer-facing `Mis pedidos`.
- Signed-in account UI links to `Mis pedidos`.
- Authenticated Stripe-session creation rejects access to an authenticated order owned by another account.

Relevant commits:
- `1723dd2487db33bb7292857bf1e614b23f2c1c41` — link orders to verified Supabase users and authenticated customer order list
- `f2b81bd8db73e57aa02b9309317cab9a0459778b` — send authenticated session with checkout order creation
- `1cfa4ec4c489efd0c0a712e58ef4d1b540a84275` — add customer `Mis pedidos` page
- `7efcba264d5c706c21a7cd46357a6d74a35bf5fd` — add `Mis pedidos` to account UI
- `2f8c1fd913a0ab53ad0521ea288285906d100291` — protect authenticated order checkout
- `dc0c4b7c5f2e928901a53e344f19ee6a56661b56` — pass authenticated headers into Stripe session creation

Manual production validation on 2026-09-06:
- Two separate customer accounts were used.
- Two separate Stripe test payments completed successfully.
- Each account saw its own order correctly.
- User reported both accounts / both payments working perfectly.
- Existing checkout and Stripe flow remained functional.

Product decision:
- Guest checkout is intentionally preserved to avoid blocking sales.
- Do not attach guest historical orders to an account merely by unverified email matching.
- Future optional reclaim flow may link historical guest orders only after verified ownership of the email/account.

## 11. Transactional email — REQUIRED BEFORE REAL LAUNCH, BLOCKED ON DOMAIN

Current state:
- No SHAXXIA custom production domain has been purchased/configured yet.
- Therefore do not add a temporary transactional-email implementation now unless explicitly requested.

Desired future behavior after domain exists:
- Configure a transactional sender such as `pedidos@<shaxxia-domain>`.
- Send order-confirmation email only after Stripe/webhook confirms `payment_status=paid`.
- Include order number, products, total, delivery address and link to order where applicable.
- Make delivery idempotent so Stripe webhook retries do not send duplicate emails.
- Store a delivery marker such as `confirmation_email_sent_at`.
- Later add shipment/tracking and delivered notifications.

This is especially important for guest checkout because guests may not use `Mis pedidos`.

## 12. Security / hard guardrails

1. Never commit secrets.
2. Never expose supplier cost in customer APIs or UI.
3. Never trust client-supplied prices or order totals.
4. Verify supplier availability/cost server-side before accepting payment/order.
5. Validate authenticated user access token server-side before assigning order ownership.
6. Customer must only be able to read their own orders.
7. Do not touch Metaprom AI infrastructure from SHAXXIA work.
8. Preserve last known-good commits before risky changes.
9. If a change breaks a critical flow, revert to the last known-good state instead of layering speculative patches.
10. Respect Vercel Hobby function-count limits.
11. Do not replace huge `index.html` blindly; it contains embedded binary-like data URI content.
12. Do not create customer access to `order_items` that could expose `supplier_cost_snapshot`.

## 13. Remaining launch dependencies / decisions

The main remaining blockers are now largely commercial/operational dependencies rather than missing core storefront code.

### A. Custom SHAXXIA domain
Required before public launch / brand polish.
After domain purchase:
- Connect domain to Vercel.
- Update Supabase Site URL / redirect allow list.
- Update Google OAuth authorized origin as required.
- Verify production HTTPS/routing.
- Configure transactional email domain/DNS.

### B. Shipping / freight model
Current checkout still shows shipping as a test value (`$0 prueba`).
Before real payments:
- Decide how shipping will work commercially.
- Determine whether PyeM or another provider exposes an API, rate table, portal workflow or manual fulfillment process.
- Define origin, destination, weight/dimensions, zones, free-shipping thresholds if any, and who absorbs/marks up freight.
- Once rules/source are known, calculate shipping server-side before Stripe and persist it on the order.

Do not implement freight logic until the operational model/API is known.

### C. Fulfillment / supplier handoff
Need to define the real post-payment operational flow:
- How SHAXXIA sends a paid order to UFRA/PyeM or other fulfillment party.
- Whether this is API, portal, email, CSV, manual process, or combination.
- How tracking number/carrier/status returns to SHAXXIA.
- What happens on supplier failure after payment.

Implementation depends on the provider process and should not be guessed.

### D. Real-payment launch controls
Stripe is currently validated in test mode.
Before taking real money:
- Confirm business/payment account readiness.
- Switch to live Stripe credentials deliberately.
- Configure/verify live webhook endpoint and secret.
- Run a controlled low-value live transaction.
- Confirm refunds/cancellations/failed-payment handling operationally.

Do not switch Stripe to live casually during unrelated work.

### E. Transactional email
Blocked until custom domain exists. See section 11.

### F. Customer/legal/store policies
Before public ecommerce launch, supply final business text/details for:
- Shipping policy and expected delivery times.
- Returns/refunds/cancellations.
- Privacy notice / personal-data handling.
- Terms and conditions.
- Contact/support channel.
- Business identity/contact details required for customer-facing operation.

These are content/business decisions first; implementation into the site is straightforward after copy is finalized.

## 14. Secondary future product/engineering items — NOT LAUNCH-BLOCKING RIGHT NOW

- Further supplier synchronization automation and monitoring.
- Improve SAX markdown output safely.
- Generalize brand availability preflight without breaking literal brand names such as `La Rive` or `El Ganso`.
- Expand `Mis pedidos` with product-level details/tracking after fulfillment data exists.
- Guest-order reclaim after verified account ownership, if desired.
- Google OAuth branding/verification polish when public launch requires it.
- Additional analytics/monitoring/customer-service tooling as business volume justifies it.

## 15. Session operating rule

When continuing development:
- Read this master first.
- Inspect current source before modifying anything.
- Prefer one smallest change at a time.
- Build/verify deployment after changes.
- Do not claim a feature works merely because deployment succeeded; validate the actual customer flow when possible.
- Do not invent operational integrations before supplier/shipping/provider rules are known.

# NEXT SESSION START HERE

**P0 CUSTOMER ORDERS / MIS PEDIDOS IS COMPLETE.**

Do not modify checkout/order/auth/Stripe merely for cleanup; the current state is known-good and manually validated with two accounts and two successful Stripe test payments.

Next development work is intentionally blocked on business inputs:
1. User provides SHAXXIA custom domain decision/purchase.
2. User provides shipping/freight operating model and any PyeM/provider API or process information.
3. User provides fulfillment handoff/tracking process.

Once one of those inputs is available, audit that specific integration read-only first and make the smallest safe implementation without disturbing the known-good order/Stripe flow.
