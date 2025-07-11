const sqlite3 = require('sqlite3').verbose();

module.exports = async (req, res) => {
  // Open the database for each request
  const db = new sqlite3.Database('prices.db');

  if (req.method === 'GET') {
    // List all prices
    db.all('SELECT * FROM prices ORDER BY SKU, tour', [], (err, rows) => {
      db.close();
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch prices', details: err.message });
      }
      res.status(200).json({ prices: rows });
    });
    return;
  }

  if (req.method === 'PATCH') {
    // Edit a price by id
    let body = req.body;
    if (Buffer.isBuffer(body)) {
      body = body.toString('utf8');
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    const { id, SKU, tour_id, company, tour, adult_net, child_net, remark } = body;
    if (!id) {
      db.close();
      return res.status(400).json({ error: 'Missing id' });
    }
    // Only update provided fields
    const fields = [];
    const values = [];
    if (SKU !== undefined) { fields.push('SKU = ?'); values.push(SKU); }
    if (tour_id !== undefined) { fields.push('tour_id = ?'); values.push(tour_id); }
    if (company !== undefined) { fields.push('company = ?'); values.push(company); }
    if (tour !== undefined) { fields.push('tour = ?'); values.push(tour); }
    if (adult_net !== undefined) { fields.push('adult_net = ?'); values.push(adult_net); }
    if (child_net !== undefined) { fields.push('child_net = ?'); values.push(child_net); }
    if (remark !== undefined) { fields.push('remark = ?'); values.push(remark); }
    if (!fields.length) {
      db.close();
      return res.status(400).json({ error: 'No fields to update' });
    }
    values.push(id);
    db.run(`UPDATE prices SET ${fields.join(', ')} WHERE id = ?`, values, function(err) {
      db.close();
      if (err) {
        return res.status(500).json({ error: 'Failed to update price', details: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Price not found' });
      }
      res.status(200).json({ success: true });
    });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}; 