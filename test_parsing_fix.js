const { ThailandToursParser } = require('./api/webhook.js');

// Test email content with multiple bookings
const testEmail = `
New Order: #6872911446

Booking #34527
Phuket Island Tour
(#HKT0041)
August 6, 2025
Adult: 4
Child: 0
Infant: 0
฿2,400.00

Booking #34528
Phi Phi Island Tour
(#HKT0042)
August 7, 2025
Adult: 4
Child: 0
Infant: 0
฿3,200.00

Booking #34529
James Bond Island Tour
(#HKT0043)
August 8, 2025
Adult: 4
Child: 0
Infant: 0
฿2,800.00

Customer: John Doe
Hotel: Phuket Resort
Phone: +66-123-456-789
`;

console.log('Testing ThailandToursParser with multiple bookings...\n');

try {
    const parser = new ThailandToursParser(testEmail);
    const bookings = parser.extractMultipleBookings();
    
    console.log(`Found ${bookings.length} bookings:`);
    console.log('='.repeat(50));
    
    bookings.forEach((booking, index) => {
        console.log(`\nBooking ${index + 1}:`);
        console.log(`  Booking Number: ${booking.bookingNumber}`);
        console.log(`  Order Number: ${booking.orderNumber}`);
        console.log(`  Program: ${booking.program}`);
        console.log(`  Tour Date: ${booking.tourDate}`);
        console.log(`  Adult: ${booking.adult}`);
        console.log(`  Child: ${booking.child}`);
        console.log(`  Infant: ${booking.infant}`);
        console.log(`  Paid: ${booking.paid}`);
        console.log(`  SKU: ${booking.sku}`);
        console.log(`  Customer: ${booking.name}`);
        console.log(`  Hotel: ${booking.hotel}`);
        console.log(`  Phone: ${booking.phoneNumber}`);
    });
    
    // Verify that each booking has the correct passenger counts
    const expectedPassengers = [4, 4, 4]; // Each booking should have 4 adults
    let allCorrect = true;
    
    bookings.forEach((booking, index) => {
        const actualAdults = parseInt(booking.adult) || 0;
        const expectedAdults = expectedPassengers[index];
        
        if (actualAdults !== expectedAdults) {
            console.log(`❌ ERROR: Booking ${booking.bookingNumber} has ${actualAdults} adults, expected ${expectedAdults}`);
            allCorrect = false;
        } else {
            console.log(`✅ Booking ${booking.bookingNumber} has correct passenger count: ${actualAdults} adults`);
        }
    });
    
    if (allCorrect) {
        console.log('\n🎉 All bookings have correct passenger counts!');
    } else {
        console.log('\n❌ Some bookings have incorrect passenger counts.');
    }
    
} catch (error) {
    console.error('Error testing parser:', error);
} 