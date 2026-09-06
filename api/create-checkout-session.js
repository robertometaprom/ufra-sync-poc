import crypto from 'node:crypto';

function cfg(){const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!url||!key)throw new Error('Supabase env missing');return{url:url.replace(/\/$/,''),key}}
async function db(path,{method='GET',body,prefer}={}){const{url,key}=cfg();const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'};if(prefer)headers.Prefer=prefer;const r=await fetch(`${url}/rest/v1/${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});const t=await r.text();if(!r.ok)throw new Error(`Supabase ${r.status}: ${t.slice(0,300)}`);return t?JSON.parse(t):null}
function origin(req){const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0].trim(),host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0].trim();if(!host)throw new Error('Host missing');return `${proto}://${host}`}
function add(p,k,v){if(v!==undefined&&v!==null)p.append(k,String(v))}
function rawBody(req){return new Promise((resolve,reject)=>{const chunks=[];req.on('data',c=>chunks.push(Buffer.from(c)));req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject)})}
function validSignature(payload,header,secret){if(!header||!secret)return false;let timestamp=null;const signatures=[];for(const part of String(header).split(',')){const i=part.indexOf('=');if(i<0)continue;const k=part.slice(0,i).trim(),v=part.slice(i+1).trim();if(k==='t')timestamp=v;if(k==='v1')signatures.push(v)}if(!timestamp||!signatures.length)return false;if(Math.abs(Math.floor(Date.now()/1000)-Number(timestamp))>300)return false;const expected=crypto.createHmac('sha256',secret).update(`${timestamp}.${payload.toString('utf8')}`).digest('hex');const a=Buffer.from(expected,'hex');return signatures.some(sig=>{try{const b=Buffer.from(sig,'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b)}catch{return false}})}

export const config={api:{bodyParser:false}};

export default async function handler(req,res){
  try{
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST required'});
    const raw=await rawBody(req);
    const stripeSignature=req.headers['stripe-signature'];

    if(stripeSignature){
      const webhookSecret=process.env.STRIPE_WEBHOOK_SECRET;
      if(!webhookSecret)throw new Error('STRIPE_WEBHOOK_SECRET missing');
      if(!validSignature(raw,stripeSignature,webhookSecret))return res.status(400).json({ok:false,error:'Invalid Stripe signature'});
      const event=JSON.parse(raw.toString('utf8'));
      if(event.type==='checkout.session.completed'){
        const session=event.data?.object||{},orderId=session.metadata?.order_id;
        if(session.payment_status==='paid'&&orderId&&/^[0-9a-f-]{36}$/i.test(orderId))await db(`orders?id=eq.${orderId}`,{method:'PATCH',prefer:'return=minimal',body:{status:'paid',payment_status:'paid'}});
      }else if(event.type==='payment_intent.payment_failed'){
        const pi=event.data?.object||{},orderId=pi.metadata?.order_id;
        if(orderId&&/^[0-9a-f-]{36}$/i.test(orderId))await db(`orders?id=eq.${orderId}&payment_status=eq.pending`,{method:'PATCH',prefer:'return=minimal',body:{payment_status:'failed'}});
      }
      return res.status(200).json({received:true});
    }

    let body={};try{body=raw.length?JSON.parse(raw.toString('utf8')):{}}catch{return res.status(400).json({ok:false,error:'Invalid JSON'})}
    const stripeKey=process.env.STRIPE_SECRET_KEY;if(!stripeKey||!stripeKey.startsWith('sk_test_'))throw new Error('Stripe test secret key missing');const orderId=String(body?.orderId||'').trim();if(!/^[0-9a-f-]{36}$/i.test(orderId))return res.status(400).json({ok:false,error:'Invalid order id'});
    const orders=await db(`orders?id=eq.${orderId}&select=id,status,payment_status,total,currency,customer_email&limit=1`),order=orders?.[0];if(!order)return res.status(404).json({ok:false,error:'Order not found'});if(order.status!=='pending_payment'||order.payment_status!=='pending')return res.status(409).json({ok:false,error:'Order is not pending payment'});
    const items=await db(`order_items?order_id=eq.${orderId}&select=product_id,quantity,unit_price,products(canonical_name)&order=id.asc`);if(!items?.length)throw new Error('Order has no items');const calculated=items.reduce((s,x)=>s+Number(x.unit_price)*Number(x.quantity),0);if(Math.abs(calculated-Number(order.total))>0.01)throw new Error('Order total mismatch');
    const p=new URLSearchParams();add(p,'mode','payment');add(p,'client_reference_id',order.id);add(p,'customer_email',order.customer_email);add(p,'locale','es');add(p,'success_url',`${origin(req)}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`);add(p,'cancel_url',`${origin(req)}/checkout.html?cancelled=1`);add(p,'metadata[order_id]',order.id);add(p,'metadata[store]','shaxxia');add(p,'payment_intent_data[metadata][order_id]',order.id);add(p,'payment_intent_data[metadata][store]','shaxxia');items.forEach((x,i)=>{const product=Array.isArray(x.products)?x.products[0]:x.products;add(p,`line_items[${i}][price_data][currency]`,'mxn');add(p,`line_items[${i}][price_data][product_data][name]`,product?.canonical_name||'Producto SHAXXIA');add(p,`line_items[${i}][price_data][unit_amount]`,Math.round(Number(x.unit_price)*100));add(p,`line_items[${i}][quantity]`,Math.max(1,Number(x.quantity)||1))});
    const sr=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${stripeKey}`,'Content-Type':'application/x-www-form-urlencoded'},body:p.toString()});const data=await sr.json();if(!sr.ok)throw new Error(data?.error?.message||`Stripe ${sr.status}`);if(!data?.url||!data?.id)throw new Error('Stripe session missing URL');return res.status(200).json({ok:true,sessionId:data.id,url:data.url,orderId:order.id});
  }catch(e){console.error('create-checkout-session',e);return res.status(500).json({ok:false,error:e.message})}
}
