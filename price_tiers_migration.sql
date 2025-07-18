-- Price Tiers Migration
-- This adds price tier functionality to the existing system

-- ENUM TYPE for price tier types
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'price_tier_type') THEN
        CREATE TYPE price_tier_type AS ENUM ('simple', 'seasonal');
    END IF;
END$$;

-- TABLE: price_tiers
CREATE TABLE IF NOT EXISTS public.price_tiers (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL UNIQUE,
    tier_type price_tier_type NOT NULL DEFAULT 'simple',
    multiplier NUMERIC NOT NULL DEFAULT 1.0,
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_seasonal_dates CHECK (
        (tier_type = 'simple') OR 
        (tier_type = 'seasonal' AND start_date IS NOT NULL AND end_date IS NOT NULL AND start_date <= end_date)
    ),
    CONSTRAINT chk_multiplier CHECK (multiplier > 0)
);

-- Add price tier columns to rates table
ALTER TABLE public.rates 
ADD COLUMN IF NOT EXISTS price_tier_id INTEGER REFERENCES public.price_tiers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS base_net_adult NUMERIC,
ADD COLUMN IF NOT EXISTS base_net_child NUMERIC;

-- Update existing rates to have base prices (same as current net prices)
UPDATE public.rates 
SET base_net_adult = net_adult, 
    base_net_child = net_child 
WHERE base_net_adult IS NULL OR base_net_child IS NULL;

-- Make base prices NOT NULL after setting them
ALTER TABLE public.rates 
ALTER COLUMN base_net_adult SET NOT NULL,
ALTER COLUMN base_net_child SET NOT NULL;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_price_tiers_active ON public.price_tiers (is_active);
CREATE INDEX IF NOT EXISTS idx_price_tiers_type ON public.price_tiers (tier_type);
CREATE INDEX IF NOT EXISTS idx_rates_price_tier_id ON public.rates (price_tier_id);

-- Insert default price tier
INSERT INTO public.price_tiers (name, tier_type, multiplier, is_active) 
VALUES ('Standard', 'simple', 1.0, true)
ON CONFLICT (name) DO NOTHING;

-- Function to calculate tier-adjusted prices
CREATE OR REPLACE FUNCTION calculate_tier_price(
    base_price NUMERIC,
    tier_id INTEGER DEFAULT NULL
) RETURNS NUMERIC AS $$
DECLARE
    tier_multiplier NUMERIC := 1.0;
BEGIN
    IF tier_id IS NOT NULL THEN
        SELECT multiplier INTO tier_multiplier 
        FROM public.price_tiers 
        WHERE id = tier_id AND is_active = true;
    END IF;
    
    RETURN COALESCE(tier_multiplier, 1.0) * base_price;
END;
$$ LANGUAGE plpgsql;

-- Function to get active seasonal tier for a given date
CREATE OR REPLACE FUNCTION get_seasonal_tier_for_date(
    check_date DATE DEFAULT CURRENT_DATE
) RETURNS INTEGER AS $$
DECLARE
    tier_id INTEGER;
BEGIN
    SELECT id INTO tier_id
    FROM public.price_tiers 
    WHERE tier_type = 'seasonal' 
      AND is_active = true 
      AND start_date <= check_date 
      AND end_date >= check_date
    ORDER BY multiplier DESC
    LIMIT 1;
    
    RETURN tier_id;
END;
$$ LANGUAGE plpgsql;

-- View for rates with calculated prices
CREATE OR REPLACE VIEW rates_with_tiers AS
SELECT 
    r.id,
    r.product_id,
    r.name as rate_name,
    r.base_net_adult,
    r.base_net_child,
    r.fee_type,
    r.fee_adult,
    r.fee_child,
    r.price_tier_id,
    pt.name as tier_name,
    pt.tier_type,
    pt.multiplier,
    calculate_tier_price(r.base_net_adult, r.price_tier_id) as net_adult,
    calculate_tier_price(r.base_net_child, r.price_tier_id) as net_child,
    r.created_at,
    r.updated_at
FROM public.rates r
LEFT JOIN public.price_tiers pt ON r.price_tier_id = pt.id; 