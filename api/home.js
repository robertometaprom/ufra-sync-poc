export default async function handler(req,res) {
  try {
    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = req.headers.host;
    const r = await fetch(`${proto}://${host}/index.html`, { cache:'no-store' });
    if (!r.ok) throw new Error(`index ${r.status}`);
    let html = await r.text();

    const fix = `
<style>
/* SAX two-pane experience: conversation and recommendations scroll independently. */
.sax-body{display:grid!important;grid-template-rows:minmax(170px,42%) minmax(0,58%);gap:10px;overflow:hidden!important;padding:12px!important}
.sax-suggestions{grid-row:1;align-self:start;z-index:2;background:#fffaf5;margin-bottom:0;padding-bottom:8px}
.sax-feed{grid-row:1;min-height:0;overflow-y:auto!important;overflow-x:hidden;padding-top:42px;padding-right:4px;scrollbar-width:thin;overflow-anchor:auto!important}
.sax-recommendations{grid-row:2;min-height:0;overflow-y:auto;border-top:1px solid #ddd1c4;padding:10px 4px 4px;scrollbar-width:thin;overflow-anchor:none!important}
.sax-recommendations:empty{display:none}
.sax-recommendations-title{font-family:Georgia,serif;font-size:16px;margin:0 0 9px;color:#2d2621}
.sax-recommendations .turn-products{padding:0 0 10px}
.sax-recommendations .turn-products-head{display:none}
.sax-recommendations .products{grid-template-columns:repeat(2,minmax(0,1fr))!important}
.sax-recommendations .turn-products,.sax-recommendations .products{overflow-anchor:none!important}
@media(max-width:1180px){.sax-recommendations .products{grid-template-columns:1fr!important}}
@media(max-width:820px){.sax-body{grid-template-rows:minmax(160px,45%) minmax(0,55%)}.sax-feed{padding-top:42px}}
</style>
<script>
try {
  // The two panes make product-driven auto-scrolling unnecessary.
  bottom = function(){};

  // Keep SAX wide on desktop so recommendations have room, without changing width mid-answer.
  const originalOpenSax = openSax;
  openSax = function(){
    originalOpenSax();
    if (innerWidth > 1180) document.body.classList.add('sax-expanded');
  };

  // Create a physically separate recommendation pane below the conversation.
  const recPane = document.createElement('section');
  recPane.className = 'sax-recommendations';
  recPane.setAttribute('aria-label','Opciones recomendadas por SAX');
  body.appendChild(recPane);

  // Do not reposition the conversation when messages arrive. They append chronologically
  // and the user continues naturally downward, just like a normal chat.

  const originalAddProducts = addProducts;
  addProducts = function(items,turn){
    originalAddProducts(items,turn);
    if (!items || !items.length) return;
    const block = turn.querySelector('.turn-products');
    if (!block) return;

    // Only the newest recommendation set is shown below. It cannot move the conversation.
    recPane.innerHTML = '<div class="sax-recommendations-title">Opciones para ti</div>';
    recPane.appendChild(block);
    recPane.scrollTop = 0;
  };
} catch (e) { console.error('SAX two-pane layout', e); }
</script>
`;

    html = html.replace('</body>', `${fix}</body>`);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).send(html);
  } catch (e) {
    console.error('home', e);
    return res.status(500).send('Unable to load storefront');
  }
}
