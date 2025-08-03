const { sql } = require('@vercel/postgres');

async function updateChannels() {
  try {
    console.log('Starting channel consolidation...');
    
    // Update all channels to the new 2-channel system
    const result = await sql.query(`
      UPDATE bookings 
      SET channel = 
        CASE 
          WHEN channel IN ('Viator', 'Bokun') THEN 'Viator'
          WHEN channel IN ('Website', 'GYG', 'OTA') THEN 'Website'
          ELSE 'Website'
        END
      WHERE channel IS NOT NULL
    `);
    
    console.log(`Updated ${result.rowCount} bookings`);
    
    // Verify the changes
    const verifyResult = await sql.query(`
      SELECT channel, COUNT(*) as count 
      FROM bookings 
      GROUP BY channel 
      ORDER BY count DESC
    `);
    
    console.log('Current channel distribution:');
    verifyResult.rows.forEach(row => {
      console.log(`  ${row.channel}: ${row.count}`);
    });
    
    console.log('Channel consolidation completed successfully!');
    
  } catch (error) {
    console.error('Error updating channels:', error);
  }
}

updateChannels(); 