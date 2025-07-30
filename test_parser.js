const { ThailandToursParser } = require('./api/webhook.js');

// Test email content (simplified version of your email)
const testEmail = `
New Order: #6872911446

Order Details
Order number: 6872911446
Order date: July 29, 2025

Product Price

*Phi Phi Islands, Maya Bay & Khai Islands by Speedboat*
(#HKT0041)

Quantity: 1
* Booking #34527 Paid *

   - August 6, 2025
   - Adults: 4

฿5,596

*Tiger Kingdom and Half day city tour*
(#HKT0014)

Quantity: 1
* Booking #34528 Paid *

   - August 5, 2025
   - Session: Morning
   - Adult (+11): 4

฿5,996

*Phuket to James Bond Island: Premium Speedboat Trip*
(#HKT0006)

Quantity: 1
* Booking #34529 Paid *

   - August 7, 2025
   - Adults (+11): 4

฿5,996

Billing address
ZAHRA BOUSSILE
Best Western Patong Beach
Spain
+212660151107
maachhut@gmail.com
`;

console.log('Testing multiple booking parsing...\n');

const parser = new ThailandToursParser(testEmail);

// Test multiple bookings extraction
const multipleBookings = parser.extractMultipleBookings();
console.log(`Found ${multipleBookings.length} bookings:`);

multipleBookings.forEach((booking, index) => {
    console.log(`\nBooking ${index + 1}:`);
    console.log(`  Booking Number: ${booking.bookingNumber}`);
    console.log(`  Order Number: ${booking.orderNumber}`);
    console.log(`  Program: ${booking.program}`);
    console.log(`  SKU: ${booking.sku}`);
    console.log(`  Tour Date: ${booking.tourDate}`);
    console.log(`  Adults: ${booking.adult}`);
    console.log(`  Children: ${booking.child}`);
    console.log(`  Infants: ${booking.infant}`);
    console.log(`  Paid: ${booking.paid}`);
    console.log(`  Customer: ${booking.name}`);
    console.log(`  Hotel: ${booking.hotel}`);
});

console.log('\nTest completed!'); 