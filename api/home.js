export default async function handler(req,res) {
  try {
    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = req.headers.host;
    const r = await fetch(`${proto}://${host}/index.html`, { cache:'no-store' });
    if (!r.ok) throw new Error(`index ${r.status}`);
    let html = await r.text();

    const fix = `\n<style>\n/* Prevent browser scroll anchoring from jumping to recommendation cards. */\n.sax-body,.sax-feed,.turn,.turn-products,.products{overflow-anchor:none!important}\n</style>\n<script>\ntry {\n  function saxShow(el, offset) {\n    if (!el || !body) return;\n    requestAnimationFrame(() => requestAnimationFrame(() => {\n      if (!el.isConnected) return;\n      const br = body.getBoundingClientRect();\n      const er = el.getBoundingClientRect();\n      body.scrollTop = Math.max(0, body.scrollTop + er.top - br.top - (offset || 8));\n    }));\n  }\n\n  // Product-card insertion must never move the viewport to the bottom.\n  bottom = function(){};\n\n  // On desktop open SAX already at its wider recommendation width. This removes the\n  // mid-answer width change that was reflowing text upward when cards appeared.\n  const originalOpenSax = openSax;\n  openSax = function(){\n    originalOpenSax();\n    if (innerWidth > 1180) document.body.classList.add('sax-expanded');\n  };\n\n  const originalAddMsg = addMsg;\n  addMsg = function(role,text,turn){\n    const m = originalAddMsg(role,text,turn);\n    saxShow(m, 8);\n    return m;\n  };\n\n  const originalAddProducts = addProducts;\n  addProducts = function(items,turn){\n    originalAddProducts(items,turn);\n    if (!items || !items.length) return;\n    const messages = turn.querySelectorAll('.msg.assistant');\n    const answer = messages[messages.length - 1];\n    // Keep the answer visible after the cards are inserted and after images/layout settle.\n    saxShow(answer, 8);\n    [80,180,350,650].forEach(ms => setTimeout(() => saxShow(answer, 8), ms));\n  };\n} catch (e) { console.error('SAX scroll fix', e); }\n</script>\n`;

    html = html.replace('</body>', `${fix}</body>`);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).send(html);
  } catch (e) {
    console.error('home', e);
    return res.status(500).send('Unable to load storefront');
  }
}
