export default async function handler(req, res) {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        console.log('LINE Webhook Event:', JSON.stringify(json, null, 2));
      } catch (e) {
        console.log('LINE Webhook Raw Body:', body);
      }
      res.status(200).send('OK');
    });
  } else {
    res.status(405).send('Method Not Allowed');
  }
} 