import {
    getEquipmentForDate,
    equipmentEntryMatchesProject,
    type EquipmentChecklistEntry,
    type EquipmentOrChecklistEntry,
} from './dailyReportStorage';
import { mergeLocalRemotePreferSupabase } from './mergeLocalRemote';
import { fetchEquipmentFromSupabase } from './supabaseSync';

/**
 * Equipment checklists for list/edit: prefer Supabase when any rows exist for this project/day
 * (DB is source of truth). Fall back to local AsyncStorage only when remote is empty (offline).
 */
export async function loadEquipmentChecklistsForProject(
    dateKey: string,
    date: Date,
    projectId: string,
    projectName: string
): Promise<EquipmentChecklistEntry[]> {
    const pred = (e: EquipmentOrChecklistEntry) =>
        'type' in e &&
        e.type === 'checklist' &&
        equipmentEntryMatchesProject(e, projectName, projectId);

    const [localData, remoteData] = await Promise.all([
        getEquipmentForDate(dateKey),
        fetchEquipmentFromSupabase(dateKey, date, projectId, projectName),
    ]);

    const merged = mergeLocalRemotePreferSupabase(localData, remoteData, pred);
    return merged
        .filter((e): e is EquipmentChecklistEntry => 'type' in e && e.type === 'checklist')
        .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
}
