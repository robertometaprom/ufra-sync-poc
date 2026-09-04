const CATEGORY_URL = 'https://ufra.com.mx/categorias/fragancias.html';
const PAGE_SIZE = 24;

function decodeHtml(s = '') {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
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
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; UFRA-Sync-POC/1.1; +merchant-catalog-test)', 'accept-language': 'es-MX,es;q=0.9,en;q=0.8' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`UFRA ${response.status} at ${url}`);
  return response.text();
}
export default async function handler(req, res) {
  try {
    const requestedPage = Number.parseInt(String(req.query?.page || '1'), 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageUrl = page === 1 ? CATEGORY_URL : `${CATEGORY_URL}?p=${page}`;
    const categoryHtml = await fetchHtml(pageUrl);
    const links = findProductLinks(categoryHtml);
    const catalogTotal = findCatalogTotal(categoryHtml);
    const totalPages = catalogTotal ? Math.ceil(catalogTotal / PAGE_SIZE) : null;
    if (!links.length) throw new Error('No product links detected on UFRA category page');
    const products = [];
    for (const url of links) { try { const html = await fetchHtml(url), product = parseProduct(html, url); products.push({ ...product, salePrice: applyMargin(product.supplierPrice), syncedAt: new Date().toISOString() }); } catch (error) { products.push({ sourceUrl: url, error: error.message }); } }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, source: pageUrl, page, pageSize: PAGE_SIZE, catalogTotal, totalPages, count: products.length, hasPrevious: page > 1, hasNext: totalPages ? page < totalPages : products.length === PAGE_SIZE, pricingRule: '<500 +45%; 500-1000 +35%; >1000 +25%; rounded up to MXN 10', products });
  } catch (error) { res.status(502).json({ ok: false, error: error.message }); }
}
