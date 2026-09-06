export default async function handler(req,res) {
  try {
    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = req.headers.host;
    const r = await fetch(`${proto}://${host}/index.html`, { cache:'no-store' });
    if (!r.ok) throw new Error(`index ${r.status}`);
    let html = await r.text();

    const fix = `\n<script>\n// SAX chronological scroll fix. Product cards may expand the panel width and reflow the\n// answer for ~280ms. Keep the newest text anchored while that layout transition settles.\ntry {\n  function saxShow(el, offset) {\n    if (!el || !body) return;\n    const position = () => {\n      if (!el.isConnected || !body) return;\n      const br = body.getBoundingClientRect();\n      const er = el.getBoundingClientRect();\n      body.scrollTop = Math.max(0, body.scrollTop + er.top - br.top - (offset || 8));\n    };\n    requestAnimationFrame(() => requestAnimationFrame(position));\n  }\n\n  function saxAnchorThroughReflow(el) {\n    if (!el) return;\n    saxShow(el, 8);\n    // .sax-panel width transition is .28s. Re-anchor during and just after it so the\n    // response cannot jump above the viewport when recommendation cards expand the panel.\n    [90, 180, 300, 420].forEach(ms => setTimeout(() => saxShow(el, 8), ms));\n  }\n\n  // Never auto-scroll to the bottom of product cards.\n  bottom = function(){};\n\n  const originalAddMsg = addMsg;\n  addMsg = function(role,text,turn){\n    const m = originalAddMsg(role,text,turn);\n    saxShow(m, 8);\n    return m;\n  };\n\n  const originalAddProducts = addProducts;\n  addProducts = function(items,turn){\n    originalAddProducts(items,turn);\n    if (!items || !items.length) return;\n    const messages = turn.querySelectorAll('.msg.assistant');\n    const answer = messages[messages.length - 1];\n    saxAnchorThroughReflow(answer);\n  };\n} catch (e) { console.error('SAX scroll fix', e); }\n</script>\n`;

    html = html.replace('</body>', `${fix}</body>`);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).send(html);
  } catch (e) {
    console.error('home', e);
    return res.status(500).send('Unable to load storefront');
  }
}
