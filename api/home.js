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

/* SHAXXIA account access */
.shx-account-btn{border:1px solid rgba(35,28,23,.18);background:#fffaf5;color:#1d1815;border-radius:999px;padding:8px 12px;font:600 13px/1.1 Arial,sans-serif;cursor:pointer;max-width:190px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 0 auto}
.shx-account-btn:hover{background:#f5ede4}
.shx-account-btn.shx-account-fallback{position:fixed;top:14px;right:18px;z-index:180;box-shadow:0 8px 24px rgba(0,0,0,.09)}
.shx-auth-backdrop{position:fixed;inset:0;z-index:200;background:rgba(18,14,12,.48);display:none;align-items:center;justify-content:center;padding:18px}
.shx-auth-backdrop.open{display:flex}
.shx-auth-card{width:min(420px,100%);background:#fffaf5;border:1px solid #ded1c3;border-radius:18px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.24);font-family:Arial,sans-serif;color:#241e1a}
.shx-auth-card h2{font-family:Georgia,serif;font-size:28px;margin:0 0 6px}
.shx-auth-card p{font-size:14px;line-height:1.45;margin:0 0 18px;color:#5a4f47}
.shx-auth-field{display:block;margin:0 0 12px}
.shx-auth-field span{display:block;font-size:12px;font-weight:700;margin:0 0 6px}
.shx-auth-field input{width:100%;box-sizing:border-box;border:1px solid #d8c9b8;border-radius:12px;padding:12px 13px;background:white;color:#1d1815;font-size:15px;outline:none}
.shx-auth-field input:focus{border-color:#8d7460;box-shadow:0 0 0 3px rgba(141,116,96,.11)}
.shx-auth-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px}
.shx-auth-primary,.shx-auth-secondary,.shx-auth-logout{border:0;border-radius:12px;padding:12px 14px;font-weight:700;cursor:pointer}
.shx-auth-primary{background:#171310;color:white}
.shx-auth-secondary{background:#eee4d9;color:#241e1a}
.shx-auth-logout{width:100%;background:#171310;color:white;margin-top:12px}
.shx-auth-status{min-height:18px;margin-top:12px!important;font-size:13px!important;color:#7a2f2f!important}
.shx-auth-close{float:right;border:0;background:transparent;font-size:24px;line-height:1;cursor:pointer;color:#665b53;margin:-2px -2px 0 10px}
.shx-auth-user{background:#f1e7dc;border-radius:12px;padding:12px 14px;margin-top:12px;font-size:14px}
@media(max-width:720px){.shx-account-btn{padding:8px 10px}.shx-account-btn.shx-account-fallback{top:10px;right:10px}.shx-auth-actions{grid-template-columns:1fr}}
</style>
<script>
try {
  bottom = function(){};

  const originalOpenSax = openSax;
  openSax = function(){
    originalOpenSax();
    if (innerWidth > 1180) document.body.classList.add('sax-expanded');
  };

  const recPane = document.createElement('section');
  recPane.className = 'sax-recommendations';
  recPane.setAttribute('aria-label','Opciones recomendadas por SAX');
  body.appendChild(recPane);

  const originalAddMsg = addMsg;
  addMsg = function(role,text,turn){
    const m = originalAddMsg(role,text,turn);
    requestAnimationFrame(() => {
      const feed = document.querySelector('.sax-feed');
      if (feed) feed.scrollTop = feed.scrollHeight;
    });
    return m;
  };

  const originalAddProducts = addProducts;
  addProducts = function(items,turn){
    originalAddProducts(items,turn);
    if (!items || !items.length) return;
    const block = turn.querySelector('.turn-products');
    if (!block) return;
    recPane.innerHTML = '<div class="sax-recommendations-title">Opciones para ti</div>';
    recPane.appendChild(block);
    recPane.scrollTop = 0;
  };

  const SB_URL='https://yfbuxelsdpucmtxnuazv.supabase.co';
  const SB_KEY='sb_publishable_Oj2nv9h1zLVuiBqEndPgLg_0P64QJhq';
  const AUTH_KEY='shaxx_auth_v1';

  function loadAuth(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}}
  function saveAuth(v){if(v)localStorage.setItem(AUTH_KEY,JSON.stringify(v));else localStorage.removeItem(AUTH_KEY)}
  async function authFetch(path,options={}){
    const headers=Object.assign({'apikey':SB_KEY,'Content-Type':'application/json'},options.headers||{});
    const r=await fetch(SB_URL+path,Object.assign({},options,{headers}));
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data?.msg||data?.message||data?.error_description||data?.error||'No se pudo completar la operación');
    return data;
  }
  async function refreshSession(){
    const s=loadAuth();if(!s?.refresh_token)return null;
    try{const data=await authFetch('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:s.refresh_token})});const next={access_token:data.access_token,refresh_token:data.refresh_token,user:data.user,expires_at:Date.now()+((data.expires_in||3600)*1000)};saveAuth(next);return next}catch{saveAuth(null);return null}
  }
  async function currentSession(){let s=loadAuth();if(!s)return null;if(!s.expires_at||Date.now()>s.expires_at-60000)s=await refreshSession();return s}

  const accountBtn=document.createElement('button');
  accountBtn.className='shx-account-btn';accountBtn.type='button';accountBtn.textContent='Entrar';
  const navCandidates=[...document.querySelectorAll('header nav, header .nav, nav')];
  const nav=navCandidates.find(n=>/Carrito/i.test(n.textContent||''))||navCandidates[0];
  if(nav){nav.appendChild(accountBtn)}else{accountBtn.classList.add('shx-account-fallback');document.body.appendChild(accountBtn)}

  const backdrop=document.createElement('div');
  backdrop.className='shx-auth-backdrop';
  backdrop.innerHTML='<div class="shx-auth-card" role="dialog" aria-modal="true" aria-label="Mi cuenta SHAXXIA"><button class="shx-auth-close" type="button" aria-label="Cerrar">×</button><div class="shx-auth-guest"><h2>Mi cuenta</h2><p>Entra o crea tu cuenta con tu correo para guardar tu acceso y tus pedidos.</p><label class="shx-auth-field"><span>Correo</span><input class="shx-auth-email" type="email" autocomplete="email" placeholder="tu@correo.com"></label><label class="shx-auth-field"><span>Contraseña</span><input class="shx-auth-password" type="password" autocomplete="current-password" minlength="6" placeholder="Mínimo 6 caracteres"></label><div class="shx-auth-actions"><button class="shx-auth-primary" type="button">Entrar</button><button class="shx-auth-secondary" type="button">Crear cuenta</button></div><p class="shx-auth-status"></p></div><div class="shx-auth-signed" hidden><h2>Mi cuenta</h2><p>Sesión iniciada correctamente.</p><div class="shx-auth-user"></div><button class="shx-auth-logout" type="button">Cerrar sesión</button></div></div>';
  document.body.appendChild(backdrop);

  const guest=backdrop.querySelector('.shx-auth-guest'),signed=backdrop.querySelector('.shx-auth-signed'),status=backdrop.querySelector('.shx-auth-status'),email=backdrop.querySelector('.shx-auth-email'),password=backdrop.querySelector('.shx-auth-password'),userBox=backdrop.querySelector('.shx-auth-user');
  function renderAuth(session){const u=session?.user;if(u){accountBtn.textContent=u.email||'Mi cuenta';guest.hidden=true;signed.hidden=false;userBox.textContent=u.email||'Cuenta activa'}else{accountBtn.textContent='Entrar';guest.hidden=false;signed.hidden=true;userBox.textContent=''}}
  function openAuth(){status.textContent='';backdrop.classList.add('open');currentSession().then(renderAuth)}
  function closeAuth(){backdrop.classList.remove('open')}
  accountBtn.addEventListener('click',openAuth);backdrop.querySelector('.shx-auth-close').addEventListener('click',closeAuth);backdrop.addEventListener('click',e=>{if(e.target===backdrop)closeAuth()});
  async function signIn(){status.textContent='';const e=email.value.trim(),p=password.value;if(!e||!p){status.textContent='Escribe tu correo y contraseña.';return}try{const data=await authFetch('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:e,password:p})});const session={access_token:data.access_token,refresh_token:data.refresh_token,user:data.user,expires_at:Date.now()+((data.expires_in||3600)*1000)};saveAuth(session);renderAuth(session)}catch(err){status.textContent=err.message}}
  async function signUp(){status.textContent='';const e=email.value.trim(),p=password.value;if(!e||!p){status.textContent='Escribe tu correo y una contraseña.';return}if(p.length<6){status.textContent='La contraseña debe tener al menos 6 caracteres.';return}try{const data=await authFetch('/auth/v1/signup',{method:'POST',body:JSON.stringify({email:e,password:p,data:{brand:'SHAXXIA'}})});if(data?.access_token){const session={access_token:data.access_token,refresh_token:data.refresh_token,user:data.user,expires_at:Date.now()+((data.expires_in||3600)*1000)};saveAuth(session);renderAuth(session)}else{status.style.color='#365a38';status.textContent='Cuenta creada. Revisa tu correo para confirmar tu cuenta y después entra aquí.'}}catch(err){status.textContent=err.message}}
  backdrop.querySelector('.shx-auth-primary').addEventListener('click',signIn);backdrop.querySelector('.shx-auth-secondary').addEventListener('click',signUp);backdrop.querySelector('.shx-auth-logout').addEventListener('click',async()=>{const s=loadAuth();try{if(s?.access_token)await authFetch('/auth/v1/logout',{method:'POST',headers:{Authorization:'Bearer '+s.access_token},body:'{}'})}catch{}saveAuth(null);renderAuth(null);closeAuth()});password.addEventListener('keydown',e=>{if(e.key==='Enter')signIn()});
  window.SHAXXIA_AUTH={async getAccessToken(){return (await currentSession())?.access_token||null},async getUser(){return (await currentSession())?.user||null},open:openAuth};
  currentSession().then(renderAuth);
} catch (e) { console.error('SHAXXIA runtime', e); }
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
