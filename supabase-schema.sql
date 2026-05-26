-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/tweewxtzfyxtvrawjlqz/sql/new)
-- Create AKKFG tables

-- Users table (for custom federation users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL, -- hashed
  role TEXT NOT NULL DEFAULT 'Player' CHECK (role IN ('Player', 'Coach', 'Admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SEED DEFAULT ADMIN (run once)
INSERT INTO public.users (name, email, password, role) 
VALUES (
  'Admin', 
  'admin@akkfg.com', 
  '$2b$10$Pnmi6Zl6QswyKXj5cc5KwO.9O/rVzqYiPIJy5jIz0zgf0X0vvTl6m',  -- bcrypt hash of 'admin123'
  'Admin'
) 
ON CONFLICT (email) DO NOTHING;

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- News
CREATE TABLE IF NOT EXISTS public.news (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  date TEXT,
  image TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

-- Events
CREATE TABLE IF NOT EXISTS public.events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT,
  location TEXT,
  category TEXT,
  status TEXT DEFAULT 'Upcoming',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Registrations (main federation form)
CREATE TABLE IF NOT EXISTS public.registrations (
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

ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Policies (public read, authenticated write)
CREATE POLICY "Public read news/events" ON public.news FOR SELECT USING (true);
CREATE POLICY "Public read events" ON public.events FOR SELECT USING (true);
CREATE POLICY "Public read registrations own" ON public.registrations FOR SELECT USING (true);
CREATE POLICY "Authenticated write registrations" ON public.registrations FOR ALL USING (auth.role() IS NOT NULL);
CREATE POLICY "Admin manage all" ON public.users FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Admin manage registrations" ON public.registrations FOR ALL USING (auth.role() = 'service_role');
