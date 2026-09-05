function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server configuration missing');
  return { url: url.replace(/\/$/, ''), key };
}

async function db(path) {
  const { url, key } = supabaseConfig();
  const r = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: 'no-store'
  });
  if (!r.ok) throw new Error(`Database request failed (${r.status})`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

function esc(v) { return encodeURIComponent(String(v || '').trim()); }
function roundUp(value, step) { const s = Number(step) > 0 ? Number(step) : 1; return Math.ceil(Number(value) / s) * s; }
function salePrice(cost, rule) { return cost == null ? null : roundUp(Number(cost) * Number(rule.multiplier || 1) + Number(rule.fixed_markup || 0), rule.round_to || 1); }

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'Method not allowed' });
    const q = String(req.query?.q || '').trim().slice(0, 120);
    const brand = String(req.query?.brand || '').trim().slice(0, 80);
    const gender = String(req.query?.gender || '').trim().slice(0, 30);
    const type = String(req.query?.type || '').trim().slice(0, 30);
    const minPrice = Math.max(0, Number(req.query?.minPrice || 0));
    const maxPrice = Math.max(0, Number(req.query?.maxPrice || 0));
    const limit = Math.min(12, Math.max(1, Number.parseInt(String(req.query?.limit || '8'), 10) || 8));

    const stores = await db('stores?slug=eq.ufra-commerce&select=id&limit=1');
    const storeId = stores?.[0]?.id;
    if (!storeId) throw new Error('Store not configured');
    const rules = await db(`pricing_rules?store_id=eq.${storeId}&active=eq.true&select=multiplier,fixed_markup,round_to&order=priority.asc&limit=1`);
    const rule = rules?.[0];
    if (!rule) throw new Error('Pricing not configured');

    // Filters for embedded product fields must be qualified with products.* in PostgREST.
    let productFilters = '';
    if (q) productFilters += `&products.search_text=ilike.*${esc(q)}*`;
    if (brand) productFilters += `&products.brand=ilike.${esc(brand)}`;
    if (gender) productFilters += `&products.gender=ilike.${esc(gender)}`;
    if (type) productFilters += `&products.fragrance_type=ilike.${esc(type)}`;

    // !inner makes embedded product/supplier filters constrain the parent rows.
    const rows = await db(`store_products?store_id=eq.${storeId}&published=eq.true&select=product_id,products!inner(canonical_name,brand,gender,fragrance_type,size_ml,image_url,search_text),supplier_products!inner(supplier_sku,supplier_price,in_stock)&supplier_products.in_stock=eq.true&limit=500${productFilters}`);
    const products = (rows || []).map(row => {
      const p = Array.isArray(row.products) ? row.products[0] : row.products;
      const s = Array.isArray(row.supplier_products) ? row.supplier_products[0] : row.supplier_products;
      const price = salePrice(s?.supplier_price, rule);
      return { id:row.product_id, sku:s?.supplier_sku || null, name:p?.canonical_name || null, brand:p?.brand || null, gender:p?.gender || null, fragranceType:p?.fragrance_type || null, sizeMl:p?.size_ml == null ? null : Number(p.size_ml), image:p?.image_url || null, inStock:Boolean(s?.in_stock), salePrice:price, currency:'MXN' };
    }).filter(p => p.inStock && p.salePrice != null && (!minPrice || p.salePrice >= minPrice) && (!maxPrice || p.salePrice <= maxPrice)).sort((a,b) => a.salePrice-b.salePrice).slice(0,limit);

    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({ ok:true, count:products.length, products });
  } catch (e) {
    console.error('director-search', e);
    return res.status(500).json({ ok:false, error:'Unable to search catalog' });
  }
}
