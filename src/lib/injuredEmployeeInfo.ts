export const INJURED_EMPLOYEE_GENDERS = [
    'Undisclosed',
    'Male',
    'Female',
    'Non-binary',
    'Other',
] as const;

export type InjuredEmployeeGender = (typeof INJURED_EMPLOYEE_GENDERS)[number];

export interface InjuredEmployeeRecord {
    name: string;
    jobTitle: string;
    gender: InjuredEmployeeGender;
    /** ISO date YYYY-MM-DD */
    dateOfBirth: string;
    /** ISO date YYYY-MM-DD */
    dateOfHire: string;
}

export const MAX_INJURED_EMPLOYEES = 5;

export function emptyInjuredEmployee(): InjuredEmployeeRecord {
    return {
        name: '',
        jobTitle: '',
        gender: 'Undisclosed',
        dateOfBirth: '',
        dateOfHire: '',
    };
}

export function formatInjuredEmployeeSummary(record: InjuredEmployeeRecord): string {
    const parts: string[] = [];
    const name = record.name.trim();
    if (name) parts.push(name);
    const title = record.jobTitle.trim();
    if (title) parts.push(title);
    if (record.gender && record.gender !== 'Undisclosed') parts.push(record.gender);
    return parts.join(' · ') || 'Injured employee';
}

export function formatInjuredEmployeeDateLabel(iso: string): string {
    if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '';
    const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function normalizeGender(value: unknown): InjuredEmployeeGender {
    if (typeof value !== 'string') return 'Undisclosed';
    const v = value.trim();
    return (INJURED_EMPLOYEE_GENDERS as readonly string[]).includes(v)
        ? (v as InjuredEmployeeGender)
        : 'Undisclosed';
}

function normalizeDate(value: unknown): string {
    if (typeof value !== 'string') return '';
    const t = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
}

function normalizeOne(raw: Record<string, unknown>): InjuredEmployeeRecord | null {
    const name =
        (typeof raw.name === 'string' ? raw.name : '') ||
        (typeof raw.employee_name === 'string' ? raw.employee_name : '');
    const jobTitle =
        (typeof raw.jobTitle === 'string' ? raw.jobTitle : '') ||
        (typeof raw.job_title === 'string' ? raw.job_title : '');
    const gender = normalizeGender(raw.gender);
    const dateOfBirth = normalizeDate(raw.dateOfBirth ?? raw.date_of_birth);
    const dateOfHire = normalizeDate(raw.dateOfHire ?? raw.date_of_hire);

    if (!name.trim() && !jobTitle.trim() && !dateOfBirth && !dateOfHire) return null;

    return {
        name: name.trim(),
        jobTitle: jobTitle.trim(),
        gender,
        dateOfBirth,
        dateOfHire,
    };
}

/** Parse DB / draft JSONB or legacy string lines. */
export function normalizeInjuredEmployeeList(raw: unknown): InjuredEmployeeRecord[] {
    if (!Array.isArray(raw)) return [];
    const out: InjuredEmployeeRecord[] = [];
    for (const item of raw) {
        if (typeof item === 'string') {
            const s = item.trim();
            if (!s) continue;
            try {
                const parsed = JSON.parse(s) as Record<string, unknown>;
                const rec = normalizeOne(parsed);
                if (rec) out.push(rec);
            } catch {
                out.push({ ...emptyInjuredEmployee(), name: s });
            }
            continue;
        }
        if (item && typeof item === 'object') {
            const rec = normalizeOne(item as Record<string, unknown>);
            if (rec) out.push(rec);
        }
    }
    return out.slice(0, MAX_INJURED_EMPLOYEES);
}
