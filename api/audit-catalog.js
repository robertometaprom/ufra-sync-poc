const CATEGORY_URL = 'https://ufra.com.mx/categorias/fragancias.html';
const PAGE_SIZE = 24;
const FETCH_TIMEOUT_MS = 12000;
const CONCURRENCY = 8;

function decodeHtml(s = '') {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}
function cleanText(s = '') { return decodeHtml(String(s)).replace(/\s+/g, ' ').trim(); }
function stripHtml(s = '') { return cleanText(String(s).replace(/<[^>]+>/g, ' ')); }
function findCatalogTotal(html) {
  const text = stripHtml(html);
  const m = text.match(/Art[ií]culos\s+[\d,]+-[\d,]+\s+de\s+([\d,]+)/i);
  return m ? Number(m[1].replace(/,/g, '')) || null : null;
}
function findProductLinks(html) {
  const decoded = decodeHtml(html);
  const seen = new Set();
  const links = [];
  const patterns = [
    /<a[^>]+class=["'][^"']*product-item-link[^"']*["'][^>]+href=["']([^"']+)["']/gi,
    /<a[^>]+href=["'](https?:\/\/ufra\.com\.mx\/[^"'#?]+\.html)["'][^>]*>/gi
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(decoded))) {
      const url = m[1].replace(/&amp;/g, '&').split('#')[0];
      if (/\/categorias\//i.test(url) || /\/catalogos(?:\/|\.html)/i.test(url)) continue;
      if (!seen.has(url)) { seen.add(url); links.push(url); }
    }
  }
  return links.slice(0, PAGE_SIZE);
}
async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; UFRA-Catalog-Audit/1.0)', 'accept-language': 'es-MX,es;q=0.9' }, cache: 'no-store', signal: controller.signal });
    if (!r.ok) throw new Error(`UFRA ${r.status}`);
    return await r.text();
  } finally { clearTimeout(timeout); }
}
function supabaseConfig() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server environment variables are missing');
  return { url: url.replace(/\/$/, ''), key };
}
async function db(path) {
  const { url, key } = supabaseConfig();
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : [];
}
async function mapLimit(items, limit, worker) {
  const out = new Array(items.length); let next = 0;
  async function run() { while (true) { const i = next++; if (i >= items.length) return; try { out[i] = await worker(items[i]); } catch (e) { out[i] = { error: e.message }; } } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}
export default async function handler(req, res) {
  try {
    const first = await fetchHtml(CATEGORY_URL);
    const catalogTotal = findCatalogTotal(first);
    if (!catalogTotal) throw new Error('Could not detect UFRA catalog total');
    const totalPages = Math.ceil(catalogTotal / PAGE_SIZE);
    const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    const pageResults = await mapLimit(pages, CONCURRENCY, async page => {
      const html = page === 1 ? first : await fetchHtml(`${CATEGORY_URL}?p=${page}`);
      const links = findProductLinks(html);
      return { page, count: links.length, links };
    });
    const liveLinks = [];
    const seen = new Set();
    const pageIssues = [];
    for (const result of pageResults) {
      if (!result || result.error) { pageIssues.push(result); continue; }
      const expected = result.page < totalPages ? PAGE_SIZE : catalogTotal - PAGE_SIZE * (totalPages - 1);
      if (result.count !== expected) pageIssues.push({ page: result.page, expected, detected: result.count });
      for (const url of result.links) if (!seen.has(url)) { seen.add(url); liveLinks.push(url); }
    }
    const supplierRows = await db('supplier_products?select=supplier_sku,source_url&limit=5000');
    const dbUrls = new Set(supplierRows.map(r => r.source_url).filter(Boolean));
    const liveSet = new Set(liveLinks);
    const missingFromDb = liveLinks.filter(url => !dbUrls.has(url));
    const noLongerLive = [...dbUrls].filter(url => !liveSet.has(url));
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ ok: true, catalogTotal, totalPages, detectedUniqueLinks: liveLinks.length, databaseRows: supplierRows.length, missingFromDbCount: missingFromDb.length, missingFromDb, noLongerLiveCount: noLongerLive.length, noLongerLive: noLongerLive.slice(0, 100), pageIssues });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message });
  }
}
