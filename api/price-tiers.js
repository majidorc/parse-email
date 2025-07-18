const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

module.exports = async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const userRole = session.role;
  
  // Only admin and programs_manager can manage price tiers
  if (userRole !== 'admin' && userRole !== 'programs_manager') {
    return res.status(403).json({ error: 'Forbidden: Admin or Programs Manager only' });
  }

  try {
    switch (req.method) {
      case 'GET':
        // Get all price tiers
        const { rows: tiers } = await sql`
          SELECT id, name, tier_type, multiplier, start_date, end_date, is_active, created_at, updated_at
          FROM price_tiers 
          ORDER BY tier_type, name
        `;
        res.status(200).json({ tiers });
        break;

      case 'POST':
        // Create new price tier
        const { name, tier_type, multiplier, start_date, end_date, is_active } = req.body;
        
        if (!name || !tier_type || multiplier === undefined) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        if (tier_type === 'seasonal' && (!start_date || !end_date)) {
          return res.status(400).json({ error: 'Seasonal tiers require start and end dates' });
        }

        if (multiplier <= 0) {
          return res.status(400).json({ error: 'Multiplier must be greater than 0' });
        }

        const insertResult = await sql`
          INSERT INTO price_tiers (name, tier_type, multiplier, start_date, end_date, is_active)
          VALUES (${name}, ${tier_type}, ${multiplier}, ${start_date || null}, ${end_date || null}, ${is_active !== false})
          RETURNING *
        `;
        
        res.status(201).json({ tier: insertResult.rows[0] });
        break;

      case 'PUT':
        // Update existing price tier
        const { id, ...updateData } = req.body;
        
        if (!id) {
          return res.status(400).json({ error: 'Tier ID is required' });
        }

        if (updateData.tier_type === 'seasonal' && (!updateData.start_date || !updateData.end_date)) {
          return res.status(400).json({ error: 'Seasonal tiers require start and end dates' });
        }

        if (updateData.multiplier !== undefined && updateData.multiplier <= 0) {
          return res.status(400).json({ error: 'Multiplier must be greater than 0' });
        }

        const updateResult = await sql`
          UPDATE price_tiers 
          SET 
            name = COALESCE(${updateData.name}, name),
            tier_type = COALESCE(${updateData.tier_type}, tier_type),
            multiplier = COALESCE(${updateData.multiplier}, multiplier),
            start_date = ${updateData.start_date || null},
            end_date = ${updateData.end_date || null},
            is_active = COALESCE(${updateData.is_active}, is_active),
            updated_at = now()
          WHERE id = ${id}
          RETURNING *
        `;

        if (updateResult.rows.length === 0) {
          return res.status(404).json({ error: 'Price tier not found' });
        }

        res.status(200).json({ tier: updateResult.rows[0] });
        break;

      case 'DELETE':
        // Delete price tier
        const { id: deleteId } = req.query;
        
        if (!deleteId) {
          return res.status(400).json({ error: 'Tier ID is required' });
        }

        // Check if tier is being used by any rates
        const { rows: usedRates } = await sql`
          SELECT COUNT(*) as count FROM rates WHERE price_tier_id = ${deleteId}
        `;

        if (parseInt(usedRates[0].count) > 0) {
          return res.status(400).json({ 
            error: 'Cannot delete tier that is being used by rates. Please reassign rates first.' 
          });
        }

        const deleteResult = await sql`
          DELETE FROM price_tiers WHERE id = ${deleteId}
        `;

        if (deleteResult.rowCount === 0) {
          return res.status(404).json({ error: 'Price tier not found' });
        }

        res.status(200).json({ message: 'Price tier deleted successfully' });
        break;

      default:
        res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Price tiers API error:', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
}; 