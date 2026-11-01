// UFRA Tiendanube image discovery (read-only).
// Never updates Supabase or product pricing. Review image rights before copying files.
export function extractTiendanubeImages(html, baseUrl) {
  const out = [];
  const seen = new Set();
  const add = (value) => {
    if (typeof value !== 'string') return;
    const cleaned = value.replace(/&amp;/g, '&').replace(/\u0026/g, '&').replace(/\\//g, '/');
    try {
      const url = new URL(cleaned, baseUrl);
      if (url.protocol !== 'https:' || !['dcdn-us.mitiendanube.com', 'dcdn.mitiendanube.com'].includes(url.hostname)) return;
      if (!/\.(?:webp|png|jpe?g)(?:$|\?)/i.test(url.href)) return;
      const canonical = url.href.split('?')[0];
      if (!seen.has(canonical)) { seen.add(canonical); out.push(canonical); }
    } catch {}
  };
  const visit = (obj, depth = 0) => {
    if (depth > 10 || obj == null) return;
    if (typeof obj === 'string') { add(obj); return; }
    if (Array.isArray(obj)) { for (const v of obj) visit(v, depth + 1); return; }
    if (typeof obj === 'object') {
      for (const [key, val] of Object.entries(obj)) {
        if (/^(image|images|thumbnail|photo|photos|src|url|contentUrl)$/i.test(key)) visit(val, depth + 1);
      }
    }
  };
  // Product JSON-LD and image meta tags are preferable to arbitrary site assets.
  for (const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const obj = JSON.parse(m[1]);
      const products = Array.isArray(obj) ? obj : obj['@graph'] || [obj];
      for (const item of products) if (/Product/i.test(String(item?.['@type'] || ''))) visit(item);
    } catch {}
  }
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/(?:og:image|twitter:image)/i.test(tag)) continue;
    const value = tag.match(/content=["']([^"']+)["']/i)?.[1];
    add(value);
  }
  return out;
}
