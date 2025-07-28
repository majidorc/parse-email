# Auto Rate Assignment Feature

## Overview

This feature automatically assigns the first available rate from the programs list when a booking comes in without a rate in the email parse but has a SKU that exists in the programs/rates tables.

## Example Scenario

**Booking:** 6872811444  
**SKU:** HKT0076  
**Program:** Everyday Banana Beach Tour  
**Rate:** Everyday Banana Beach  

When a booking email comes in for booking 6872811444 with SKU HKT0076 but the email parser doesn't extract a rate (rate field is empty/null), the system will:

1. ✅ Check if SKU HKT0076 exists in the `products` table
2. ✅ Look up the first available rate for HKT0076 in the `rates` table
3. ✅ Automatically assign "Everyday Banana Beach" rate to the booking
4. ✅ Save the booking with the auto-assigned rate
5. ✅ Use the auto-assigned rate in Telegram notifications

**Result:** Booking 6872811444 will have rate "Everyday Banana Beach" instead of null/empty.

## How It Works

### Trigger Conditions
The auto-rate assignment is triggered when:
1. A booking is being inserted or updated
2. The booking has no rate (empty, null, or whitespace)
3. The booking has a valid SKU that exists in the `products` table
4. The SKU has at least one associated rate in the `rates` table

### Assignment Logic
1. When a booking comes in without a rate, the system checks if the SKU exists in the `products` table
2. If the SKU exists, it looks up the first available rate for that SKU (ordered by rate ID)
3. The first rate found is automatically assigned to the booking
4. The booking is then saved with the auto-assigned rate

### Implementation Details

The feature is implemented in `api/webhook.js` with the following logic:

```javascript
// Auto-assign rate if no rate is provided but SKU exists in programs list
let finalRate = extractedInfo.rate;
if ((!finalRate || finalRate.trim() === '') && extractedInfo.sku && extractedInfo.sku.trim() !== '') {
    try {
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
    } catch (error) {
        console.error(`[AUTO-RATE] Error looking up rate for SKU ${extractedInfo.sku}:`, error);
    }
}
```

## Database Requirements

The feature requires the following database tables to be set up:

### Products Table
```sql
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku TEXT,
  product_id_optional TEXT,
  program TEXT,
  remark TEXT
);
```

### Rates Table
```sql
CREATE TABLE IF NOT EXISTS rates (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  net_adult NUMERIC(12,2) NOT NULL,
  net_child NUMERIC(12,2) NOT NULL,
  fee_type TEXT NOT NULL,
  fee_adult NUMERIC(12,2),
  fee_child NUMERIC(12,2)
);
```

## Testing

You can test the functionality using the provided test scripts:

```bash
# Test the specific booking scenario
node test-specific-booking.js

# Add SKU and rate to programs list
node add-sku-rate.js

# Test general auto-rate assignment
node test-auto-rate.js
```

These scripts will:
1. Check if the required tables exist
2. Verify there are products with rates
3. Test the auto-rate assignment logic
4. Show existing bookings that could benefit from auto-assignment

## Logging

The feature includes comprehensive logging to track when auto-rate assignment occurs:

- `[AUTO-RATE] No rate provided for booking X, checking programs list for SKU: Y`
- `[AUTO-RATE] Auto-assigned rate "Z" for booking X with SKU Y`
- `[AUTO-RATE] No rates found for SKU Y in programs list`
- `[AUTO-RATE] Error looking up rate for SKU Y: error details`

## Benefits

1. **Reduced Manual Work**: Automatically assigns rates for bookings that would otherwise require manual intervention
2. **Consistency**: Ensures all bookings have rates when possible
3. **Efficiency**: Reduces the time spent on booking management
4. **Error Prevention**: Minimizes the chance of bookings being left without rates

## Limitations

1. **First Rate Only**: Always assigns the first available rate (ordered by ID)
2. **SKU Dependency**: Only works when the booking has a valid SKU that exists in the products table
3. **No Rate Selection**: Cannot choose between multiple available rates automatically
4. **Manual Override**: Users can still manually update rates after auto-assignment

## Future Enhancements

Potential improvements could include:
1. **Smart Rate Selection**: Choose rates based on booking criteria (e.g., adult/child count)
2. **Rate Priority**: Implement a priority system for rates
3. **Multiple Rate Assignment**: Assign different rates for adults vs children
4. **Rate Validation**: Validate that the assigned rate is appropriate for the booking 