const axios = require('axios');

// Bookings to delete
const bookingNumbers = ['34527', '34528', '34529', '6872911446'];

async function deleteBookings() {
  console.log('Cleaning up test bookings...\n');
  
  for (const bookingNumber of bookingNumbers) {
    try {
      console.log(`Deleting booking ${bookingNumber}...`);
      
      const response = await axios.delete(`http://localhost:3000/api/bookings?booking_number=${bookingNumber}`);
      
      console.log(`✅ Booking ${bookingNumber} deleted successfully`);
      
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`ℹ️  Booking ${bookingNumber} not found (already deleted)`);
      } else {
        console.error(`❌ Error deleting booking ${bookingNumber}:`, error.response?.data || error.message);
      }
    }
  }
  
  console.log('\nCleanup completed!');
}

deleteBookings(); 