const { sql } = require('@vercel/postgres');

// Test the specific booking scenario
async function testSpecificBooking() {
    console.log('Testing auto-rate assignment for specific booking scenario...');
    console.log('Booking: 6872811444');
    console.log('SKU: HKT0076');
    console.log('Expected Rate: Everyday Banana Beach');
    console.log('');
    
    try {
        // Test 1: Check if the SKU exists in products table
        console.log('1. Checking if SKU HKT0076 exists in products table...');
        const { rows: products } = await sql`
            SELECT sku, program 
            FROM products 
            WHERE sku = 'HKT0076'
        `;
        
        if (products.length === 0) {
            console.log('❌ SKU HKT0076 not found in products table');
            console.log('Please add this SKU to the products table first');
            return;
        }
        
        console.log('✅ SKU HKT0076 found in products table');
        console.log(`   Program: ${products[0].program}`);
        
        // Test 2: Check if rates exist for this SKU
        console.log('\n2. Checking rates for SKU HKT0076...');
        const { rows: rates } = await sql`
            SELECT r.name, r.net_adult, r.net_child
            FROM products p 
            JOIN rates r ON p.id = r.product_id 
            WHERE p.sku = 'HKT0076'
            ORDER BY r.id
        `;
        
        if (rates.length === 0) {
            console.log('❌ No rates found for SKU HKT0076');
            console.log('Please add rates to this SKU in the programs list');
            return;
        }
        
        console.log('✅ Rates found for SKU HKT0076:');
        rates.forEach((rate, index) => {
            console.log(`   ${index + 1}. ${rate.name} - Adult: ฿${rate.net_adult}, Child: ฿${rate.net_child}`);
        });
        
        // Test 3: Simulate the auto-rate assignment logic
        console.log('\n3. Testing auto-rate assignment logic...');
        const extractedInfo = {
            bookingNumber: '6872811444',
            sku: 'HKT0076',
            rate: '', // Empty rate as if email didn't parse it
            program: products[0].program
        };
        
        // Simulate the exact logic from webhook.js
        let finalRate = extractedInfo.rate;
        if ((!finalRate || finalRate.trim() === '') && extractedInfo.sku && extractedInfo.sku.trim() !== '') {
            console.log(`[AUTO-RATE] No rate provided for booking ${extractedInfo.bookingNumber}, checking programs list for SKU: ${extractedInfo.sku}`);
            
            // Look up the first available rate for this SKU
            const { rows: rateRows } = await sql`
                SELECT r.name 
                FROM products p 
                JOIN rates r ON p.id = r.product_id 
                WHERE p.sku = ${extractedInfo.sku}
                ORDER BY r.id 
                LIMIT 1
            `;
            
            if (rateRows.length > 0) {
                finalRate = rateRows[0].name;
                console.log(`[AUTO-RATE] Auto-assigned rate "${finalRate}" for booking ${extractedInfo.bookingNumber} with SKU ${extractedInfo.sku}`);
            } else {
                console.log(`[AUTO-RATE] No rates found for SKU ${extractedInfo.sku} in programs list`);
            }
        }
        
        console.log(`\n✅ Final result: Booking ${extractedInfo.bookingNumber} would be assigned rate: "${finalRate}"`);
        
        // Test 4: Check if this booking already exists and what rate it has
        console.log('\n4. Checking current booking status...');
        const { rows: existingBooking } = await sql`
            SELECT booking_number, sku, rate, program
            FROM bookings 
            WHERE booking_number = '6872811444'
        `;
        
        if (existingBooking.length > 0) {
            const booking = existingBooking[0];
            console.log('Current booking status:');
            console.log(`   Booking Number: ${booking.booking_number}`);
            console.log(`   SKU: ${booking.sku}`);
            console.log(`   Current Rate: ${booking.rate || 'None'}`);
            console.log(`   Program: ${booking.program}`);
            
            if (!booking.rate || booking.rate.trim() === '') {
                console.log('⚠️  This booking currently has no rate - auto-assignment would fix this!');
            } else {
                console.log('✅ This booking already has a rate assigned');
            }
        } else {
            console.log('ℹ️  This booking does not exist in the database yet');
        }
        
        console.log('\n🎯 Auto-rate assignment test completed successfully!');
        console.log('The system will automatically assign the first available rate when:');
        console.log('- Email doesn\'t parse a rate (rate is empty/null)');
        console.log('- SKU exists in the programs list');
        console.log('- At least one rate is available for that SKU');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error('Error details:', error.message);
    }
}

// Run the test
testSpecificBooking()
    .then(() => {
        console.log('\nTest completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('Test failed:', error);
        process.exit(1);
    }); 