import home from '../lib/home-core.js';

const compactSax = `
<style id="shx-sax-compact">
/* Text-first SAX conversation: full screen only after the customer starts talking. */
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
/* Before the first question, SAX stays prominently visible without hiding the store. */
body:not(.sax-started).sax-open{padding-left:var(--sax-w)!important;overflow:auto!important}
body:not(.sax-started).sax-open .sax-panel{inset:0 auto 0 0!important;width:var(--sax-w)!important;max-width:430px!important;height:100dvh!important;border-right:1px solid #d9cdbf!important;transform:translateX(0)!important}
body:not(.sax-started).sax-open .sax-backdrop{display:none!important}
@media(max-width:820px){
 body:not(.sax-started).sax-open{padding-left:0!important;overflow:auto!important}
 body:not(.sax-started).sax-open .sax-panel{top:auto!important;bottom:0!important;width:100vw!important;max-width:none!important;height:42dvh!important;min-height:300px!important;border-right:0!important;border-top:1px solid #d9cdbf!important;box-shadow:0 -12px 32px #1f18121f!important}
 body:not(.sax-started).sax-open .sax-hero{min-height:118px!important;height:118px!important;padding:16px 125px 12px 16px!important}
 body:not(.sax-started).sax-open .sax-photo{width:120px!important;height:118px!important}
 body:not(.sax-started).sax-open .sax-title{font-size:30px!important}
 body:not(.sax-started).sax-open .sax-body{padding:10px 12px 74px!important}
}
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
 const feed=document.querySelector('.sax-feed'),body=document.querySelector('.sax-body'),panel=document.querySelector('.sax-panel'),composer=document.querySelector('.sax-composer');
 const label=()=>document.querySelectorAll('.sax-feed .msg').forEach(el=>el.dataset.speaker=el.classList.contains('assistant')?'SAX':firstName());
 label();if(feed)new MutationObserver(label).observe(feed,{childList:true,subtree:true});
 /* Store first, but keep SAX visibly open as an advisor. Only the first submitted question promotes SAX to full screen. */
 document.body.classList.remove('sax-expanded','sax-started');
 if(panel)panel.classList.remove('sax-conversation');
 document.body.classList.add('sax-open');
 let started=false,raf=0,timer=0;
 const latestTurn=()=>{if(!feed)return null;const turns=feed.querySelectorAll('.turn');return turns.length?turns[turns.length-1]:feed.lastElementChild};
 const pinLatest=()=>{
   if(!started||!feed||!body)return;
   cancelAnimationFrame(raf);clearTimeout(timer);
   raf=requestAnimationFrame(()=>{
     body.scrollTop=body.scrollHeight;
     timer=setTimeout(()=>{body.scrollTop=body.scrollHeight},100);
     setTimeout(()=>{body.scrollTop=body.scrollHeight},260);
   });
 };
 const startConversation=()=>{
   if(started)return;
   started=true;document.body.classList.add('sax-started','sax-open');
   if(panel)panel.classList.add('sax-conversation');
   setTimeout(pinLatest,0);setTimeout(pinLatest,120);
 };
 if(feed)new MutationObserver(pinLatest).observe(feed,{childList:true,subtree:true,characterData:true});
 if(composer){
   composer.addEventListener('submit',()=>{startConversation();setTimeout(pinLatest,0)},true);
   const send=composer.querySelector('button');if(send)send.addEventListener('click',()=>{startConversation();setTimeout(pinLatest,0)},true);
   const input=composer.querySelector('textarea');if(input)input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){startConversation();setTimeout(pinLatest,0)}},true);
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
