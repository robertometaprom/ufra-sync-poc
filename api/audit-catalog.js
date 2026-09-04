const CATEGORY_URL = 'https://ufra.com.mx/categorias/fragancias.html';
const PAGE_SIZE = 24;
const FETCH_TIMEOUT_MS = 12000;

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
  const patterns = [
    /Art[ií]culos\s+[\d,.]+\s*[-–]\s*[\d,.]+\s+de\s+([\d,.]+)/i,
    /Items?\s+[\d,.]+\s*[-–]\s*[\d,.]+\s+of\s+([\d,.]+)/i,
    /([\d,.]+)\s+Art[ií]culos/i
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const n = Number(m[1].replace(/[^0-9]/g, ''));
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
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
      const url = decodeHtml(m[1]).split('#')[0];
      if (/\/categorias\//i.test(url) || /\/catalogos(?:\/|\.html)/i.test(url)) continue;
      if (!seen.has(url)) { seen.add(url); links.push(url); }
    }
  }
  return links.slice(0, PAGE_SIZE);
}

function hasExplicitNextPage(html, page) {
  const decoded = decodeHtml(html);
  const nextPage = page + 1;
  const pageHref = new RegExp(`href=["'][^"']*(?:\\?|&)p=${nextPage}(?:&[^"']*)?["']`, 'i');
  if (pageHref.test(decoded)) return true;
  return /class=["'][^"']*action\s+next[^"']*["']/i.test(decoded) && /P[aá]gina\s+Siguiente|Siguiente|Next/i.test(stripHtml(decoded));
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; UFRA-Catalog-Audit/1.1)',
        'accept-language': 'es-MX,es;q=0.9,en;q=0.8'
      },
      cache: 'no-store',
      signal: controller.signal
    });
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

export default async function handler(req, res) {
  try {
    const requestedPage = Number.parseInt(String(req.query?.page || '1'), 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const pageUrl = page === 1 ? CATEGORY_URL : `${CATEGORY_URL}?p=${page}`;
    const html = await fetchHtml(pageUrl);
    const links = findProductLinks(html);
    if (!links.length) throw new Error(`No product links detected on UFRA page ${page}`);

    const catalogTotal = findCatalogTotal(html);
    const totalPages = catalogTotal ? Math.ceil(catalogTotal / PAGE_SIZE) : null;
    const explicitNext = hasExplicitNextPage(html, page);
    const hasNext = totalPages ? page < totalPages : explicitNext || links.length === PAGE_SIZE;

    const supplierRows = await db('supplier_products?select=source_url&limit=5000');
    const dbUrls = new Set(supplierRows.map(r => r.source_url).filter(Boolean));
    const missingFromDb = links.filter(url => !dbUrls.has(url));

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      ok: true,
      page,
      source: pageUrl,
      catalogTotal,
      totalPages,
      detectedLinks: links.length,
      explicitNext,
      hasNext,
      databaseRows: supplierRows.length,
      missingFromDbCount: missingFromDb.length,
      missingFromDb,
      links
    });
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'UFRA timed out while serving this catalog page' : error.message;
    res.status(502).json({ ok: false, error: message });
  }
}
