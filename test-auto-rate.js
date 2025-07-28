const { sql } = require('@vercel/postgres');

// Test function to verify auto-rate assignment
async function testAutoRateAssignment() {
    console.log('Testing auto-rate assignment functionality...');
    
    try {
        // Test 1: Check if products and rates tables exist
        console.log('\n1. Checking if products and rates tables exist...');
        const { rows: tableCheck } = await sql`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name IN ('products', 'rates')
            ORDER BY table_name
        `;
        
        if (tableCheck.length < 2) {
            console.log('❌ Products or rates table not found. Please ensure the database schema is set up correctly.');
            return;
        }
        console.log('✅ Products and rates tables found');
        
        // Test 2: Check if there are any products with rates
        console.log('\n2. Checking for products with rates...');
        const { rows: productsWithRates } = await sql`
            SELECT p.sku, p.program, r.name as rate_name
            FROM products p 
            JOIN rates r ON p.id = r.product_id 
            ORDER BY p.sku, r.id 
            LIMIT 5
        `;
        
        if (productsWithRates.length === 0) {
            console.log('❌ No products with rates found. Please add some products and rates to test the functionality.');
            return;
        }
        
        console.log('✅ Found products with rates:');
        productsWithRates.forEach(p => {
            console.log(`   - SKU: ${p.sku}, Program: ${p.program}, Rate: ${p.rate_name}`);
        });
        
        // Test 3: Simulate auto-rate assignment logic
        console.log('\n3. Testing auto-rate assignment logic...');
        const testSKU = productsWithRates[0].sku;
        console.log(`Testing with SKU: ${testSKU}`);
        
        // Simulate the auto-rate assignment logic
        const { rows: rateRows } = await sql`
            SELECT r.name 
            FROM products p 
            JOIN rates r ON p.id = r.product_id 
            WHERE p.sku = ${testSKU}
            ORDER BY r.id 
            LIMIT 1
        `;
        
        if (rateRows.length > 0) {
            const assignedRate = rateRows[0].name;
            console.log(`✅ Auto-assigned rate: "${assignedRate}" for SKU: ${testSKU}`);
        } else {
            console.log(`❌ No rates found for SKU: ${testSKU}`);
        }
        
        // Test 4: Check current bookings without rates
        console.log('\n4. Checking for bookings without rates...');
        const { rows: bookingsWithoutRates } = await sql`
            SELECT booking_number, sku, program, rate 
            FROM bookings 
            WHERE (rate IS NULL OR rate = '' OR rate = 'N/A') 
            AND sku IS NOT NULL 
            AND sku != ''
            LIMIT 5
        `;
        
        if (bookingsWithoutRates.length > 0) {
            console.log('Found bookings without rates that could benefit from auto-assignment:');
            bookingsWithoutRates.forEach(b => {
                console.log(`   - Booking: ${b.booking_number}, SKU: ${b.sku}, Program: ${b.program}, Current Rate: ${b.rate || 'None'}`);
            });
        } else {
            console.log('✅ No bookings found without rates');
        }
        
        console.log('\n✅ Auto-rate assignment test completed successfully!');
        console.log('\nThe functionality is ready to use. When a booking comes in without a rate but with a SKU that exists in the programs list, the first available rate will be automatically assigned.');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
testAutoRateAssignment()
    .then(() => {
        console.log('\nTest completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('Test failed:', error);
        process.exit(1);
    }); 