const CATEGORY_URL = 'https://ufra.com.mx/categorias/fragancias.html';
const FETCH_TIMEOUT_MS = 12000;

function decodeHtml(s = '') {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

function moneyToNumber(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/[^0-9.,-]/g, '').trim();
  if (!cleaned) return null;
  const normalized = cleaned.includes(',') && cleaned.includes('.')
    ? cleaned.replace(/,/g, '')
    : cleaned.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractDataPrice(block, type) {
  const tags = block.match(/<[^>]+data-price-type=["'][^"']+["'][^>]*>/gi) || [];
  for (const tag of tags) {
    const typeMatch = tag.match(/data-price-type=["']([^"']+)["']/i)?.[1];
    if (typeMatch !== type) continue;
    const amount = tag.match(/data-price-amount=["']([^"']+)["']/i)?.[1];
    if (amount != null) return amount;
  }
  return null;
}

function extractTextPrice(block, labelRegex) {
  const text = decodeHtml(block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  return text.match(new RegExp(`${labelRegex.source}\\s*\\$?\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`, 'i'))?.[1] || null;
}

function parseCards(html) {
  const decoded = decodeHtml(html);
  const cards = [];
  const blocks = [...decoded.matchAll(/<li[^>]*class=["'][^"']*product-item[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi)];

  for (const match of blocks) {
    const block = match[1];
    const link = block.match(/<a[^>]+class=["'][^"']*product-item-link[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1]
      || block.match(/<a[^>]+href=["'](https?:\/\/ufra\.com\.mx\/[^"'#?]+\.html)["']/i)?.[1];
    if (!link) continue;

    const url = decodeHtml(link).split('#')[0];
    if (/\/categorias\//i.test(url) || /\/catalogos(?:\/|\.html)/i.test(url)) continue;

    const oldPriceRaw = extractDataPrice(block, 'oldPrice')
      || block.match(/class=["'][^"']*old-price[^"']*["'][\s\S]{0,800}?class=["'][^"']*price[^"']*["'][^>]*>\s*\$?\s*([^<]+)</i)?.[1]
      || extractTextPrice(block, /Precio habitual/i);

    const finalPriceRaw = extractDataPrice(block, 'finalPrice')
      || block.match(/class=["'][^"']*special-price[^"']*["'][\s\S]{0,800}?class=["'][^"']*price[^"']*["'][^>]*>\s*\$?\s*([^<]+)</i)?.[1]
      || extractTextPrice(block, /Precio especial/i);

    const supplierListPrice = moneyToNumber(oldPriceRaw);
    const supplierPrice = moneyToNumber(finalPriceRaw);
    cards.push({ url, supplierListPrice, supplierPrice });
  }

  return cards;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; UFRA-ListPrice-Backfill/1.1)',
        'accept-language': 'es-MX,es;q=0.9'
      },
      cache: 'no-store',
      signal: controller.signal
    });
    if (!r.ok) throw new Error(`UFRA ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(timeout);
  }
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
  const r = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

export default async function handler(req, res) {
  try {
    const requestedPage = Number.parseInt(String(req.query?.page || '1'), 10);
    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const write = String(req.query?.write || '') === '1';
    const pageUrl = page === 1 ? CATEGORY_URL : `${CATEGORY_URL}?p=${page}`;
    const html = await fetchHtml(pageUrl);
    const cards = parseCards(html);
    if (!cards.length) throw new Error('No UFRA product cards detected');

    let matched = 0;
    let updated = 0;
    let missingInDb = 0;
    let noListPrice = 0;
    const details = [];

    for (const card of cards) {
      if (card.supplierListPrice == null) noListPrice++;
      const rows = await db(`supplier_products?source_url=eq.${encodeURIComponent(card.url)}&select=id,supplier_price,supplier_list_price&limit=1`);
      const row = rows?.[0];
      if (!row) {
        missingInDb++;
        details.push({ url: card.url, status: 'missing_in_db', supplierListPrice: card.supplierListPrice, supplierPrice: card.supplierPrice });
        continue;
      }

      matched++;
      if (write && card.supplierListPrice != null) {
        const body = { supplier_list_price: card.supplierListPrice };
        if (card.supplierPrice != null) body.supplier_price = card.supplierPrice;
        await db(`supplier_products?id=eq.${row.id}`, { method: 'PATCH', prefer: 'return=minimal', body });
        updated++;
      }

      details.push({ url: card.url, status: write ? 'updated' : 'matched', supplierListPrice: card.supplierListPrice, supplierPrice: card.supplierPrice });
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      ok: true,
      page,
      source: pageUrl,
      write,
      detected: cards.length,
      matched,
      updated,
      missingInDb,
      noListPrice,
      details
    });
  } catch (error) {
    res.status(502).json({ ok: false, error: error.message });
  }
}
