/**
 * Daily report storage: persist and read all submissions by date (YYYY-MM-DD).
 * React Native equivalent using AsyncStorage instead of localStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { uploadPhotosArray, uploadImageToCloudinary } from './cloudinary';
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
    syncAttachmentToSupabase
} from './supabaseSync';

// --- Date Utilities ---

export function getDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export async function getReportDate(): Promise<Date> {
    try {
        const saved = await AsyncStorage.getItem('selectedDate');
        if (saved) return new Date(saved);
    } catch { }
    return new Date();
}

export async function setReportDate(date: Date): Promise<void> {
    await AsyncStorage.setItem('selectedDate', date.toISOString());
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
    id: number;
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
    project: { name: string };
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
    injuredEmployeeInfo?: string[];
    incidentInvestigation?: string[];
    incidentOutcome?: string[];
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
}

export type EquipmentOrChecklistEntry = EquipmentEntry | EquipmentChecklistEntry;

export interface SignedReportEntry {
    reportDate: string; // ISO date YYYY-MM-DD
    signedAt?: string;
    preparedBy: string;
    signatureDataUrl?: string;
    projectName: string;
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

// --- Save Functions ---

export async function saveNotes(dateKey: string, entry: NoteEntry): Promise<void> {
    if (entry.photos?.length) entry.photos = await uploadPhotosArray(entry.photos);
    await appendEntry(STORAGE_KEYS.notes, dateKey, entry);
    syncNoteToSupabase(entry).catch(console.error);
}

export async function saveChemicals(dateKey: string, entry: ChemicalEntry): Promise<void> {
    if (entry.photos?.length) entry.photos = await uploadPhotosArray(entry.photos);
    await appendEntry(STORAGE_KEYS.chemicals, dateKey, entry);
    syncChemicalsToSupabase(entry).catch(console.error);
}

export async function saveMetrics(dateKey: string, entry: MetricsEntry): Promise<void> {
    if (entry.photos?.length) entry.photos = await uploadPhotosArray(entry.photos);
    await appendEntry(STORAGE_KEYS.metrics, dateKey, entry);
    syncMetricsToSupabase(entry).catch(console.error);
}

export async function saveSurvey(dateKey: string, entry: SurveyEntry): Promise<void> {
    await appendEntry(STORAGE_KEYS.survey, dateKey, entry);
    syncSurveyToSupabase(entry).catch(console.error);
}

export async function saveEquipment(dateKey: string, entry: EquipmentEntry): Promise<void> {
    if (entry.photos?.length) entry.photos = await uploadPhotosArray(entry.photos);
    await appendEntry(STORAGE_KEYS.equipment, dateKey, entry);
    syncEquipmentToSupabase(entry).catch(console.error);
}

export async function saveMaterial(dateKey: string, entry: MaterialEntry): Promise<void> {
    if (entry.photos?.length) entry.photos = await uploadPhotosArray(entry.photos);
    await appendEntry(STORAGE_KEYS.material, dateKey, entry);
}

export async function saveAttachments(dateKey: string, entry: AttachmentEntry): Promise<void> {
    if (entry.previews?.length) entry.previews = await uploadPhotosArray(entry.previews);
    await appendEntry(STORAGE_KEYS.attachments, dateKey, entry);
    syncAttachmentToSupabase(entry).catch(console.error);
}

export async function saveEquipmentChecklist(
    dateKey: string,
    entry: EquipmentChecklistEntry
): Promise<void> {
    if (entry.photos?.length) entry.photos = await uploadPhotosArray(entry.photos);
    if (entry.signature) entry.signature = (await uploadImageToCloudinary(entry.signature)) || undefined;
    
    await appendEntry(STORAGE_KEYS.equipment, dateKey, entry as unknown as EquipmentEntry);
    syncEquipmentChecklistToSupabase(entry).catch(console.error);
}

export async function saveObservation(dateKey: string, entry: ObservationEntry): Promise<void> {
    if (entry.resolutionPhotos?.length) entry.resolutionPhotos = await uploadPhotosArray(entry.resolutionPhotos);
    if (entry.attachments?.length) entry.attachments = await uploadPhotosArray(entry.attachments);

    await appendEntry(STORAGE_KEYS.observations, dateKey, entry);
    syncObservationToSupabase(entry).catch(console.error);
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
    syncObservationToSupabase(entry).catch(console.error);
}

export async function deleteObservation(dateKey: string, id: string): Promise<void> {
    const key = STORAGE_KEYS.observations(dateKey);
    const arr = await readArray<ObservationEntry>(key);
    await writeArray(key, arr.filter((o) => o.id !== id));
}

export async function saveIncident(dateKey: string, entry: IncidentEntry): Promise<void> {
    if (entry.photos?.length) entry.photos = await uploadPhotosArray(entry.photos);
    await appendEntry(STORAGE_KEYS.incidents, dateKey, entry);
    syncIncidentToSupabase(entry).catch(console.error);
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
    syncIncidentToSupabase(entry).catch(console.error);
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
): Promise<void> {
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

    syncSignedReportToSupabase(entry).catch(console.error);
}

export async function saveUnsignedReport(
    dateKey: string,
    entry: SignedReportEntry
): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.signed(dateKey), JSON.stringify(entry));
    const keys = await getSignedReportDateKeys();
    if (!keys.includes(dateKey)) {
        keys.push(dateKey);
        keys.sort().reverse();
        await AsyncStorage.setItem(SIGNED_REPORT_DATE_KEYS, JSON.stringify(keys));
    }
    syncSignedReportToSupabase(entry).catch(console.error);
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

// --- Aggregated Report ---

export interface ReportData {
    dateKey: string;
    date: Date;
    projectName: string;
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
    projectName: string = 'North Valley Solar Farm'
): Promise<ReportData> {
    const dateKey = getDateKey(date);
    const [notes, chemicals, material, metrics, survey, equipment, attachments, observations, incidents, signed] =
        await Promise.all([
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
        ]);

    return {
        dateKey,
        date,
        projectName,
        notes,
        chemicals,
        material,
        metrics,
        survey,
        equipment,
        attachments,
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
