const CATEGORY_URL = 'https://ufra.com.mx/categorias.html';
const PAGE_SIZE = 24;
const BATCH_SIZE = 4;
const CONCURRENCY = 2;
const FETCH_TIMEOUT_MS = 12000;
const FETCH_ATTEMPTS = 2;

function decodeHtml(s = '') {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}
function cleanText(s = '') { return decodeHtml(String(s)).replace(/\s+/g, ' ').trim(); }
function stripHtml(s = '') { return cleanText(String(s).replace(/<[^>]+>/g, ' ')); }
function moneyToNumber(value = '') { const n = Number(String(value).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; }
function findProductLinks(html) {
  const links = [], seen = new Set();
  const re = /<a[^>]+class=["'][^"']*product-item-link[^"']*["'][^>]+href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) && links.length < PAGE_SIZE) {
    const url = decodeHtml(m[1]);
    if (!seen.has(url)) { seen.add(url); links.push(url); }
  }
  return links;
}
function findCatalogTotal(html) {
  const text = stripHtml(html);
  const match = text.match(/Art[ií]culos\s+[\d,]+-[\d,]+\s+de\s+([\d,]+)/i);
  if (!match) return null;
  return Number(match[1].replace(/,/g, '')) || null;
}
function hasExplicitNextPage(html, page) {
  const decoded = decodeHtml(html);
  const nextPage = page + 1;
  const pageHref = new RegExp(`href=["'][^"']*(?:\\?|&)p=${nextPage}(?:&[^"']*)?["']`, 'i');
  if (pageHref.test(decoded)) return true;
  return /class=["'][^"']*action\s+next[^"']*["']/i.test(decoded) && /Página\s+Siguiente|Siguiente/i.test(stripHtml(decoded));
}
function parseJsonLd(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    try {
      const parsed = JSON.parse(match[1].trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) if (item && (item['@type'] === 'Product' || item.name) && item.offers) return item;
    } catch {}
  }
  return null;
}
function firstMatch(html, patterns) { for (const re of patterns) { const m = html.match(re); if (m?.[1]) return stripHtml(m[1]); } return null; }
function priceFromType(html, type) {
  const escaped = String(type).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return moneyToNumber(firstMatch(html, [
    new RegExp(`data-price-type=["']${escaped}["'][\\s\\S]{0,500}?data-price-amount=["']([^"']+)["']`, 'i'),
    new RegExp(`data-price-amount=["']([^"']+)["'][^>]{0,300}?data-price-type=["']${escaped}["']`, 'i')
  ]));
}
function parseProduct(html, sourceUrl) {
  const ld = parseJsonLd(html), offers = Array.isArray(ld?.offers) ? ld.offers[0] : ld?.offers;
  const rawName = ld?.name || firstMatch(html, [/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i, /<span[^>]+data-ui-id=["']page-title-wrapper["'][^>]*>([\s\S]*?)<\/span>/i, /<h1[^>]*>([\s\S]*?)<\/h1>/i]);
  const sku = cleanText(ld?.sku || firstMatch(html, [/itemprop=["']sku["'][^>]*>([\s\S]*?)<\//i, /class=["'][^"']*value[^"']*["'][^>]*itemprop=["']sku["'][^>]*>([\s\S]*?)<\//i, /SKU\s*[:#]?\s*<[^>]*>([^<]+)/i]) || '');
  const name = cleanText(rawName || '');
  const finalPrice = priceFromType(html, 'finalPrice') || moneyToNumber(firstMatch(html, [/class=["'][^"']*special-price[^"']*["'][\s\S]{0,1200}?data-price-amount=["']([^"']+)["']/i]));
  const oldPrice = priceFromType(html, 'oldPrice') || moneyToNumber(firstMatch(html, [/class=["'][^"']*old-price[^"']*["'][\s\S]{0,1200}?data-price-amount=["']([^"']+)["']/i]));
  const fallbackPrice = moneyToNumber(offers?.price) || moneyToNumber(firstMatch(html, [/data-price-amount=["']([^"']+)["']/i, /itemprop=["']price["'][^>]+content=["']([^"']+)["']/i]));
  const price = finalPrice || fallbackPrice;
  const listPrice = oldPrice != null && price != null && oldPrice > price ? oldPrice : null;
  const availabilityRaw = String(offers?.availability || '');
  const inStock = availabilityRaw ? /InStock/i.test(availabilityRaw) : !/Agotado|Sin existencias/i.test(html);
  const image = ld?.image ? (Array.isArray(ld.image) ? ld.image[0] : ld.image) : firstMatch(html, [/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i]);
  const rawBrand = typeof ld?.brand === 'string' ? ld.brand : ld?.brand?.name;
  const brand = cleanText(rawBrand || (name ? name.split(' ')[0] : '')) || null;
  return { sku, name, brand, supplierPrice: price, supplierListPrice: listPrice, inStock, image, sourceUrl };
}
function applyMargin(cost) { if (cost == null) return null; const multiplier = cost < 500 ? 1.45 : cost <= 1000 ? 1.35 : 1.25; return Math.ceil((cost * multiplier) / 10) * 10; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function fetchHtmlOnce(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; UFRA-Sync-POC/1.6; +merchant-catalog-test)', 'accept-language': 'es-MX,es;q=0.9,en;q=0.8' }, cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`UFRA ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timeout); }
}
async function fetchHtml(url) {
  let lastError;
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
    try { return await fetchHtmlOnce(url); }
    catch (error) { lastError = error; if (attempt < FETCH_ATTEMPTS) await sleep(300 * attempt); }
  }
  throw lastError;
}
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length); let next = 0;
  async function run() { while (true) { const index = next++; if (index >= items.length) return; results[index] = await worker(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}
function supabaseConfig() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
  const supplierRow = { supplier_id: supplierId, product_id: productId, supplier_sku: String(product.sku), supplier_name: product.name, source_url: product.sourceUrl, supplier_price: product.supplierPrice, supplier_list_price: product.supplierListPrice, currency: 'MXN', in_stock: product.inStock, image_url: product.image, raw_attributes: { brand: product.brand }, last_seen_at: now, last_synced_at: now, active: true };
  let supplierProductId = existing?.[0]?.id;
  if (supplierProductId) await db(`supplier_products?id=eq.${supplierProductId}`, { method: 'PATCH', prefer: 'return=minimal', body: supplierRow });
  else { const created = await db('supplier_products?select=id', { method: 'POST', prefer: 'return=representation', body: supplierRow }); supplierProductId = created?.[0]?.id; }
  const storeExisting = await db(`store_products?store_id=eq.${storeId}&supplier_product_id=eq.${supplierProductId}&select=id&limit=1`);
  const storeRow = { store_id: storeId, product_id: productId, supplier_product_id: supplierProductId, sale_price: product.salePrice, published: Boolean(product.inStock), updated_at: now };
  if (storeExisting?.[0]?.id) await db(`store_products?id=eq.${storeExisting[0].id}`, { method: 'PATCH', prefer: 'return=minimal', body: storeRow });
  else await db('store_products', { method: 'POST', prefer: 'return=minimal', body: storeRow });
  return { skipped: false, created: !existing?.[0]?.id, sku: product.sku };
}
async function getOrCreateRun(supplierId, page, runId) {
  if (runId) {
    const rows = await db(`sync_runs?id=eq.${encodeURIComponent(runId)}&supplier_id=eq.${supplierId}&select=id,cursor_page,cursor_index,status&limit=1`);
    if (!rows?.[0]) throw new Error('sync run not found');
    return rows[0];
  }
  const created = await db('sync_runs?select=id,cursor_page,cursor_index,status', { method: 'POST', prefer: 'return=representation', body: { supplier_id: supplierId, status: 'running', cursor_page: page, cursor_index: 0 } });
  return created?.[0];
}
async function syncBatch(products, page, offset, supplierId, storeId, runId, pageLinkCount) {
  const results = [];
  for (const product of products) {
    try { results.push(await syncProduct(product, supplierId, storeId)); }
    catch (error) { results.push({ skipped: true, sku: product.sku || null, reason: error.message }); }
  }
  const valid = results.filter(r => !r.skipped), errors = results.filter(r => r.skipped);
  const created = valid.filter(r => r.created).length, updated = valid.length - created;
  const nextOffset = Math.min(offset + products.length, pageLinkCount);
  const pageComplete = nextOffset >= pageLinkCount;
  const nextPage = pageComplete ? page + 1 : page;
  const nextIndex = pageComplete ? 0 : nextOffset;
  await db(`sync_runs?id=eq.${runId}`, { method: 'PATCH', prefer: 'return=minimal', body: { status: pageComplete ? 'page_complete' : 'running', cursor_page: nextPage, cursor_index: nextIndex, pages_processed: pageComplete ? 1 : 0, products_seen: nextOffset, products_created: created, products_updated: updated, errors: errors.length, error_details: errors.slice(0, 20), finished_at: pageComplete ? new Date().toISOString() : null } });
  return { runId, saved: valid.length, created, updated, errors: errors.length, page, offset, nextPage, nextIndex, pageComplete, batchSize: products.length, details: errors };
}
export default async function handler(req, res) {
  try {
    const requestedPage = Number.parseInt(String(req.query?.page || '1'), 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const shouldSync = String(req.query?.sync || '') === '1';
    const requestedOffset = Number.parseInt(String(req.query?.offset || '0'), 10);
    const pageUrl = page === 1 ? CATEGORY_URL : `${CATEGORY_URL}?p=${page}`;
    const categoryHtml = await fetchHtml(pageUrl);
    const links = findProductLinks(categoryHtml);
    const catalogTotal = findCatalogTotal(categoryHtml);
    const totalPages = catalogTotal ? Math.ceil(catalogTotal / PAGE_SIZE) : null;
    const explicitNext = hasExplicitNextPage(categoryHtml, page);
    if (!links.length) throw new Error('No product links detected on UFRA category page');

    let selectedLinks = links;
    let offset = 0;
    let runId = null;
    let supplierId = null;
    let storeId = null;
    if (shouldSync) {
      supplierId = await getSingleton('suppliers', 'ufra');
      storeId = await getSingleton('stores', 'ufra-commerce');
      const run = await getOrCreateRun(supplierId, page, String(req.query?.runId || '') || null);
      runId = run.id;
      offset = String(req.query?.offset || '') ? Math.max(0, requestedOffset) : Math.max(0, Number(run.cursor_page) === page ? Number(run.cursor_index || 0) : 0);
      selectedLinks = links.slice(offset, offset + BATCH_SIZE);
    }

    const products = await mapWithConcurrency(selectedLinks, CONCURRENCY, async (url) => {
      try { const html = await fetchHtml(url); const product = parseProduct(html, url); return { ...product, salePrice: applyMargin(product.supplierPrice), syncedAt: new Date().toISOString() }; }
      catch (error) { const message = error?.name === 'AbortError' ? 'UFRA tardó demasiado en responder después de reintentos' : error.message; return { sourceUrl: url, error: message }; }
    });

    const databaseSync = shouldSync ? await syncBatch(products, page, offset, supplierId, storeId, runId, links.length) : null;
    const hasNext = totalPages ? page < totalPages : explicitNext;
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, mode: shouldSync ? 'batch-sync' : 'browse', source: pageUrl, page, pageSize: PAGE_SIZE, batchSize: shouldSync ? BATCH_SIZE : null, catalogTotal, totalPages, count: products.length, hasPrevious: page > 1, hasNext, explicitNext, pricingRule: '<500 +45%; 500-1000 +35%; >1000 +25%; rounded up to MXN 10', databaseSync, products });
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'UFRA tardó demasiado en responder después de reintentos' : error.message;
    res.status(502).json({ ok: false, error: message });
  }
}
