export type IncidentYesNo = 'Yes' | 'No' | '';

export const INCIDENT_OUTCOME_TYPES = [
    'Death',
    'Days away from work',
    'Job transfer/restricted work activity',
    'Other',
] as const;

const LEGACY_OUTCOME_TYPE_ALIASES: Record<string, IncidentOutcomeType> = {
    'Job transfer or restriction': 'Job transfer/restricted work activity',
    'Other recordable cases': 'Other',
    'Non-recordable': 'Other',
    'Unknown / Pending': 'Other',
};

function normalizeOutcomeType(value: unknown): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if ((INCIDENT_OUTCOME_TYPES as readonly string[]).includes(trimmed)) return trimmed;
    return LEGACY_OUTCOME_TYPE_ALIASES[trimmed] ?? trimmed;
}

export type IncidentOutcomeType = (typeof INCIDENT_OUTCOME_TYPES)[number];

export interface IncidentOutcomeRecord {
    emergencyRoomTreated: IncidentYesNo;
    hospitalizedInPatient: IncidentYesNo;
    outcomeType: string;
    daysAwayFromWork: string;
    daysOnJobTransferRestriction: string;
}

export function emptyIncidentOutcome(): IncidentOutcomeRecord {
    return {
        emergencyRoomTreated: '',
        hospitalizedInPatient: '',
        outcomeType: '',
        daysAwayFromWork: '0',
        daysOnJobTransferRestriction: '0',
    };
}

function normalizeYesNo(value: unknown): IncidentYesNo {
    if (value === 'Yes' || value === 'No') return value;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return '';
}

function normalizeDays(value: unknown): string {
    if (typeof value === 'number' && Number.isFinite(value)) return String(Math.max(0, Math.floor(value)));
    if (typeof value === 'string' && value.trim() !== '') {
        const n = parseInt(value.trim(), 10);
        return Number.isNaN(n) ? '0' : String(Math.max(0, n));
    }
    return '0';
}

function normalizeOne(raw: Record<string, unknown>): IncidentOutcomeRecord | null {
    const emergencyRoomTreated = normalizeYesNo(
        raw.emergencyRoomTreated ?? raw.emergency_room_treated ?? raw.treatedInEmergencyRoom
    );
    const hospitalizedInPatient = normalizeYesNo(
        raw.hospitalizedInPatient ?? raw.hospitalized_in_patient ?? raw.hospitalizedAsInPatient
    );
    const outcomeType = normalizeOutcomeType(
        raw.outcomeType ?? raw.outcome_type ?? raw.incidentOutcome
    );
    const daysAwayFromWork = normalizeDays(
        raw.daysAwayFromWork ?? raw.days_away_from_work ?? raw.daysAway
    );
    const daysOnJobTransferRestriction = normalizeDays(
        raw.daysOnJobTransferRestriction ??
            raw.days_on_job_transfer_restriction ??
            raw.daysOnTransfer
    );

    if (
        !emergencyRoomTreated &&
        !hospitalizedInPatient &&
        !outcomeType.trim() &&
        daysAwayFromWork === '0' &&
        daysOnJobTransferRestriction === '0'
    ) {
        return null;
    }

    return {
        emergencyRoomTreated,
        hospitalizedInPatient,
        outcomeType: outcomeType.trim(),
        daysAwayFromWork,
        daysOnJobTransferRestriction,
    };
}

/** Parse DB JSONB array/object or legacy string notes. */
export function normalizeIncidentOutcome(raw: unknown): IncidentOutcomeRecord | undefined {
    if (!raw) return undefined;

    if (Array.isArray(raw)) {
        for (const item of raw) {
            if (typeof item === 'string') {
                const s = item.trim();
                if (!s) continue;
                try {
                    const parsed = JSON.parse(s) as Record<string, unknown>;
                    const rec = normalizeOne(parsed);
                    if (rec) return rec;
                } catch {
                    return { ...emptyIncidentOutcome(), outcomeType: s };
                }
                continue;
            }
            if (item && typeof item === 'object') {
                const rec = normalizeOne(item as Record<string, unknown>);
                if (rec) return rec;
            }
        }
        return undefined;
    }

    if (typeof raw === 'object') {
        return normalizeOne(raw as Record<string, unknown>) ?? undefined;
    }

    if (typeof raw === 'string' && raw.trim()) {
        return { ...emptyIncidentOutcome(), outcomeType: raw.trim() };
    }

    return undefined;
}

export function incidentOutcomeHasData(record: IncidentOutcomeRecord | undefined | null): boolean {
    if (!record) return false;
    return !!(
        record.emergencyRoomTreated ||
        record.hospitalizedInPatient ||
        record.outcomeType.trim() ||
        record.daysAwayFromWork !== '0' ||
        record.daysOnJobTransferRestriction !== '0'
    );
}

export function formatIncidentOutcomeSummary(record: IncidentOutcomeRecord): string {
    const parts: string[] = [];
    if (record.outcomeType.trim()) parts.push(record.outcomeType.trim());
    if (record.emergencyRoomTreated === 'Yes') parts.push('ER treated');
    if (record.hospitalizedInPatient === 'Yes') parts.push('Hospitalized');
    if (record.daysAwayFromWork !== '0') parts.push(`${record.daysAwayFromWork} days away`);
    if (record.daysOnJobTransferRestriction !== '0') {
        parts.push(`${record.daysOnJobTransferRestriction} days restricted`);
    }
    return parts.join(' · ') || 'Outcome recorded';
}

/** Store as JSONB array with one object (matches existing column default). */
export function incidentOutcomeForDb(record: IncidentOutcomeRecord | undefined): IncidentOutcomeRecord[] {
    if (!record || !incidentOutcomeHasData(record)) return [];
    return [record];
}
