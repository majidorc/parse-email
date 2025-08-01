import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  const client = await pool.connect();
  try {
    console.log('Starting channel identification fix...');
    
    // Step 1: Get current channel distribution
    const { rows: beforeFix } = await client.query(`
      SELECT 
        channel,
        COUNT(*) as count,
        COALESCE(SUM(paid), 0) as total_sales
      FROM bookings 
      GROUP BY channel 
      ORDER BY channel
    `);
    
    console.log('Before fix:', beforeFix);
    
    // Step 2: Update channels based on booking number patterns
    const { rows: updateResult1 } = await client.query(`
      UPDATE bookings 
      SET channel = CASE
        -- GYG (GetYourGuide) identification
        WHEN booking_number LIKE 'GYG%' THEN 'GYG'
        WHEN booking_number LIKE '%GYG%' THEN 'GYG'
        WHEN booking_number LIKE '%GETYOURGUIDE%' THEN 'GYG'
        
        -- Viator identification
        WHEN booking_number LIKE 'V%' THEN 'Viator'
        WHEN booking_number LIKE '%VIATOR%' THEN 'Viator'
        WHEN booking_number LIKE '%BOKUN%' THEN 'Viator'
        WHEN booking_number LIKE '%BOKUN.IO%' THEN 'Viator'
        
        -- Website identification (booking numbers starting with 6)
        WHEN booking_number LIKE '6%' THEN 'Website'
        
        -- Default to Website for any other pattern
        ELSE 'Website'
      END
      WHERE channel IS NULL OR channel = ''
    `);
    
    console.log('Updated based on booking numbers:', updateResult1);
    
    // Step 3: Update based on parsed_emails data for more accuracy
    const { rows: updateResult2 } = await client.query(`
      UPDATE bookings 
      SET channel = CASE
        WHEN p.sender ILIKE '%bokun.io%' AND p.body ILIKE '%Sold by%GetYourGuide%' THEN 'GYG'
        WHEN p.sender ILIKE '%bokun.io%' AND p.body ILIKE '%Sold by%Viator.com%' THEN 'Viator'
        WHEN p.sender ILIKE '%bokun.io%' AND p.body NOT ILIKE '%GetYourGuide%' AND p.body NOT ILIKE '%Sold by%GetYourGuide%' THEN 'Viator'
        WHEN p.sender ILIKE '%bokun.io%' THEN 'Viator'
        ELSE bookings.channel
      END
      FROM parsed_emails p
      WHERE bookings.booking_number = p.booking_number
    `);
    
    console.log('Updated based on parsed emails:', updateResult2);
    
    // Step 4: Get after fix distribution
    const { rows: afterFix } = await client.query(`
      SELECT 
        channel,
        COUNT(*) as count,
        COALESCE(SUM(paid), 0) as total_sales
      FROM bookings 
      GROUP BY channel 
      ORDER BY channel
    `);
    
    console.log('After fix:', afterFix);
    
    // Step 5: Show some sample bookings for verification
    const { rows: sampleBookings } = await client.query(`
      SELECT booking_number, channel, paid, tour_date
      FROM bookings 
      WHERE channel IN ('GYG', 'Viator')
      ORDER BY tour_date DESC 
      LIMIT 10
    `);
    
    res.status(200).json({
      success: true,
      message: 'Channel identification fix completed',
      beforeFix,
      afterFix,
      sampleBookings,
      updatesApplied: {
        bookingNumberUpdates: updateResult1.length,
        emailUpdates: updateResult2.length
      }
    });
    
  } catch (err) {
    console.error('Error fixing channels:', err);
    res.status(500).json({ 
      error: err.message,
      success: false 
    });
  } finally {
    client.release();
  }
} 