function cfg(){const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('Supabase env missing');return{url:url.replace(/\/$/,''),key}}
async function db(path,opts={}){const{url,key}=cfg();const r=await fetch(`${url}/rest/v1/${path}`,{...opts,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=representation',...(opts.headers||{})}});const t=await r.text();if(!r.ok)throw new Error(`Supabase ${r.status}: ${t.slice(0,400)}`);return t?JSON.parse(t):null}
function cleanUrl(u){return u?.replace(/\\u0026/g,'&').replace(/\\\//g,'/')}
function imageKey(u){try{const x=new URL(u);return decodeURIComponent(x.pathname.split('/').pop()||x.pathname).toLowerCase()}catch{return cleanUrl(u)?.split('?')[0].split('/').pop()?.toLowerCase()}}
function dedupeGallery(a){const seen=new Set(),out=[];for(const raw of a){const u=cleanUrl(raw);if(!u||!/^https?:/i.test(u)||!/\.(?:jpe?g|png|webp)(?:\?|$)/i.test(u))continue;const key=imageKey(u)||u;if(seen.has(key))continue;seen.add(key);out.push(u)}return out}
function gallery(html){const out=[];const add=u=>{if(u)out.push(u)};
  // UFRA/Magento exposes the larger `full` image and then smaller/cache variants in `img`.
  // Process `full` first and dedupe by source filename so we keep one HD image per gallery shot.
  for(const m of html.matchAll(/"full"\s*:\s*"([^"]+)"/gi))add(m[1]);
  for(const m of html.matchAll(/data-(?:zoom-image|large-image|full-image)=["']([^"']+)["']/gi))add(m[1]);
  for(const m of html.matchAll(/"img"\s*:\s*"([^"]+)"/gi))add(m[1]);
  return dedupeGallery(out);
}
export default async function handler(req,res){try{const write=String(req.query?.write||'0')==='1';const limit=Math.min(10,Math.max(1,parseInt(req.query?.limit||'3',10)));const offset=Math.max(0,parseInt(req.query?.offset||'0',10));const rows=await db(`supplier_products?source_url=not.is.null&select=id,supplier_sku,source_url&order=first_seen_at.asc,id.asc&offset=${offset}&limit=${limit}`);const results=[];for(const p of rows||[]){try{const r=await fetch(p.source_url,{headers:{'user-agent':'Mozilla/5.0 (compatible; UFRACommerceCatalog/1.0)','accept-language':'es-MX,es;q=0.9'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`UFRA ${r.status}`);const html=await r.text();const images=gallery(html);if(write&&images.length){await db('product_images?on_conflict=supplier_product_id,image_url',{method:'POST',body:JSON.stringify(images.map((image_url,i)=>({supplier_product_id:p.id,image_url,position:i,is_primary:i===0})))})}results.push({sku:p.supplier_sku,count:images.length,images});}catch(e){results.push({sku:p.supplier_sku,count:0,error:e.message})}}
res.setHeader('Cache-Control','no-store');res.status(200).json({ok:true,write,offset,limit,processed:results.length,results});}catch(e){res.status(500).json({ok:false,error:e.message})}}
