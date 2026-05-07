import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    Image,
    Modal,
    Dimensions,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';
import { getDateKey, getAttachmentsForDate, AttachmentEntry } from '@/lib/dailyReportStorage';
import { fetchAttachmentsFromSupabase } from '@/lib/supabaseSync';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
};

const WIN = Dimensions.get('window');

function normalizeProjectName(name: string | undefined): string {
    return (name ?? '').trim().toLowerCase();
}

/** Exact match on filenames + notes + day (when names align across local/remote). */
function attachmentLogicalKey(e: AttachmentEntry): string {
    const dayKey = getDateKey(new Date(e.timestamp));
    const names = [...(e.fileNames ?? [])]
        .map((n) => n.trim())
        .filter(Boolean)
        .sort()
        .join('|');
    const notes = (e.notes ?? '').trim();
    return `${normalizeProjectName(e.project?.name)}\x01${dayKey}\x01${names}\x01${notes}`;
}

/** Same image often differs by http/https or casing — compare paths only. */
function normalizeComparableUploadUrl(p: string): string {
    let s = p.trim().split('?')[0].trim().toLowerCase();
    s = s.replace(/^https?:\/\//, '');
    return s;
}

/**
 * 4-hour block within the local calendar day — aligns local `timestamp` vs Supabase `logged_at` even when
 * they skew by an hour or more.
 */
function attachmentSlotKey(e: AttachmentEntry): string {
    const d = new Date(e.timestamp);
    const dayKey = getDateKey(d);
    const minutesFromMidnight = d.getHours() * 60 + d.getMinutes();
    const block = Math.floor(minutesFromMidnight / 240);
    const count = Math.max((e.fileNames ?? []).length, (e.previews ?? []).length, 1);
    const notes = (e.notes ?? '').trim();
    return `${normalizeProjectName(e.project?.name)}\x01${dayKey}\x01${block}\x01${count}\x01${notes}`;
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

function hasCloudinaryPreview(e: AttachmentEntry): boolean {
    return allStableCloudinaryUrls(e).length > 0;
}

/** Collapse duplicate rows in one list (e.g. repeated Cloudinary URLs from double-insert). */
function dedupeAttachmentRows(list: AttachmentEntry[]): AttachmentEntry[] {
    const sorted = [...list].sort((a, b) => {
        const ac = hasCloudinaryPreview(a) ? 1 : 0;
        const bc = hasCloudinaryPreview(b) ? 1 : 0;
        if (ac !== bc) return bc - ac;
        return +new Date(b.timestamp) - +new Date(a.timestamp);
    });
    const seenUrl = new Set<string>();
    const seenStrict = new Set<string>();
    const seenSlot = new Set<string>();
    const out: AttachmentEntry[] = [];

    for (const e of sorted) {
        const urls = allStableCloudinaryUrls(e);
        if (urls.length > 0) {
            if (urls.some((u) => seenUrl.has(u))) continue;
            urls.forEach((u) => seenUrl.add(u));
            seenSlot.add(attachmentSlotKey(e));
            seenStrict.add(attachmentLogicalKey(e));
            out.push(e);
            continue;
        }

        if (seenSlot.has(attachmentSlotKey(e))) continue;

        const strict = attachmentLogicalKey(e);
        if (seenStrict.has(strict)) continue;

        seenSlot.add(attachmentSlotKey(e));
        seenStrict.add(strict);
        out.push(e);
    }

    return out.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
}

export default function AttachmentsScreen() {
    const { selectedDate, selectedProject } = useAppContext();
    const [entries, setEntries] = useState<AttachmentEntry[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [previewUri, setPreviewUri] = useState<string | null>(null);

    const dateLabel = selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    const loadData = useCallback(async () => {
        const dateKey = getDateKey(selectedDate);
        const [localData, remoteData] = await Promise.all([
            getAttachmentsForDate(dateKey),
            fetchAttachmentsFromSupabase(
                dateKey,
                selectedDate,
                selectedProject?.id ?? '',
                selectedProject?.name ?? ''
            ),
        ]);
        const matchProject = (d: AttachmentEntry) =>
            normalizeProjectName(d.project?.name) === normalizeProjectName(selectedProject?.name);
        const localFiltered = localData.filter(matchProject);
        const remoteFiltered = remoteData.filter(matchProject);

        // Single source: no merge. Prefer Supabase when it returns anything for this day/project; else device queue only.
        const rows = remoteFiltered.length > 0 ? remoteFiltered : localFiltered;
        setEntries(dedupeAttachmentRows(rows));
    }, [selectedDate, selectedProject?.name]);

    useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    return (
        <View style={styles.container}>
            <ScreenHeader title="Attachments" subtitle={dateLabel} />
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
            >
                {entries.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="camera-outline" size={40} color={COLORS.brand} />
                        </View>
                        <Text style={styles.emptyTitle}>No Attachments</Text>
                        <Text style={styles.emptySubtitle}>Tap the button below to attach photos or files for {dateLabel}</Text>
                        <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/attachments/add')}>
                            <Ionicons name="add" size={18} color="#fff" />
                            <Text style={styles.emptyBtnText}>Add Attachment</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    entries.map((entry) => (
                        <View key={entry.id} style={styles.card}>
                            <View style={styles.cardHeader}>
                                <View style={styles.cardIconWrap}>
                                    <Ionicons name="images-outline" size={20} color={COLORS.brand} />
                                </View>
                                <View style={styles.cardInfo}>
                                    <Text style={styles.cardTitle}>{entry.fileNames.length} file{entry.fileNames.length !== 1 ? 's' : ''}</Text>
                                    <Text style={styles.cardTime}>{new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text>
                                </View>
                            </View>
                            {entry.notes && <Text style={styles.cardNotes}>{entry.notes}</Text>}
                            {entry.previews && entry.previews.length > 0 ? (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                    {entry.previews.map((uri, i) => (
                                        <TouchableOpacity
                                            key={`${entry.id}-${i}`}
                                            activeOpacity={0.85}
                                            onPress={() => setPreviewUri(uri)}
                                        >
                                            <Image source={{ uri }} style={styles.preview} />
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            ) : (
                                <View style={styles.fileList}>
                                    {entry.fileNames.map((name, i) => (
                                        <View key={i} style={styles.fileRow}>
                                            <Ionicons name="document-outline" size={14} color={COLORS.subtitle} />
                                            <Text style={styles.fileName} numberOfLines={1}>{name}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    ))
                )}
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => router.push('/attachments/add')}
                activeOpacity={0.85}
            >
                <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>

            <Modal visible={!!previewUri} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
                <View style={styles.lightboxBackdrop}>
                    <TouchableOpacity
                        style={styles.lightboxClose}
                        onPress={() => setPreviewUri(null)}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                        <Ionicons name="close-circle" size={36} color="#fff" />
                    </TouchableOpacity>
                    {previewUri ? (
                        <Image
                            source={{ uri: previewUri }}
                            style={styles.lightboxImage}
                            resizeMode="contain"
                        />
                    ) : null}
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 100, gap: 12 },
    emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
    emptyIconWrap: { width: 72, height: 72, borderRadius: 20, backgroundColor: COLORS.brand + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
    emptySubtitle: { color: COLORS.subtitle, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.brand, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
    emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardIconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.brand + '20', alignItems: 'center', justifyContent: 'center' },
    cardInfo: { flex: 1 },
    cardTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
    cardTime: { color: COLORS.subtitle, fontSize: 12 },
    cardNotes: { color: COLORS.subtitle, fontSize: 13, lineHeight: 18 },
    preview: { width: 80, height: 80, borderRadius: 10 },
    lightboxBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.94)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 12,
    },
    lightboxClose: {
        position: 'absolute',
        top: 52,
        right: 16,
        zIndex: 10,
    },
    lightboxImage: {
        width: WIN.width - 24,
        height: WIN.height * 0.82,
    },
    fileList: { gap: 4 },
    fileRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    fileName: { color: COLORS.subtitle, fontSize: 13, flex: 1 },
    fab: {
        position: 'absolute',
        bottom: 28,
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: COLORS.brand,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: COLORS.brand,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.45,
        shadowRadius: 12,
        elevation: 8,
    },
});

