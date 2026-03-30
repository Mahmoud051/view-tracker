# View — Billboard Management System
نظام إدارة اللوحات الإعلانية

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env` and fill in your Supabase credentials:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Supabase Database Setup
Run the following SQL in your Supabase SQL Editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE gov_status_enum AS ENUM ('active', 'expired', 'renewal_pending');
CREATE TYPE contract_status_enum AS ENUM ('active', 'expired', 'terminated', 'upcoming');
CREATE TYPE rental_type_enum AS ENUM ('monthly', 'quarterly', 'semi_annual', 'annual');
CREATE TYPE payment_method_enum AS ENUM ('cash', 'transfer', 'other');

-- Stands table
CREATE TABLE stands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  address TEXT NOT NULL,
  photo_url TEXT,
  width NUMERIC NOT NULL DEFAULT 0,
  height NUMERIC NOT NULL DEFAULT 0,
  area NUMERIC GENERATED ALWAYS AS (width * height) STORED,
  gov_license_number TEXT,
  gov_rental_start DATE,
  gov_rental_end DATE,
  gov_rental_cost NUMERIC DEFAULT 0,
  gov_status gov_status_enum DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clients table
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contracts table
CREATE TABLE contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stand_id UUID REFERENCES stands(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  rental_type rental_type_enum NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_value NUMERIC NOT NULL DEFAULT 0,
  status contract_status_enum DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payments table
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_date DATE NOT NULL,
  payment_method payment_method_enum DEFAULT 'cash',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Maintenance records table
CREATE TABLE maintenance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stand_id UUID REFERENCES stands(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  cost NUMERIC DEFAULT 0,
  technician_name TEXT,
  is_paid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE stands ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies (authenticated users only)
CREATE POLICY "Allow all for authenticated" ON stands FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON payments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON maintenance_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

### 4. Supabase Storage Setup
1. Go to **Storage** in your Supabase dashboard
2. Create a new bucket named `stand-photos`
3. Set the bucket to **Public**
4. Add this storage policy:

```sql
CREATE POLICY "Public read access" ON storage.objects FOR SELECT USING (bucket_id = 'stand-photos');
CREATE POLICY "Auth upload access" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'stand-photos');
CREATE POLICY "Auth update access" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'stand-photos');
CREATE POLICY "Auth delete access" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'stand-photos');
```

### 5. Create Admin User
Go to **Authentication → Users** in Supabase and create a new user with email and password.

### 6. Run the App
```bash
npm run dev
```

## Features
- 🏢 Full billboard (stand) management with photos
- 📋 Contract management with payment tracking
- 👥 Client management
- 📊 Revenue reports and charts
- 🔔 Expiry alerts for permits and contracts
- 📱 Mobile responsive RTL Arabic interface
- 🌙 Dark/Light theme toggle
- 📤 Excel and PDF export
