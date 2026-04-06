-- 1. Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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
CREATE TABLE IF NOT EXISTS public.safety_talk_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS public.safety_talks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.safety_talk_templates(id),
  template_name TEXT,
  scheduled_date DATE,
  status TEXT CHECK (status IN ('upcoming', 'missed', 'conducted')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Checklist & Equipment
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
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

-- 10. Daily Reports
CREATE TABLE IF NOT EXISTS public.daily_signed_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  prepared_by TEXT,
  signature_url TEXT,
  report_url TEXT,
  unsigned_report_url TEXT,
  is_signed BOOLEAN DEFAULT FALSE,
  signed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, report_date)
);

-- 11. General Attachments
CREATE TABLE IF NOT EXISTS public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  notes TEXT,
  file_names TEXT[] DEFAULT '{}',
  cloudinary_urls TEXT[] DEFAULT '{}',
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
