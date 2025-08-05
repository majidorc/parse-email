-- Create web_notifications table for storing web notification data
CREATE TABLE IF NOT EXISTS web_notifications (
    id SERIAL PRIMARY KEY,
    booking_number VARCHAR(50) UNIQUE NOT NULL,
    customer_name VARCHAR(255),
    program TEXT,
    tour_date DATE,
    adult INTEGER DEFAULT 0,
    child INTEGER DEFAULT 0,
    infant INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    read_at TIMESTAMP WITH TIME ZONE NULL
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_web_notifications_created_at ON web_notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_web_notifications_booking_number ON web_notifications(booking_number);

-- Add comment to table
COMMENT ON TABLE web_notifications IS 'Stores web notifications for new bookings'; 