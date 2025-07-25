const { sql } = require('@vercel/postgres');

async function updateBookingRate() {
  try {
    const bookingNumber = '6852111359';
    const rate = 'Optional: Boat trip + Longneck';
    
    console.log(`Updating booking ${bookingNumber} with rate: ${rate}`);
    
    // Check if booking exists
    const { rows } = await sql`SELECT * FROM bookings WHERE booking_number = ${bookingNumber}`;
    if (!rows.length) {
      console.error('Booking not found');
      return;
    }
    
    console.log('Current booking data:', rows[0]);
    
    // Update the rate
    await sql`UPDATE bookings SET rate = ${rate} WHERE booking_number = ${bookingNumber}`;
    
    console.log('✅ Rate updated successfully!');
    
    // Verify the update
    const { rows: updatedRows } = await sql`SELECT booking_number, rate FROM bookings WHERE booking_number = ${bookingNumber}`;
    console.log('Updated booking:', updatedRows[0]);
    
  } catch (err) {
    console.error('Error updating booking rate:', err);
  } finally {
    process.exit(0);
  }
}

updateBookingRate(); 