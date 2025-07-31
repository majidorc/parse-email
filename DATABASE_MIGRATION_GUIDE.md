# Database Migration Guide

## Problem
Your friend is getting this error:
```
[ERROR][DB] Database error while processing booking 1291631569: NeonDbError: column "order_number" of relation "bookings" does not exist
```

## Root Cause
The database was created before the `order_number` column was added to the `bookings` table. The application code expects this column to exist, but it's missing from the database.

## Solution

### Option 1: Quick Fix (Recommended)
Run this SQL script on your friend's database:

```sql
-- Add the order_number column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'bookings' 
        AND column_name = 'order_number'
    ) THEN
        ALTER TABLE bookings ADD COLUMN order_number TEXT;
        CREATE INDEX IF NOT EXISTS idx_bookings_order_number ON bookings(order_number);
        RAISE NOTICE 'Added order_number column to bookings table';
    ELSE
        RAISE NOTICE 'order_number column already exists in bookings table';
    END IF;
END $$;
```

### Option 2: Comprehensive Migration
If you want to ensure all columns are up to date, run the `migrate_bookings_table.sql` script which will add all missing columns.

## How to Run the Migration

1. **Connect to your Neon database** using your preferred method:
   - Neon web console
   - psql command line
   - Any PostgreSQL client

2. **Run the migration script** by copying and pasting the SQL code above

3. **Verify the fix** by checking if the column exists:
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'bookings' 
   AND column_name = 'order_number';
   ```

## Prevention
To avoid this issue in the future:
- Always run database migrations when deploying new versions
- Keep a migration log of schema changes
- Test database schema changes in a staging environment first

## Files Created
- `add_order_number_column.sql` - Simple fix for just the missing column
- `migrate_bookings_table.sql` - Comprehensive migration for all missing columns
- `DATABASE_MIGRATION_GUIDE.md` - This troubleshooting guide 