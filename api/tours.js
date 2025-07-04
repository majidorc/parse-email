const { sql } = require('@vercel/postgres');

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    // List all tours with cheapest rate price
    try {
      // Get all tours
      const { rows: tours } = await sql`SELECT * FROM tours ORDER BY program, sku, rate`;
      // Get all rates
      const { rows: rates } = await sql`SELECT * FROM rates`;
      // For each tour, find the cheapest rate (lowest net_adult)
      const toursWithCheapest = tours.map(tour => {
        // Find all rates for this program (by name match)
        // If you want to match by rate name, you can adjust this logic
        const cheapest = rates.reduce((min, rate) => {
          if (!min || Number(rate.net_adult) < Number(min.net_adult)) return rate;
          return min;
        }, null);
        return {
          ...tour,
          cheapest_net_adult: cheapest ? cheapest.net_adult : null,
          cheapest_net_child: cheapest ? cheapest.net_child : null
        };
      });
      res.status(200).json({ tours: toursWithCheapest });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch tours', details: err.message });
    }
    return;
  }
  if (req.method === 'POST') {
    // Add a new tour
    const { id, sku, program, rate, net_adult, net_child, np, np_adult, np_child, remark } = req.body;
    if (!sku || !program || !rate || net_adult === undefined || net_child === undefined || np === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
      await sql`
        INSERT INTO tours (id, sku, program, rate, net_adult, net_child, np, np_adult, np_child, remark)
        VALUES (${id}, ${sku}, ${program}, ${rate}, ${net_adult}, ${net_child}, ${np}, ${np_adult}, ${np_child}, ${remark})
      `;
      res.status(201).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to add tour', details: err.message });
    }
    return;
  }
  if (req.method === 'PUT') {
    // Edit a tour (by id+sku+rate)
    const { id, sku, rate, program, net_adult, net_child, np, np_adult, np_child, remark } = req.body;
    if (!id || !sku || !rate) {
      return res.status(400).json({ error: 'Missing id, sku, or rate' });
    }
    try {
      await sql`
        UPDATE tours SET program=${program}, net_adult=${net_adult}, net_child=${net_child}, np=${np}, np_adult=${np_adult}, np_child=${np_child}, remark=${remark}, updated_at=NOW()
        WHERE id=${id} AND sku=${sku} AND rate=${rate}
      `;
      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to update tour', details: err.message });
    }
    return;
  }
  if (req.method === 'DELETE') {
    // Delete a tour (by id+sku+rate)
    const { id, sku, rate } = req.body;
    if (!id || !sku || !rate) {
      return res.status(400).json({ error: 'Missing id, sku, or rate' });
    }
    try {
      await sql`DELETE FROM tours WHERE id=${id} AND sku=${sku} AND rate=${rate}`;
      res.status(200).json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete tour', details: err.message });
    }
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
}; 