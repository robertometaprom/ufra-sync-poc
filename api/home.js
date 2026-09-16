import home from '../lib/home-core.js';

const compactSax = `
<style id="shx-sax-compact">
/* Text-first SAX conversation: full screen, no chat bubbles. */
.sax-conversation .sax-body{padding:12px 22px 88px!important}
.sax-feed{gap:4px!important}
.sax-feed .turn{gap:4px!important;margin:0!important}
.sax-feed .msg,.sax-feed .msg.assistant,.sax-feed .msg.user{display:block!important;width:100%!important;max-width:100%!important;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;color:#2d2621!important;font-size:15px!important;line-height:1.35!important;box-shadow:none!important;white-space:pre-wrap!important}
.sax-feed .msg::before{content:attr(data-speaker) ': ';font-weight:800;color:#171411}
.turn-products{padding:10px 0 24px!important}
.turn-products-head{margin:4px 0 12px!important}
.sax-composer{padding:8px 22px max(8px,env(safe-area-inset-bottom))!important}
.sax-composer textarea{min-height:42px!important;max-height:105px!important;padding:9px 11px!important;font-size:15px!important;line-height:1.35!important}
.sax-composer button{height:42px!important}
@media(max-width:620px){
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
 label();const feed=document.querySelector('.sax-feed');if(feed)new MutationObserver(label).observe(feed,{childList:true,subtree:true});
 if(feed&&window.matchMedia('(max-width:620px)').matches){
   const body=document.querySelector('.sax-body');
   let raf=0, timer=0;
   const latestTurn=()=>{const turns=feed.querySelectorAll('.turn');return turns.length?turns[turns.length-1]:feed.lastElementChild};
   const revealLatest=()=>{
     cancelAnimationFrame(raf);clearTimeout(timer);
     raf=requestAnimationFrame(()=>{
       const el=latestTurn();if(!el)return;
       el.scrollIntoView({block:'start',inline:'nearest',behavior:'auto'});
       if(body){const max=Math.max(0,body.scrollHeight-body.clientHeight);if(body.scrollTop>max)body.scrollTop=max;}
       timer=setTimeout(()=>{const last=latestTurn();if(last)last.scrollIntoView({block:'start',inline:'nearest',behavior:'auto'});},120);
     });
   };
   new MutationObserver(revealLatest).observe(feed,{childList:true,subtree:true,characterData:true});
   const composer=document.querySelector('.sax-composer');
   if(composer){
     composer.addEventListener('submit',()=>setTimeout(revealLatest,0),true);
     const send=composer.querySelector('button');if(send)send.addEventListener('click',()=>setTimeout(revealLatest,0),true);
     const input=composer.querySelector('textarea');if(input)input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey)setTimeout(revealLatest,0)},true);
   }
 }
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
