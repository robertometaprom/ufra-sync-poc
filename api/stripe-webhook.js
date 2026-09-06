import crypto from 'node:crypto';

function cfg(){
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Supabase env missing');
  return{url:url.replace(/\/$/,''),key};
}
async function db(path,{method='GET',body,prefer}={}){
  const{url,key}=cfg();
  const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};
  if(prefer)headers.Prefer=prefer;
  const r=await fetch(`${url}/rest/v1/${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  const t=await r.text();
  if(!r.ok)throw new Error(`Supabase ${r.status}: ${t.slice(0,300)}`);
  return t?JSON.parse(t):null;
}
function rawBody(req){
  return new Promise((resolve,reject)=>{const chunks=[];req.on('data',c=>chunks.push(Buffer.from(c)));req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject)});
}
function validSignature(payload,header,secret){
  if(!header||!secret)return false;
  const parts=Object.fromEntries(String(header).split(',').map(x=>x.split('=').map(s=>s.trim()))),timestamp=parts.t,signature=parts.v1;
  if(!timestamp||!signature)return false;
  if(Math.abs(Math.floor(Date.now()/1000)-Number(timestamp))>300)return false;
  const expected=crypto.createHmac('sha256',secret).update(`${timestamp}.${payload.toString('utf8')}`).digest('hex');
  const a=Buffer.from(expected,'hex'),b=Buffer.from(signature,'hex');
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
export const config={api:{bodyParser:false}};
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST required'});
  try{
    const secret=process.env.STRIPE_WEBHOOK_SECRET;
    if(!secret)throw new Error('STRIPE_WEBHOOK_SECRET missing');
    const raw=await rawBody(req);
    if(!validSignature(raw,req.headers['stripe-signature'],secret))return res.status(400).json({ok:false,error:'Invalid Stripe signature'});
    const event=JSON.parse(raw.toString('utf8'));
    if(event.type==='checkout.session.completed'){
      const session=event.data?.object||{},orderId=session.metadata?.order_id;
      if(orderId&&/^[0-9a-f-]{36}$/i.test(orderId)){
        await db(`orders?id=eq.${orderId}`,{method:'PATCH',prefer:'return=minimal',body:{status:'paid',payment_status:'paid'}});
      }
    }else if(event.type==='payment_intent.payment_failed'){
      const pi=event.data?.object||{},orderId=pi.metadata?.order_id;
      if(orderId&&/^[0-9a-f-]{36}$/i.test(orderId)){
        await db(`orders?id=eq.${orderId}&payment_status=eq.pending`,{method:'PATCH',prefer:'return=minimal',body:{payment_status:'failed'}});
      }
    }
    return res.status(200).json({received:true});
  }catch(e){return res.status(500).json({ok:false,error:e.message})}
}
