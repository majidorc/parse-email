-- Fix Channel Identification Migration
-- This script will update all bookings with proper channel identification

-- Step 1: Create a temporary table to store the corrected channel data
CREATE TEMP TABLE channel_fixes AS
SELECT 
  booking_number,
  CASE
    -- GYG (GetYourGuide) identification
    WHEN booking_number LIKE 'GYG%' THEN 'GYG'
    WHEN booking_number LIKE '%GYG%' THEN 'GYG'
    WHEN booking_number LIKE '%GETYOURGUIDE%' THEN 'GYG'
    
    -- Viator identification
    WHEN booking_number LIKE 'V%' THEN 'Viator'
    WHEN booking_number LIKE '%VIATOR%' THEN 'Viator'
    WHEN booking_number LIKE '%BOKUN%' THEN 'Viator'
    WHEN booking_number LIKE '%BOKUN.IO%' THEN 'Viator'
    
    -- Website identification (booking numbers starting with 6)
    WHEN booking_number LIKE '6%' THEN 'Website'
    
    -- Default to Website for any other pattern
    ELSE 'Website'
  END AS corrected_channel
FROM bookings;

-- Step 2: Update the bookings table with corrected channels
UPDATE bookings 
SET channel = channel_fixes.corrected_channel
FROM channel_fixes
WHERE bookings.booking_number = channel_fixes.booking_number;

-- Step 3: Also update based on parsed_emails data for more accuracy
UPDATE bookings 
SET channel = CASE
  WHEN p.sender ILIKE '%bokun.io%' AND p.body ILIKE '%Sold by%GetYourGuide%' THEN 'GYG'
  WHEN p.sender ILIKE '%bokun.io%' AND p.body ILIKE '%Sold by%Viator.com%' THEN 'Viator'
  WHEN p.sender ILIKE '%bokun.io%' AND p.body NOT ILIKE '%GetYourGuide%' AND p.body NOT ILIKE '%Sold by%GetYourGuide%' THEN 'Viator'
  WHEN p.sender ILIKE '%bokun.io%' THEN 'Viator'
  ELSE bookings.channel
END
FROM parsed_emails p
WHERE bookings.booking_number = p.booking_number;

-- Step 4: Show summary of the changes
SELECT 
  'Before Fix' as status,
  channel,
  COUNT(*) as count,
  SUM(paid) as total_sales
FROM bookings 
GROUP BY channel
ORDER BY channel;

-- Step 5: Create an index for better performance
CREATE INDEX IF NOT EXISTS idx_bookings_channel ON bookings(channel);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_number ON bookings(booking_number); 