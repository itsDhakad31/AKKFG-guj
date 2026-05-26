-- Clean AKKFG schema (drop and recreate)
-- Run this in Supabase SQL Editor

-- Drop existing policies first (if they exist)
DROP POLICY IF EXISTS "Public read news" ON public.news;
DROP POLICY IF EXISTS "Public read events" ON public.events;
DROP POLICY IF EXISTS "Public read registrations own" ON public.registrations;
DROP POLICY IF EXISTS "Authenticated write registrations" ON public.registrations;
DROP POLICY IF EXISTS "Admin manage all" ON public.users;
DROP POLICY IF EXISTS "Admin manage registrations" ON public.registrations;
DROP POLICY IF EXISTS "Public read news/events" ON public.news;

-- Drop tables (if they exist)
DROP TABLE IF EXISTS public.registrations CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;
DROP TABLE IF EXISTS public.news CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- Create Users table (for custom federation users)
CREATE TABLE public.users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Player' CHECK (role IN ('Player', 'Coach', 'Admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert DEFAULT ADMIN (run once)
INSERT INTO public.users (name, email, password, role) 
VALUES (
  'Admin', 
  'admin@akkfg.com', 
  '$2b$10$Pnmi6Zl6QswyKXj5cc5KwO.9O/rVzqYiPIJy5jIz0zgf0X0vvTl6m',
  'Admin'
) 
ON CONFLICT (email) DO NOTHING;

-- Create News table
CREATE TABLE public.news (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  date TEXT,
  image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Events table
CREATE TABLE public.events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT,
  location TEXT,
  category TEXT,
  status TEXT DEFAULT 'Upcoming',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Registrations table
CREATE TABLE public.registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  dob TEXT,
  address_city TEXT,
  address_country TEXT DEFAULT 'India',
  gender TEXT,
  email TEXT,
  mobile TEXT,
  experience TEXT,
  role TEXT DEFAULT 'Student' CHECK (role IN ('Student', 'Coach')),
  status TEXT DEFAULT 'Pending',
  unique_id TEXT,
  doc_photo TEXT,
  doc_aadhar TEXT,
  doc_pan TEXT,
  doc_birth TEXT,
  level_passing TEXT,
  year_passing TEXT,
  coaching_cert TEXT,
  edu_qualification TEXT,
  referee_cert TEXT,
  kkfi_id TEXT,
  nsrs_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies
CREATE POLICY "Public read news" ON public.news FOR SELECT USING (true);
CREATE POLICY "Public read events" ON public.events FOR SELECT USING (true);
CREATE POLICY "Public insert registrations" ON public.registrations FOR INSERT WITH CHECK (true);
CREATE POLICY "Public read registrations" ON public.registrations FOR SELECT USING (true);
CREATE POLICY "Service role all users" ON public.users FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role all registrations" ON public.registrations FOR ALL USING (auth.role() = 'service_role');

-- Test: Insert sample news
INSERT INTO public.news (title, summary, date, image)
VALUES (
  'AKKFG Season 2026 Starts',
  'The Amateur Kho-Kho Federation Gujarat announces the start of season 2026.',
  '2026-03-18',
  'https://via.placeholder.com/300x200?text=AKKFG+2026'
);

-- Test: Insert sample event
INSERT INTO public.events (title, date, location, category, status)
VALUES (
  'Regional Qualifiers - North Gujarat',
  '2026-04-15',
  'Mehsana Sports Complex',
  'Tournament',
  'Upcoming'
);

-- Done
SELECT 'Schema created successfully!' as status;
