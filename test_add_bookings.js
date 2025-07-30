const axios = require('axios');

// Test data for the 3 bookings from the email
const bookings = [
  {
    booking_number: '34527',
    order_number: '6872911446',
    tour_date: '2025-08-06',
    customer_name: 'ZAHRA BOUSSILE',
    phone_number: '+212660151107',
    sku: 'HKT0041',
    program: 'Phi Phi Islands, Maya Bay & Khai Islands by Speedboat',
    rate: '',
    hotel: 'Best Western Patong Beach, Spain',
    adult: 4,
    child: 0,
    infant: 0,
    paid: 5596.00,
    channel: 'Website'
  },
  {
    booking_number: '34528',
    order_number: '6872911446',
    tour_date: '2025-08-05',
    customer_name: 'ZAHRA BOUSSILE',
    phone_number: '+212660151107',
    sku: 'HKT0014',
    program: 'Tiger Kingdom and Half day city tour',
    rate: '',
    hotel: 'Best Western Patong Beach, Spain',
    adult: 4,
    child: 0,
    infant: 0,
    paid: 5996.00,
    channel: 'Website'
  },
  {
    booking_number: '34529',
    order_number: '6872911446',
    tour_date: '2025-08-07',
    customer_name: 'ZAHRA BOUSSILE',
    phone_number: '+212660151107',
    sku: 'HKT0006',
    program: 'Phuket to James Bond Island: Premium Speedboat Trip',
    rate: '',
    hotel: 'Best Western Patong Beach, Spain',
    adult: 4,
    child: 0,
    infant: 0,
    paid: 5996.00,
    channel: 'Website'
  }
];

async function addBookings() {
  console.log('Adding test bookings...\n');
  
  for (const booking of bookings) {
    try {
      console.log(`Adding booking ${booking.booking_number}...`);
      
      const response = await axios.post('http://localhost:3000/api/bookings', booking, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`✅ Booking ${booking.booking_number} added successfully`);
      console.log(`   Program: ${booking.program}`);
      console.log(`   Tour Date: ${booking.tour_date}`);
      console.log(`   Adults: ${booking.adult}`);
      console.log(`   Paid: ฿${booking.paid}`);
      console.log('');
      
    } catch (error) {
      console.error(`❌ Error adding booking ${booking.booking_number}:`, error.response?.data || error.message);
    }
  }
  
  console.log('Test completed!');
  console.log('Now check the dashboard to see the grouped view.');
}

addBookings(); 