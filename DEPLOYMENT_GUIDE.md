# Deployment Guide for Excel Import Fix

## Current Issue
The Excel import is still showing 500 errors on the production server `https://parse.tours.co.th` because the fixes haven't been deployed yet.

## Immediate Steps Required

### 1. Database Migration (CRITICAL)
Run this SQL on your production database to add the missing `rate_order` column:

```sql
-- Run this on your production database
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

### 2. Deploy Code Changes

#### Option A: Vercel CLI (Recommended)
```bash
# Install Vercel CLI globally
npm install -g vercel

# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

#### Option B: Git-based Deployment
If your Vercel project is connected to Git:
1. Push changes to the main branch
2. Vercel should automatically deploy
3. Check the Vercel dashboard for deployment status

#### Option C: Manual Upload
1. Go to your Vercel dashboard
2. Navigate to your project
3. Upload the updated files manually

### 3. Verify Deployment
After deployment, test the Excel import again. The enhanced logging will show detailed information in the server logs.

## Files That Need to Be Deployed
- `api/products-rates.js` (Enhanced with error handling)
- `api/webhook.js` (Improved cancellation logic)
- All new documentation files

## Expected Behavior After Fix
- Excel import should work without 500 errors
- Server logs will show `[PRODUCTS-RATES]` messages for debugging
- Cancellation emails from tours.co.th should be processed correctly

## Troubleshooting
If the issue persists after deployment:
1. Check Vercel function logs for detailed error messages
2. Verify the database migration was successful
3. Test with a simple CSV file first
4. Check authentication/permissions

## Database Connection
Make sure your production `DATABASE_URL` environment variable is correctly set in Vercel. 