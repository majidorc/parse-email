-- Add net_total column to bookings table for manual admin editing
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS net_total NUMERIC;

-- Add index for better performance
CREATE INDEX IF NOT EXISTS idx_bookings_net_total ON public.bookings (net_total); 