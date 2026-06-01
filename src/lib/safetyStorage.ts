import AsyncStorage from '@react-native-async-storage/async-storage';
import { createUuid } from './dailyReportStorage';
import { syncSafetyTalkToSupabase } from './supabaseSync';
import { normalizeProjectName } from './mergeLocalRemote';

export type SafetyTalkStatus = 'upcoming' | 'missed' | 'conducted';

/** Persisted to DB / local list (no signature image payloads — use `attendancePdfUrl` for proof). */
export type SafetyTalkAttendeeRow = {
    name: string;
    company?: string;
    /** Whether a signature was captured (details live in combined PDF when present). */
    signed?: boolean;
};

export type SafetyTalkCompletion = {
    attendees?: SafetyTalkAttendeeRow[];
    attendancePdfUrl?: string | null;
};

export interface SafetyTalk {
    id: string;
    templateId: string;
    templateName: string;
    /** ISO date-only string: YYYY-MM-DD */
    date: string;
    status: SafetyTalkStatus;
    createdAt: string;
    /** Supabase `projects.id` for the field project this talk belongs to */
    projectId?: string;
    projectName?: string;
    attendees?: SafetyTalkAttendeeRow[];
    attendancePdfUrl?: string | null;
}

/** Whether this talk belongs to the given field project (id preferred, then name). */
export function safetyTalkMatchesProject(
    talk: SafetyTalk,
    projectId: string | undefined,
    projectName: string | undefined
): boolean {
    const pn = (projectName ?? '').trim();
    if (!pn || pn === 'No Project Selected') return false;
    const pid = (projectId ?? '').trim();
    if (pid && talk.projectId?.trim()) {
        return talk.projectId.trim() === pid;
    }
    if (talk.projectName?.trim()) {
        return normalizeProjectName(talk.projectName) === normalizeProjectName(pn);
    }
    return false;
}

const STORAGE_KEY = 'safety_talks';

/** Strip base64 signatures for storage / Supabase (PDF carries the rendered signatures). */
export function attendeesToStoredRows(
    attendees: { name: string; company?: string; signature?: string }[]
): SafetyTalkAttendeeRow[] {
    return attendees.map(({ name, company, signature }) => ({
        name: name.trim(),
        company: company?.trim() || undefined,
        signed: typeof signature === 'string' && signature.length > 0,
    }));
}

const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Older builds used non-UUID ids (e.g. `Date.now().toString()`), which Postgres rejects for `safety_talks.id`.
 * Migrate local rows + `safety_talk_completed_*` keys, then best-effort re-sync.
 */
async function migrateLegacyTalkIdsIfNeeded(talks: SafetyTalk[]): Promise<SafetyTalk[]> {
    const hasLegacy = talks.some((t) => !UUID_RE.test(String(t.id ?? '')));
    if (!hasLegacy) return talks;

    const migrated: SafetyTalk[] = talks.map((t) =>
        UUID_RE.test(String(t.id ?? '')) ? t : { ...t, id: createUuid() }
    );

    const moves: { oldId: string; newId: string }[] = [];
    for (let i = 0; i < talks.length; i++) {
        const oldId = String(talks[i]?.id ?? '');
        const newId = String(migrated[i]?.id ?? '');
        if (oldId && newId && oldId !== newId) moves.push({ oldId, newId });
    }

    await Promise.all(
        moves.map(async ({ oldId, newId }) => {
            try {
                const oldKey = `safety_talk_completed_${oldId}`;
                const newKey = `safety_talk_completed_${newId}`;
                const raw = await AsyncStorage.getItem(oldKey);
                if (!raw) return;
                await AsyncStorage.setItem(newKey, raw);
                await AsyncStorage.removeItem(oldKey);
            } catch {
                // best-effort
            }
        })
    );

    await writeTalks(migrated);

    const affectedNewIds = new Set(moves.map((m) => m.newId));
    for (const t of migrated) {
        if (affectedNewIds.has(t.id)) {
            syncSafetyTalkToSupabase(t).catch(console.error);
        }
    }

    return migrated;
}

async function readTalks(): Promise<SafetyTalk[]> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        const talks = Array.isArray(parsed) ? (parsed as SafetyTalk[]) : [];
        return await migrateLegacyTalkIdsIfNeeded(talks);
    } catch {
        return [];
    }
}

async function writeTalks(talks: SafetyTalk[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(talks));
}

export async function getSafetyTalks(): Promise<SafetyTalk[]> {
    return readTalks();
}

export async function getTalkById(id: string): Promise<SafetyTalk | undefined> {
    const talks = await readTalks();
    return talks.find((t) => t.id === id);
}

export async function addScheduledSafetyTalk(
    dateKey: string,
    templateId: string,
    templateName: string,
    projectId: string,
    projectName: string
): Promise<void> {
    const talks = await readTalks();
    const talk: SafetyTalk = {
        id: createUuid(),
        templateId,
        templateName,
        date: dateKey,
        status: 'upcoming',
        createdAt: new Date().toISOString(),
        projectId,
        projectName,
    };
    talks.push(talk);
    await writeTalks(talks);
    syncSafetyTalkToSupabase(talk).catch(console.error);
}

/** Used by signature flows: create a completed talk that shows under "Done" immediately. */
export async function addConductedSafetyTalk(
    dateKey: string,
    templateId: string,
    templateName: string,
    projectId: string,
    projectName: string,
    completion?: SafetyTalkCompletion
): Promise<string> {
    const talks = await readTalks();
    const id = createUuid();
    const talk: SafetyTalk = {
        id,
        templateId,
        templateName,
        date: dateKey,
        status: 'conducted',
        createdAt: new Date().toISOString(),
        projectId,
        projectName,
        attendees: completion?.attendees,
        attendancePdfUrl: completion?.attendancePdfUrl ?? undefined,
    };
    talks.push(talk);
    await writeTalks(talks);
    syncSafetyTalkToSupabase(talk).catch(console.error);
    return id;
}

export async function updateScheduledSafetyTalk(
    id: string,
    dateKey: string,
    templateId: string,
    templateName: string,
    projectId: string,
    projectName: string
): Promise<void> {
    const talks = await readTalks();
    const idx = talks.findIndex((t) => t.id === id);
    if (idx === -1) return;
    talks[idx] = {
        ...talks[idx],
        date: dateKey,
        templateId,
        templateName,
        projectId,
        projectName,
    };
    await writeTalks(talks);
    syncSafetyTalkToSupabase(talks[idx]).catch(console.error);
}

export async function deleteScheduledSafetyTalk(id: string): Promise<void> {
    const talks = await readTalks();
    await writeTalks(talks.filter((t) => t.id !== id));
}

export async function markSafetyTalkConducted(id: string): Promise<void> {
    const talks = await readTalks();
    const idx = talks.findIndex((t) => t.id === id);
    if (idx === -1) return;
    talks[idx] = { ...talks[idx], status: 'conducted' };
    await writeTalks(talks);
    syncSafetyTalkToSupabase(talks[idx]).catch(console.error);
}
