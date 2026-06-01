/**
 * Daily report storage: persist and read all submissions by date (YYYY-MM-DD).
 * React Native equivalent using AsyncStorage instead of localStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { uploadPhotosArray, uploadImageToCloudinary, uploadAttachmentPreviews } from './cloudinary';
import {
    syncNoteToSupabase,
    syncChemicalsToSupabase,
    syncMetricsToSupabase,
    syncSurveyToSupabase,
    syncEquipmentToSupabase,
    syncEquipmentChecklistToSupabase,
    syncObservationToSupabase,
    syncIncidentToSupabase,
    syncSignedReportToSupabase,
    syncAttachmentToSupabase,
    type SyncSignedReportResult,
    fetchDailySignedReportFromSupabase,
    fetchEquipmentFromSupabase,
    fetchAttachmentsFromSupabase,
} from './supabaseSync';
import { mergeLocalRemotePreferSupabase } from './mergeLocalRemote';
import type { InjuredEmployeeRecord } from './injuredEmployeeInfo';
import type { IncidentInvestigationRecord } from './incidentInvestigationInfo';
import type { IncidentOutcomeRecord } from './incidentOutcomeInfo';

// --- Date Utilities ---

export function getDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Interpret `YYYY-MM-DD` as a local calendar date (avoids UTC midnight parsing bugs). */
export function parseDateKeyLocal(dateKey: string): Date {
    const [ys, ms, ds] = dateKey.split('-');
    const y = Number(ys);
    const mo = Number(ms);
    const d = Number(ds);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return new Date();
    return new Date(y, mo - 1, d);
}

/**
 * Real device UTC instant when the user saved the record.
 * Used for local `timestamp` and Supabase `logged_at`. Which report day a row belongs to is
 * determined by AsyncStorage date keys and DB `report_date`, not by shifting this timestamp.
 */
export function getSubmittedAtIso(): string {
    return new Date().toISOString();
}

/**
 * RFC 4122 v4 UUID. Must match `isUuid` checks in `supabaseSync` (8-4-4-4-12 hex) so upserts target the
 * correct row; the old substring-based generator often produced invalid lengths and broke multi-row sync.
 */
export function createUuid(): string {
    const c = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: Crypto }).crypto : undefined;
    if (c?.randomUUID) return c.randomUUID();
    if (c?.getRandomValues) {
        const buf = new Uint8Array(16);
        c.getRandomValues(buf);
        buf[6] = (buf[6]! & 0x0f) | 0x40;
        buf[8] = (buf[8]! & 0x3f) | 0x80;
        const hex = [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    }
    const rnd = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
    const a = rnd() + rnd();
    const b = rnd();
    const segC = `4${rnd().slice(1)}`;
    const d1 = ((8 + Math.floor(Math.random() * 4)) | 0).toString(16);
    const d = `${d1}${rnd().slice(1)}`;
    const e = rnd() + rnd() + rnd();
    return `${a}-${b}-${segC}-${d}-${e}`.toLowerCase();
}

export async function getReportDate(): Promise<Date> {
    try {
        const saved = await AsyncStorage.getItem('selectedDate');
        if (!saved) return new Date();
        if (/^\d{4}-\d{2}-\d{2}$/.test(saved)) return parseDateKeyLocal(saved);
        const parsed = new Date(saved);
        if (!isNaN(parsed.getTime())) return parsed;
    } catch { }
    return new Date();
}

export async function setReportDate(date: Date): Promise<void> {
    await AsyncStorage.setItem('selectedDate', getDateKey(date));
}

export function formatReportDateLabel(date: Date): string {
    return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

// --- Entry Types ---

export interface NoteEntry {
    id: string;
    project: { name: string };
    timestamp: string;
    category: string;
    notes: string;
    photos?: string[];
}

export interface ChemicalEntry {
    id: string;
    project: { name: string };
    timestamp: string;
    applicationType: 'wicking' | 'spraying';
    chemicals: { name: string; quantity: string; unit: string }[];
    notes?: string;
    photos?: string[];
}

export interface MetricsEntry {
    id: string;
    project: { name: string };
    timestamp: string;
    waterUsage?: string;
    acresCompleted?: string;
    greenSpaceCompleted?: string;
    numberOfOperators?: string;
    notes?: string;
    photos?: string[];
}

export interface SurveyQuestionEntry {
    id: string;
    question: string;
    answer: 'N/A' | 'No' | 'Yes' | '';
    description: string;
}

export interface SurveyEntry {
    id: string;
    project: { name: string };
    timestamp: string;
    questions: SurveyQuestionEntry[];
}

export interface EquipmentEntry {
    id: string;
    project: { name: string };
    timestamp: string;
    value?: string;
    unit?: string;
    notes?: string;
    photos?: string[];
}

export interface MaterialEntry {
    id: string;
    project: { name: string };
    timestamp: string;
    value: string;
    unit: string;
    notes?: string;
    photos?: string[];
}

export interface AttachmentEntry {
    id: string;
    project: { name: string; id?: string };
    timestamp: string;
    fileNames: string[];
    notes?: string;
    previews?: string[];
}

export interface ObservationAssignee {
    name: string;
    company: string;
}

export interface ObservationEntry {
    id: string;
    project: { name: string };
    timestamp: string;
    category: 'Negative' | 'Positive';
    type: string;
    status: 'Open' | 'In Progress' | 'Resolved' | 'Closed';
    priority: 'Low' | 'Medium' | 'High' | 'Critical';
    description?: string;
    location?: string;
    assignees: ObservationAssignee[];
    dueDate?: string;
    resolutionPhotos?: string[];
    attachments?: string[];
    teamNotifications?: string[];
}

export interface IncidentEntry {
    id: string;
    project: { name: string };
    timestamp: string;
    title: string;
    status: 'Open' | 'Closed';
    recordable: boolean;
    incidentDate: string;
    incidentTime: string;
    location: string;
    injuryIllnessType?: string;
    injuredEmployeeInfo?: InjuredEmployeeRecord[];
    incidentInvestigation?: IncidentInvestigationRecord;
    incidentOutcome?: IncidentOutcomeRecord;
    description?: string;
    photos?: string[];
}

export interface EquipmentChecklistEntry {
    id: string;
    type: 'checklist';
    timestamp: string;
    formData: Record<string, string>;
    signature?: string;
    photos?: string[];
    /** When set, Supabase sync uses this project (id preferred) instead of only formData.siteName. */
    project?: { name: string; id?: string };
}

export type EquipmentOrChecklistEntry = EquipmentEntry | EquipmentChecklistEntry;

export interface SignedReportEntry {
    reportDate: string; // ISO date YYYY-MM-DD
    signedAt?: string;
    preparedBy: string;
    signatureDataUrl?: string;
    projectName: string;
    /** When set (from Supabase project picker), cloud sync does not depend on name matching. */
    projectId?: string;
    reportUrl?: string;
    unsignedReportUrl?: string;
    isSigned: boolean;
}

// --- Storage Keys ---

const STORAGE_KEYS = {
    notes: (d: string) => `notes_${d}`,
    chemicals: (d: string) => `chemicals_${d}`,
    metrics: (d: string) => `metrics_${d}`,
    survey: (d: string) => `survey_${d}`,
    equipment: (d: string) => `equipment_${d}`,
    material: (d: string) => `material_${d}`,
    attachments: (d: string) => `attachments_${d}`,
    observations: (d: string) => `observations_${d}`,
    incidents: (d: string) => `incidents_${d}`,
    signed: (d: string) => `report_signed_${d}`,
} as const;

// --- AsyncStorage Helpers ---

async function readArray<T>(key: string): Promise<T[]> {
    try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function writeArray<T>(key: string, value: T[]): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
}

async function appendEntry<T>(
    keyFn: (d: string) => string,
    dateKey: string,
    entry: T
): Promise<void> {
    const key = keyFn(dateKey);
    const arr = await readArray<T>(key);
    arr.push(entry);
    await writeArray(key, arr);
}

async function upsertEntryById<T extends { id: string }>(
    keyFn: (d: string) => string,
    dateKey: string,
    entry: T
): Promise<void> {
    const key = keyFn(dateKey);
    const arr = await readArray<T>(key);
    const idx = arr.findIndex((item) => item.id === entry.id);
    if (idx >= 0) arr[idx] = entry;
    else arr.push(entry);
    await writeArray(key, arr);
}

// --- Save Functions ---

export async function saveNotes(dateKey: string, entry: NoteEntry): Promise<void> {
    if (entry.photos?.length) entry.photos = await uploadPhotosArray(entry.photos);
    await upsertEntryById(STORAGE_KEYS.notes, dateKey, entry);
    syncNoteToSupabase(dateKey, entry).catch(console.error);
}

export async function saveChemicals(dateKey: string, entry: ChemicalEntry): Promise<void> {
    if (entry.photos?.length) entry.photos = await uploadPhotosArray(entry.photos);
    await upsertEntryById(STORAGE_KEYS.chemicals, dateKey, entry);
    syncChemicalsToSupabase(dateKey, entry).catch(console.error);
}

export async function saveMetrics(dateKey: string, entry: MetricsEntry): Promise<void> {
    if (entry.photos?.length) entry.photos = await uploadPhotosArray(entry.photos);
    await upsertEntryById(STORAGE_KEYS.metrics, dateKey, entry);
    syncMetricsToSupabase(dateKey, entry).catch(console.error);
}

export async function saveSurvey(dateKey: string, entry: SurveyEntry): Promise<void> {
    await upsertEntryById(STORAGE_KEYS.survey, dateKey, entry);
    syncSurveyToSupabase(dateKey, entry).catch(console.error);
}

export async function saveEquipment(dateKey: string, entry: EquipmentEntry): Promise<void> {
    if (entry.photos?.length) entry.photos = await uploadPhotosArray(entry.photos);
    await upsertEntryById(STORAGE_KEYS.equipment, dateKey, entry);
    syncEquipmentToSupabase(dateKey, entry).catch(console.error);
}

export async function saveMaterial(dateKey: string, entry: MaterialEntry): Promise<void> {
    if (entry.photos?.length) entry.photos = await uploadPhotosArray(entry.photos);
    await appendEntry(STORAGE_KEYS.material, dateKey, entry);
}

export async function saveAttachments(dateKey: string, entry: AttachmentEntry): Promise<void> {
    const imageUris = entry.previews ?? [];
    if (imageUris.length > 0) {
        entry.previews = await uploadAttachmentPreviews(imageUris);
    }

    const syncResult = await syncAttachmentToSupabase(dateKey, entry);
    if (!syncResult.ok) {
        throw new Error(syncResult.error || 'Could not save attachments to the database.');
    }

    await upsertEntryById(STORAGE_KEYS.attachments, dateKey, entry);
}

export async function saveEquipmentChecklist(
    dateKey: string,
    entry: EquipmentChecklistEntry
): Promise<void> {
    if (entry.photos?.length) entry.photos = await uploadPhotosArray(entry.photos);
    if (entry.signature) entry.signature = (await uploadImageToCloudinary(entry.signature)) || undefined;
    
    await upsertEntryById(STORAGE_KEYS.equipment, dateKey, entry as unknown as EquipmentEntry);
    syncEquipmentChecklistToSupabase(dateKey, entry).catch(console.error);
}

export async function saveObservation(dateKey: string, entry: ObservationEntry): Promise<void> {
    if (entry.resolutionPhotos?.length) entry.resolutionPhotos = await uploadPhotosArray(entry.resolutionPhotos);
    if (entry.attachments?.length) entry.attachments = await uploadPhotosArray(entry.attachments);

    await appendEntry(STORAGE_KEYS.observations, dateKey, entry);
    syncObservationToSupabase(dateKey, entry).catch(console.error);
}

export async function updateObservation(dateKey: string, entry: ObservationEntry): Promise<void> {
    if (entry.resolutionPhotos?.length) entry.resolutionPhotos = await uploadPhotosArray(entry.resolutionPhotos);
    if (entry.attachments?.length) entry.attachments = await uploadPhotosArray(entry.attachments);

    const key = STORAGE_KEYS.observations(dateKey);
    const arr = await readArray<ObservationEntry>(key);
    const idx = arr.findIndex((o) => o.id === entry.id);
    if (idx >= 0) {
        arr[idx] = entry;
        await writeArray(key, arr);
    } else {
        arr.push(entry);
        await writeArray(key, arr);
    }
    syncObservationToSupabase(dateKey, entry).catch(console.error);
}

export async function deleteObservation(dateKey: string, id: string): Promise<void> {
    const key = STORAGE_KEYS.observations(dateKey);
    const arr = await readArray<ObservationEntry>(key);
    await writeArray(key, arr.filter((o) => o.id !== id));
}

export async function saveIncident(dateKey: string, entry: IncidentEntry): Promise<void> {
    if (entry.photos?.length) entry.photos = await uploadPhotosArray(entry.photos);
    await appendEntry(STORAGE_KEYS.incidents, dateKey, entry);
    syncIncidentToSupabase(dateKey, entry).catch(console.error);
}

export async function updateIncident(dateKey: string, entry: IncidentEntry): Promise<void> {
    if (entry.photos?.length) entry.photos = await uploadPhotosArray(entry.photos);

    const key = STORAGE_KEYS.incidents(dateKey);
    const arr = await readArray<IncidentEntry>(key);
    const idx = arr.findIndex((o) => o.id === entry.id);
    if (idx >= 0) {
        arr[idx] = entry;
        await writeArray(key, arr);
    } else {
        arr.push(entry);
        await writeArray(key, arr);
    }
    syncIncidentToSupabase(dateKey, entry).catch(console.error);
}

export async function deleteIncident(dateKey: string, id: string): Promise<void> {
    const key = STORAGE_KEYS.incidents(dateKey);
    const arr = await readArray<IncidentEntry>(key);
    await writeArray(key, arr.filter((o) => o.id !== id));
}

// --- Read Functions ---

export async function getNotesForDate(dateKey: string): Promise<NoteEntry[]> {
    return readArray<NoteEntry>(STORAGE_KEYS.notes(dateKey));
}

export async function getChemicalsForDate(dateKey: string): Promise<ChemicalEntry[]> {
    return readArray<ChemicalEntry>(STORAGE_KEYS.chemicals(dateKey));
}

export async function getMetricsForDate(dateKey: string): Promise<MetricsEntry[]> {
    return readArray<MetricsEntry>(STORAGE_KEYS.metrics(dateKey));
}

export async function getSurveyForDate(dateKey: string): Promise<SurveyEntry[]> {
    return readArray<SurveyEntry>(STORAGE_KEYS.survey(dateKey));
}

export async function getEquipmentForDate(dateKey: string): Promise<EquipmentOrChecklistEntry[]> {
    return readArray<EquipmentOrChecklistEntry>(STORAGE_KEYS.equipment(dateKey));
}

export async function getMaterialForDate(dateKey: string): Promise<MaterialEntry[]> {
    return readArray<MaterialEntry>(STORAGE_KEYS.material(dateKey));
}

export async function getAttachmentsForDate(dateKey: string): Promise<AttachmentEntry[]> {
    return readArray<AttachmentEntry>(STORAGE_KEYS.attachments(dateKey));
}

export async function getObservationsForDate(dateKey: string): Promise<ObservationEntry[]> {
    return readArray<ObservationEntry>(STORAGE_KEYS.observations(dateKey));
}

export async function getIncidentsForDate(dateKey: string): Promise<IncidentEntry[]> {
    return readArray<IncidentEntry>(STORAGE_KEYS.incidents(dateKey));
}

// --- Signed Reports ---

const SIGNED_REPORT_DATE_KEYS = 'signed_report_date_keys';

export async function saveSignedReport(
    dateKey: string,
    entry: SignedReportEntry
): Promise<SyncSignedReportResult> {
    if (entry.signatureDataUrl) {
        entry.signatureDataUrl = (await uploadImageToCloudinary(entry.signatureDataUrl)) || entry.signatureDataUrl;
    }

    await AsyncStorage.setItem(STORAGE_KEYS.signed(dateKey), JSON.stringify(entry));
    const keys = await getSignedReportDateKeys();
    if (!keys.includes(dateKey)) {
        keys.push(dateKey);
        keys.sort().reverse();
        await AsyncStorage.setItem(SIGNED_REPORT_DATE_KEYS, JSON.stringify(keys));
    }

    const result = await syncSignedReportToSupabase(entry);
    if (!result.ok) {
        console.warn('[saveSignedReport] Supabase daily_signed_reports sync failed:', result.error);
    }
    return result;
}

export async function saveUnsignedReport(
    dateKey: string,
    entry: SignedReportEntry
): Promise<SyncSignedReportResult> {
    await AsyncStorage.setItem(STORAGE_KEYS.signed(dateKey), JSON.stringify(entry));
    const keys = await getSignedReportDateKeys();
    if (!keys.includes(dateKey)) {
        keys.push(dateKey);
        keys.sort().reverse();
        await AsyncStorage.setItem(SIGNED_REPORT_DATE_KEYS, JSON.stringify(keys));
    }
    const result = await syncSignedReportToSupabase(entry);
    if (!result.ok) {
        console.warn('[saveUnsignedReport] Supabase daily_signed_reports sync failed:', result.error);
    }
    return result;
}

export async function getSignedReportDateKeys(): Promise<string[]> {
    try {
        const raw = await AsyncStorage.getItem(SIGNED_REPORT_DATE_KEYS);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch { }
    return [];
}

export async function getSignedReport(dateKey: string): Promise<SignedReportEntry | null> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEYS.signed(dateKey));
        if (!raw) return null;
        return JSON.parse(raw) as SignedReportEntry;
    } catch {
        return null;
    }
}

/**
 * Re-push a locally signed report to `daily_signed_reports` (e.g. first sync failed, or the row
 * predates `projectId`). Safe to call whenever preview opens: upsert is idempotent.
 * Only runs when the signed row's project name matches the currently selected project.
 */
export async function resyncSignedReportToSupabaseIfPresent(
    dateKey: string,
    selectedProject: { id: string; name: string },
): Promise<SyncSignedReportResult | null> {
    const pid = selectedProject.id?.trim();
    if (!pid) return null;

    const signed = await getSignedReport(dateKey);
    if (!signed?.isSigned) return null;
    if (!projectNameEquals(signed.projectName, selectedProject.name)) return null;

    const entry: SignedReportEntry = {
        ...signed,
        projectId: signed.projectId?.trim() || pid,
    };

    if (!signed.projectId?.trim()) {
        try {
            await AsyncStorage.setItem(STORAGE_KEYS.signed(dateKey), JSON.stringify(entry));
        } catch {
            /* still upsert with in-memory projectId */
        }
    }

    return syncSignedReportToSupabase(entry);
}

// --- Aggregated Report ---

export interface ReportData {
    dateKey: string;
    date: Date;
    projectName: string;
    projectAddress?: string;
    projectZipcode?: string;
    notes: NoteEntry[];
    chemicals: ChemicalEntry[];
    material: MaterialEntry[];
    metrics: MetricsEntry[];
    survey: SurveyEntry[];
    equipment: EquipmentOrChecklistEntry[];
    attachments: AttachmentEntry[];
    observations: ObservationEntry[];
    incidents: IncidentEntry[];
    signed: SignedReportEntry | null;
}

export async function getReportForDate(
    date: Date,
    projectName: string = 'North Valley Solar Farm',
    projectAddress?: string,
    projectZipcode?: string,
    options?: { projectId?: string },
): Promise<ReportData> {
    const dateKey = getDateKey(date);
    const pid = options?.projectId?.trim() ?? '';
    const uuidOk =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pid);

    const [
        notes,
        chemicals,
        material,
        metrics,
        survey,
        localEquipment,
        localAttachments,
        observations,
        incidents,
        localSigned,
        remoteSignedPack,
        remoteEquipment,
        remoteAttachments,
    ] = await Promise.all([
        getNotesForDate(dateKey),
        getChemicalsForDate(dateKey),
        getMaterialForDate(dateKey),
        getMetricsForDate(dateKey),
        getSurveyForDate(dateKey),
        getEquipmentForDate(dateKey),
        getAttachmentsForDate(dateKey),
        getObservationsForDate(dateKey),
        getIncidentsForDate(dateKey),
        getSignedReport(dateKey),
        uuidOk ? fetchDailySignedReportFromSupabase(pid, dateKey, projectName) : Promise.resolve({ entry: null as SignedReportEntry | null, ok: false }),
        uuidOk ? fetchEquipmentFromSupabase(dateKey, date, pid, projectName) : Promise.resolve([] as EquipmentOrChecklistEntry[]),
        uuidOk ? fetchAttachmentsFromSupabase(dateKey, date, pid, projectName) : Promise.resolve([] as AttachmentEntry[]),
    ]);

    const equipmentPred = (e: EquipmentOrChecklistEntry) =>
        equipmentEntryMatchesProject(e, projectName, pid);
    const equipment = mergeLocalRemotePreferSupabase(localEquipment, remoteEquipment, equipmentPred);

    const attachmentsPred = (a: AttachmentEntry) =>
        projectNameEquals(a.project?.name, projectName) ||
        (!!pid && a.project?.id?.trim() === pid);
    const reportAttachments = (uuidOk ? remoteAttachments : localAttachments)
        .filter(attachmentsPred)
        .filter((a) =>
            (a.previews ?? []).some(
                (u) => typeof u === 'string' && (u.startsWith('https://') || u.startsWith('http://'))
            )
        );

    /** When Supabase read succeeds: use DB row if present; otherwise same-project local (pending sync). */
    let signed: SignedReportEntry | null = localSigned;
    if (uuidOk && remoteSignedPack.ok) {
        if (remoteSignedPack.entry !== null) {
            signed = remoteSignedPack.entry;
        } else if (localSigned && projectNameEquals(localSigned.projectName, projectName)) {
            signed = localSigned;
        } else {
            signed = null;
        }
    }

    return {
        dateKey,
        date,
        projectName,
        projectAddress,
        projectZipcode,
        notes,
        chemicals,
        material,
        metrics,
        survey,
        equipment,
        attachments: reportAttachments,
        observations,
        incidents,
        signed,
    };
}

export async function hasDataForDate(dateKey: string): Promise<boolean> {
    const [notes, chemicals, metrics, survey, equipment, attachments, material, observations, incidents] = await Promise.all([
        getNotesForDate(dateKey),
        getChemicalsForDate(dateKey),
        getMetricsForDate(dateKey),
        getSurveyForDate(dateKey),
        getEquipmentForDate(dateKey),
        getAttachmentsForDate(dateKey),
        getMaterialForDate(dateKey),
        getObservationsForDate(dateKey),
        getIncidentsForDate(dateKey),
    ]);
    return (
        notes.length > 0 ||
        chemicals.length > 0 ||
        metrics.length > 0 ||
        survey.length > 0 ||
        equipment.length > 0 ||
        attachments.length > 0 ||
        material.length > 0 ||
        observations.length > 0 ||
        incidents.length > 0
    );
}

function projectNameEquals(a: string | undefined, b: string | undefined): boolean {
    if (!a?.trim() || !b?.trim()) return false;
    return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function equipmentEntryMatchesProject(
    entry: EquipmentOrChecklistEntry,
    projectName: string,
    projectId?: string
): boolean {
    const pid = projectId?.trim();
    if (
        pid &&
        'type' in entry &&
        entry.type === 'checklist' &&
        entry.project?.id?.trim() === pid
    ) {
        return true;
    }
    if ('type' in entry && entry.type === 'checklist' && entry.formData && typeof (entry.formData as Record<string, string>).siteName === 'string') {
        return projectNameEquals((entry.formData as Record<string, string>).siteName, projectName);
    }
    if ('project' in entry && entry.project?.name) {
        return projectNameEquals(entry.project.name, projectName);
    }
    return false;
}

/** Any saved logs or report draft/signature for this calendar day and project (local AsyncStorage). */
export async function hasDataForDateForProject(dateKey: string, projectName: string): Promise<boolean> {
    const pn = projectName.trim();
    if (!pn) return false;

    const [notes, chemicals, metrics, survey, equipment, attachments, material, observations, incidents] = await Promise.all([
        getNotesForDate(dateKey),
        getChemicalsForDate(dateKey),
        getMetricsForDate(dateKey),
        getSurveyForDate(dateKey),
        getEquipmentForDate(dateKey),
        getAttachmentsForDate(dateKey),
        getMaterialForDate(dateKey),
        getObservationsForDate(dateKey),
        getIncidentsForDate(dateKey),
    ]);

    if (notes.some((n) => projectNameEquals(n.project?.name, pn))) return true;
    if (chemicals.some((c) => projectNameEquals(c.project?.name, pn))) return true;
    if (metrics.some((m) => projectNameEquals(m.project?.name, pn))) return true;
    if (survey.some((s) => projectNameEquals(s.project?.name, pn))) return true;
    if (equipment.some((e) => equipmentEntryMatchesProject(e, pn))) return true;
    if (attachments.some((a) => projectNameEquals(a.project?.name, pn))) return true;
    if (material.some((m) => projectNameEquals(m.project?.name, pn))) return true;
    if (observations.some((o) => projectNameEquals(o.project?.name, pn))) return true;
    if (incidents.some((i) => projectNameEquals(i.project?.name, pn))) return true;

    const report = await getSignedReport(dateKey);
    if (report && projectNameEquals(report.projectName, pn)) return true;

    return false;
}

/** Whether this calendar day is fully signed for the project (Supabase when online; else local). */
export async function isReportFullySignedForProject(
    dateKey: string,
    projectName: string,
    options?: { projectId?: string },
): Promise<boolean> {
    const pid = options?.projectId?.trim() ?? '';
    const uuidOk =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pid);
    if (uuidOk) {
        const { entry, ok } = await fetchDailySignedReportFromSupabase(pid, dateKey, projectName);
        if (ok) {
            if (entry !== null) return entry.isSigned === true;
            const s = await getSignedReport(dateKey);
            return !!(s && projectNameEquals(s.projectName, projectName) && s.isSigned);
        }
    }
    const s = await getSignedReport(dateKey);
    return !!(s && projectNameEquals(s.projectName, projectName) && s.isSigned);
}
