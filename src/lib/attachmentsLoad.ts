import type { AttachmentEntry } from './dailyReportStorage';
import { fetchAttachmentsFromSupabase } from './supabaseSync';

/** Row is visible only when Supabase `cloudinary_urls` has at least one HTTP(S) URL. */
export function attachmentHasCloudinaryUrls(entry: AttachmentEntry): boolean {
    return (entry.previews ?? []).some(
        (u) => typeof u === 'string' && u.trim().length > 0 && (u.startsWith('https://') || u.startsWith('http://'))
    );
}

/** Keep only HTTP(S) preview URLs (maps to `cloudinary_urls` in the DB). */
export function attachmentWithCloudUrlsOnly(entry: AttachmentEntry): AttachmentEntry {
    const previews = (entry.previews ?? []).filter(
        (u) => typeof u === 'string' && (u.startsWith('https://') || u.startsWith('http://'))
    );
    return { ...entry, previews };
}

function normalizeComparableUploadUrl(p: string): string {
    let s = p.trim().split('?')[0].trim().toLowerCase();
    s = s.replace(/^https?:\/\//, '');
    return s;
}

function allStableCloudinaryUrls(e: AttachmentEntry): string[] {
    return [
        ...new Set(
            (e.previews ?? [])
                .filter((p): p is string => typeof p === 'string' && /cloudinary/i.test(p))
                .map((p) => normalizeComparableUploadUrl(p))
        ),
    ].sort();
}

function dedupeAttachmentRows(list: AttachmentEntry[]): AttachmentEntry[] {
    const withUrls = list.filter(attachmentHasCloudinaryUrls).map(attachmentWithCloudUrlsOnly);
    const sorted = [...withUrls].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
    const seenUrl = new Set<string>();
    const out: AttachmentEntry[] = [];

    for (const e of sorted) {
        const urls = allStableCloudinaryUrls(e);
        if (urls.length === 0) continue;
        if (urls.some((u) => seenUrl.has(u))) continue;
        urls.forEach((u) => seenUrl.add(u));
        out.push(e);
    }

    return out.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
}

/**
 * Attachments list: **Supabase only** — rows must have `cloudinary_urls` in the DB.
 * Local AsyncStorage is not shown (avoids phantom entries that never synced).
 */
export async function loadAttachmentsFromDatabase(
    dateKey: string,
    date: Date,
    projectId: string,
    projectName: string
): Promise<AttachmentEntry[]> {
    const rows = await fetchAttachmentsFromSupabase(dateKey, date, projectId, projectName);
    return dedupeAttachmentRows(rows);
}
