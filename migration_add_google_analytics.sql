-- Migration: Add google_analytics_id column to settings table
-- Run this in your database to add Google Analytics support

ALTER TABLE settings 
ADD COLUMN IF NOT EXISTS google_analytics_id TEXT;

-- Update existing settings to have empty google_analytics_id if not exists
UPDATE settings 
SET google_analytics_id = '' 
WHERE google_analytics_id IS NULL; 