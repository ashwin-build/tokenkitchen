// Signs license keys. The matching public key is embedded in the app, so keys verify offline.
const crypto = require('crypto'), fs = require('fs');
const PLANS = {
  Q: { days: 90,  paise: 69900,  label: 'Quarterly' },
  H: { days: 180, paise: 109900, label: 'Half-yearly' },
  A: { days: 365, paise: 219900, label: 'Annual' },
};
const b64 = b => Buffer.from(b).toString('base64url');
function issue(email, plan, start = Date.now()) {
  const pl = PLANS[plan]; if (!pl) throw new Error('Unknown plan');
  const body = b64(JSON.stringify({ e: email, p: plan, s: start, x: start + pl.days * 864e5, id: crypto.randomUUID() }));
  const sig = crypto.sign('sha256', Buffer.from(body), { key: fs.readFileSync(__dirname + '/license-private.pem'), dsaEncoding: 'ieee-p1363' });
  return body + '.' + b64(sig);
}
module.exports = { PLANS, issue };
// Manual issue: node license.js customer@email.com A
if (require.main === module) console.log(issue(process.argv[2], process.argv[3] || 'Q'));
