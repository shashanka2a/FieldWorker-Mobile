export interface IncidentInvestigationRecord {
    injuryIllnessDescription: string;
    activityPriorToIncident: string;
    recountOfIncident: string;
    affectOnBody: string;
    sourceOfHarm: string;
}

export const INCIDENT_INVESTIGATION_FIELDS: {
    key: keyof IncidentInvestigationRecord;
    label: string;
    placeholder: string;
}[] = [
    {
        key: 'injuryIllnessDescription',
        label: 'Description of injury or illness',
        placeholder: 'Describe the injury or illness…',
    },
    {
        key: 'activityPriorToIncident',
        label: 'Activity prior to incident',
        placeholder: 'What was the employee doing before the incident?',
    },
    {
        key: 'recountOfIncident',
        label: 'Recount of incident',
        placeholder: 'Describe what happened…',
    },
    {
        key: 'affectOnBody',
        label: 'Affect on body',
        placeholder: 'Which part of the body was affected?',
    },
    {
        key: 'sourceOfHarm',
        label: 'Source of harm',
        placeholder: 'What caused the harm?',
    },
];

export function emptyIncidentInvestigation(): IncidentInvestigationRecord {
    return {
        injuryIllnessDescription: '',
        activityPriorToIncident: '',
        recountOfIncident: '',
        affectOnBody: '',
        sourceOfHarm: '',
    };
}

function pickString(raw: Record<string, unknown>, ...keys: string[]): string {
    for (const key of keys) {
        const v = raw[key];
        if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
}

function normalizeOne(raw: Record<string, unknown>): IncidentInvestigationRecord | null {
    const record: IncidentInvestigationRecord = {
        injuryIllnessDescription: pickString(
            raw,
            'injuryIllnessDescription',
            'injury_illness_description',
            'descriptionOfInjuryOrIllness'
        ),
        activityPriorToIncident: pickString(
            raw,
            'activityPriorToIncident',
            'activity_prior_to_incident',
            'activityPrior'
        ),
        recountOfIncident: pickString(raw, 'recountOfIncident', 'recount_of_incident', 'recount'),
        affectOnBody: pickString(raw, 'affectOnBody', 'affect_on_body', 'effectOnBody'),
        sourceOfHarm: pickString(raw, 'sourceOfHarm', 'source_of_harm', 'source'),
    };

    if (!incidentInvestigationHasData(record)) return null;
    return record;
}

/** Parse DB JSONB array/object or legacy string list. */
export function normalizeIncidentInvestigation(raw: unknown): IncidentInvestigationRecord | undefined {
    if (!raw) return undefined;

    if (Array.isArray(raw)) {
        const objects: IncidentInvestigationRecord[] = [];
        const legacyStrings: string[] = [];

        for (const item of raw) {
            if (typeof item === 'string') {
                const s = item.trim();
                if (!s) continue;
                try {
                    const parsed = JSON.parse(s) as Record<string, unknown>;
                    const rec = normalizeOne(parsed);
                    if (rec) objects.push(rec);
                } catch {
                    legacyStrings.push(s);
                }
                continue;
            }
            if (item && typeof item === 'object') {
                const rec = normalizeOne(item as Record<string, unknown>);
                if (rec) objects.push(rec);
            }
        }

        if (objects.length > 0) return objects[0];

        if (legacyStrings.length > 0) {
            const empty = emptyIncidentInvestigation();
            empty.recountOfIncident = legacyStrings.join('\n\n');
            return empty;
        }

        return undefined;
    }

    if (typeof raw === 'object') {
        return normalizeOne(raw as Record<string, unknown>) ?? undefined;
    }

    return undefined;
}

export function incidentInvestigationHasData(
    record: IncidentInvestigationRecord | undefined | null
): boolean {
    if (!record) return false;
    return INCIDENT_INVESTIGATION_FIELDS.some(({ key }) => record[key].trim().length > 0);
}

export function formatIncidentInvestigationSummary(record: IncidentInvestigationRecord): string {
    for (const { key, label } of INCIDENT_INVESTIGATION_FIELDS) {
        const value = record[key].trim();
        if (value) {
            const preview = value.length > 48 ? `${value.slice(0, 48)}…` : value;
            return `${label}: ${preview}`;
        }
    }
    return 'Investigation recorded';
}

export function incidentInvestigationForDb(
    record: IncidentInvestigationRecord | undefined
): IncidentInvestigationRecord[] {
    if (!record || !incidentInvestigationHasData(record)) return [];
    return [record];
}
