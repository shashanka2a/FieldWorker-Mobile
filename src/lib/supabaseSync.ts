import type { User } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { uploadPhotosArray, uploadImageToCloudinary, uploadAttachmentPreviews, isRemoteMediaUrl } from './cloudinary';
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
import { normalizeInjuredEmployeeList } from './injuredEmployeeInfo';
import { incidentInvestigationForDb, normalizeIncidentInvestigation } from './incidentInvestigationInfo';
import { incidentOutcomeForDb, normalizeIncidentOutcome } from './incidentOutcomeInfo';

function getLocalDayRange(date: Date): { startIso: string; endIso: string } {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** DB `logged_at`: actual submission instant from the entry (not the selected report calendar day). */
function loggedAtIsoFromEntryTimestamp(entryTimestamp: string | undefined): string {
    if (!entryTimestamp) return new Date().toISOString();
    const d = new Date(entryTimestamp);
    if (Number.isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
}

/**
 * Audit `details` for web dashboards: `snapshot` mirrors the primary DB row (snake_case);
 * `related` holds child-table rows written in the same action; `project_name` aids display without joins.
 */
function auditDetailsForDashboard(
    projectName: string | undefined,
    snapshot: Record<string, unknown>,
    related?: Record<string, unknown>
): Record<string, unknown> {
    const details: Record<string, unknown> = {
        snapshot: JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>,
    };
    if (projectName) details.project_name = projectName;
    if (related && Object.keys(related).length > 0) {
        details.related = JSON.parse(JSON.stringify(related)) as Record<string, unknown>;
    }
    return details;
}

function normalizeProjectName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Same display rules as AppContext `currentUser.name` (auth metadata or email local-part). */
function displayNameFromUser(user: User): string {
    const meta = user.user_metadata as Record<string, unknown> | undefined;
    const full = typeof meta?.full_name === 'string' ? meta.full_name.trim() : '';
    if (full) return full;
    const fromEmail = (user.email?.split('@')[0] ?? '').trim();
    return fromEmail || 'Field Worker';
}

async function logFieldDataAudit(params: {
    action: string;
    entity_type: string;
    entity_id?: string | null;
    project_id: string | null;
    report_date?: string | null;
    details?: Record<string, unknown>;
}): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    const submitted_employee_name = session?.user ? displayNameFromUser(session.user) : null;
    const submitted_by_user_id = session?.user?.id ?? null;

    const { error } = await supabase.from('audit_log').insert([
        {
            // Production DB CHECK constraint allows fixed values (e.g. field_sync), not table.upsert strings.
            action: 'field_sync',
            entity_type: params.entity_type,
            entity_id: params.entity_id ?? null,
            project_id: params.project_id,
            report_date: params.report_date ?? null,
            details: {
                ...(params.details ?? {}),
                sync_action: params.action,
            },
            submitted_employee_name,
            submitted_by_user_id,
        },
    ]);
    if (error) console.warn('[audit_log]', error.message);
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

/** Activity feed + checklist fetch: use selected project UUID when valid (avoid duplicate-name project rows). */
async function resolveQueryProjectIds(projectId: string, projectName: string): Promise<string[]> {
    const trimmed = (projectId ?? '').trim();
    if (trimmed && UUID_RE.test(trimmed)) return [trimmed];
    return resolveProjectIds(projectId, projectName);
}

function resolveRowProjectId(row: { project_id?: unknown }): string | undefined {
    const p = row.project_id;
    if (typeof p === 'string' && UUID_RE.test(p)) return p;
    if (p && typeof p === 'object' && !Array.isArray(p) && typeof (p as { id?: string }).id === 'string') {
        const id = (p as { id: string }).id;
        if (UUID_RE.test(id)) return id;
    }
    return undefined;
}

/** Normalize UI time strings (e.g. "2:30 PM") to Postgres `TIME` (`HH:MM:SS`). */
function normalizeIncidentTimeForDb(time: string | undefined): string {
    const trimmed = (time ?? '').trim();
    if (!trimmed) return '00:00:00';

    const m24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m24) {
        const h = Math.min(23, parseInt(m24[1]!, 10));
        const min = Math.min(59, parseInt(m24[2]!, 10));
        const sec = m24[3] ? Math.min(59, parseInt(m24[3], 10)) : 0;
        return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    const parsed = Date.parse(`1970-01-01 ${trimmed}`);
    if (!Number.isNaN(parsed)) {
        const d = new Date(parsed);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
    }

    return '00:00:00';
}

function formatIncidentTimeFromDb(time: string | undefined): string {
    const normalized = normalizeIncidentTimeForDb(time);
    const [h, m] = normalized.split(':').map((x) => parseInt(x, 10));
    const d = new Date();
    d.setHours(Number.isNaN(h) ? 0 : h, Number.isNaN(m) ? 0 : m, 0, 0);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

async function resolveSignatureUrlForSync(signature: string | undefined): Promise<string | null> {
    if (!signature?.trim()) return null;
    const s = signature.trim();
    if (s.startsWith('https://') || s.startsWith('http://')) return s;
    return (await uploadImageToCloudinary(s)) ?? null;
}

/**
 * Gets the Supabase project UUID based on the project name.
 * If it doesn't exist, it creates it.
 */
export async function getProjectId(projectName: string): Promise<string | null> {
    if (!projectName?.trim()) return null;

    const trimmed = projectName.trim();
    const normalized = normalizeProjectName(trimmed);

    const { data: exact, error: exactErr } = await supabase
        .from('projects')
        .select('id')
        .eq('name', trimmed)
        .maybeSingle();
    if (exactErr) {
        console.warn('[getProjectId] projects eq(name) failed:', exactErr.message);
    }
    if (exact?.id) return exact.id;

    const { data: ci, error: ciErr } = await supabase
        .from('projects')
        .select('id')
        .ilike('name', trimmed)
        .maybeSingle();
    if (ciErr) {
        console.warn('[getProjectId] projects ilike(name) failed:', ciErr.message);
    }
    if (ci?.id) return ci.id;

    const { data: rows, error: listErr } = await supabase.from('projects').select('id, name');
    if (listErr) {
        console.warn('[getProjectId] projects list failed:', listErr.message);
        return null;
    }
    if (Array.isArray(rows)) {
        for (const p of rows as { id?: string; name?: string }[]) {
            const n = typeof p?.name === 'string' ? normalizeProjectName(p.name) : '';
            if (n && n === normalized && typeof p?.id === 'string') return p.id;
        }
    }

    const { data: newData, error: insertError } = await supabase
        .from('projects')
        .insert([{ name: trimmed }])
        .select('id')
        .single();

    if (insertError) {
        console.warn(
            '[getProjectId] projects insert failed (RLS or duplicate?):',
            insertError.message,
            insertError.code ?? '',
        );
        return null;
    }
    return newData?.id ?? null;
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
        logged_at: loggedAtIsoFromEntryTimestamp(entry.timestamp),
        report_date: dateKey,
    };
    if (isUuid) payload.id = entry.id;

    // With UUID ids, edits will update the same row; without, this still creates a row.
    await supabase.from('notes').upsert([payload], { onConflict: 'id' });
    await logFieldDataAudit({
        action: 'notes.upsert',
        entity_type: 'notes',
        entity_id: isUuid ? entry.id : null,
        project_id: projectId,
        report_date: dateKey,
        details: auditDetailsForDashboard(entry.project?.name, {
            id: (payload.id as string | undefined) ?? null,
            project_id: projectId,
            category: payload.category,
            notes_text: payload.notes_text,
            photos: payload.photos,
            logged_at: payload.logged_at,
            report_date: payload.report_date,
        }),
    });
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

/** True when a `daily_signed_reports` row represents an actual signature (production has no `is_signed` column). */
export function dailySignedReportRowLooksSigned(r: {
    is_signed?: boolean | null;
    signature_url?: string | null;
}): boolean {
    if (r.is_signed === true) return true;
    const sig = typeof r.signature_url === 'string' ? r.signature_url.trim() : '';
    if (!sig) return false;
    if (sig.startsWith('http://') || sig.startsWith('https://')) return true;
    if (sig.startsWith('data:image')) return true;
    return sig.length > 80;
}

function mapDailySignedReportRowToSignedEntry(
    row: {
        report_date: string;
        prepared_by?: string | null;
        signature_url?: string | null;
        report_url?: string | null;
        signed_at?: string | null;
        is_signed?: boolean | null;
    },
    projectName: string,
    projectId: string
): SignedReportEntry {
    const reportDate = String(row.report_date).slice(0, 10);
    const looksSigned = dailySignedReportRowLooksSigned(row);
    return {
        reportDate,
        preparedBy: (typeof row.prepared_by === 'string' && row.prepared_by.trim()) ? row.prepared_by.trim() : '—',
        signatureDataUrl: row.signature_url ?? undefined,
        signedAt: row.signed_at ?? undefined,
        reportUrl: row.report_url ?? undefined,
        isSigned: looksSigned,
        projectName,
        projectId,
    };
}

/**
 * Single-day `daily_signed_reports` row for the project (authoritative signed/draft state across devices).
 * `ok: false` = network/RLS error — caller should fall back to local cache.
 */
export async function fetchDailySignedReportFromSupabase(
    projectId: string,
    reportDate: string,
    projectName: string
): Promise<{ entry: SignedReportEntry | null; ok: boolean }> {
    const { data, error } = await supabase
        .from('daily_signed_reports')
        .select('report_date, prepared_by, signature_url, report_url, signed_at')
        .eq('project_id', projectId)
        .eq('report_date', reportDate.slice(0, 10))
        .maybeSingle();

    if (error) {
        console.warn('[fetchDailySignedReport]', error.message);
        return { entry: null, ok: false };
    }
    if (!data) return { entry: null, ok: true };
    return { entry: mapDailySignedReportRowToSignedEntry(data as any, projectName, projectId), ok: true };
}

/** All calendar days for this project that are signed in Supabase (newest first). */
export async function fetchSignedDailyReportSummariesForProject(
    projectId: string,
    projectName: string
): Promise<{ dateKey: string; entry: SignedReportEntry }[]> {
    const { data, error } = await supabase
        .from('daily_signed_reports')
        .select('report_date, prepared_by, signature_url, report_url, signed_at')
        .eq('project_id', projectId)
        .order('report_date', { ascending: false });

    if (error || !Array.isArray(data)) {
        if (error) console.warn('[fetchSignedDailyReportSummaries]', error.message);
        return [];
    }
    const out: { dateKey: string; entry: SignedReportEntry }[] = [];
    for (const row of data as any[]) {
        if (!row?.report_date) continue;
        const entry = mapDailySignedReportRowToSignedEntry(row, projectName, projectId);
        if (!entry.isSigned) continue;
        out.push({ dateKey: entry.reportDate, entry });
    }
    return out;
}

/**
 * Home calendar: dates in the padded month grid with **any** field data for this **project**
 * (all users) — entity tables plus `audit_log` plus `safety_talks.scheduled_date`. Signed days use
 * `daily_signed_reports` (any signer on the project). **Not** the same as the Activity tab, which is
 * only the signed-in user’s `audit_log` rows.
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

    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0);
    const gridStart = new Date(monthStart);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const gridEnd = new Date(monthEnd);
    gridEnd.setDate(gridEnd.getDate() + (6 - monthEnd.getDay()));

    const pad = (n: number) => String(n).padStart(2, '0');
    const startKey = `${gridStart.getFullYear()}-${pad(gridStart.getMonth() + 1)}-${pad(gridStart.getDate())}`;
    const endKey = `${gridEnd.getFullYear()}-${pad(gridEnd.getMonth() + 1)}-${pad(gridEnd.getDate())}`;

    const activityDates = new Set<string>();
    const addReportDates = (rows: { report_date?: string | null }[] | null | undefined) => {
        if (!rows) return;
        for (const r of rows) {
            const rd = r?.report_date;
            if (typeof rd === 'string' && rd.length >= 10) activityDates.add(rd.slice(0, 10));
        }
    };
    const addScheduledDates = (rows: { scheduled_date?: string | null }[] | null | undefined) => {
        if (!rows) return;
        for (const r of rows) {
            const sd = r?.scheduled_date;
            if (typeof sd === 'string' && sd.length >= 10) activityDates.add(sd.slice(0, 10));
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
        if (!res.error && res.data) addReportDates(res.data as { report_date: string }[]);
    }

    const safetyRes = await supabase
        .from('safety_talks')
        .select('scheduled_date')
        .in('project_id', projectIds)
        .gte('scheduled_date', startKey)
        .lte('scheduled_date', endKey);
    if (!safetyRes.error && safetyRes.data) {
        addScheduledDates(safetyRes.data as { scheduled_date: string }[]);
    }

    const auditRes = await supabase
        .from('audit_log')
        .select('report_date')
        .in('project_id', projectIds)
        .not('report_date', 'is', null)
        .gte('report_date', startKey)
        .lte('report_date', endKey);
    if (!auditRes.error && auditRes.data) {
        addReportDates(auditRes.data as { report_date: string }[]);
    }

    const signedDates = new Set<string>();
    const signedRes = await supabase
        .from('daily_signed_reports')
        .select('report_date, signature_url, signed_at')
        .in('project_id', projectIds)
        .gte('report_date', startKey)
        .lte('report_date', endKey);
    if (!signedRes.error && signedRes.data) {
        for (const r of signedRes.data as {
            report_date: string;
            signature_url?: string | null;
            signed_at?: string | null;
        }[]) {
            if (!r?.report_date) continue;
            const key = String(r.report_date).slice(0, 10);
            if (dailySignedReportRowLooksSigned(r)) signedDates.add(key);
        }
    }

    return { activityDates, signedDates };
}

export type AuditActivityFeedRow = {
    id: string;
    created_at: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    report_date: string | null;
    details: Record<string, unknown> | null;
};

/**
 * Activity tab: `audit_log` rows for **this user only** on the selected project (not other users’
 * submissions). Uses the selected project UUID when valid (not every `projects` row with the same name).
 * `safety_talks` and `equipment_checklists` rows are de-duplicated by `entity_id` (re-sync / re-save).
 * Contrast with {@link fetchCalendarMonthActivityAndSignedFromSupabase}, which is project-wide for the home calendar.
 */
export async function fetchActivityFeedFromAuditLog(
    userId: string,
    projectId: string,
    projectName: string,
    options?: { limit?: number }
): Promise<AuditActivityFeedRow[]> {
    const projectIds = await resolveQueryProjectIds(projectId, projectName);
    if (projectIds.length === 0) return [];

    const limit = Math.min(Math.max(options?.limit ?? 200, 1), 500);
    const { data, error } = await supabase
        .from('audit_log')
        .select('id, created_at, action, entity_type, entity_id, report_date, details')
        .eq('submitted_by_user_id', userId)
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) {
        console.warn('[audit_log] fetchActivityFeedFromAuditLog', error.message);
        return [];
    }
    const rows = (data ?? []) as AuditActivityFeedRow[];
    const dedupeTypes = new Set(['safety_talks', 'equipment_checklists']);
    const seenEntity = new Set<string>();
    const deduped: AuditActivityFeedRow[] = [];
    for (const row of rows) {
        if (row.entity_type && dedupeTypes.has(row.entity_type)) {
            const eid = typeof row.entity_id === 'string' ? row.entity_id.trim() : '';
            if (eid) {
                const key = `${row.entity_type}:${eid}`;
                if (seenEntity.has(key)) continue;
                seenEntity.add(key);
            }
        }
        deduped.push(row);
    }
    return deduped;
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
    const projectIds = await resolveQueryProjectIds(projectId, projectName);
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
            .select(
                'id, form_data, signature_url, photos, logged_at, attachment_applicable, attachment_name, attachment_condition, attachment_number, project:project_id(id, name)'
            )
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
                  .select(
                      'id, form_data, signature_url, photos, logged_at, attachment_applicable, attachment_name, attachment_condition, attachment_number, project:project_id(id, name)'
                  )
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
        : checklistsSource.data.map((row: any) => {
              const fd = { ...(row.form_data ?? {}) } as Record<string, unknown>;
              if (row.attachment_applicable != null && String(row.attachment_applicable).trim() !== '') {
                  fd.attachmentApplicable = String(row.attachment_applicable);
              }
              if (row.attachment_name != null && String(row.attachment_name).trim() !== '') {
                  fd.attachmentName = String(row.attachment_name);
              }
              if (row.attachment_condition != null && String(row.attachment_condition).trim() !== '') {
                  fd.attachmentCondition = String(row.attachment_condition);
              }
              if (row.attachment_number != null && String(row.attachment_number).trim() !== '') {
                  fd.attachmentNumber = String(row.attachment_number);
              }
              const proj = row.project as { id?: string; name?: string } | null | undefined;
              const pid =
                  (typeof proj?.id === 'string' && UUID_RE.test(proj.id) ? proj.id : undefined) ??
                  resolveRowProjectId(row);
              const pname =
                  (typeof proj?.name === 'string' && proj.name.trim() ? proj.name : undefined) ??
                  resolveProjectName(row);
              return {
                  id: row.id,
                  type: 'checklist' as const,
                  timestamp: row.logged_at,
                  project: {
                    name: pname,
                    ...(pid ? { id: pid } : {}),
                  },
                  formData: fd as Record<string, string>,
                  signature: row.signature_url ?? undefined,
                  photos: Array.isArray(row.photos) ? row.photos : [],
              };
          });

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
        incidentTime: formatIncidentTimeFromDb(row.incident_time),
        location: row.location ?? '',
        injuryIllnessType: row.injury_illness_type || undefined,
        injuredEmployeeInfo: normalizeInjuredEmployeeList(row.injured_employee_info),
        incidentInvestigation: normalizeIncidentInvestigation(row.incident_investigation),
        incidentOutcome: normalizeIncidentOutcome(row.incident_outcome),
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
        return '';
    };

    const coalesceCompany = (r: Row): string => {
        // `public.employees` doesn't have a company column; surface something useful in the UI.
        // Prefer classification, then role.
        if (typeof r?.classification === 'string' && r.classification.trim()) return r.classification;
        if (typeof r?.role === 'string' && r.role.trim()) return r.role;
        return '';
    };

    const pid = typeof options?.projectId === 'string' ? options.projectId.trim() : '';
    const pname = typeof options?.projectName === 'string' ? options.projectName.trim() : '';
    let projectOverlapTokens: string[] = [];
    if (pid || pname) {
        const ids = await resolveProjectIds(pid, pname);
        projectOverlapTokens = [...new Set([...ids, pname].filter(Boolean))];
    }

    // Keep this list compatible with your `public.employees` schema.
    const employeesSelect =
        'id, name, role, status, assigned_projects, email, phone, employee_id, classification';

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
        'name, role, status, email, phone, employee_id, classification';
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
    const projectIds = await resolveQueryProjectIds(projectId, projectName);
    if (projectIds.length === 0) return [];
    const { startIso, endIso } = getLocalDayRange(date);

    const dateOnly = String(dateKey).trim().slice(0, 10);
    let data: any[] | null = null;

    const attachmentSelect =
        'id, notes, file_names, cloudinary_urls, logged_at, report_date, selected_date, project:project_id(id, name)';

    {
        const res = await supabase
            .from('attachments')
            .select(attachmentSelect)
            .in('project_id', projectIds)
            .or(`report_date.eq.${dateOnly},selected_date.eq.${dateOnly}`)
            .order('logged_at', { ascending: true });
        if (!res.error && res.data && res.data.length > 0) data = res.data as any[];
        if (res.error) {
            console.warn('[fetchAttachmentsFromSupabase] date query:', res.error.message);
            const fallback = await supabase
                .from('attachments')
                .select(attachmentSelect)
                .in('project_id', projectIds)
                .eq('report_date', dateOnly)
                .order('logged_at', { ascending: true });
            if (!fallback.error && fallback.data?.length) data = fallback.data as any[];
        }
    }

    if (!data) {
        const res = await supabase
            .from('attachments')
            .select(attachmentSelect)
            .in('project_id', projectIds)
            .gte('logged_at', startIso)
            .lt('logged_at', endIso)
            .order('logged_at', { ascending: true });
        if (res.error) {
            console.warn('[fetchAttachmentsFromSupabase] logged_at fallback:', res.error.message);
        }
        if (!res.error && res.data) data = res.data as any[];
    }

    if (!data) return [];

    return data
        .map((row: any) => {
            const proj = row.project as { id?: string; name?: string } | null | undefined;
            const pid =
                (typeof proj?.id === 'string' && UUID_RE.test(proj.id) ? proj.id : undefined) ??
                resolveRowProjectId(row);
            const pname =
                (typeof proj?.name === 'string' && proj.name.trim() ? proj.name : undefined) ??
                resolveProjectName(row);
            const urls = (Array.isArray(row.cloudinary_urls) ? row.cloudinary_urls : []).filter(
                (u: unknown) => typeof u === 'string' && (u.startsWith('https://') || u.startsWith('http://'))
            );
            return {
                id: row.id,
                project: {
                    name: pname,
                    ...(pid ? { id: pid } : {}),
                },
                timestamp: row.logged_at,
                fileNames: Array.isArray(row.file_names) ? row.file_names : [],
                notes: row.notes || undefined,
                previews: urls,
            };
        })
        .filter((row) =>
            (row.previews ?? []).some(
                (u: string) => u.startsWith('https://') || u.startsWith('http://')
            )
        );
}

export type SyncAttachmentResult = { ok: true } | { ok: false; error: string };

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
        logged_at: loggedAtIsoFromEntryTimestamp(entry.timestamp),
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

    let chemicalApplicationsSnapshot: { chemical_log_id: string; name: string; quantity: number; unit: string }[] = [];
    if (logData?.id && entry.chemicals && entry.chemicals.length > 0) {
        await supabase.from('chemical_applications').delete().eq('chemical_log_id', logData.id);
        chemicalApplicationsSnapshot = entry.chemicals.map(c => ({
            chemical_log_id: logData.id,
            name: c.name,
            quantity: Number(c.quantity) || 0,
            unit: c.unit
        }));
        await supabase.from('chemical_applications').insert(chemicalApplicationsSnapshot);
    }

    await logFieldDataAudit({
        action: 'chemicals_logs.upsert',
        entity_type: 'chemicals_logs',
        entity_id: logData?.id ?? null,
        project_id: projectId,
        report_date: dateKey,
        details: auditDetailsForDashboard(
            entry.project?.name,
            {
                id: logData?.id ?? null,
                project_id: projectId,
                application_type: payload.application_type,
                notes: payload.notes,
                photos: payload.photos,
                logged_at: payload.logged_at,
                report_date: payload.report_date,
            },
            chemicalApplicationsSnapshot.length > 0
                ? { chemical_applications: chemicalApplicationsSnapshot }
                : undefined
        ),
    });
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
        logged_at: loggedAtIsoFromEntryTimestamp(entry.timestamp),
        report_date: dateKey
    };

    let metricsRowId: string | null = targetId;
    if (targetId) {
        await supabase.from('metrics').update(payload).eq('id', targetId);
    } else {
        const { data } = await supabase.from('metrics').insert([payload]).select('id').single();
        metricsRowId = data?.id ?? null;
    }

    await logFieldDataAudit({
        action: 'metrics.upsert',
        entity_type: 'metrics',
        entity_id: metricsRowId,
        project_id: projectId,
        report_date: dateKey,
        details: auditDetailsForDashboard(entry.project?.name, {
            id: metricsRowId,
            project_id: projectId,
            water_usage: payload.water_usage,
            acres_completed: payload.acres_completed,
            green_space_completed: payload.green_space_completed,
            number_of_operators: payload.number_of_operators,
            notes: payload.notes,
            photos: payload.photos,
            logged_at: payload.logged_at,
            report_date: payload.report_date,
        }),
    });
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
        logged_at: loggedAtIsoFromEntryTimestamp(entry.timestamp),
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

    let surveyQuestionsSnapshot: { survey_id: string; question: string; answer: string; description: string }[] = [];
    if (surveyData?.id && entry.questions && entry.questions.length > 0) {
        await supabase.from('survey_questions').delete().eq('survey_id', surveyData.id);
        surveyQuestionsSnapshot = entry.questions.map(q => ({
            survey_id: surveyData.id,
            question: q.question,
            answer: q.answer,
            description: q.description || ''
        }));
        await supabase.from('survey_questions').insert(surveyQuestionsSnapshot);
    }

    await logFieldDataAudit({
        action: 'surveys.upsert',
        entity_type: 'surveys',
        entity_id: surveyData?.id ?? null,
        project_id: projectId,
        report_date: dateKey,
        details: auditDetailsForDashboard(
            entry.project?.name,
            {
                id: surveyData?.id ?? null,
                project_id: projectId,
                logged_at: payload.logged_at,
                report_date: payload.report_date,
            },
            surveyQuestionsSnapshot.length > 0 ? { survey_questions: surveyQuestionsSnapshot } : undefined
        ),
    });
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
        logged_at: loggedAtIsoFromEntryTimestamp(entry.timestamp),
        report_date: dateKey,
    };
    if (isUuid) payload.id = entry.id;

    await supabase.from('equipment_logs').upsert([payload], { onConflict: 'id' });
    await logFieldDataAudit({
        action: 'equipment_logs.upsert',
        entity_type: 'equipment_logs',
        entity_id: isUuid ? entry.id : null,
        project_id: projectId,
        report_date: dateKey,
        details: auditDetailsForDashboard(entry.project?.name, {
            id: (payload.id as string | undefined) ?? null,
            project_id: projectId,
            value: payload.value,
            unit: payload.unit,
            notes: payload.notes,
            photos: payload.photos,
            logged_at: payload.logged_at,
            report_date: payload.report_date,
        }),
    });
}

/** Upserts `public.equipment_checklists`. Each checklist has a client UUID (`createUuid`) so multiple machines
 *  per day/project insert as separate rows. PostgREST keys: id, project_id, form_data, signature_url, photos,
 *  logged_at, report_date, attachment_* columns. */
export async function syncEquipmentChecklistToSupabase(
    dateKey: string,
    entry: EquipmentChecklistEntry,
    options?: { skipAuditLog?: boolean }
) {
    const siteFromForm = (entry.formData?.siteName || 'Unknown Site').trim();
    const nameFromEntry = entry.project?.name?.trim();
    const idFromEntry = entry.project?.id?.trim() ?? '';
    const projectIdLooksUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idFromEntry);
    const projectId = projectIdLooksUuid ? idFromEntry : await getProjectId(nameFromEntry || siteFromForm);
    if (!projectId) {
        console.warn('[syncEquipmentChecklistToSupabase] Could not resolve project_id', {
            projectIdFromEntry: idFromEntry || null,
            projectNameFromEntry: nameFromEntry || null,
            formSiteName: siteFromForm,
        });
        return;
    }
    const projectName = nameFromEntry || siteFromForm;

    const attachmentApplicable =
        (entry.formData as any)?.attachmentApplicable ??
        ((entry.formData as any)?.attachment ? 'Yes' : 'N/A');
    const attachmentName =
        (entry.formData as any)?.attachmentName ??
        (entry.formData as any)?.attachment ??
        null;
    const attachmentNumber = (entry.formData as any)?.attachmentNumber ?? null;
    const attachmentCondition = (entry.formData as any)?.attachmentCondition ?? null;

    const entryIdIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id);

    const payload = {
        project_id: projectId,
        form_data: entry.formData || {},
        attachment_applicable: attachmentApplicable || null,
        attachment_name: attachmentName || null,
        attachment_number: attachmentNumber != null && String(attachmentNumber).trim() !== '' ? String(attachmentNumber).trim() : null,
        attachment_condition: attachmentCondition || null,
        signature_url: await resolveSignatureUrlForSync(entry.signature),
        photos: await uploadPhotosArray(entry.photos),
        logged_at: loggedAtIsoFromEntryTimestamp(entry.timestamp),
        report_date: String(dateKey).trim().slice(0, 10),
    };

    let checklistRowId: string | null = null;

    if (entryIdIsUuid) {
        const row = { ...payload, id: entry.id };
        const { data, error } = await supabase
            .from('equipment_checklists')
            .upsert([row], { onConflict: 'id' })
            .select('id')
            .single();
        if (error) {
            console.warn(
                '[syncEquipmentChecklistToSupabase] upsert failed:',
                error.message,
                error.code ?? '',
                (error as { details?: string }).details ?? ''
            );
            return;
        }
        checklistRowId = data?.id ?? entry.id;
    } else {
        // Legacy local ids: insert a new row (do not overwrite the latest checklist for the day).
        const { data, error } = await supabase
            .from('equipment_checklists')
            .insert([payload])
            .select('id')
            .single();
        if (error) {
            console.warn(
                '[syncEquipmentChecklistToSupabase] insert failed (legacy id):',
                error.message,
                error.code ?? '',
                (error as { details?: string }).details ?? ''
            );
            return;
        }
        checklistRowId = data?.id ?? null;
    }

    if (!options?.skipAuditLog) {
        await logFieldDataAudit({
            action: 'equipment_checklists.upsert',
            entity_type: 'equipment_checklists',
            entity_id: checklistRowId,
            project_id: projectId,
            report_date: dateKey,
            details: auditDetailsForDashboard(projectName, {
                id: checklistRowId,
                project_id: projectId,
                form_data: payload.form_data,
                attachment_applicable: payload.attachment_applicable,
                attachment_name: payload.attachment_name,
                attachment_number: payload.attachment_number,
                attachment_condition: payload.attachment_condition,
                signature_url: payload.signature_url,
                photos: payload.photos,
                logged_at: payload.logged_at,
                report_date: payload.report_date,
            }),
        });
    }
}

export async function syncObservationToSupabase(dateKey: string, entry: ObservationEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    const observationRow = {
        id: entry.id,
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
        logged_at: loggedAtIsoFromEntryTimestamp(entry.timestamp),
        report_date: dateKey,
    };

    const { data: obsData } = await supabase
        .from('observations')
        .upsert([observationRow], { onConflict: 'id' })
        .select('id')
        .single();

    let assigneesSnapshot: { observation_id: string; name: string; company: string }[] = [];
    if (obsData?.id && entry.assignees && entry.assignees.length > 0) {
        await supabase.from('observation_assignees').delete().eq('observation_id', obsData.id);
        
        assigneesSnapshot = entry.assignees.map(a => ({
            observation_id: obsData.id,
            name: a.name,
            company: a.company || '',
        }));
        await supabase.from('observation_assignees').insert(assigneesSnapshot);
    }

    await logFieldDataAudit({
        action: 'observations.upsert',
        entity_type: 'observations',
        entity_id: obsData?.id ?? entry.id,
        project_id: projectId,
        report_date: dateKey,
        details: auditDetailsForDashboard(
            entry.project?.name,
            { ...observationRow, id: obsData?.id ?? observationRow.id },
            assigneesSnapshot.length > 0 ? { observation_assignees: assigneesSnapshot } : undefined
        ),
    });
}

export async function syncIncidentToSupabase(dateKey: string, entry: IncidentEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    const incidentRow = {
        id: entry.id,
            project_id: projectId,
            title: entry.title,
            status: entry.status,
            recordable: entry.recordable || false,
            incident_date: entry.incidentDate || null,
            incident_time: normalizeIncidentTimeForDb(entry.incidentTime),
            location: entry.location,
            injury_illness_type: entry.injuryIllnessType || '',
            injured_employee_info: entry.injuredEmployeeInfo || [],
            incident_investigation: incidentInvestigationForDb(entry.incidentInvestigation),
            incident_outcome: incidentOutcomeForDb(entry.incidentOutcome),
            description: entry.description || '',
            photos: await uploadPhotosArray(entry.photos),
        logged_at: loggedAtIsoFromEntryTimestamp(entry.timestamp),
        report_date: dateKey,
    };

    await supabase.from('incidents').upsert([incidentRow], { onConflict: 'id' });

    await logFieldDataAudit({
        action: 'incidents.upsert',
        entity_type: 'incidents',
        entity_id: entry.id,
        project_id: projectId,
        report_date: dateKey,
        details: auditDetailsForDashboard(entry.project?.name, incidentRow),
    });
}

async function resolveSafetyTalkProjectId(talk: SafetyTalk): Promise<string | null> {
    if (talk.projectId && UUID_RE.test(talk.projectId)) return talk.projectId;
    const saved = await AsyncStorage.getItem('selectedProjectId');
    if (saved && UUID_RE.test(saved)) return saved;
    return null;
}

async function resolveProjectNameForAudit(projectId: string, fallbackName?: string): Promise<string> {
    if (fallbackName && fallbackName.trim()) return fallbackName.trim();
    const { data } = await supabase.from('projects').select('name').eq('id', projectId).maybeSingle();
    return typeof data?.name === 'string' && data.name.trim() ? data.name : 'Project';
}

async function resolveSafetyTalkTemplateFk(templateId: string | undefined): Promise<string | null> {
    if (!templateId || !UUID_RE.test(templateId)) return null;
    const { data, error } = await supabase
        .from('safety_talk_templates')
        .select('id')
        .eq('id', templateId)
        .maybeSingle();
    if (error || !data?.id) return null;
    return data.id;
}

/** Upserts `public.safety_talks`. PostgREST keys: id, project_id, template_id (nullable uuid FK), template_name,
 *  scheduled_date (date), status, created_at (timestamptz), attendees (jsonb), attendance_pdf_url (text).
 *  `attendees` is an array of { name, company?, signed? } from the mobile app (not employee UUIDs unless you change the app). */
export async function syncSafetyTalkToSupabase(
    talk: SafetyTalk,
    options?: { skipAuditLog?: boolean }
) {
    const projectId = await resolveSafetyTalkProjectId(talk);
    if (!projectId) {
        console.warn('[sync] safety_talk skipped: missing project id (select a field project)');
        return;
    }

    const projectNameForAudit = await resolveProjectNameForAudit(projectId, talk.projectName);

    // FK to safety_talk_templates: only set when a row exists (invalid UUIDs break the whole upsert).
    const templateIdFk = await resolveSafetyTalkTemplateFk(talk.templateId);

    const buildRow = (includeAttendanceColumns: boolean) => {
        const scheduled_date = String(talk.date ?? '').trim().slice(0, 10);
        return {
            id: talk.id,
            project_id: projectId,
            template_id: templateIdFk,
            template_name: talk.templateName,
            scheduled_date,
            status: talk.status,
            created_at: talk.createdAt,
            ...(includeAttendanceColumns
                ? {
                      attendees: JSON.parse(JSON.stringify(Array.isArray(talk.attendees) ? talk.attendees : [])),
                      attendance_pdf_url: talk.attendancePdfUrl ?? null,
                  }
                : {}),
        };
    };

    let safetyTalkRow = buildRow(true);
    let { error: upErr } = await supabase.from('safety_talks').upsert([safetyTalkRow], { onConflict: 'id' });

    // Older DBs without attendees / attendance_pdf_url columns — retry core columns only.
    if (upErr && /attendees|attendance_pdf|schema cache|PGRST204|42703/i.test(upErr.message + (upErr as any).details)) {
        safetyTalkRow = buildRow(false);
        ({ error: upErr } = await supabase.from('safety_talks').upsert([safetyTalkRow], { onConflict: 'id' }));
    }

    if (upErr) {
        console.warn(
            '[sync] safety_talks upsert failed:',
            upErr.message,
            upErr.code ?? '',
            (upErr as any).details ?? '',
            '| Sign in, pick a project, add `attendees` + `attendance_pdf_url` columns if missing, check RLS policies.'
        );
        return;
    }

    if (!options?.skipAuditLog) {
        await logFieldDataAudit({
            action: 'safety_talks.upsert',
            entity_type: 'safety_talks',
            entity_id: talk.id,
            project_id: projectId,
            report_date: talk.date,
            details: auditDetailsForDashboard(projectNameForAudit, safetyTalkRow),
        });
    }
}

export type SyncSignedReportResult = { ok: true } | { ok: false; error: string };

export async function syncSignedReportToSupabase(entry: SignedReportEntry): Promise<SyncSignedReportResult> {
    const projectId =
        entry.projectId && UUID_RE.test(entry.projectId)
            ? entry.projectId
            : await getProjectId(entry.projectName);
    if (!projectId) {
        console.warn(
            '[sync] daily_signed_reports skipped: could not resolve project_id. Sign in, ensure the project exists in public.projects, and check RLS on projects.',
            { projectName: entry.projectName, storedProjectId: entry.projectId ?? null },
        );
        return { ok: false, error: 'no_project_id' };
    }

    const reportDateKey = String(entry.reportDate ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDateKey)) {
        console.warn('[sync] daily_signed_reports skipped: invalid report_date', entry.reportDate);
        return { ok: false, error: 'invalid_report_date' };
    }

    const signatureUrlForDb = async (): Promise<string> => {
        const raw = entry.signatureDataUrl?.trim();
        if (!raw) return '';
        if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
        const uploaded = await uploadImageToCloudinary(raw);
        return (uploaded && uploaded.trim()) || raw;
    };

    const preparedBy = (entry.preparedBy ?? '').trim() || '—';
    const signature_url = await signatureUrlForDb();
    const signed_at = (entry.signedAt ?? '').trim() || new Date().toISOString();

    const signedReportRow = {
        project_id: projectId,
        report_date: reportDateKey,
        prepared_by: preparedBy,
        signature_url: signature_url || '',
        signed_at,
        report_url: entry.reportUrl?.trim() || null,
    };

    let rowForAudit: Record<string, unknown> = signedReportRow;

    // Prefer upsert when UNIQUE(project_id, report_date) exists. Production DBs without that
    // constraint fail with "no unique or exclusion constraint matching the ON CONFLICT" — fall back
    // to select + update/insert.
    let upErr = (await supabase.from('daily_signed_reports').upsert([signedReportRow], { onConflict: 'project_id,report_date' }))
        .error;

    const needsFallback =
        upErr &&
        /no unique or exclusion constraint matching the ON CONFLICT|42P10/i.test(
            upErr.message + ((upErr as any).details ?? '')
        );

    if (needsFallback) {
        const { data: existing, error: selErr } = await supabase
            .from('daily_signed_reports')
            .select('id')
            .eq('project_id', projectId)
            .eq('report_date', reportDateKey)
            .limit(1)
            .maybeSingle();

        if (selErr) {
            console.warn('[sync] daily_signed_reports select failed:', selErr.message);
            return { ok: false, error: selErr.message };
        }

        if (existing?.id) {
            const { error } = await supabase.from('daily_signed_reports').update(signedReportRow).eq('id', existing.id);
            upErr = error;
        } else {
            const { error } = await supabase.from('daily_signed_reports').insert([signedReportRow]);
            upErr = error;
        }
    }

    if (upErr) {
        console.warn(
            '[sync] daily_signed_reports upsert failed:',
            upErr.message,
            upErr.code ?? '',
            (upErr as any).details ?? '',
            '| Check RLS policies for daily_signed_reports (authenticated INSERT/UPDATE).',
        );
        return { ok: false, error: upErr.message };
    }

    await logFieldDataAudit({
        action: 'daily_signed_reports.upsert',
        entity_type: 'daily_signed_reports',
        entity_id: null,
        project_id: projectId,
        report_date: reportDateKey,
        details: auditDetailsForDashboard(entry.projectName, rowForAudit),
    });
    return { ok: true };
}

export async function syncAttachmentToSupabase(
    dateKey: string,
    entry: AttachmentEntry
): Promise<SyncAttachmentResult> {
    const {
        data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) {
        return { ok: false, error: 'Please sign in before saving attachments.' };
    }

    const nameFromEntry = entry.project?.name?.trim();
    const idFromEntry = entry.project?.id?.trim() ?? '';
    const projectId =
        idFromEntry && UUID_RE.test(idFromEntry)
            ? idFromEntry
            : await getProjectId(nameFromEntry || '');
    if (!projectId) {
        const msg = 'Select a project on the Home tab before saving attachments.';
        console.warn('[syncAttachmentToSupabase]', msg);
        return { ok: false, error: msg };
    }

    let previews = [...(entry.previews ?? [])];
    let cloudinary_urls = previews.filter((u) => typeof u === 'string' && isRemoteMediaUrl(u));

    if (cloudinary_urls.length === 0 && previews.length > 0) {
        try {
            previews = await uploadAttachmentPreviews(previews);
            entry.previews = previews;
            cloudinary_urls = previews.filter((u) => isRemoteMediaUrl(u));
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Photos could not upload before saving.';
            console.warn('[syncAttachmentToSupabase]', msg);
            return { ok: false, error: msg };
        }
    }

    if (cloudinary_urls.length === 0) {
        const msg = 'Add at least one photo before saving.';
        console.warn('[syncAttachmentToSupabase]', msg);
        return { ok: false, error: msg };
    }

    const isUuid = UUID_RE.test(entry.id);
    const reportDay = String(dateKey).trim().slice(0, 10);
    const payload: Record<string, unknown> = {
        project_id: projectId,
        notes: entry.notes || '',
        file_names: entry.fileNames || [],
        cloudinary_urls,
        logged_at: loggedAtIsoFromEntryTimestamp(entry.timestamp),
        report_date: reportDay,
        selected_date: reportDay,
    };
    if (isUuid) payload.id = entry.id;

    const upsertPayload = { ...payload };
    let { error } = await supabase.from('attachments').upsert([upsertPayload], { onConflict: 'id' });

    if (error && /selected_date|schema cache|PGRST204|42703/i.test(error.message + ((error as { details?: string }).details ?? ''))) {
        const { selected_date: _sd, ...withoutSelected } = upsertPayload;
        ({ error } = await supabase.from('attachments').upsert([withoutSelected], { onConflict: 'id' }));
    }

    if (error && /row-level security|RLS|42501|policy/i.test(error.message + ((error as { details?: string }).details ?? ''))) {
        return {
            ok: false,
            error: 'Database blocked this save (permissions). Check Supabase RLS policies for the attachments table.',
        };
    }

    if (error) {
        console.warn(
            '[syncAttachmentToSupabase] upsert failed:',
            error.message,
            error.code ?? '',
            (error as { details?: string }).details ?? ''
        );
        return { ok: false, error: error.message };
    }

    await logFieldDataAudit({
        action: 'attachments.upsert',
        entity_type: 'attachments',
        entity_id: isUuid ? entry.id : null,
        project_id: projectId,
        report_date: dateKey,
        details: auditDetailsForDashboard(entry.project?.name, {
            id: (payload.id as string | undefined) ?? null,
            project_id: projectId,
            notes: payload.notes,
            file_names: payload.file_names,
            cloudinary_urls: payload.cloudinary_urls,
            logged_at: payload.logged_at,
            report_date: payload.report_date,
            selected_date: payload.selected_date,
        }),
    });
    return { ok: true };
}
