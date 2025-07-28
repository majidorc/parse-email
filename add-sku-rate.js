const { sql } = require('@vercel/postgres');

// Script to add SKU HKT0076 with rate "Everyday Banana Beach" to programs
async function addSKUAndRate() {
    console.log('Adding SKU HKT0076 with rate "Everyday Banana Beach" to programs...');
    
    try {
        // Check if SKU already exists
        console.log('1. Checking if SKU HKT0076 already exists...');
        const { rows: existingProducts } = await sql`
            SELECT id, sku, program 
            FROM products 
            WHERE sku = 'HKT0076'
        `;
        
        let productId;
        
        if (existingProducts.length > 0) {
            console.log('✅ SKU HKT0076 already exists in products table');
            productId = existingProducts[0].id;
            console.log(`   Product ID: ${productId}`);
            console.log(`   Program: ${existingProducts[0].program}`);
        } else {
            console.log('2. Adding SKU HKT0076 to products table...');
            const { rows: newProduct } = await sql`
                INSERT INTO products (sku, program) 
                VALUES ('HKT0076', 'Everyday Banana Beach Tour')
                RETURNING id
            `;
            productId = newProduct[0].id;
            console.log('✅ SKU HKT0076 added to products table');
            console.log(`   Product ID: ${productId}`);
        }
        
        // Check if rate already exists
        console.log('\n3. Checking if rate "Everyday Banana Beach" already exists...');
        const { rows: existingRates } = await sql`
            SELECT id, name, net_adult, net_child
            FROM rates 
            WHERE product_id = ${productId} AND name = 'Everyday Banana Beach'
        `;
        
        if (existingRates.length > 0) {
            console.log('✅ Rate "Everyday Banana Beach" already exists');
            console.log(`   Rate ID: ${existingRates[0].id}`);
            console.log(`   Adult Price: ฿${existingRates[0].net_adult}`);
            console.log(`   Child Price: ฿${existingRates[0].net_child}`);
        } else {
            console.log('4. Adding rate "Everyday Banana Beach" to rates table...');
            const { rows: newRate } = await sql`
                INSERT INTO rates (product_id, name, net_adult, net_child, fee_type) 
                VALUES (${productId}, 'Everyday Banana Beach', 0, 0, 'none')
                RETURNING id, name, net_adult, net_child
            `;
            console.log('✅ Rate "Everyday Banana Beach" added to rates table');
            console.log(`   Rate ID: ${newRate[0].id}`);
            console.log(`   Adult Price: ฿${newRate[0].net_adult}`);
            console.log(`   Child Price: ฿${newRate[0].net_child}`);
        }
        
        // Verify the setup
        console.log('\n5. Verifying the complete setup...');
        const { rows: completeSetup } = await sql`
            SELECT p.sku, p.program, r.name as rate_name, r.net_adult, r.net_child
            FROM products p 
            JOIN rates r ON p.id = r.product_id 
            WHERE p.sku = 'HKT0076'
            ORDER BY r.id
        `;
        
        console.log('✅ Complete setup verified:');
        completeSetup.forEach((item, index) => {
            console.log(`   ${index + 1}. SKU: ${item.sku}`);
            console.log(`      Program: ${item.program}`);
            console.log(`      Rate: ${item.rate_name}`);
            console.log(`      Adult: ฿${item.net_adult}, Child: ฿${item.net_child}`);
        });
        
        console.log('\n🎯 Setup completed successfully!');
        console.log('Now when booking 6872811444 with SKU HKT0076 comes in without a rate,');
        console.log('the system will automatically assign "Everyday Banana Beach" rate.');
        
    } catch (error) {
        console.error('❌ Error setting up SKU and rate:', error);
        console.error('Error details:', error.message);
    }
}

// Run the setup
addSKUAndRate()
    .then(() => {
        console.log('\nSetup completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('Setup failed:', error);
        process.exit(1);
    }); 