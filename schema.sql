-- 1. Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  street_address TEXT,
  zipcode TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Directory (field + web). Filter in app by assigned_projects @> selected project name.
CREATE TABLE IF NOT EXISTS public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT,
  status TEXT,
  assigned_projects TEXT[] DEFAULT '{}',
  email TEXT,
  phone TEXT,
  employee_id TEXT,
  classification TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_name ON public.employees (name);
CREATE INDEX IF NOT EXISTS idx_employees_assigned_projects ON public.employees USING gin (assigned_projects);

-- 2. Daily Notes
CREATE TABLE IF NOT EXISTS public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  notes_text TEXT,
  photos TEXT[] DEFAULT '{}',
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Chemicals
CREATE TABLE IF NOT EXISTS public.chemicals_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  application_type TEXT CHECK (application_type IN ('wicking', 'spraying')),
  notes TEXT,
  photos TEXT[] DEFAULT '{}',
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chemical_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chemical_log_id UUID REFERENCES public.chemicals_logs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT NOT NULL
);

-- Company chemical presets (controls the rows shown in the mobile Chemicals UI).
-- You indicated this table already exists in Supabase; keeping it in schema.sql for new envs.
CREATE TABLE IF NOT EXISTS public.company_chemical_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_type TEXT NOT NULL CHECK (application_type IN ('wicking', 'spraying')),
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'oz',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (application_type, name)
);

CREATE INDEX IF NOT EXISTS idx_company_chemical_presets_application_type ON public.company_chemical_presets (application_type);

ALTER TABLE public.company_chemical_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read company_chemical_presets" ON public.company_chemical_presets;
CREATE POLICY "Allow public read company_chemical_presets"
  ON public.company_chemical_presets FOR SELECT USING (true);

-- 4. Metrics
CREATE TABLE IF NOT EXISTS public.metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  water_usage NUMERIC,
  acres_completed NUMERIC,
  green_space_completed NUMERIC,
  number_of_operators INTEGER,
  notes TEXT,
  photos TEXT[] DEFAULT '{}',
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Safety Talks (Toolbox Talks)
-- Mobile + sync code use table name: public.safety_talks (plural). Not `safety_talk`.
CREATE TABLE IF NOT EXISTS public.safety_talk_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  pdf_url TEXT
);

-- Backfill for older deployments (safe if column already exists)
ALTER TABLE IF EXISTS public.safety_talk_templates
  ADD COLUMN IF NOT EXISTS pdf_url TEXT;

CREATE TABLE IF NOT EXISTS public.safety_talks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.safety_talk_templates(id),
  template_name TEXT,
  scheduled_date DATE,
  status TEXT CHECK (status IN ('upcoming', 'missed', 'conducted')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  attendees JSONB NOT NULL DEFAULT '[]'::jsonb,
  attendance_pdf_url TEXT
);

ALTER TABLE IF EXISTS public.safety_talks
  ADD COLUMN IF NOT EXISTS attendees JSONB DEFAULT '[]'::jsonb;
ALTER TABLE IF EXISTS public.safety_talks
  ADD COLUMN IF NOT EXISTS attendance_pdf_url TEXT;

COMMENT ON TABLE public.safety_talks IS 'Scheduled / conducted toolbox talks per project; mobile upserts via syncSafetyTalkToSupabase.';
COMMENT ON COLUMN public.safety_talks.attendees IS 'JSON array of attendee objects (name, company, signed); matches mobile SafetyTalkAttendeeRow.';
COMMENT ON COLUMN public.safety_talks.attendance_pdf_url IS 'URL to combined attendance PDF (sign-in sheet) when generated.';

-- If this table has RLS enabled without INSERT/UPDATE policies for your app role, Supabase will reject upserts (no rows).
-- Mirror `audit_log`: policies TO authenticated WITH CHECK (true), or service-role-only writes from a backend.

-- 6. Checklist & Equipment
-- Mobile + sync use: public.equipment_checklists (plural). Not `equipment_checklist`.
CREATE TABLE IF NOT EXISTS public.equipment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  value TEXT,
  unit TEXT,
  notes TEXT,
  photos TEXT[] DEFAULT '{}',
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.equipment_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  form_data JSONB NOT NULL,
  signature_url TEXT,
  photos TEXT[] DEFAULT '{}',
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  report_date DATE,
  attachment_applicable TEXT,
  attachment_name TEXT,
  attachment_condition TEXT,
  attachment_number TEXT
);

-- Backfill older DBs created from an earlier schema.sql revision (safe if columns already exist).
ALTER TABLE public.equipment_logs ADD COLUMN IF NOT EXISTS report_date DATE;
ALTER TABLE public.equipment_checklists ADD COLUMN IF NOT EXISTS report_date DATE;
ALTER TABLE public.equipment_checklists ADD COLUMN IF NOT EXISTS attachment_applicable TEXT;
ALTER TABLE public.equipment_checklists ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE public.equipment_checklists ADD COLUMN IF NOT EXISTS attachment_condition TEXT;
ALTER TABLE public.equipment_checklists ADD COLUMN IF NOT EXISTS attachment_number TEXT;

COMMENT ON TABLE public.equipment_checklists IS 'ASV / equipment daily checklist; one row per checklist (client UUID). Multiple machines per project/day allowed; mobile upserts via syncEquipmentChecklistToSupabase.';
COMMENT ON COLUMN public.equipment_checklists.form_data IS 'Full checklist form as JSON (machineNumber, machineType, fluids, attachment fields, etc.).';
COMMENT ON COLUMN public.equipment_checklists.report_date IS 'Calendar report day (YYYY-MM-DD) from the app home screen; used for sync filters.';
COMMENT ON COLUMN public.equipment_checklists.attachment_number IS 'Attachment reference or number (e.g. part / asset id) when an attachment applies.';

-- 7. Surveys
CREATE TABLE IF NOT EXISTS public.surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID REFERENCES public.surveys(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT CHECK (answer IN ('N/A', 'No', 'Yes', '')),
  description TEXT
);

-- 8. Observations
CREATE TABLE IF NOT EXISTS public.observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- App uses existing UUID
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  category TEXT CHECK (category IN ('Negative', 'Positive')),
  type TEXT,
  status TEXT CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Closed')),
  priority TEXT CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
  description TEXT,
  location TEXT,
  due_date DATE,
  resolution_photos TEXT[] DEFAULT '{}',
  attachments TEXT[] DEFAULT '{}',
  team_notifications JSONB DEFAULT '[]', -- JSON array of notification objects
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.observation_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  observation_id UUID REFERENCES public.observations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT
);

-- 9. Incidents
CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- App uses existing UUID
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT CHECK (status IN ('Open', 'Closed')),
  recordable BOOLEAN DEFAULT FALSE,
  incident_date DATE,
  incident_time TIME,
  location TEXT NOT NULL,
  injury_illness_type TEXT,
  injured_employee_info JSONB DEFAULT '[]',
  incident_investigation JSONB DEFAULT '[]',
  incident_outcome JSONB DEFAULT '[]',
  description TEXT,
  photos TEXT[] DEFAULT '{}',
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS report_date DATE;

-- 10. Daily signed reports (Utility Vision production shape: 8 columns, strict NOT NULL on text/timestamp core fields)
CREATE TABLE IF NOT EXISTS public.daily_signed_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  prepared_by TEXT NOT NULL,
  signature_url TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  report_date DATE,
  report_url TEXT,
  UNIQUE(project_id, report_date)
);

-- Backfill for older deployments (safe if columns already exist)
ALTER TABLE public.daily_signed_reports ADD COLUMN IF NOT EXISTS report_date DATE;
ALTER TABLE public.daily_signed_reports ADD COLUMN IF NOT EXISTS prepared_by TEXT;
ALTER TABLE public.daily_signed_reports ADD COLUMN IF NOT EXISTS signature_url TEXT;
ALTER TABLE public.daily_signed_reports ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE public.daily_signed_reports ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.daily_signed_reports ADD COLUMN IF NOT EXISTS report_url TEXT;

-- If `daily_signed_reports` was created without UNIQUE(project_id, report_date), PostgREST upserts
-- fail. The app falls back to update/insert; you can still add this in Supabase SQL (one-time):
--   CREATE UNIQUE INDEX daily_signed_reports_project_report_date_uidx
--     ON public.daily_signed_reports (project_id, report_date);

-- 11. General Attachments
CREATE TABLE IF NOT EXISTS public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  notes TEXT,
  file_names TEXT[] DEFAULT '{}',
  cloudinary_urls TEXT[] DEFAULT '{}',
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Mobile sync stores which *report calendar day* the upload belongs to (home screen date), not EXIF capture day.
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS report_date DATE;
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS selected_date DATE;

COMMENT ON TABLE public.attachments IS 'Field photos per project/day; image bytes on Cloudinary, URLs in cloudinary_urls[].';
COMMENT ON COLUMN public.attachments.report_date IS 'Report calendar day (YYYY-MM-DD) from app home screen; primary filter for gallery/list.';
COMMENT ON COLUMN public.attachments.selected_date IS 'Same calendar day as report_date when synced from mobile (matches production Supabase).';
COMMENT ON COLUMN public.attachments.cloudinary_urls IS 'HTTPS URLs after Cloudinary upload; gallery only shows rows with non-empty array.';

-- 12. Field data audit (append-only). If this table already exists in Supabase, run the ALTERs so new rows include submitter display name.
-- details JSON (mobile app): { "project_name": string, "snapshot": { <snake_case columns mirroring the entity table row> }, "related"?: { child table name: rows[] } }
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  action TEXT NOT NULL DEFAULT 'field_sync',
  entity_type TEXT,
  entity_id TEXT,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  report_date DATE,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_employee_name TEXT,
  submitted_by_user_id UUID
);

ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS submitted_employee_name TEXT;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS submitted_by_user_id UUID;

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_project_report ON public.audit_log (project_id, report_date);
CREATE INDEX IF NOT EXISTS idx_audit_log_submitted_user ON public.audit_log (submitted_by_user_id, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_insert_authenticated" ON public.audit_log;
CREATE POLICY "audit_log_insert_authenticated"
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "audit_log_select_authenticated" ON public.audit_log;
CREATE POLICY "audit_log_select_authenticated"
  ON public.audit_log FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- RLS for mobile sync: projects + daily_signed_reports
-- If these tables had RLS enabled without policies, upserts from the app fail
-- silently (0 rows). Run this block on an existing Supabase project when needed.
-- ---------------------------------------------------------------------------

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_select_authenticated" ON public.projects;
CREATE POLICY "projects_select_authenticated"
  ON public.projects FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "projects_insert_authenticated" ON public.projects;
CREATE POLICY "projects_insert_authenticated"
  ON public.projects FOR INSERT TO authenticated
  WITH CHECK (true);

ALTER TABLE public.daily_signed_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_signed_reports_select_authenticated" ON public.daily_signed_reports;
CREATE POLICY "daily_signed_reports_select_authenticated"
  ON public.daily_signed_reports FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "daily_signed_reports_insert_authenticated" ON public.daily_signed_reports;
CREATE POLICY "daily_signed_reports_insert_authenticated"
  ON public.daily_signed_reports FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "daily_signed_reports_update_authenticated" ON public.daily_signed_reports;
CREATE POLICY "daily_signed_reports_update_authenticated"
  ON public.daily_signed_reports FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
