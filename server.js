// Run: npm i express && RZP_KEY_ID=... RZP_KEY_SECRET=... RZP_WEBHOOK_SECRET=... AGGREGATOR_SECRET=... FEED_KEY=... node server.js   (Node 18+)
const express = require('express'), crypto = require('crypto'), { PLANS, issue } = require('./license');
const { RZP_KEY_ID, RZP_KEY_SECRET, RZP_WEBHOOK_SECRET, AGGREGATOR_SECRET, FEED_KEY } = process.env;
const app = express(), licenses = new Map(), clients = new Set(); // use a real database in production
app.use(express.json({ verify: (req, _, buf) => { req.raw = buf; } }));
app.use(express.static(__dirname + '/public')); // put tokenkitchen.html here (same origin, no CORS)

// ---- Licence purchase (Razorpay) ----
app.post('/api/order', async (req, res) => {
  const { plan, email } = req.body, pl = PLANS[plan];
  if (!pl || !email) return res.status(400).json({ error: 'Choose a plan and enter an email' });
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(RZP_KEY_ID + ':' + RZP_KEY_SECRET).toString('base64') },
    body: JSON.stringify({ amount: pl.paise, currency: 'INR', notes: { plan, email } }),
  });
  const o = await r.json();
  if (!r.ok) return res.status(502).json(o);
  res.json({ orderId: o.id, keyId: RZP_KEY_ID, amount: o.amount });
});
// Razorpay calls this after payment. Add the "order.paid" event in the dashboard.
app.post('/webhook/razorpay', (req, res) => {
  const want = crypto.createHmac('sha256', RZP_WEBHOOK_SECRET).update(req.raw).digest('hex');
  const got = req.get('X-Razorpay-Signature') || '';
  if (got.length !== want.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want))) return res.sendStatus(400);
  if (req.body.event === 'order.paid') {
    const o = req.body.payload.order.entity, { plan, email } = o.notes || {};
    if (PLANS[plan] && o.amount_paid === PLANS[plan].paise && !licenses.has(o.id)) {
      licenses.set(o.id, issue(email, plan));
      console.log('Licence issued for', email, plan); // TODO: also email the key to the customer
    }
  }
  res.sendStatus(200);
});
app.get('/api/license', (req, res) => { const k = licenses.get(req.query.order); k ? res.json({ key: k }) : res.sendStatus(404); });
app.get('/buy', (req, res) => res.type('html').send(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Buy licence</title>
<body style="font:16px system-ui;max-width:480px;margin:40px auto;padding:0 16px"><h2>TokenKitchen licence</h2><p id=m>Opening checkout…</p><textarea id=k rows=5 style="width:100%;display:none"></textarea>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script><script>
const q=new URLSearchParams(location.search),m=document.getElementById('m');
fetch('/api/order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plan:q.get('plan'),email:q.get('email')})}).then(r=>r.json()).then(o=>{
 if(!o.orderId){m.textContent='Could not start payment.';return}
 new Razorpay({key:o.keyId,order_id:o.orderId,amount:o.amount,name:'TokenKitchen',prefill:{email:q.get('email')},handler:()=>{m.textContent='Payment received. Generating your key…';
  const t=setInterval(async()=>{const r=await fetch('/api/license?order='+o.orderId);if(r.ok){clearInterval(t);const{key}=await r.json();m.textContent='Copy this key into Plan & license in the app:';const k=document.getElementById('k');k.style.display='block';k.value=key}},1500)}}).open()});
</script>`));

// ---- Delivery-app orders -> live feed (Server-Sent Events) ----
// Swiggy/Zomato order payloads are only shared with approved partners. Map each one here once you have their docs.
const normalize = {
  swiggy: b => ({ ext: b.orderId, src: 'swiggy', items: (b.items || []).map(i => ({ n: i.name, q: i.quantity })) }), // TODO: replace with the real payload mapping
  zomato: b => ({ ext: b.orderId, src: 'zomato', items: (b.items || []).map(i => ({ n: i.name, q: i.quantity })) }), // TODO: replace with the real payload mapping
};
app.post('/webhooks/:platform', (req, res) => {
  if (req.get('X-Webhook-Secret') !== AGGREGATOR_SECRET) return res.sendStatus(401); // TODO: use each platform's own signature scheme
  const o = normalize[req.params.platform]?.(req.body);
  if (!o) return res.sendStatus(400);
  clients.forEach(c => c.write('data: ' + JSON.stringify(o) + '\n\n'));
  res.sendStatus(200);
});
app.get('/events', (req, res) => {
  if (req.query.key !== FEED_KEY) return res.sendStatus(401);
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' }); res.flushHeaders();
  clients.add(res); req.on('close', () => clients.delete(res));
});
app.listen(process.env.PORT || 3000, () => console.log('Server running'));
