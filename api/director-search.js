function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server configuration missing');
  return { url: url.replace(/\/$/, ''), key };
}

async function db(path) {
  const { url, key } = supabaseConfig();
  const r = await fetch(`${url}/rest/v1/${path}`, { headers:{apikey:key,Authorization:`Bearer ${key}`}, cache:'no-store' });
  if (!r.ok) throw new Error(`Database request failed (${r.status})`);
  const text=await r.text(); return text?JSON.parse(text):null;
}

function roundUp(value,step){const s=Number(step)>0?Number(step):1;return Math.ceil(Number(value)/s)*s}
function salePrice(cost,rule){return cost==null?null:roundUp(Number(cost)*Number(rule.multiplier||1)+Number(rule.fixed_markup||0),rule.round_to||1)}
function norm(v){return String(v||'').trim().toLowerCase()}
function inferredGender(p){
  if(p?.gender)return norm(p.gender);
  const n=` ${String(p?.canonical_name||'').toUpperCase()} `;
  if(/(^|[^A-Z])(WOMEN|WOMAN|FEMME|MUJER)([^A-Z]|$)/.test(n))return 'mujer';
  if(/(^|[^A-Z])(MEN|MAN|HOMME|HOMBRE)([^A-Z]|$)/.test(n))return 'hombre';
  return '';
}
function inferredType(p){
  if(p?.fragrance_type)return norm(p.fragrance_type);
  const n=` ${String(p?.canonical_name||'').toUpperCase()} `;
  for(const t of ['EDP','EDT','EDC']) if(new RegExp(`(^|[^A-Z])${t}([^A-Z]|$)`).test(n)) return t.toLowerCase();
  if(/(^|[^A-Z])PARFUM([^A-Z]|$)/.test(n))return 'parfum';
  return '';
}

export default async function handler(req,res){
 try{
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed'});
  const q=norm(req.query?.q).slice(0,120),brand=norm(req.query?.brand).slice(0,80),gender=norm(req.query?.gender).slice(0,30),type=norm(req.query?.type).slice(0,30);
  const minPrice=Math.max(0,Number(req.query?.minPrice||0)),maxPrice=Math.max(0,Number(req.query?.maxPrice||0));
  const limit=Math.min(12,Math.max(1,parseInt(String(req.query?.limit||'8'),10)||8));
  const stores=await db('stores?slug=eq.ufra-commerce&select=id&limit=1'),storeId=stores?.[0]?.id;if(!storeId)throw new Error('Store not configured');
  const rules=await db(`pricing_rules?store_id=eq.${storeId}&active=eq.true&select=multiplier,fixed_markup,round_to&order=priority.asc&limit=1`),rule=rules?.[0];if(!rule)throw new Error('Pricing not configured');

  // The current catalog has many null normalized gender/type fields. Read the whole published catalog
  // in pages and infer only explicit MEN/MAN/HOMME/WOMEN/WOMAN/FEMME tokens from the product name.
  // This prevents a null normalized field from making Director falsely claim that no products exist.
  const select='product_id,products(canonical_name,brand,gender,fragrance_type,size_ml,image_url,search_text),supplier_products(supplier_sku,supplier_price,in_stock)';
  const pages=await Promise.all([0,1000].map(offset=>db(`store_products?store_id=eq.${storeId}&published=eq.true&select=${select}&limit=1000&offset=${offset}`)));
  const rows=pages.flat();
  const products=rows.map(row=>{
    const p=Array.isArray(row.products)?row.products[0]:row.products,s=Array.isArray(row.supplier_products)?row.supplier_products[0]:row.supplier_products;
    const price=salePrice(s?.supplier_price,rule);
    return {id:row.product_id,sku:s?.supplier_sku||null,name:p?.canonical_name||null,brand:p?.brand||null,gender:p?.gender||null,fragranceType:p?.fragrance_type||null,sizeMl:p?.size_ml==null?null:Number(p.size_ml),image:p?.image_url||null,inStock:Boolean(s?.in_stock),salePrice:price,currency:'MXN',_p:p};
  }).filter(x=>{
    if(!x.inStock||x.salePrice==null)return false;
    if(minPrice&&x.salePrice<minPrice)return false;if(maxPrice&&x.salePrice>maxPrice)return false;
    if(brand&&!norm(x.brand).includes(brand))return false;
    if(gender&&inferredGender(x._p)!==gender)return false;
    if(type&&inferredType(x._p)!==type)return false;
    if(q){const hay=norm(`${x.name} ${x.brand} ${x.sku} ${x._p?.search_text||''}`);if(!hay.includes(q))return false;}
    return true;
  }).sort((a,b)=>a.salePrice-b.salePrice).slice(0,limit).map(({_p,...x})=>x);
  res.setHeader('Cache-Control','no-store');return res.status(200).json({ok:true,count:products.length,products});
 }catch(e){console.error('director-search',e);return res.status(500).json({ok:false,error:'Unable to search catalog'});}
}
