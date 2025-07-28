const { sql } = require('@vercel/postgres');

// Test function to verify the SQL syntax fix
async function testSQLFix() {
    console.log('Testing SQL syntax fix for auto-rate assignment...');
    
    try {
        // Test 1: Check if we can query the products table
        console.log('\n1. Testing basic products query...');
        const { rows: products } = await sql`
            SELECT sku, program 
            FROM products 
            LIMIT 1
        `;
        
        if (products.length === 0) {
            console.log('❌ No products found in database. Please add some products first.');
            return;
        }
        
        console.log('✅ Products table query successful');
        const testSKU = products[0].sku;
        console.log(`Test SKU: ${testSKU}`);
        
        // Test 2: Test the exact query that was causing issues
        console.log('\n2. Testing the auto-rate assignment query...');
        const { rows: rateRows } = await sql`
            SELECT r.name 
            FROM products p 
            JOIN rates r ON p.id = r.product_id 
            WHERE p.sku = ${testSKU}
            ORDER BY r.id 
            LIMIT 1
        `;
        
        console.log('✅ Auto-rate assignment query successful');
        if (rateRows.length > 0) {
            console.log(`Found rate: ${rateRows[0].name}`);
        } else {
            console.log('No rates found for this SKU');
        }
        
        // Test 3: Test with null/undefined SKU handling
        console.log('\n3. Testing null SKU handling...');
        const nullSKU = null;
        const emptySKU = '';
        const validSKU = testSKU;
        
        // Test the condition logic
        const testConditions = [
            { sku: nullSKU, rate: '', description: 'null SKU' },
            { sku: emptySKU, rate: '', description: 'empty SKU' },
            { sku: validSKU, rate: '', description: 'valid SKU, no rate' },
            { sku: validSKU, rate: 'Some Rate', description: 'valid SKU, has rate' }
        ];
        
        testConditions.forEach(test => {
            const hasRate = test.rate && test.rate.trim() !== '';
            const hasValidSKU = test.sku && test.sku.trim() !== '';
            const shouldAutoAssign = (!hasRate) && hasValidSKU;
            
            console.log(`   ${test.description}: shouldAutoAssign = ${shouldAutoAssign}`);
        });
        
        console.log('\n✅ SQL syntax fix test completed successfully!');
        console.log('The auto-rate assignment feature should now work without SQL syntax errors.');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error('Error details:', error.message);
    }
}

// Run the test
testSQLFix()
    .then(() => {
        console.log('\nTest completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('Test failed:', error);
        process.exit(1);
    }); 