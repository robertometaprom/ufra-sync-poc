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
- Client session stored locally by storefront auth runtime.
- `window.SHAXXIA_AUTH` exposes access-token/user helpers for future authenticated order linkage.

Important commits:
- `388dbbb13ab7300c45e7acbe4958111a52c507b1` — initial email/password login implementation
- `9ac2181140d12b6384a9dfe19fdb4119c0efdbe6` — added customer name handling and explicit confirmation redirect
- `98ceef53c4868504337b9ef93b22c4ebeb3df452` — added Google login UI/flow

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

## 9. Stripe / checkout

Separate Stripe account/context is used for SHAXXIA. Test mode has been validated.

Known test payment:
- 9,060 MXN test volume observed in Stripe

Current architecture:
- `api/create-checkout-session.js` handles both checkout-session creation and Stripe webhook behavior in the same function due Vercel Hobby function limit.

Webhook endpoint:
- `https://ufra-sync-poc.vercel.app/api/create-checkout-session`

Webhook events:
- `checkout.session.completed`
- `payment_intent.payment_failed`

Relevant commits:
- `9134ee4` — added standalone webhook; deployment failed due function limit
- `eadf733` — consolidated Stripe webhook into checkout endpoint
- `04e88e2` — removed standalone webhook; deployment returned Ready
- `45efc060c513c50b346cd3e8e967494f89fa827f` — checkout success page updated for automatic webhook messaging

Do not create another standalone Stripe webhook API function unless plan limits change or an existing function is removed deliberately.

## 10. Login implementation details

Current auth runtime lives in `api/home.js`.

It uses:
- Supabase project URL
- Supabase publishable key
- Local storage key `shaxx_auth_v1`
- Password grant for email login
- Signup endpoint for account creation
- Refresh token flow
- `/auth/v1/user` update for display name
- OAuth authorization flow for Google
- Google return token capture into the same local session representation

Future work must not assume auth is already linked to orders. Login works, but order ownership has not yet been completed.

## 11. Known-good user account validation

On 2026-09-06, Supabase Auth showed one customer account with:
- Display name: Roberto Valle
- Same email account linked to both Email and Google providers
- No duplicate Google-only user created

This validates Supabase automatic identity linking for the tested same-email flow.

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

## 13. Current open product/engineering work

### P0 — CUSTOMER ORDERS / MIS PEDIDOS

This is the exact next session starting point.

Goal:
1. Link each new order to the authenticated Supabase user UID.
2. Send the user's Supabase Bearer access token from the storefront/checkout flow.
3. Validate that token server-side before trusting user identity.
4. Persist authenticated user ID on the order record using a proper column/migration if needed.
5. Keep guest behavior explicit; do not silently assign orders to arbitrary emails.
6. Build `Mis pedidos` so authenticated customers can see only their own purchases.
7. Enforce ownership server-side / via RLS or equivalent secure query boundary.
8. Preserve existing checkout and Stripe behavior.
9. Avoid adding unnecessary new Vercel serverless functions.
10. Do not modify SAX unless required for this task.

Before implementation:
- Audit current `orders`, `order_items`, `api/create-order.js`, `api/create-checkout-session.js`, cart/checkout client code, and current RLS policies.
- Identify exact current order lifecycle and where order rows are created.
- Determine whether an authenticated user column already exists before adding one.
- Make the smallest safe change.

Acceptance criteria:
- Logged-in customer places an order and order row stores their verified Supabase UID.
- Server ignores/does not trust a client-provided UID without validating Bearer token.
- Same customer can later retrieve their own orders.
- A different authenticated user cannot retrieve those orders.
- Existing Stripe checkout remains functional.
- Build/deployment returns Ready.

## 14. Secondary future items

After P0 Customer Orders:
- Customer-facing `Mis pedidos` UI
- Shipping/freight integration with provider/courier rules/API
- Further supplier synchronization automation and monitoring
- PyeM fulfillment integration
- Improve SAX markdown rendering safely
- Generalize brand availability preflight without breaking literal brand names such as `La Rive` or `El Ganso`
- Custom production domain for SHAXXIA when ready
- Google OAuth branding/verification polish when public launch requires it

## 15. Session operating rule

When continuing development:
- Read this master first.
- Inspect current source before modifying anything.
- Prefer one smallest change at a time.
- Build/verify deployment after changes.
- Do not claim a feature works merely because deployment succeeded; validate the actual customer flow when possible.

# NEXT SESSION START HERE

Continue with **P0 — CUSTOMER ORDERS / MIS PEDIDOS**.

First action should be read-only audit of the existing order path and schema. Do not implement until the exact current order lifecycle, current columns, auth-token availability, and existing RLS are understood. Then make the smallest secure change to attach verified Supabase user identity to orders without breaking checkout or Stripe.
