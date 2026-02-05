const crypto = require('crypto');
const express = require('express');

const app = express();
app.use(express.json({ verify: (req, res, buf) => (req.rawBody = buf) }));

function verifySignature(rawBody, signature, secret) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

app.post('/webhooks/chat', (req, res) => {
  const signature = req.header('x-webhook-signature');
  if (!verifySignature(req.rawBody, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body;
  console.log('webhook', event.type, event.data);
  return res.status(204).send();
});

app.listen(3000, () => console.log('Webhook listener on 3000'));
