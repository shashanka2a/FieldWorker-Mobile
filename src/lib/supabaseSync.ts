import { supabase } from './supabase';
import { uploadPhotosArray, uploadImageToCloudinary } from './cloudinary';
import type {
    NoteEntry,
    ChemicalEntry,
    MetricsEntry,
    SurveyEntry,
    EquipmentEntry,
    EquipmentChecklistEntry,
    ObservationEntry,
    IncidentEntry,
    SignedReportEntry,
    AttachmentEntry
} from './dailyReportStorage';
import type { SafetyTalk } from './safetyStorage';
import type { SafetyTemplate } from './safetyTemplates';

function getLocalDayRange(date: Date): { startIso: string; endIso: string } {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * Use the report calendar day from `dateKey` with the wall-clock from `wall`.
 * Ensures `logged_at` falls on the selected reporting day (so date filters match)
 * even when the device "now" is a different calendar day.
 */
function mergeLocalCalendarDayWithWallClock(dateKey: string, wall: Date): string {
    const [ys, ms, ds] = dateKey.split('-');
    const y = Number(ys);
    const mo = Number(ms);
    const d = Number(ds);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return wall.toISOString();
    const merged = new Date(y, mo - 1, d, wall.getHours(), wall.getMinutes(), wall.getSeconds(), wall.getMilliseconds());
    return merged.toISOString();
}

function normalizeProjectName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function resolveProjectIds(projectId: string, projectName: string): Promise<string[]> {
    const ids = new Set<string>();
    if (projectId) ids.add(projectId);

    const normalized = normalizeProjectName(projectName || '');
    if (!normalized) return [...ids];

    const { data } = await supabase.from('projects').select('id, name');
    if (Array.isArray(data)) {
        for (const p of data as any[]) {
            const n = typeof p?.name === 'string' ? normalizeProjectName(p.name) : '';
            if (n && n === normalized && typeof p?.id === 'string') ids.add(p.id);
        }
    }
    return [...ids];
}

/**
 * Gets the Supabase project UUID based on the project name.
 * If it doesn't exist, it creates it.
 */
export async function getProjectId(projectName: string): Promise<string | null> {
    if (!projectName) return null;
    
    const { data, error } = await supabase
        .from('projects')
        .select('id')
        .eq('name', projectName)
        .single();

    if (data?.id) return data.id;

    // Create if not found
    const { data: newData, error: insertError } = await supabase
        .from('projects')
        .insert([{ name: projectName }])
        .select('id')
        .single();

    if (newData?.id) return newData.id;
    return null;
}

export async function syncNoteToSupabase(dateKey: string, entry: NoteEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id);
    const payload: any = {
        project_id: projectId,
        category: entry.category,
        notes_text: entry.notes,
        photos: await uploadPhotosArray(entry.photos),
        logged_at: mergeLocalCalendarDayWithWallClock(dateKey, new Date(entry.timestamp)),
        report_date: dateKey,
    };
    if (isUuid) payload.id = entry.id;

    // With UUID ids, edits will update the same row; without, this still creates a row.
    await supabase.from('notes').upsert([payload], { onConflict: 'id' });
}

export async function fetchNotesFromSupabase(
    dateKey: string,
    date: Date,
    projectId: string,
    projectName: string
): Promise<NoteEntry[]> {
    const projectIds = await resolveProjectIds(projectId, projectName);
    if (projectIds.length === 0) return [];

    const { startIso, endIso } = getLocalDayRange(date);

    // Prefer report_date (newer rows), fallback to logged_at range (older rows).
    let rows: any[] | null = null;

    {
        const res = await supabase
            .from('notes')
            .select('id, category, notes_text, photos, logged_at')
            .in('project_id', projectIds)
            .eq('report_date', dateKey)
            .order('logged_at', { ascending: true });
        if (!res.error && res.data && res.data.length > 0) rows = res.data as any[];
    }

    if (!rows) {
        const res = await supabase
            .from('notes')
            .select('id, category, notes_text, photos, logged_at')
            .in('project_id', projectIds)
            .gte('logged_at', startIso)
            .lt('logged_at', endIso)
            .order('logged_at', { ascending: true });
        if (!res.error && res.data) rows = res.data as any[];
    }

    if (!rows) return [];

    return rows.map((row) => ({
        id: row.id,
        project: { name: projectName || 'Unknown Project' },
        timestamp: row.logged_at,
        category: row.category ?? 'General',
        notes: row.notes_text ?? '',
        photos: Array.isArray(row.photos) ? row.photos : [],
    }));
}

/**
 * For the calendar legend (green / yellow / red): distinct dates in the month that have
 * Supabase activity or a fully signed daily report, scoped to the selected project
 * (including duplicate project_id rows with the same name).
 */
export async function fetchCalendarMonthActivityAndSignedFromSupabase(
    year: number,
    monthIndex: number,
    projectId: string,
    projectName: string
): Promise<{ activityDates: Set<string>; signedDates: Set<string> }> {
    const projectIds = await resolveProjectIds(projectId, projectName);
    if (projectIds.length === 0) {
        return { activityDates: new Set(), signedDates: new Set() };
    }

    const m = String(monthIndex + 1).padStart(2, '0');
    const lastD = new Date(year, monthIndex + 1, 0).getDate();
    const startKey = `${year}-${m}-01`;
    const endKey = `${year}-${m}-${String(lastD).padStart(2, '0')}`;

    const activityDates = new Set<string>();
    const addActivity = (rows: { report_date: string }[] | null | undefined) => {
        if (!rows) return;
        for (const r of rows) {
            if (r?.report_date) activityDates.add(r.report_date);
        }
    };

    const activityTables = [
        'notes',
        'chemicals_logs',
        'metrics',
        'surveys',
        'equipment_logs',
        'equipment_checklists',
        'attachments',
        'observations',
        'incidents',
    ] as const;

    const activityResults = await Promise.all(
        activityTables.map((table) =>
            supabase
                .from(table)
                .select('report_date')
                .in('project_id', projectIds)
                .gte('report_date', startKey)
                .lte('report_date', endKey)
        )
    );
    for (const res of activityResults) {
        if (!res.error && res.data) addActivity(res.data as { report_date: string }[]);
    }

    const signedDates = new Set<string>();
    const signedRes = await supabase
        .from('daily_signed_reports')
        .select('report_date')
        .in('project_id', projectIds)
        .eq('is_signed', true)
        .gte('report_date', startKey)
        .lte('report_date', endKey);
    if (!signedRes.error && signedRes.data) {
        for (const r of signedRes.data as { report_date: string }[]) {
            if (r?.report_date) signedDates.add(r.report_date);
        }
    }

    return { activityDates, signedDates };
}

function resolveProjectName(row: any): string {
    const projectData = row?.project_id;
    if (typeof projectData?.name === 'string' && projectData.name) return projectData.name;
    if (Array.isArray(projectData) && typeof projectData[0]?.name === 'string') return projectData[0].name;
    return 'Unknown Project';
}

export async function fetchChemicalsFromSupabase(
    dateKey: string,
    date: Date,
    projectId: string,
    projectName: string
): Promise<ChemicalEntry[]> {
    const projectIds = await resolveProjectIds(projectId, projectName);
    if (projectIds.length === 0) return [];
    const { startIso, endIso } = getLocalDayRange(date);

    let data: any[] | null = null;

    {
        const res = await supabase
            .from('chemicals_logs')
            .select('id, application_type, notes, photos, logged_at, project_id(name), chemical_applications(name, quantity, unit)')
            .in('project_id', projectIds)
            .eq('report_date', dateKey)
            .order('logged_at', { ascending: true });
        if (!res.error && res.data && res.data.length > 0) data = res.data as any[];
    }

    if (!data) {
        const res = await supabase
            .from('chemicals_logs')
            .select('id, application_type, notes, photos, logged_at, project_id(name), chemical_applications(name, quantity, unit)')
            .in('project_id', projectIds)
            .gte('logged_at', startIso)
            .lt('logged_at', endIso)
            .order('logged_at', { ascending: true });
        if (!res.error && res.data) data = res.data as any[];
    }

    if (!data) return [];

    return data.map((row: any) => ({
        id: row.id,
        project: { name: resolveProjectName(row) },
        timestamp: row.logged_at,
        applicationType: row.application_type === 'wicking' ? 'wicking' : 'spraying',
        chemicals: Array.isArray(row.chemical_applications)
            ? row.chemical_applications.map((c: any) => ({
                  name: c?.name ?? '',
                  quantity: c?.quantity != null ? String(c.quantity) : '',
                  unit: c?.unit ?? 'GAL',
              }))
            : [],
        notes: row.notes || undefined,
        photos: Array.isArray(row.photos) ? row.photos : [],
    }));
}

/** Company preset chemical rows per application method (`public.company_chemical_presets`). */
export async function fetchCompanyChemicalPresetsFromSupabase(
    applicationType: 'wicking' | 'spraying',
): Promise<{ name: string; unit: string }[]> {
    const res = await supabase
        .from('company_chemical_presets')
        .select('name, unit, sort_order')
        .eq('application_type', applicationType)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
    if (res.error) {
        console.warn('[fetchCompanyChemicalPresetsFromSupabase]', applicationType, res.error.message);
        return [];
    }
    if (!res.data?.length) return [];
    return (res.data as { name?: string; unit?: string }[])
        .map((r) => ({
            name: String(r.name ?? '').trim(),
            unit: String(r.unit ?? 'oz').trim() || 'oz',
        }))
        .filter((r) => r.name.length > 0);
}

export async function fetchMetricsFromSupabase(
    dateKey: string,
    date: Date,
    projectId: string,
    projectName: string
): Promise<MetricsEntry[]> {
    const projectIds = await resolveProjectIds(projectId, projectName);
    if (projectIds.length === 0) return [];
    const { startIso, endIso } = getLocalDayRange(date);

    let data: any[] | null = null;

    {
        const res = await supabase
            .from('metrics')
            .select('id, water_usage, acres_completed, green_space_completed, number_of_operators, notes, photos, logged_at, project_id(name)')
            .in('project_id', projectIds)
            .eq('report_date', dateKey)
            .order('logged_at', { ascending: true });
        if (!res.error && res.data && res.data.length > 0) data = res.data as any[];
    }

    if (!data) {
        const res = await supabase
            .from('metrics')
            .select('id, water_usage, acres_completed, green_space_completed, number_of_operators, notes, photos, logged_at, project_id(name)')
            .in('project_id', projectIds)
            .gte('logged_at', startIso)
            .lt('logged_at', endIso)
            .order('logged_at', { ascending: true });
        if (!res.error && res.data) data = res.data as any[];
    }

    if (!data) return [];

    return data.map((row: any) => ({
        id: row.id,
        project: { name: resolveProjectName(row) },
        timestamp: row.logged_at,
        waterUsage: row.water_usage != null ? String(row.water_usage) : undefined,
        acresCompleted: row.acres_completed != null ? String(row.acres_completed) : undefined,
        greenSpaceCompleted: row.green_space_completed != null ? String(row.green_space_completed) : undefined,
        numberOfOperators: row.number_of_operators != null ? String(row.number_of_operators) : undefined,
        notes: row.notes || undefined,
        photos: Array.isArray(row.photos) ? row.photos : [],
    }));
}

export async function fetchSurveyFromSupabase(
    dateKey: string,
    date: Date,
    projectId: string,
    projectName: string
): Promise<SurveyEntry[]> {
    const projectIds = await resolveProjectIds(projectId, projectName);
    if (projectIds.length === 0) return [];
    const { startIso, endIso } = getLocalDayRange(date);

    let data: any[] | null = null;

    {
        const res = await supabase
            .from('surveys')
            .select('id, logged_at, project_id(name), survey_questions(id, question, answer, description)')
            .in('project_id', projectIds)
            .eq('report_date', dateKey)
            .order('logged_at', { ascending: true });
        if (!res.error && res.data && res.data.length > 0) data = res.data as any[];
    }

    if (!data) {
        const res = await supabase
            .from('surveys')
            .select('id, logged_at, project_id(name), survey_questions(id, question, answer, description)')
            .in('project_id', projectIds)
            .gte('logged_at', startIso)
            .lt('logged_at', endIso)
            .order('logged_at', { ascending: true });
        if (!res.error && res.data) data = res.data as any[];
    }

    if (!data) return [];

    return data.map((row: any) => ({
        id: row.id,
        project: { name: resolveProjectName(row) },
        timestamp: row.logged_at,
        questions: Array.isArray(row.survey_questions)
            ? row.survey_questions.map((q: any, idx: number) => ({
                  id: String(q?.id ?? idx + 1),
                  question: q?.question ?? '',
                  answer: q?.answer ?? '',
                  description: q?.description ?? '',
              }))
            : [],
    }));
}

export async function fetchEquipmentFromSupabase(
    dateKey: string,
    date: Date,
    projectId: string,
    projectName: string
): Promise<(EquipmentEntry | EquipmentChecklistEntry)[]> {
    const projectIds = await resolveProjectIds(projectId, projectName);
    if (projectIds.length === 0) return [];
    const { startIso, endIso } = getLocalDayRange(date);

    const [logsResult, checklistResult] = await Promise.all([
        supabase
            .from('equipment_logs')
            .select('id, value, unit, notes, photos, logged_at, project_id(name)')
            .in('project_id', projectIds)
            .eq('report_date', dateKey)
            .order('logged_at', { ascending: true }),
        supabase
            .from('equipment_checklists')
            .select('id, form_data, signature_url, photos, logged_at, project_id(name)')
            .in('project_id', projectIds)
            .eq('report_date', dateKey)
            .order('logged_at', { ascending: true }),
    ]);

    const [fallbackLogs, fallbackChecklists] = (logsResult.data?.length || checklistResult.data?.length)
        ? [null, null]
        : await Promise.all([
              supabase
                  .from('equipment_logs')
                  .select('id, value, unit, notes, photos, logged_at, project_id(name)')
                  .in('project_id', projectIds)
                  .gte('logged_at', startIso)
                  .lt('logged_at', endIso)
                  .order('logged_at', { ascending: true }),
              supabase
                  .from('equipment_checklists')
                  .select('id, form_data, signature_url, photos, logged_at, project_id(name)')
                  .in('project_id', projectIds)
                  .gte('logged_at', startIso)
                  .lt('logged_at', endIso)
                  .order('logged_at', { ascending: true }),
          ]);

    const logsSource = (logsResult.data?.length ? logsResult : fallbackLogs);
    const checklistsSource = (checklistResult.data?.length ? checklistResult : fallbackChecklists);

    const logs = logsSource?.error || !logsSource?.data
        ? []
        : logsSource.data.map((row: any) => ({
              id: row.id,
              project: { name: resolveProjectName(row) },
              timestamp: row.logged_at,
              value: row.value ?? '',
              unit: row.unit ?? '',
              notes: row.notes || undefined,
              photos: Array.isArray(row.photos) ? row.photos : [],
          }));

    const checklists = checklistsSource?.error || !checklistsSource?.data
        ? []
        : checklistsSource.data.map((row: any) => ({
              id: row.id,
              type: 'checklist' as const,
              timestamp: row.logged_at,
              formData: row.form_data ?? {},
              signature: row.signature_url ?? undefined,
              photos: Array.isArray(row.photos) ? row.photos : [],
          }));

    return [...logs, ...checklists].sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
}

export async function fetchObservationsFromSupabase(
    dateKey: string,
    date: Date,
    projectId: string,
    projectName: string
): Promise<ObservationEntry[]> {
    const projectIds = await resolveProjectIds(projectId, projectName);
    if (projectIds.length === 0) return [];
    const { startIso, endIso } = getLocalDayRange(date);

    let data: any[] | null = null;

    {
        const res = await supabase
            .from('observations')
            .select('id, category, type, status, priority, description, location, due_date, resolution_photos, attachments, team_notifications, logged_at, project_id(name), observation_assignees(name, company)')
            .in('project_id', projectIds)
            .eq('report_date', dateKey)
            .order('logged_at', { ascending: true });
        if (!res.error && res.data && res.data.length > 0) data = res.data as any[];
    }

    if (!data) {
        const res = await supabase
            .from('observations')
            .select('id, category, type, status, priority, description, location, due_date, resolution_photos, attachments, team_notifications, logged_at, project_id(name), observation_assignees(name, company)')
            .in('project_id', projectIds)
            .gte('logged_at', startIso)
            .lt('logged_at', endIso)
            .order('logged_at', { ascending: true });
        if (!res.error && res.data) data = res.data as any[];
    }

    if (!data) return [];

    return data.map((row: any) => ({
        id: row.id,
        project: { name: resolveProjectName(row) },
        timestamp: row.logged_at,
        category: row.category ?? 'Negative',
        type: row.type ?? '',
        status: row.status ?? 'Open',
        priority: row.priority ?? 'Low',
        description: row.description || undefined,
        location: row.location || undefined,
        assignees: Array.isArray(row.observation_assignees)
            ? row.observation_assignees.map((a: any) => ({ name: a?.name ?? '', company: a?.company ?? '' }))
            : [],
        dueDate: row.due_date || undefined,
        resolutionPhotos: Array.isArray(row.resolution_photos) ? row.resolution_photos : [],
        attachments: Array.isArray(row.attachments) ? row.attachments : [],
        teamNotifications: Array.isArray(row.team_notifications) ? row.team_notifications : [],
    }));
}

export async function fetchIncidentsFromSupabase(
    dateKey: string,
    date: Date,
    projectId: string,
    projectName: string
): Promise<IncidentEntry[]> {
    const projectIds = await resolveProjectIds(projectId, projectName);
    if (projectIds.length === 0) return [];
    const { startIso, endIso } = getLocalDayRange(date);

    let data: any[] | null = null;

    {
        const res = await supabase
            .from('incidents')
            .select('id, title, status, recordable, incident_date, incident_time, location, injury_illness_type, injured_employee_info, incident_investigation, incident_outcome, description, photos, logged_at, project_id(name)')
            .in('project_id', projectIds)
            .eq('report_date', dateKey)
            .order('logged_at', { ascending: true });
        if (!res.error && res.data && res.data.length > 0) data = res.data as any[];
    }

    if (!data) {
        const res = await supabase
            .from('incidents')
            .select('id, title, status, recordable, incident_date, incident_time, location, injury_illness_type, injured_employee_info, incident_investigation, incident_outcome, description, photos, logged_at, project_id(name)')
            .in('project_id', projectIds)
            .gte('logged_at', startIso)
            .lt('logged_at', endIso)
            .order('logged_at', { ascending: true });
        if (!res.error && res.data) data = res.data as any[];
    }

    if (!data) return [];

    return data.map((row: any) => ({
        id: row.id,
        project: { name: resolveProjectName(row) },
        timestamp: row.logged_at,
        title: row.title ?? '',
        status: row.status ?? 'Open',
        recordable: !!row.recordable,
        incidentDate: row.incident_date ?? '',
        incidentTime: row.incident_time ?? '00:00',
        location: row.location ?? '',
        injuryIllnessType: row.injury_illness_type || undefined,
        injuredEmployeeInfo: Array.isArray(row.injured_employee_info) ? row.injured_employee_info : [],
        incidentInvestigation: Array.isArray(row.incident_investigation) ? row.incident_investigation : [],
        incidentOutcome: Array.isArray(row.incident_outcome) ? row.incident_outcome : [],
        description: row.description || undefined,
        photos: Array.isArray(row.photos) ? row.photos : [],
    }));
}

export type FetchEmployeesOptions = {
    /** When set (with optional project name), only employees whose `assigned_projects` overlaps these values are returned (Postgres `&&`). */
    projectId?: string;
    projectName?: string;
};

/** Names/companies for observation assignee / safety attendee pickers (see `public.employees`). */
export async function fetchEmployeesFromSupabase(
    options?: FetchEmployeesOptions
): Promise<{ name: string; company: string }[]> {
    type Row = Record<string, any>;

    const normalize = (name: string, company: string) => ({
        name: String(name ?? '').trim(),
        company: String(company ?? '').trim(),
    });

    const coalesceName = (r: Row): string => {
        if (typeof r?.name === 'string' && r.name.trim()) return r.name;
        if (typeof r?.full_name === 'string' && r.full_name.trim()) return r.full_name;
        const fn = typeof r?.first_name === 'string' ? r.first_name.trim() : '';
        const ln = typeof r?.last_name === 'string' ? r.last_name.trim() : '';
        const combo = `${fn} ${ln}`.trim();
        return combo || '';
    };

    const coalesceCompany = (r: Row): string => {
        if (typeof r?.company === 'string') return r.company;
        if (typeof r?.company_name === 'string') return r.company_name;
        if (typeof r?.organization === 'string') return r.organization;
        return '';
    };

    const pid = typeof options?.projectId === 'string' ? options.projectId.trim() : '';
    const pname = typeof options?.projectName === 'string' ? options.projectName.trim() : '';
    let projectOverlapTokens: string[] = [];
    if (pid || pname) {
        const ids = await resolveProjectIds(pid, pname);
        projectOverlapTokens = [...new Set([...ids, pname].filter(Boolean))];
    }

    const employeesSelect =
        'name, company, full_name, first_name, last_name, company_name, organization, assigned_projects';

    const tryFetchEmployees = async () => {
        let q = supabase.from('employees').select(employeesSelect).order('name', { ascending: true });
        if (projectOverlapTokens.length > 0) {
            q = q.overlaps('assigned_projects', projectOverlapTokens);
        }
        const res = await q;
        if (res.error) {
            console.warn('[fetchEmployeesFromSupabase] employees error:', res.error.message);
            return null;
        }
        if (!res.data) return null;
        return res.data as Row[];
    };

    const tryFetch = async (table: string, select: string, orderBy: string) => {
        const res = await supabase.from(table).select(select).order(orderBy, { ascending: true });
        if (res.error) {
            console.warn(`[fetchEmployeesFromSupabase] ${table} error:`, res.error.message);
            return null;
        }
        if (!res.data) return null;
        return res.data as Row[];
    };

    const mapRows = (rows: Row[]) =>
        rows
            .map((r) => normalize(coalesceName(r), coalesceCompany(r)))
            .filter((x) => x.name.length > 0);

    const primary = await tryFetchEmployees();
    if (primary !== null) {
        const mapped = mapRows(primary);
        if (mapped.length > 0) return mapped;
        if (projectOverlapTokens.length > 0) {
            // Query succeeded but nobody on this project in `assigned_projects`.
            return [];
        }
    } else if (projectOverlapTokens.length > 0) {
        console.warn(
            '[fetchEmployeesFromSupabase] employees query failed (RLS/schema). Not using unscoped fallback tables while project filter is active.'
        );
        return [];
    }

    const fallbackSelect =
        'name, company, full_name, first_name, last_name, company_name, organization';
    const fallbacks: Array<Promise<Row[] | null>> = [
        tryFetch('team_members', fallbackSelect, 'name'),
        tryFetch('directory', fallbackSelect, 'name'),
    ];

    for (const p of fallbacks) {
        const rows = await p;
        if (!rows || rows.length === 0) continue;
        const out = mapRows(rows);
        if (out.length > 0) return out;
    }

    return [];
}

/** DB-backed safety talk templates (avoid hardcoded placeholder PDFs). */
export async function fetchSafetyTalkTemplatesFromSupabase(): Promise<SafetyTemplate[]> {
    const res = await supabase
        .from('safety_talk_templates')
        .select('id, name, description, pdf_url')
        .order('name', { ascending: true });
    if (res.error || !res.data) return [];
    return (res.data as any[]).map((row) => ({
        id: String(row.id),
        name: String(row.name ?? ''),
        description: row.description ? String(row.description) : undefined,
        pdfUrl: String(row.pdf_url ?? ''),
    })).filter((t) => t.id && t.name && t.pdfUrl);
}

export async function fetchSafetyTalkTemplateByIdFromSupabase(id: string): Promise<SafetyTemplate | null> {
    if (!id) return null;
    const res = await supabase
        .from('safety_talk_templates')
        .select('id, name, description, pdf_url')
        .eq('id', id)
        .maybeSingle();
    if (res.error || !res.data) return null;
    return {
        id: String((res.data as any).id),
        name: String((res.data as any).name ?? ''),
        description: (res.data as any).description ? String((res.data as any).description) : undefined,
        pdfUrl: String((res.data as any).pdf_url ?? ''),
    };
}

export async function fetchAttachmentsFromSupabase(
    dateKey: string,
    date: Date,
    projectId: string,
    projectName: string
): Promise<AttachmentEntry[]> {
    const projectIds = await resolveProjectIds(projectId, projectName);
    if (projectIds.length === 0) return [];
    const { startIso, endIso } = getLocalDayRange(date);

    let data: any[] | null = null;

    {
        const res = await supabase
            .from('attachments')
            .select('id, notes, file_names, cloudinary_urls, logged_at, project_id(name)')
            .in('project_id', projectIds)
            .eq('report_date', dateKey)
            .order('logged_at', { ascending: true });
        if (!res.error && res.data && res.data.length > 0) data = res.data as any[];
    }

    if (!data) {
        const res = await supabase
            .from('attachments')
            .select('id, notes, file_names, cloudinary_urls, logged_at, project_id(name)')
            .in('project_id', projectIds)
            .gte('logged_at', startIso)
            .lt('logged_at', endIso)
            .order('logged_at', { ascending: true });
        if (!res.error && res.data) data = res.data as any[];
    }

    if (!data) return [];

    return data.map((row: any) => ({
        id: row.id,
        project: { name: resolveProjectName(row) },
        timestamp: row.logged_at,
        fileNames: Array.isArray(row.file_names) ? row.file_names : [],
        notes: row.notes || undefined,
        previews: Array.isArray(row.cloudinary_urls) ? row.cloudinary_urls : [],
    }));
}

export async function syncChemicalsToSupabase(dateKey: string, entry: ChemicalEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id);
    let targetId: string | null = null;

    if (isUuid) {
        targetId = entry.id;
    } else {
        const { data: existing } = await supabase
            .from('chemicals_logs')
            .select('id')
            .eq('project_id', projectId)
            .eq('report_date', dateKey)
            .eq('application_type', entry.applicationType)
            .order('logged_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        targetId = existing?.id ?? null;
    }

    const payload = {
        project_id: projectId,
        application_type: entry.applicationType,
        notes: entry.notes || '',
        photos: await uploadPhotosArray(entry.photos),
        logged_at: mergeLocalCalendarDayWithWallClock(dateKey, new Date(entry.timestamp)),
        report_date: dateKey,
    };

    let logData: { id: string } | null = null;
    if (targetId) {
        const { data } = await supabase
            .from('chemicals_logs')
            .update(payload)
            .eq('id', targetId)
            .select('id')
            .single();
        logData = data;
    } else {
        const { data } = await supabase
            .from('chemicals_logs')
            .insert([payload])
            .select('id')
            .single();
        logData = data;
    }

    if (logData?.id && entry.chemicals && entry.chemicals.length > 0) {
        await supabase.from('chemical_applications').delete().eq('chemical_log_id', logData.id);
        const apps = entry.chemicals.map(c => ({
            chemical_log_id: logData.id,
            name: c.name,
            quantity: Number(c.quantity) || 0,
            unit: c.unit
        }));
        await supabase.from('chemical_applications').insert(apps);
    }
}

export async function syncMetricsToSupabase(dateKey: string, entry: MetricsEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id);
    let targetId: string | null = null;
    if (isUuid) {
        targetId = entry.id;
    } else {
        const { data: existing } = await supabase
            .from('metrics')
            .select('id')
            .eq('project_id', projectId)
            .eq('report_date', dateKey)
            .order('logged_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        targetId = existing?.id ?? null;
    }

    const payload = {
        project_id: projectId,
        water_usage: Number(entry.waterUsage) || null,
        acres_completed: Number(entry.acresCompleted) || null,
        green_space_completed: Number(entry.greenSpaceCompleted) || null,
        number_of_operators: Number(entry.numberOfOperators) || null,
        notes: entry.notes || '',
        photos: await uploadPhotosArray(entry.photos),
        logged_at: mergeLocalCalendarDayWithWallClock(dateKey, new Date(entry.timestamp)),
        report_date: dateKey
    };

    if (targetId) {
        await supabase.from('metrics').update(payload).eq('id', targetId);
    } else {
        await supabase.from('metrics').insert([payload]);
    }
}

export async function syncSurveyToSupabase(dateKey: string, entry: SurveyEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id);
    let targetId: string | null = null;

    if (isUuid) {
        targetId = entry.id;
    } else {
        const { data: existing } = await supabase
            .from('surveys')
            .select('id')
            .eq('project_id', projectId)
            .eq('report_date', dateKey)
            .order('logged_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        targetId = existing?.id ?? null;
    }

    const payload = {
        project_id: projectId,
        logged_at: mergeLocalCalendarDayWithWallClock(dateKey, new Date(entry.timestamp)),
        report_date: dateKey,
    };

    let surveyData: { id: string } | null = null;
    if (targetId) {
        const { data } = await supabase
            .from('surveys')
            .update(payload)
            .eq('id', targetId)
            .select('id')
            .single();
        surveyData = data;
    } else {
        const { data } = await supabase
            .from('surveys')
            .insert([payload])
            .select('id')
            .single();
        surveyData = data;
    }

    if (surveyData?.id && entry.questions && entry.questions.length > 0) {
        await supabase.from('survey_questions').delete().eq('survey_id', surveyData.id);
        const qArr = entry.questions.map(q => ({
            survey_id: surveyData.id,
            question: q.question,
            answer: q.answer,
            description: q.description || ''
        }));
        await supabase.from('survey_questions').insert(qArr);
    }
}

export async function syncEquipmentToSupabase(dateKey: string, entry: EquipmentEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id);
    const payload: any = {
        project_id: projectId,
        value: entry.value || '',
        unit: entry.unit || '',
        notes: entry.notes || '',
        photos: await uploadPhotosArray(entry.photos),
        logged_at: mergeLocalCalendarDayWithWallClock(dateKey, new Date(entry.timestamp)),
        report_date: dateKey,
    };
    if (isUuid) payload.id = entry.id;

    await supabase.from('equipment_logs').upsert([payload], { onConflict: 'id' });
}

export async function syncEquipmentChecklistToSupabase(dateKey: string, entry: EquipmentChecklistEntry) {
    // Requires the checklist to have project info nested within formData or extended structure 
    // Usually dailyReportStorage passes the entry but the project might be extracted from formData
    const projectName = entry.formData?.siteName || 'Unknown Site';
    const projectId = await getProjectId(projectName);
    if (!projectId) return;

    const attachmentApplicable =
        (entry.formData as any)?.attachmentApplicable ??
        ((entry.formData as any)?.attachment ? 'Yes' : 'N/A');
    const attachmentName =
        (entry.formData as any)?.attachmentName ??
        (entry.formData as any)?.attachment ??
        null;
    const attachmentCondition = (entry.formData as any)?.attachmentCondition ?? null;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id);
    let targetId: string | null = null;

    if (isUuid) {
        targetId = entry.id;
    } else {
        const { data: existing } = await supabase
            .from('equipment_checklists')
            .select('id')
            .eq('project_id', projectId)
            .eq('report_date', dateKey)
            .order('logged_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        targetId = existing?.id ?? null;
    }

    const payload = {
        project_id: projectId,
        form_data: entry.formData || {},
        attachment_applicable: attachmentApplicable || null,
        attachment_name: attachmentName || null,
        attachment_condition: attachmentCondition || null,
        signature_url: entry.signature ? await uploadImageToCloudinary(entry.signature) : null,
        photos: await uploadPhotosArray(entry.photos),
        logged_at: mergeLocalCalendarDayWithWallClock(dateKey, new Date(entry.timestamp)),
        report_date: dateKey,
    };

    if (targetId) {
        await supabase.from('equipment_checklists').update(payload).eq('id', targetId);
    } else {
        await supabase.from('equipment_checklists').insert([payload]);
    }
}

export async function syncObservationToSupabase(dateKey: string, entry: ObservationEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    // Insert or update observation 
    const { data: obsData } = await supabase
        .from('observations')
        .upsert([{
            id: entry.id, // Keep the same UUID string generated by the app!
            project_id: projectId,
            category: entry.category,
            type: entry.type,
            status: entry.status,
            priority: entry.priority,
            description: entry.description || '',
            location: entry.location || '',
            due_date: entry.dueDate ? entry.dueDate : null,
            resolution_photos: await uploadPhotosArray(entry.resolutionPhotos),
            attachments: await uploadPhotosArray(entry.attachments),
            team_notifications: entry.teamNotifications || [],
            logged_at: mergeLocalCalendarDayWithWallClock(dateKey, new Date(entry.timestamp)),
            report_date: dateKey
        }], { onConflict: 'id' })
        .select('id')
        .single();

    if (obsData?.id && entry.assignees && entry.assignees.length > 0) {
        // Clear old assignees first on upsert
        await supabase.from('observation_assignees').delete().eq('observation_id', obsData.id);
        
        const assignees = entry.assignees.map(a => ({
            observation_id: obsData.id,
            name: a.name,
            company: a.company || ''
        }));
        await supabase.from('observation_assignees').insert(assignees);
    }
}

export async function syncIncidentToSupabase(dateKey: string, entry: IncidentEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    await supabase
        .from('incidents')
        .upsert([{
            id: entry.id, // Using existing local UUID
            project_id: projectId,
            title: entry.title,
            status: entry.status,
            recordable: entry.recordable || false,
            incident_date: entry.incidentDate || null,
            incident_time: entry.incidentTime || '00:00:00',
            location: entry.location,
            injury_illness_type: entry.injuryIllnessType || '',
            injured_employee_info: entry.injuredEmployeeInfo || [],
            incident_investigation: entry.incidentInvestigation || [],
            incident_outcome: entry.incidentOutcome || [],
            description: entry.description || '',
            photos: await uploadPhotosArray(entry.photos),
            logged_at: mergeLocalCalendarDayWithWallClock(dateKey, new Date(entry.timestamp)),
            report_date: dateKey
        }], { onConflict: 'id' });
}

export async function syncSafetyTalkToSupabase(talk: SafetyTalk) {
    // For SafetyTalks we may need to make sure the template exists 
    // However, the schema allows template_id = null if we just save template_name.
    // SafetyTalk doesn't have a project on its root based on local storage, 
    // let's assign it to a default project or handle appropriately.
    const projectId = await getProjectId('General Site'); 
    if (!projectId) return;

    await supabase.from('safety_talks').upsert([{
        id: talk.id,
        project_id: projectId,
        template_name: talk.templateName,
        scheduled_date: talk.date,
        status: talk.status,
        created_at: talk.createdAt
    }], { onConflict: 'id' });
}

export async function syncSignedReportToSupabase(entry: SignedReportEntry) {
    const projectId = await getProjectId(entry.projectName);
    if (!projectId) return;

    await supabase.from('daily_signed_reports').upsert([{
        project_id: projectId,
        report_date: entry.reportDate,
        prepared_by: entry.preparedBy,
        signature_url: entry.signatureDataUrl ? await uploadImageToCloudinary(entry.signatureDataUrl) : null,
        signed_at: entry.signedAt || null,
        report_url: entry.reportUrl || null,
        unsigned_report_url: entry.unsignedReportUrl || null,
        is_signed: entry.isSigned
    }], { onConflict: 'project_id,report_date' });
}

export async function syncAttachmentToSupabase(dateKey: string, entry: AttachmentEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id);
    const payload: any = {
        project_id: projectId,
        notes: entry.notes || '',
        file_names: entry.fileNames || [],
        cloudinary_urls: entry.previews || [],
        logged_at: mergeLocalCalendarDayWithWallClock(dateKey, new Date(entry.timestamp)),
        report_date: dateKey,
    };
    if (isUuid) payload.id = entry.id;

    await supabase.from('attachments').upsert([payload], { onConflict: 'id' });
}
