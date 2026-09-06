function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase server environment variables are missing');
  return { url: url.replace(/\/$/, ''), key };
}

async function db(path) {
  const { url, key } = supabaseConfig();
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store'
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const MIN_VISIBLE_PRICE = 301;

function roundUp(value, roundTo) {
  const step = Number(roundTo) > 0 ? Number(roundTo) : 1;
  return Math.ceil(Number(value) / step) * step;
}

function priceProduct(cost, listPrice, rule) {
  if (cost == null) return { salePrice: null, compareAtPrice: null };
  const multiplier = Number(rule?.multiplier || 1);
  const fixedMarkup = Number(rule?.fixed_markup || 0);
  const salePrice = roundUp(Number(cost) * multiplier + fixedMarkup, rule?.round_to || 1);
  const reference = listPrice == null ? null : Number(listPrice);
  const compareAtPrice = reference != null && reference >= salePrice * 1.10 ? reference : null;
  return { salePrice, compareAtPrice };
}

function searchText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export default async function handler(req, res) {
  try {
    const requestedLimit = Number.parseInt(String(req.query?.limit || '24'), 10);
    const limit = Math.min(100, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : 24));
    const requestedOffset = Number.parseInt(String(req.query?.offset || '0'), 10);
    const offset = Math.max(0, Number.isFinite(requestedOffset) ? requestedOffset : 0);
    const q = searchText(req.query?.q);

    const stores = await db('stores?slug=eq.ufra-commerce&select=id&limit=1');
    const storeId = stores?.[0]?.id;
    if (!storeId) throw new Error('store ufra-commerce not found');

    const rules = await db(`pricing_rules?store_id=eq.${storeId}&active=eq.true&select=id,name,multiplier,fixed_markup,round_to,priority&order=priority.asc&limit=1`);
    const rule = rules?.[0];
    if (!rule) throw new Error('No active pricing rule configured');

    const select='id,product_id,supplier_product_id,products(canonical_name,brand,image_url),supplier_products(supplier_sku,supplier_price,supplier_list_price,in_stock,source_url)';
    const pages=await Promise.all([0,1000].map(dbOffset=>db(`store_products?store_id=eq.${storeId}&published=eq.true&select=${select}&order=updated_at.desc&offset=${dbOffset}&limit=1000`)));
    const allRows=pages.flat();

    const visible = (allRows || []).map(row => {
      const product = Array.isArray(row.products) ? row.products[0] : row.products;
      const supplier = Array.isArray(row.supplier_products) ? row.supplier_products[0] : row.supplier_products;
      const priced = priceProduct(supplier?.supplier_price, supplier?.supplier_list_price, rule);
      return {
        id: row.product_id,
        sku: supplier?.supplier_sku || null,
        name: product?.canonical_name || null,
        brand: product?.brand || null,
        image: product?.image_url || null,
        inStock: Boolean(supplier?.in_stock),
        salePrice: priced.salePrice,
        compareAtPrice: priced.compareAtPrice,
        currency: 'MXN'
      };
    }).filter(p => p.salePrice != null && p.salePrice >= MIN_VISIBLE_PRICE);

    const matched = q ? visible.filter(p => searchText(`${p.name || ''} ${p.brand || ''} ${p.sku || ''}`).includes(q)) : visible;
    const products=matched.slice(offset,offset+limit);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      ok: true,
      offset,
      limit,
      count: products.length,
      total: matched.length,
      query: q || null,
      pricing: {
        ruleId: rule.id,
        name: rule.name,
        markupPercent: Math.round((Number(rule.multiplier) - 1) * 10000) / 100,
        roundTo: Number(rule.round_to),
        compareAtMinimumDifferencePercent: 10
      },
      products
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
}
