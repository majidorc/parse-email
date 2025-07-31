# Cancellation Logic Improvements

## Problem
The original cancellation logic only supported Bokun's "Ext. booking ref" format, but tours.co.th cancellation emails use "Booking #34680" format, causing cancellation emails to be ignored.

## Solution
Updated the cancellation logic in `api/webhook.js` to support multiple booking number formats:

### Supported Formats
1. **Bokun format**: `Ext. booking ref: 12345`
2. **tours.co.th format**: `Booking #34680`
3. **Alternative format**: `Booking ID 34680`

### Code Changes

#### Before:
```javascript
// Only supported Bokun format
const subjectMatch = parsedEmail.subject.match(/Ext\. booking ref:?\s*([A-Z0-9]+)/i);
```

#### After:
```javascript
// Supports multiple formats
const subjectMatch = parsedEmail.subject.match(/(?:Ext\. booking ref:?\s*|Booking #|Booking ID)\s*([A-Z0-9]+)/i);
```

### Additional Improvements

1. **Enhanced Pattern Matching**: Added support for "Booking ID" format
2. **Fallback Extraction**: Added a fallback method that searches the entire email content for booking number patterns
3. **Debug Logging**: Added console logging to help troubleshoot cancellation processing
4. **Multiple Source Search**: Searches subject, text body, and HTML body for booking numbers

### Fallback Logic
If the standard patterns don't work, the system now:
- Combines all email content (subject + text + HTML)
- Searches for patterns like "Booking", "Booking ID", "Booking #", "Ext. booking ref"
- Extracts numbers that are 4-10 characters long (typical booking number length)

### Testing
Created `test_cancellation_parsing.js` to verify the logic works with tours.co.th email format.

## Example Email Format
```
Subject: [Thailand Tours] A booking of Full Moon Party by Speedboat Transfer has been cancelled

Content:
* Booking #34680 Cancelled *
Booking ID 34680
```

## Expected Behavior
1. Email is detected as cancellation (contains "cancelled booking" in subject)
2. Booking number "34680" is extracted from multiple possible locations
3. System checks if booking exists in database
4. If booking exists, sends cancellation notification to Telegram
5. Deletes booking from database
6. Returns success response

## Files Modified
- `api/webhook.js` - Updated cancellation logic
- `test_cancellation_parsing.js` - Test script (created)
- `CANCELLATION_LOGIC_IMPROVEMENTS.md` - This documentation (created)

## Database Migration
Remember to run the database migration scripts if your friend's database is missing the `order_number` column:
- `add_order_number_column.sql` - Quick fix
- `migrate_bookings_table.sql` - Comprehensive migration 