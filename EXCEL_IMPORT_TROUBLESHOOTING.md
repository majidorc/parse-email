# Excel Import 500 Error Troubleshooting Guide

## Problem
When trying to import Excel data via the "Import Excel" button in settings, you get a `500 (Internal Server Error)` when making a POST request to `/api/products-rates?type=tour`.

## Root Cause Analysis

The 500 error is likely caused by one of these issues:

1. **Missing `rate_order` column** in the `rates` table
2. **Database connection issues** with the PostgreSQL pool
3. **Authentication/session issues**
4. **Data validation errors**

## Solutions

### 1. Add Missing Database Column

Run this SQL migration to add the missing `rate_order` column:

```sql
-- Run this in your database
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'rates' 
        AND column_name = 'rate_order'
    ) THEN
        ALTER TABLE rates ADD COLUMN rate_order INTEGER DEFAULT 0;
        CREATE INDEX IF NOT EXISTS idx_rates_rate_order ON rates(rate_order);
        RAISE NOTICE 'Added rate_order column to rates table';
    ELSE
        RAISE NOTICE 'rate_order column already exists in rates table';
    END IF;
END $$;
```

### 2. Check Server Logs

The updated API now includes detailed logging. Check your server logs for messages starting with `[PRODUCTS-RATES]` to identify the exact issue:

- `[PRODUCTS-RATES] Processing POST request for tour with data:` - Shows the data being sent
- `[PRODUCTS-RATES] Missing required fields:` - Shows validation errors
- `[PRODUCTS-RATES] Error in tour POST logic:` - Shows database errors

### 3. Verify Database Connection

Make sure your `DATABASE_URL` environment variable is correctly set and the database is accessible.

### 4. Check Authentication

Ensure you're logged in with admin or programs_manager role. The API requires authentication.

## Expected Data Format

The Excel import expects CSV data with these columns:
- SKU
- Program Name  
- Remark
- Rate Name
- Net Adult
- Net Child
- Fee Type
- Fee Adult
- Fee Child

## Testing the Fix

1. **Run the SQL migration** to add the `rate_order` column
2. **Restart your server** to ensure the updated API code is loaded
3. **Try importing Excel data** again
4. **Check server logs** for detailed error messages

## Debug Steps

If the issue persists:

1. Check server logs for `[PRODUCTS-RATES]` messages
2. Verify database connection by testing other API endpoints
3. Ensure you're logged in with proper permissions
4. Try importing a simple test file first

## Sample Test Data

Use this sample CSV data for testing:

```csv
SKU,Program Name,Remark,Rate Name,Net Adult,Net Child,Fee Type,Fee Adult,Fee Child
HKT0041,Sample Program,Optional remark,With transfer,900,900,none,,
HKT0041,Sample Program,Optional remark,Without transfer,800,800,entrance,100,50
```

## API Endpoint Details

- **URL**: `/api/products-rates?type=tour`
- **Method**: POST
- **Content-Type**: application/json
- **Authentication**: Required (admin or programs_manager role)
- **Database**: Uses PostgreSQL pool connection

The API automatically handles the `rate_order` column fallback, so it should work even without the migration, but adding the column will improve performance and prevent potential issues. 