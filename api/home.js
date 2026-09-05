export default async function handler(req,res) {
  try {
    const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
    const host = req.headers.host;
    const r = await fetch(`${proto}://${host}/index.html`, { cache:'no-store' });
    if (!r.ok) throw new Error(`index ${r.status}`);
    let html = await r.text();

    const fix = `\n<script>\n// SAX scroll fix: keep the newest text response visible even when product cards are appended.\n// A new user turn still scrolls below the previous product cards, preserving chronological flow.\ntry {\n  bottom = function(){\n    requestAnimationFrame(() => {\n      const latestTurn = feed && feed.lastElementChild;\n      if (!latestTurn || !body) return;\n      const products = latestTurn.querySelector('.turn-products');\n      const messages = latestTurn.querySelectorAll('.msg');\n      const latestMessage = messages[messages.length - 1];\n      if (products && latestMessage) {\n        const bodyRect = body.getBoundingClientRect();\n        const msgRect = latestMessage.getBoundingClientRect();\n        const target = Math.max(0, body.scrollTop + msgRect.top - bodyRect.top - 10);\n        body.scrollTo({ top: target, behavior: 'smooth' });\n      } else {\n        body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });\n      }\n    });\n  };\n} catch (e) { console.error('SAX scroll fix', e); }\n</script>\n`;

    html = html.replace('</body>', `${fix}</body>`);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).send(html);
  } catch (e) {
    console.error('home', e);
    return res.status(500).send('Unable to load storefront');
  }
}
