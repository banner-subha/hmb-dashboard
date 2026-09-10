-- Migration 001: Create field_visits table for HMB Ispat Visit Tracker
-- Target: Supabase Postgres (Sales Project: igyfelwdrnidaojzqksb)

CREATE TABLE IF NOT EXISTS public.field_visits (
    id BIGSERIAL PRIMARY KEY,
    employee_name TEXT,
    visit_date DATE NOT NULL,
    visit_time TIME,
    visit_type TEXT,
    visit_person TEXT,
    customer_name TEXT NOT NULL,
    customer_type TEXT NOT NULL, -- 'DEALER', 'FABRICATOR', 'SUBDEALER', 'INFLUENCER', etc.
    checkin_time TIMESTAMPTZ,
    report_time TIMESTAMPTZ,
    duration_minutes INTEGER,    -- (report_time - checkin_time) in minutes
    contact_person TEXT,
    city TEXT,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    pincode TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookup indexes for analytical queries and chatbot tools
CREATE INDEX IF NOT EXISTS idx_field_visits_geo ON public.field_visits(state, district);
CREATE INDEX IF NOT EXISTS idx_field_visits_cust ON public.field_visits(customer_type, customer_name);
CREATE INDEX IF NOT EXISTS idx_field_visits_date ON public.field_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_field_visits_emp ON public.field_visits(employee_name);
CREATE INDEX IF NOT EXISTS idx_field_visits_type ON public.field_visits(customer_type);
CREATE INDEX IF NOT EXISTS idx_field_visits_pincode ON public.field_visits(pincode);
