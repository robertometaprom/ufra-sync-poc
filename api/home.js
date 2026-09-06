export default async function handler(req,res) {
  try {
    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = req.headers.host;
    const r = await fetch(`${proto}://${host}/index.html`, { cache:'no-store' });
    if (!r.ok) throw new Error(`index ${r.status}`);
    let html = await r.text();

    const fix = `\n<script>\n// SAX chronological scroll fix. Product cards may be taller than the viewport, so never\n// scroll to their bottom automatically. New turns are brought into view below prior cards;\n// SAX's answer remains visible at the top of the conversation viewport while its cards follow.\ntry {\n  function saxShow(el, offset) {\n    if (!el || !body) return;\n    requestAnimationFrame(() => requestAnimationFrame(() => {\n      const br = body.getBoundingClientRect();\n      const er = el.getBoundingClientRect();\n      body.scrollTop = Math.max(0, body.scrollTop + er.top - br.top - (offset || 8));\n    }));\n  }\n\n  // Disable the old generic bottom-of-feed behavior. It is what hid the text whenever\n  // recommendation cards made the current turn taller than the viewport.\n  bottom = function(){};\n\n  const originalAddMsg = addMsg;\n  addMsg = function(role,text,turn){\n    const m = originalAddMsg(role,text,turn);\n    // A new user question must appear immediately below the previous recommendation cards.\n    // The thinking/answer from SAX is then anchored visibly in the same new turn.\n    saxShow(m, 8);\n    return m;\n  };\n\n  const originalAddProducts = addProducts;\n  addProducts = function(items,turn){\n    originalAddProducts(items,turn);\n    if (!items || !items.length) return;\n    // Adding images must NOT move the viewport to the bottom of the product list.\n    // Keep SAX's answer visible; products remain directly below it for natural downward browsing.\n    const messages = turn.querySelectorAll('.msg.assistant');\n    const answer = messages[messages.length - 1];\n    saxShow(answer, 8);\n  };\n} catch (e) { console.error('SAX scroll fix', e); }\n</script>\n`;

    html = html.replace('</body>', `${fix}</body>`);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).send(html);
  } catch (e) {
    console.error('home', e);
    return res.status(500).send('Unable to load storefront');
  }
}
