import home from './home.js';

const compactSax = `
<style id="shx-sax-compact">
/* Text-first SAX conversation. Keep the full-screen workspace; remove chat-bubble waste. */
.sax-conversation .sax-hero{height:62px!important;min-height:62px!important;padding:8px 78px 7px 66px!important}
.sax-conversation .sax-photo{left:14px!important;top:8px!important;width:46px!important;height:46px!important}
.sax-conversation .sax-title{font-size:21px!important;margin:0 0 1px!important}
.sax-conversation .sax-sub{font-size:10px!important}
.sax-conversation .sax-body{padding:12px 22px 88px!important}
.sax-feed{gap:4px!important}
.sax-feed .turn{gap:4px!important}
.sax-feed .msg,.sax-feed .msg.assistant,.sax-feed .msg.user{display:block!important;width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#2d2621!important;font-size:14px!important;line-height:1.35!important;box-shadow:none!important;white-space:pre-wrap!important}
.sax-feed .msg::before{content:attr(data-speaker) ': ';font-weight:800;color:#171411}
.turn-products{padding:10px 0 24px!important}
.turn-products-head{margin:4px 0 12px!important}
.sax-composer{padding:8px 22px max(8px,env(safe-area-inset-bottom))!important}
.sax-composer textarea{min-height:42px!important;max-height:105px!important;padding:9px 11px!important;font-size:14px!important;line-height:1.35!important}
.sax-composer button{height:42px!important}
@media(max-width:620px){
 .sax-conversation .sax-hero{height:58px!important;min-height:58px!important;padding:7px 62px 6px 60px!important}
 .sax-conversation .sax-photo{left:10px!important;top:7px!important;width:44px!important;height:44px!important}
 .sax-conversation .sax-title{font-size:20px!important}
 .sax-conversation .sax-body{padding:9px 12px 82px!important}
 .sax-feed{gap:3px!important}.sax-feed .turn{gap:3px!important}
 .sax-feed .msg,.sax-feed .msg.assistant,.sax-feed .msg.user{font-size:13px!important;line-height:1.32!important}
 .sax-composer{padding:7px 10px max(7px,env(safe-area-inset-bottom))!important}
 .sax-composer textarea{min-height:40px!important;font-size:13px!important}
}
</style>
<script id="shx-sax-speakers">
(()=>{
 const firstName=()=>{try{const s=JSON.parse(localStorage.getItem('shaxx_auth_v1')||'null');const u=s&&s.user;const n=(u&&u.user_metadata&&(u.user_metadata.full_name||u.user_metadata.name||u.user_metadata.given_name)||'').trim();return n?n.split(/\\s+/)[0]:'Tú'}catch{return 'Tú'}};
 const label=()=>document.querySelectorAll('.sax-feed .msg').forEach(el=>el.dataset.speaker=el.classList.contains('assistant')?'SAX':firstName());
 label();
 const feed=document.querySelector('.sax-feed');if(feed)new MutationObserver(label).observe(feed,{childList:true,subtree:true});
})();
</script>`;

export default async function handler(req,res){
  const send=res.send.bind(res);
  res.send=(body)=>{
    if(typeof body==='string'&&body.includes('</body>')) body=body.replace('</body>',compactSax+'</body>');
    return send(body);
  };
  return home(req,res);
}
