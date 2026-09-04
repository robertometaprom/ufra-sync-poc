const CATEGORY_URL = 'https://ufra.com.mx/categorias/fragancias.html';
const PAGE_SIZE = 24;
const CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 12000;

function decodeHtml(s = '') { return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
function stripHtml(s = '') { return decodeHtml(s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); }
function moneyToNumber(value = '') { const n = Number(String(value).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; }
function findProductLinks(html) {
  const links = [], seen = new Set();
  const re = /<a[^>]+class=["'][^"']*product-item-link[^"']*["'][^>]+href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) && links.length < PAGE_SIZE) { const url = decodeHtml(m[1]); if (!seen.has(url)) { seen.add(url); links.push(url); } }
  return links;
}
function findCatalogTotal(html) {
  const matches = [...html.matchAll(/Artículos\s+[\d,]+-[\d,]+\s+de\s+([\d,]+)/gi)];
  if (!matches.length) return null;
  return Number(matches[0][1].replace(/,/g, '')) || null;
}
function parseJsonLd(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) { try { const parsed = JSON.parse(match[1].trim()); const items = Array.isArray(parsed) ? parsed : [parsed]; for (const item of items) if (item && (item['@type'] === 'Product' || item.name) && item.offers) return item; } catch {} }
  return null;
}
function firstMatch(html, patterns) { for (const re of patterns) { const m = html.match(re); if (m?.[1]) return stripHtml(m[1]); } return null; }
function parseProduct(html, sourceUrl) {
  const ld = parseJsonLd(html), offers = Array.isArray(ld?.offers) ? ld.offers[0] : ld?.offers;
  const name = ld?.name || firstMatch(html, [/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i, /<span[^>]+data-ui-id=["']page-title-wrapper["'][^>]*>([\s\S]*?)<\/span>/i, /<h1[^>]*>([\s\S]*?)<\/h1>/i]);
  const sku = ld?.sku || firstMatch(html, [/itemprop=["']sku["'][^>]*>([\s\S]*?)<\//i, /class=["'][^"']*value[^"']*["'][^>]*itemprop=["']sku["'][^>]*>([\s\S]*?)<\//i, /SKU\s*[:#]?\s*<[^>]*>([^<]+)/i]);
  const price = moneyToNumber(offers?.price) || moneyToNumber(firstMatch(html, [/data-price-amount=["']([^"']+)["']/i, /data-price-type=["']finalPrice["'][\s\S]{0,500}?<span[^>]+class=["'][^"']*price[^"']*["'][^>]*>([^<]+)<\/span>/i, /itemprop=["']price["'][^>]+content=["']([^"']+)["']/i]));
  const availabilityRaw = String(offers?.availability || '');
  const inStock = availabilityRaw ? /InStock/i.test(availabilityRaw) : !/Agotado|Sin existencias/i.test(html);
  const image = ld?.image ? (Array.isArray(ld.image) ? ld.image[0] : ld.image) : firstMatch(html, [/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i]);
  const brand = typeof ld?.brand === 'string' ? ld.brand : ld?.brand?.name || (name ? name.split(' ')[0] : null);
  return { sku, name, brand, supplierPrice: price, inStock, image, sourceUrl };
}
function applyMargin(cost) { if (cost == null) return null; const multiplier = cost < 500 ? 1.45 : cost <= 1000 ? 1.35 : 1.25; return Math.ceil((cost * multiplier) / 10) * 10; }
async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; UFRA-Sync-POC/1.3; +merchant-catalog-test)', 'accept-language': 'es-MX,es;q=0.9,en;q=0.8' }, cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`UFRA ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timeout); }
}
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length); let next = 0;
  async function run() { while (true) { const index = next++; if (index >= items.length) return; results[index] = await worker(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run)); return results;
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server environment variables are missing');
  return { url: url.replace(/\/$/, ''), key };
}
async function db(path, { method = 'GET', body, prefer } = {}) {
  const { url, key } = supabaseConfig();
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
async function getSingleton(table, slug) {
  const rows = await db(`${table}?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`);
  if (!rows?.[0]?.id) throw new Error(`${table}:${slug} not found`);
  return rows[0].id;
}
async function syncProduct(product, supplierId, storeId) {
  if (!product.sku || !product.name || product.error) return { skipped: true, reason: product.error || 'missing sku/name' };
  const now = new Date().toISOString();
  const existing = await db(`supplier_products?supplier_id=eq.${supplierId}&supplier_sku=eq.${encodeURIComponent(product.sku)}&select=id,product_id&limit=1`);
  let productId = existing?.[0]?.product_id || null;
  if (!productId) {
    const created = await db('products?select=id', { method: 'POST', prefer: 'return=representation', body: { canonical_name: product.name, brand: product.brand, image_url: product.image, active: true } });
    productId = created?.[0]?.id;
  } else {
    await db(`products?id=eq.${productId}`, { method: 'PATCH', prefer: 'return=minimal', body: { canonical_name: product.name, brand: product.brand, image_url: product.image, active: true, updated_at: now } });
  }
  const supplierRow = { supplier_id: supplierId, product_id: productId, supplier_sku: String(product.sku), supplier_name: product.name, source_url: product.sourceUrl, supplier_price: product.supplierPrice, currency: 'MXN', in_stock: product.inStock, image_url: product.image, raw_attributes: { brand: product.brand }, last_seen_at: now, last_synced_at: now, active: true };
  let supplierProductId = existing?.[0]?.id;
  if (supplierProductId) {
    await db(`supplier_products?id=eq.${supplierProductId}`, { method: 'PATCH', prefer: 'return=minimal', body: supplierRow });
  } else {
    const created = await db('supplier_products?select=id', { method: 'POST', prefer: 'return=representation', body: supplierRow });
    supplierProductId = created?.[0]?.id;
  }
  const storeExisting = await db(`store_products?store_id=eq.${storeId}&supplier_product_id=eq.${supplierProductId}&select=id&limit=1`);
  const storeRow = { store_id: storeId, product_id: productId, supplier_product_id: supplierProductId, sale_price: product.salePrice, published: Boolean(product.inStock), updated_at: now };
  if (storeExisting?.[0]?.id) await db(`store_products?id=eq.${storeExisting[0].id}`, { method: 'PATCH', prefer: 'return=minimal', body: storeRow });
  else await db('store_products', { method: 'POST', prefer: 'return=minimal', body: storeRow });
  return { skipped: false, created: !existing?.[0]?.id, sku: product.sku };
}
async function syncPage(products, page) {
  const supplierId = await getSingleton('suppliers', 'ufra');
  const storeId = await getSingleton('stores', 'ufra-commerce');
  const run = await db('sync_runs?select=id', { method: 'POST', prefer: 'return=representation', body: { supplier_id: supplierId, status: 'running', cursor_page: page } });
  const runId = run?.[0]?.id;
  const results = [];
  for (const product of products) {
    try { results.push(await syncProduct(product, supplierId, storeId)); }
    catch (error) { results.push({ skipped: true, sku: product.sku || null, reason: error.message }); }
  }
  const valid = results.filter(r => !r.skipped);
  const errors = results.filter(r => r.skipped);
  const created = valid.filter(r => r.created).length;
  const updated = valid.length - created;
  if (runId) await db(`sync_runs?id=eq.${runId}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: errors.length ? 'completed_with_errors' : 'completed', pages_processed: 1, products_seen: products.length, products_created: created, products_updated: updated, errors: errors.length, error_details: errors.slice(0, 20), finished_at: new Date().toISOString() } });
  return { runId, saved: valid.length, created, updated, errors: errors.length, details: errors };
}

export default async function handler(req, res) {
  try {
    const requestedPage = Number.parseInt(String(req.query?.page || '1'), 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const shouldSync = String(req.query?.sync || '') === '1';
    const pageUrl = page === 1 ? CATEGORY_URL : `${CATEGORY_URL}?p=${page}`;
    const categoryHtml = await fetchHtml(pageUrl);
    const links = findProductLinks(categoryHtml);
    const catalogTotal = findCatalogTotal(categoryHtml);
    const totalPages = catalogTotal ? Math.ceil(catalogTotal / PAGE_SIZE) : null;
    if (!links.length) throw new Error('No product links detected on UFRA category page');
    const products = await mapWithConcurrency(links, CONCURRENCY, async (url) => {
      try { const html = await fetchHtml(url); const product = parseProduct(html, url); return { ...product, salePrice: applyMargin(product.supplierPrice), syncedAt: new Date().toISOString() }; }
      catch (error) { const message = error?.name === 'AbortError' ? 'UFRA tardó demasiado en responder' : error.message; return { sourceUrl: url, error: message }; }
    });
    const databaseSync = shouldSync ? await syncPage(products, page) : null;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, source: pageUrl, page, pageSize: PAGE_SIZE, catalogTotal, totalPages, count: products.length, hasPrevious: page > 1, hasNext: totalPages ? page < totalPages : products.length === PAGE_SIZE, pricingRule: '<500 +45%; 500-1000 +35%; >1000 +25%; rounded up to MXN 10', databaseSync, products });
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'UFRA tardó demasiado en responder' : error.message;
    res.status(502).json({ ok: false, error: message });
  }
}
