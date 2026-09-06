export default async function handler(req,res){
  try{
    const proto=(req.headers['x-forwarded-proto']||'https').split(',')[0].trim();
    const host=req.headers.host;
    const r=await fetch(`${proto}://${host}/index.html`,{cache:'no-store'});
    if(!r.ok)throw new Error(`index ${r.status}`);
    let html=await r.text();

    html=html.replace(
      '<a href="/cart.html">Carrito <span id="cartCount">0</span></a>',
      '<button id="shxAccountBtn" class="shx-account-btn" type="button">Entrar</button><a href="/cart.html">Carrito <span id="cartCount">0</span></a>'
    );

    const inject=`
<style>
.sax-body{display:grid!important;grid-template-rows:minmax(170px,42%) minmax(0,58%);gap:10px;overflow:hidden!important;padding:12px!important}
.sax-suggestions{grid-row:1;align-self:start;z-index:2;background:#fffaf5;margin-bottom:0;padding-bottom:8px}
.sax-feed{grid-row:1;min-height:0;overflow-y:auto!important;overflow-x:hidden;padding-top:42px;padding-right:4px;scrollbar-width:thin;overflow-anchor:auto!important}
.sax-recommendations{grid-row:2;min-height:0;overflow-y:auto;border-top:1px solid #ddd1c4;padding:10px 4px 4px;scrollbar-width:thin;overflow-anchor:none!important}
.sax-recommendations:empty{display:none}.sax-recommendations-title{font-family:Georgia,serif;font-size:16px;margin:0 0 9px;color:#2d2621}.sax-recommendations .turn-products{padding:0 0 10px}.sax-recommendations .turn-products-head{display:none}.sax-recommendations .products{grid-template-columns:repeat(2,minmax(0,1fr))!important}
.shx-account-btn{border:1px solid #d8c9b8!important;background:#fffaf5!important;color:#1d1815!important;border-radius:999px!important;padding:8px 12px!important;font-weight:700!important;white-space:nowrap!important;display:inline-flex!important;align-items:center!important;visibility:visible!important;opacity:1!important}
.shx-auth-backdrop{position:fixed;inset:0;z-index:200;background:rgba(18,14,12,.48);display:none;align-items:center;justify-content:center;padding:18px}.shx-auth-backdrop.open{display:flex}.shx-auth-card{width:min(420px,100%);background:#fffaf5;border:1px solid #ded1c3;border-radius:18px;padding:24px;box-shadow:0 24px 70px rgba(0,0,0,.24);font-family:Arial,sans-serif;color:#241e1a}.shx-auth-card h2{font-family:Georgia,serif;font-size:28px;margin:0 0 6px}.shx-auth-card p{font-size:14px;line-height:1.45;margin:0 0 18px;color:#5a4f47}.shx-auth-field{display:block;margin:0 0 12px}.shx-auth-field span{display:block;font-size:12px;font-weight:700;margin:0 0 6px}.shx-auth-field input{width:100%;border:1px solid #d8c9b8;border-radius:12px;padding:12px 13px;background:#fff;font-size:15px}.shx-auth-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.shx-auth-primary,.shx-auth-secondary,.shx-auth-logout,.shx-auth-save-name,.shx-auth-google{border:0;border-radius:12px;padding:12px 14px;font-weight:700;cursor:pointer}.shx-auth-primary,.shx-auth-logout,.shx-auth-save-name{background:#171310;color:#fff}.shx-auth-secondary{background:#eee4d9;color:#241e1a}.shx-auth-google{width:100%;margin:0 0 14px;background:#fff;color:#2b2724;border:1px solid #d8d3cf;display:flex;align-items:center;justify-content:center;gap:10px}.shx-auth-google:hover{background:#f8f7f5}.shx-google-mark{font-family:Arial,sans-serif;font-size:18px;font-weight:800;line-height:1;color:#4285f4}.shx-auth-divider{display:flex;align-items:center;gap:10px;margin:0 0 14px;color:#8a7f76;font-size:12px}.shx-auth-divider:before,.shx-auth-divider:after{content:'';height:1px;flex:1;background:#ddd2c8}.shx-auth-logout{width:100%;margin-top:10px}.shx-auth-save-name{width:100%;margin-top:4px}.shx-auth-status{min-height:18px;margin-top:12px!important;font-size:13px!important;color:#7a2f2f!important}.shx-auth-close{float:right;border:0;background:transparent;font-size:24px;cursor:pointer;color:#665b53}.shx-auth-user{background:#f1e7dc;border-radius:12px;padding:12px 14px;margin-top:12px;font-size:14px}.shx-auth-email-note{font-size:12px!important;color:#786d65!important;margin:8px 0 12px!important}
@media(max-width:1180px){.sax-recommendations .products{grid-template-columns:1fr!important}}@media(max-width:820px){.sax-body{grid-template-rows:minmax(160px,45%) minmax(0,55%)}.sax-feed{padding-top:42px}}@media(max-width:720px){.shx-auth-actions{grid-template-columns:1fr}}
</style>

<div id="shxAuthBackdrop" class="shx-auth-backdrop">
  <div class="shx-auth-card" role="dialog" aria-modal="true" aria-label="Mi cuenta SHAXXIA">
    <button class="shx-auth-close" type="button" aria-label="Cerrar">×</button>
    <div class="shx-auth-guest">
      <h2>Mi cuenta</h2><p>Entra o crea tu cuenta para guardar tu acceso y tus pedidos.</p>
      <button class="shx-auth-google" type="button"><span class="shx-google-mark">G</span>Continuar con Google</button>
      <div class="shx-auth-divider"><span>o usa tu correo</span></div>
      <label class="shx-auth-field"><span>Nombre</span><input class="shx-auth-name" type="text" autocomplete="name" placeholder="Tu nombre"></label>
      <label class="shx-auth-field"><span>Correo</span><input class="shx-auth-email" type="email" autocomplete="email" placeholder="tu@correo.com"></label>
      <label class="shx-auth-field"><span>Contraseña</span><input class="shx-auth-password" type="password" autocomplete="current-password" minlength="6" placeholder="Mínimo 6 caracteres"></label>
      <div class="shx-auth-actions"><button class="shx-auth-primary" type="button">Entrar</button><button class="shx-auth-secondary" type="button">Crear cuenta</button></div>
      <p class="shx-auth-status"></p>
    </div>
    <div class="shx-auth-signed" hidden>
      <h2>Mi cuenta</h2><p>Sesión iniciada correctamente.</p>
      <div class="shx-auth-user"></div>
      <p class="shx-auth-email-note"></p>
      <label class="shx-auth-field"><span>Tu nombre</span><input class="shx-auth-profile-name" type="text" autocomplete="name" placeholder="Tu nombre"></label>
      <button class="shx-auth-save-name" type="button">Guardar nombre</button>
      <p class="shx-auth-signed-status shx-auth-status"></p>
      <button class="shx-auth-logout" type="button">Cerrar sesión</button>
    </div>
  </div>
</div>

<script>
try{
  if(typeof bottom==='function')bottom=function(){};
  if(typeof openSax==='function'){
    const originalOpenSax=openSax;
    openSax=function(){originalOpenSax();if(innerWidth>1180)document.body.classList.add('sax-expanded')};
  }
  const saxBody=document.querySelector('.sax-body');
  if(saxBody&&typeof addProducts==='function'){
    const recPane=document.createElement('section');recPane.className='sax-recommendations';recPane.setAttribute('aria-label','Opciones recomendadas por SAX');saxBody.appendChild(recPane);
    if(typeof addMsg==='function'){
      const originalAddMsg=addMsg;addMsg=function(role,text,turn){const m=originalAddMsg(role,text,turn);requestAnimationFrame(()=>{const feed=document.querySelector('.sax-feed');if(feed)feed.scrollTop=feed.scrollHeight});return m};
    }
    const originalAddProducts=addProducts;addProducts=function(items,turn){originalAddProducts(items,turn);if(!items||!items.length)return;const block=turn.querySelector('.turn-products');if(!block)return;recPane.innerHTML='<div class="sax-recommendations-title">Opciones para ti</div>';recPane.appendChild(block);recPane.scrollTop=0};
  }
}catch(e){console.error('SAX layout runtime',e)}
</script>

<script>
try{
  const SB_URL='https://yfbuxelsdpucmtxnuazv.supabase.co';
  const SB_KEY='sb_publishable_Oj2nv9h1zLVuiBqEndPgLg_0P64QJhq';
  const AUTH_KEY='shaxx_auth_v1';
  let accountBtn=document.getElementById('shxAccountBtn');
  if(!accountBtn){
    const actions=document.querySelector('.top-actions');
    if(actions){
      accountBtn=document.createElement('button');accountBtn.id='shxAccountBtn';accountBtn.className='shx-account-btn';accountBtn.type='button';accountBtn.textContent='Entrar';
      const cart=actions.querySelector('a[href="/cart.html"]');if(cart)actions.insertBefore(accountBtn,cart);else actions.appendChild(accountBtn);
    }
  }
  if(!accountBtn)throw new Error('Account mount point not found');
  const backdrop=document.getElementById('shxAuthBackdrop');
  const guest=backdrop.querySelector('.shx-auth-guest'),signed=backdrop.querySelector('.shx-auth-signed'),status=backdrop.querySelector('.shx-auth-status'),nameInput=backdrop.querySelector('.shx-auth-name'),email=backdrop.querySelector('.shx-auth-email'),password=backdrop.querySelector('.shx-auth-password'),userBox=backdrop.querySelector('.shx-auth-user'),emailNote=backdrop.querySelector('.shx-auth-email-note'),profileName=backdrop.querySelector('.shx-auth-profile-name'),signedStatus=backdrop.querySelector('.shx-auth-signed-status'),googleBtn=backdrop.querySelector('.shx-auth-google');
  function loadAuth(){try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}}
  function saveAuth(v){if(v)localStorage.setItem(AUTH_KEY,JSON.stringify(v));else localStorage.removeItem(AUTH_KEY)}
  async function authFetch(path,options={}){const headers=Object.assign({'apikey':SB_KEY,'Content-Type':'application/json'},options.headers||{});const rr=await fetch(SB_URL+path,Object.assign({},options,{headers}));const data=await rr.json().catch(()=>({}));if(!rr.ok)throw new Error(data?.msg||data?.message||data?.error_description||data?.error||'No se pudo completar la operación');return data}
  async function refreshSession(){const s=loadAuth();if(!s?.refresh_token)return null;try{const data=await authFetch('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:s.refresh_token})});const next={access_token:data.access_token,refresh_token:data.refresh_token,user:data.user,expires_at:Date.now()+((data.expires_in||3600)*1000)};saveAuth(next);return next}catch{saveAuth(null);return null}}
  async function currentSession(){let s=loadAuth();if(!s)return null;if(!s.expires_at||Date.now()>s.expires_at-60000)s=await refreshSession();return s}
  function displayName(u){return (u?.user_metadata?.full_name||u?.user_metadata?.name||u?.user_metadata?.given_name||'').trim()}
  function renderAuth(s){const u=s?.user;if(u){const n=displayName(u);accountBtn.textContent=n||'Mi cuenta';guest.hidden=true;signed.hidden=false;userBox.textContent=n||'Cuenta activa';emailNote.textContent=u.email||'';profileName.value=n}else{accountBtn.textContent='Entrar';guest.hidden=false;signed.hidden=true;userBox.textContent='';emailNote.textContent='';profileName.value=''}}
  async function captureOAuthSession(){
    if(!location.hash||!location.hash.includes('access_token='))return null;
    const p=new URLSearchParams(location.hash.slice(1));const access=p.get('access_token'),refresh=p.get('refresh_token'),expires=Number(p.get('expires_in')||3600);
    if(!access)return null;
    try{const u=await authFetch('/auth/v1/user',{headers:{Authorization:'Bearer '+access}});const s={access_token:access,refresh_token:refresh,user:u,expires_at:Date.now()+(expires*1000)};saveAuth(s);history.replaceState({},document.title,location.pathname+location.search);return s}catch(e){console.error('Google OAuth session',e);return null}
  }
  function openAuth(){status.textContent='';signedStatus.textContent='';backdrop.classList.add('open');currentSession().then(renderAuth)}function closeAuth(){backdrop.classList.remove('open')}
  accountBtn.addEventListener('click',openAuth);backdrop.querySelector('.shx-auth-close').addEventListener('click',closeAuth);backdrop.addEventListener('click',e=>{if(e.target===backdrop)closeAuth()});
  function signInWithGoogle(){status.textContent='';const redirect=encodeURIComponent(location.origin+'/');location.href=SB_URL+'/auth/v1/authorize?provider=google&redirect_to='+redirect}
  async function signIn(){status.textContent='';const e=email.value.trim(),p=password.value;if(!e||!p){status.textContent='Escribe tu correo y contraseña.';return}try{const data=await authFetch('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:e,password:p})});const s={access_token:data.access_token,refresh_token:data.refresh_token,user:data.user,expires_at:Date.now()+((data.expires_in||3600)*1000)};saveAuth(s);renderAuth(s)}catch(err){status.textContent=err.message}}
  async function signUp(){status.textContent='';const n=nameInput.value.trim(),e=email.value.trim(),p=password.value;if(!n){status.textContent='Escribe tu nombre.';return}if(!e||!p){status.textContent='Escribe tu correo y una contraseña.';return}if(p.length<6){status.textContent='La contraseña debe tener al menos 6 caracteres.';return}try{const redirect=encodeURIComponent(location.origin+'/');const data=await authFetch('/auth/v1/signup?redirect_to='+redirect,{method:'POST',body:JSON.stringify({email:e,password:p,data:{brand:'SHAXXIA',full_name:n}})});if(data?.access_token){const s={access_token:data.access_token,refresh_token:data.refresh_token,user:data.user,expires_at:Date.now()+((data.expires_in||3600)*1000)};saveAuth(s);renderAuth(s)}else{status.textContent='Cuenta creada. Revisa tu correo para confirmar tu cuenta.'}}catch(err){status.textContent=err.message}}
  async function saveName(){signedStatus.textContent='';const n=profileName.value.trim();if(!n){signedStatus.textContent='Escribe tu nombre.';return}const s=await currentSession();if(!s?.access_token){signedStatus.textContent='Tu sesión expiró. Vuelve a entrar.';return}try{const u=await authFetch('/auth/v1/user',{method:'PUT',headers:{Authorization:'Bearer '+s.access_token},body:JSON.stringify({data:{full_name:n,brand:'SHAXXIA'}})});const next={...s,user:u};saveAuth(next);renderAuth(next);signedStatus.style.color='#365a38';signedStatus.textContent='Nombre guardado.'}catch(err){signedStatus.textContent=err.message}}
  googleBtn.addEventListener('click',signInWithGoogle);backdrop.querySelector('.shx-auth-primary').addEventListener('click',signIn);backdrop.querySelector('.shx-auth-secondary').addEventListener('click',signUp);backdrop.querySelector('.shx-auth-save-name').addEventListener('click',saveName);backdrop.querySelector('.shx-auth-logout').addEventListener('click',async()=>{const s=loadAuth();try{if(s?.access_token)await authFetch('/auth/v1/logout',{method:'POST',headers:{Authorization:'Bearer '+s.access_token},body:'{}'})}catch{}saveAuth(null);renderAuth(null);closeAuth()});password.addEventListener('keydown',e=>{if(e.key==='Enter')signIn()});
  window.SHAXXIA_AUTH={async getAccessToken(){return (await currentSession())?.access_token||null},async getUser(){return (await currentSession())?.user||null},open:openAuth};
  captureOAuthSession().then(s=>{if(s){renderAuth(s);closeAuth()}else currentSession().then(renderAuth)});
}catch(e){console.error('SHAXXIA auth runtime',e)}
</script>`;

    html=html.replace('</body>',`${inject}</body>`);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).send(html);
  }catch(e){console.error('home',e);return res.status(500).send('Unable to load storefront')}
}
