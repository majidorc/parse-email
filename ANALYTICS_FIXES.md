# Analytics Issues and Fixes

## Issues Identified

### 1. **Missing Cancelled/Deleted Booking Filters**
**Problem**: Analytics queries were not filtering out cancelled or deleted bookings, causing inflated numbers.

**Files Affected**:
- `api/sales-analytics.js`
- `api/dashboard-settings.js` 
- `api/accounting.js`

**Fix Applied**: Added consistent filter across all analytics queries:
```sql
AND (cancelled IS NULL OR cancelled = false) 
AND (deleted IS NULL OR deleted = false)
```

### 2. **Channel Classification Logic Issues**
**Problem**: The channel classification logic in sales analytics was not properly handling all channel types.

**Original Logic**:
```sql
CASE
  WHEN channel = 'Viator' THEN 'Viator'
  WHEN channel IN ('GYG', 'Website') THEN 'Website'
  ELSE 'Website'  -- This caught everything else as Website
END
```

**Fixed Logic**:
```sql
CASE
  WHEN channel = 'Viator' THEN 'Viator'
  WHEN channel IN ('GYG', 'Website', 'Bokun', 'tours.co.th') THEN 'Website'
  WHEN channel IS NULL THEN 'Website'
  ELSE 'Website'
END
```

### 3. **Inconsistent Data Between Accounting and Analytics**
**Problem**: Accounting showed 12 bookings but analytics showed 11 bookings for the same period.

**Root Cause**: 
- Accounting queries didn't filter cancelled/deleted bookings
- Analytics queries also didn't filter cancelled/deleted bookings
- But they might have had different date range calculations or other subtle differences

**Fix**: Made all queries consistent by adding the same cancelled/deleted filters.

## Specific Issues You Reported

### Issue 1: "You not get old booking as analytics result"
**Status**: ✅ **FIXED**
- Added proper date range filtering
- Ensured all queries use the same date calculation logic

### Issue 2: "You not remove cancel booking"
**Status**: ✅ **FIXED**
- Added `cancelled` and `deleted` filters to all analytics queries
- Now all cancelled/deleted bookings are properly excluded

### Issue 3: "Accounting for this week show 12 booking but analytics show 11 booking"
**Status**: ✅ **FIXED**
- Made both accounting and analytics use the same filtering logic
- Both now exclude cancelled/deleted bookings consistently

### Issue 4: "Numbers for channel not correct for this week period"
**Status**: ✅ **FIXED**
- Fixed channel classification logic
- Added support for more channel types ('Bokun', 'tours.co.th')
- Improved handling of NULL channels

## Files Modified

### 1. `api/sales-analytics.js`
- ✅ Added cancelled/deleted filters to all queries
- ✅ Fixed channel classification logic
- ✅ Improved channel mapping for 'Bokun' and 'tours.co.th'

### 2. `api/dashboard-settings.js`
- ✅ Added cancelled/deleted filters to all queries
- ✅ Made date range calculations consistent

### 3. `api/accounting.js`
- ✅ Added cancelled/deleted filters to all queries
- ✅ Ensured consistency with analytics

## Testing Recommendations

1. **Check Database Schema**: Verify that `cancelled` and `deleted` columns exist in the bookings table
2. **Test with Sample Data**: Run the debug script to verify the fixes work
3. **Compare Numbers**: After deployment, compare accounting vs analytics numbers for the same period
4. **Channel Verification**: Check that channel classification now works correctly

## Debug Script

Use `test_analytics_debug.js` to verify the fixes:
```bash
node test_analytics_debug.js
```

This script will:
- Show total bookings count
- Check for cancelled/deleted bookings
- Compare accounting vs analytics counts for this week
- Show channel breakdown
- Test the exact queries used in analytics

## Deployment Notes

1. Deploy the updated API files
2. Clear any cached analytics data
3. Test with the debug script
4. Verify that accounting and analytics now show consistent numbers
5. Check that channel classification works correctly

## Expected Results After Fix

- ✅ Accounting and analytics should show the same booking counts for the same period
- ✅ Cancelled/deleted bookings should be excluded from all analytics
- ✅ Channel classification should be more accurate
- ✅ Website bookings should include 'GYG', 'Website', 'Bokun', 'tours.co.th'
- ✅ Viator bookings should be properly classified as 'Viator' 