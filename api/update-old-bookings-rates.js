const { sql } = require('@vercel/postgres');
const { getSession } = require('./auth.js');

module.exports = async (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  
  const userRole = session.role;
  if (userRole !== 'admin') return res.status(403).json({ error: 'Forbidden: Admin only' });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Starting to update old bookings with missing rates...');
    
    // Get all bookings that have SKU but no rate
    const { rows: bookingsWithoutRates } = await sql`
      SELECT booking_number, sku, rate 
      FROM bookings 
      WHERE sku IS NOT NULL 
      AND sku != '' 
      AND (rate IS NULL OR rate = '' OR rate = 'null')
    `;
    
    console.log(`Found ${bookingsWithoutRates.length} bookings without rates`);
    
    if (bookingsWithoutRates.length === 0) {
      return res.status(200).json({ 
        message: 'No bookings need updating!',
        updated: 0,
        skipped: 0,
        total: 0
      });
    }
    
    // Get all products and their rates
    const { rows: products } = await sql`
      SELECT p.sku, p.program, r.name as rate_name, r.id as rate_id
      FROM products p
      JOIN rates r ON p.id = r.product_id
      ORDER BY p.sku, r.rate_order, r.name
    `;
    
    // Group rates by SKU
    const ratesBySku = {};
    products.forEach(product => {
      if (!ratesBySku[product.sku]) {
        ratesBySku[product.sku] = [];
      }
      ratesBySku[product.sku].push({
        name: product.rate_name,
        id: product.rate_id
      });
    });
    
    console.log(`Found rates for ${Object.keys(ratesBySku).length} SKUs`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    const updatedBookings = [];
    const skippedBookings = [];
    
    // Update each booking
    for (const booking of bookingsWithoutRates) {
      const rates = ratesBySku[booking.sku];
      
      if (rates && rates.length > 0) {
        // Use the first rate (lowest order) for this SKU
        const firstRate = rates[0];
        
        await sql`
          UPDATE bookings 
          SET rate = ${firstRate.name}
          WHERE booking_number = ${booking.booking_number}
        `;
        
        console.log(`Updated booking ${booking.booking_number} (SKU: ${booking.sku}) with rate: ${firstRate.name}`);
        updatedBookings.push({
          booking_number: booking.booking_number,
          sku: booking.sku,
          rate: firstRate.name
        });
        updatedCount++;
      } else {
        console.log(`No rates found for SKU: ${booking.sku} (booking: ${booking.booking_number})`);
        skippedBookings.push({
          booking_number: booking.booking_number,
          sku: booking.sku
        });
        skippedCount++;
      }
    }
    
    console.log('\n=== UPDATE COMPLETE ===');
    console.log(`Updated: ${updatedCount} bookings`);
    console.log(`Skipped: ${skippedCount} bookings (no matching rates)`);
    console.log(`Total processed: ${bookingsWithoutRates.length} bookings`);
    
    res.status(200).json({
      message: 'Update completed successfully',
      updated: updatedCount,
      skipped: skippedCount,
      total: bookingsWithoutRates.length,
      updatedBookings: updatedBookings,
      skippedBookings: skippedBookings
    });
    
  } catch (error) {
    console.error('Error updating bookings:', error);
    res.status(500).json({ 
      error: 'Failed to update bookings', 
      details: error.message 
    });
  }
}; 