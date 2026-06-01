/**
 * Avoid duplicate rows when the same record exists both locally and in Supabase
 * (local `timestamp` vs remote `logged_at` makes content-key dedupe unreliable).
 *
 * Mirrors the attachments pattern: prefer Supabase when it returns anything for the filter; else offline queue only.
 */
export function normalizeProjectName(name: string | undefined): string {
    return (name ?? '').trim().toLowerCase();
}

/** Case-insensitive project match for entries with `{ project?: { name } }`. */
export function matchProjectPredicate<T extends { project?: { name?: string } }>(selectedName: string | undefined) {
    const target = normalizeProjectName(selectedName);
    return (t: T) => normalizeProjectName(t.project?.name) === target;
}

export function mergeLocalRemotePreferSupabase<T>(
    localList: T[],
    remoteList: T[],
    matchPredicate: (t: T) => boolean
): T[] {
    const localFiltered = localList.filter(matchPredicate);
    const remoteFiltered = remoteList.filter(matchPredicate);
    return remoteFiltered.length > 0 ? remoteFiltered : localFiltered;
}

/**
 * Union local + remote by `id`; remote wins on the same id. Use when multiple rows per day exist
 * (e.g. several equipment checklists): `mergeLocalRemotePreferSupabase` would drop locals as soon as
 * any remote row exists.
 */
export function mergeLocalRemoteByIdPreferRemote<T extends { id: string }>(
    localList: T[],
    remoteList: T[],
    matchPredicate: (t: T) => boolean
): T[] {
    const localFiltered = localList.filter(matchPredicate);
    const remoteFiltered = remoteList.filter(matchPredicate);
    const byId = new Map<string, T>();
    for (const e of localFiltered) {
        if (e.id) byId.set(e.id, e);
    }
    for (const e of remoteFiltered) {
        if (e.id) byId.set(e.id, e);
    }
    return Array.from(byId.values());
}
