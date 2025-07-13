-- Neon DB Sample Schema Migration
-- This file creates all tables, types, indexes, and constraints for a fresh setup.

-- ENUM TYPE for rates.fee_type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rate_fee_type') THEN
        CREATE TYPE rate_fee_type AS ENUM ('none', 'np', 'entrance');
    END IF;
END$$;

-- TABLE: products
CREATE TABLE IF NOT EXISTS public.products (
    id SERIAL PRIMARY KEY,
    sku VARCHAR NOT NULL UNIQUE,
    product_id_optional VARCHAR,
    program TEXT NOT NULL,
    remark TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products (sku);

-- TABLE: rates
CREATE TABLE IF NOT EXISTS public.rates (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    net_adult NUMERIC NOT NULL,
    net_child NUMERIC NOT NULL,
    fee_type rate_fee_type NOT NULL DEFAULT 'none',
    fee_adult NUMERIC,
    fee_child NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    name VARCHAR NOT NULL DEFAULT 'Standard',
    CONSTRAINT chk_fee_prices CHECK (
        (
            (fee_type = 'none' AND fee_adult IS NULL AND fee_child IS NULL)
            OR
            (fee_type IN ('np', 'entrance') AND fee_adult IS NOT NULL AND fee_child IS NOT NULL)
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_rates_product_id ON public.rates (product_id);

-- TABLE: bookings
CREATE TABLE IF NOT EXISTS public.bookings (
    id SERIAL PRIMARY KEY,
    booking_number VARCHAR NOT NULL UNIQUE,
    tour_date DATE NOT NULL,
    program TEXT,
    customer_name VARCHAR,
    hotel TEXT,
    phone_number VARCHAR,
    notification_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    adult INTEGER,
    child INTEGER,
    infant INTEGER,
    raw_tour_date TEXT,
    op BOOLEAN DEFAULT false,
    customer BOOLEAN DEFAULT false,
    sku VARCHAR,
    ri BOOLEAN DEFAULT false,
    paid NUMERIC,
    book_date DATE,
    rate TEXT -- Label for rate, not a price
    , updated_fields JSONB DEFAULT '{}' -- Tracks changed fields for highlighting
); 