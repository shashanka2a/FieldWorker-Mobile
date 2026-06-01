import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    SectionList,
    TouchableOpacity,
    Image,
    StyleSheet,
    Modal,
    Pressable,
    Dimensions,
    RefreshControl,
    TextInput,
    ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { getDateKey, parseDateKeyLocal } from '@/lib/dailyReportStorage';

const COLORS = {
    brand: '#FF6633',
    bg: '#000000',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    card2: '#3A3A3C',
    border: '#3A3A3C',
    subtitle: '#8E8E93',
    muted: '#636366',
    white: '#FFFFFF',
};

const FAVORITES_KEY = 'fw_gallery_favorites';
const GRID_COLS = 4;
const H_PAD = 16;
const GAP = 3;
const { width: SCREEN_W } = Dimensions.get('window');
const THUMB_SIZE = (SCREEN_W - H_PAD * 2 - GAP * (GRID_COLS - 1)) / GRID_COLS;

const SOURCE_LABELS: Record<string, string> = {
    notes: 'Notes',
    metrics: 'Metrics',
    chemicals: 'Chemicals',
    equipment: 'Equipment',
    attachments: 'Attachments',
    observations: 'Observations',
    incidents: 'Incidents',
    material: 'Material',
};

const ALL_SOURCES = Object.keys(SOURCE_LABELS);

export interface GalleryPhoto {
    id: string;
    uri: string;
    source: string;
    dateKey: string;
    sortTime: number;
}

type GridRow = { key: string; photos: GalleryPhoto[] };

type GallerySection = {
    title: string;
    dateKey: string;
    data: GridRow[];
};

function dateKeyFromStorageKey(key: string): string | undefined {
    const m = key.match(
        /^(?:notes|chemicals|metrics|equipment|attachments|observations|incidents|material)_(.+)$/
    );
    if (!m) return undefined;
    const suffix = m[1];
    return /^\d{4}-\d{2}-\d{2}$/.test(suffix) ? suffix : undefined;
}

function formatSectionTitle(dateKey: string): string {
    if (dateKey === 'unknown') return 'Other';
    try {
        const today = getDateKey(new Date());
        const y = new Date();
        y.setDate(y.getDate() - 1);
        const yesterday = getDateKey(y);
        if (dateKey === today) return 'Today';
        if (dateKey === yesterday) return 'Yesterday';
        return parseDateKeyLocal(dateKey).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return dateKey;
    }
}

function chunkPhotos<T>(items: T[], size: number): T[][] {
    const rows: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        rows.push(items.slice(i, i + size));
    }
    return rows;
}

async function loadFavorites(): Promise<Set<string>> {
    try {
        const raw = await AsyncStorage.getItem(FAVORITES_KEY);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr.filter((u) => typeof u === 'string') : []);
    } catch {
        return new Set();
    }
}

async function saveFavorites(uris: Set<string>): Promise<void> {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify([...uris]));
}

async function getAllPhotos(): Promise<GalleryPhoto[]> {
    const photos: GalleryPhoto[] = [];
    const seen = new Set<string>();
    try {
        const keys = await AsyncStorage.getAllKeys();
        const filtered = keys.filter((k) =>
            /^(notes|chemicals|metrics|equipment|attachments|observations|incidents|material)_/.test(k)
        );
        const values = await AsyncStorage.multiGet(filtered);
        for (const [key, value] of values) {
            if (!value) continue;
            const dateKey = dateKeyFromStorageKey(key) ?? 'unknown';
            const source = key.split('_')[0] ?? 'unknown';
            let baseTime = Number.NaN;
            if (dateKey !== 'unknown') {
                baseTime = parseDateKeyLocal(dateKey).getTime();
            }
            try {
                const data = JSON.parse(value);
                const items = Array.isArray(data) ? data : [data];
                for (const item of items) {
                    const uris: string[] = [
                        ...(item?.photos ?? []),
                        ...(item?.previews ?? []),
                        ...(item?.resolutionPhotos ?? []),
                    ];
                    const entryTime = item?.timestamp ? new Date(item.timestamp).getTime() : baseTime;
                    const sortTime = Number.isNaN(entryTime) ? Date.now() : entryTime;
                    for (const uri of uris) {
                        if (!uri || seen.has(uri)) continue;
                        seen.add(uri);
                        photos.push({
                            id: `${key}:${uri}`,
                            uri,
                            source,
                            dateKey,
                            sortTime,
                        });
                    }
                }
            } catch {
                /* skip malformed bucket */
            }
        }
    } catch {
        /* best-effort */
    }
    photos.sort((a, b) => b.sortTime - a.sortTime);
    return photos;
}

export default function GalleryScreen() {
    const insets = useSafeAreaInsets();
    const { uri: uriParam } = useLocalSearchParams<{ uri?: string }>();

    const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
    const [favorites, setFavorites] = useState<Set<string>>(new Set());
    const [selected, setSelected] = useState<GalleryPhoto | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState<'all' | 'favorites'>('all');
    const [showFilter, setShowFilter] = useState(false);
    const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set(ALL_SOURCES));

    const loadPhotos = useCallback(async () => {
        const [data, fav] = await Promise.all([getAllPhotos(), loadFavorites()]);
        setPhotos(data);
        setFavorites(fav);
    }, []);

    useEffect(() => {
        void loadPhotos();
    }, [loadPhotos]);

    useEffect(() => {
        if (!uriParam || photos.length === 0) return;
        const match = photos.find((p) => p.uri === uriParam);
        if (match) setSelected(match);
    }, [photos, uriParam]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadPhotos();
        setRefreshing(false);
    };

    const toggleFavorite = useCallback(async (uri: string) => {
        setFavorites((prev) => {
            const next = new Set(prev);
            if (next.has(uri)) next.delete(uri);
            else next.add(uri);
            void saveFavorites(next);
            return next;
        });
    }, []);

    const filteredPhotos = useMemo(() => {
        const q = search.trim().toLowerCase();
        return photos.filter((p) => {
            if (tab === 'favorites' && !favorites.has(p.uri)) return false;
            if (sourceFilter.size > 0 && !sourceFilter.has(p.source)) return false;
            if (!q) return true;
            const label = SOURCE_LABELS[p.source] ?? p.source;
            const dateLabel = formatSectionTitle(p.dateKey).toLowerCase();
            return (
                label.toLowerCase().includes(q) ||
                p.dateKey.includes(q) ||
                dateLabel.includes(q) ||
                p.uri.toLowerCase().includes(q)
            );
        });
    }, [photos, tab, favorites, sourceFilter, search]);

    const sections: GallerySection[] = useMemo(() => {
        const byDate = new Map<string, GalleryPhoto[]>();
        for (const p of filteredPhotos) {
            const list = byDate.get(p.dateKey) ?? [];
            list.push(p);
            byDate.set(p.dateKey, list);
        }
        return Array.from(byDate.entries())
            .sort(([a], [b]) => {
                if (a === 'unknown') return 1;
                if (b === 'unknown') return -1;
                return b.localeCompare(a);
            })
            .map(([dateKey, items]) => {
                const sorted = [...items].sort((a, b) => b.sortTime - a.sortTime);
                return {
                    title: formatSectionTitle(dateKey),
                    dateKey,
                    data: chunkPhotos(sorted, GRID_COLS).map((row, i) => ({
                        key: `${dateKey}-row-${i}`,
                        photos: row,
                    })),
                };
            });
    }, [filteredPhotos]);

    const totalShown = filteredPhotos.length;
    const filterActive = sourceFilter.size < ALL_SOURCES.length;

    const ensureLocalFileForShare = useCallback(async (uri: string) => {
        if (uri.startsWith('file://')) return uri;
        if (!uri.startsWith('http')) return uri;
        const ext = uri.toLowerCase().includes('.png') ? 'png' : 'jpg';
        const dest = `${FileSystem.cacheDirectory}fw_gallery_${Date.now()}.${ext}`;
        const result = await FileSystem.downloadAsync(uri, dest);
        return result.uri;
    }, []);

    const handleShareSelected = useCallback(async () => {
        if (!selected) return;
        try {
            if (!(await Sharing.isAvailableAsync())) return;
            const localUri = await ensureLocalFileForShare(selected.uri);
            await Sharing.shareAsync(localUri);
        } catch {
            /* best-effort */
        }
    }, [ensureLocalFileForShare, selected]);

    const renderGridRow = ({ item }: { item: GridRow }) => (
        <View style={styles.gridRow}>
            {item.photos.map((photo) => (
                <TouchableOpacity
                    key={photo.id}
                    onPress={() => setSelected(photo)}
                    onLongPress={() => void toggleFavorite(photo.uri)}
                    activeOpacity={0.88}
                    style={styles.thumbWrap}
                >
                    <Image source={{ uri: photo.uri }} style={styles.thumb} />
                    {favorites.has(photo.uri) ? (
                        <View style={styles.favDot}>
                            <Ionicons name="heart" size={10} color="#fff" />
                        </View>
                    ) : null}
                </TouchableOpacity>
            ))}
            {item.photos.length < GRID_COLS
                ? Array.from({ length: GRID_COLS - item.photos.length }).map((_, i) => (
                      <View key={`pad-${i}`} style={styles.thumbPad} />
                  ))
                : null}
        </View>
    );

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backBtn}
                    onPress={() => router.back()}
                    hitSlop={12}
                    accessibilityLabel="Go back"
                >
                    <Ionicons name="chevron-back" size={22} color={COLORS.white} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Gallery</Text>
                <View style={styles.headerSpacer} />
            </View>

            {/* Search + filter */}
            <View style={styles.searchRow}>
                <View style={styles.searchBox}>
                    <Ionicons name="search" size={18} color={COLORS.subtitle} />
                    <TextInput
                        style={styles.searchInput}
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Search"
                        placeholderTextColor={COLORS.muted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        clearButtonMode="while-editing"
                    />
                </View>
                <TouchableOpacity
                    style={[styles.filterBtn, filterActive && styles.filterBtnActive]}
                    onPress={() => setShowFilter(true)}
                    accessibilityLabel="Filter by source"
                >
                    <Ionicons
                        name="options-outline"
                        size={22}
                        color={filterActive ? COLORS.brand : COLORS.white}
                    />
                </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={styles.tabBar}>
                <TouchableOpacity
                    style={[styles.tab, tab === 'all' && styles.tabActive]}
                    onPress={() => setTab('all')}
                >
                    <Text style={[styles.tabText, tab === 'all' && styles.tabTextActive]}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, tab === 'favorites' && styles.tabActive]}
                    onPress={() => setTab('favorites')}
                >
                    <Text style={[styles.tabText, tab === 'favorites' && styles.tabTextActive]}>
                        Favorites{favorites.size > 0 ? ` (${favorites.size})` : ''}
                    </Text>
                </TouchableOpacity>
            </View>

            <Text style={styles.countLine}>
                {totalShown} photo{totalShown !== 1 ? 's' : ''}
                {tab === 'favorites' ? ' · saved' : ''}
            </Text>

            <SectionList
                sections={sections}
                keyExtractor={(item) => item.key}
                renderItem={renderGridRow}
                renderSectionHeader={({ section }) => (
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                        <Text style={styles.sectionCount}>
                            {section.data.reduce((n, row) => n + row.photos.length, 0)}
                        </Text>
                    </View>
                )}
                stickySectionHeadersEnabled
                contentContainerStyle={[
                    styles.listContent,
                    sections.length === 0 && styles.listContentEmpty,
                ]}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="images-outline" size={48} color={COLORS.subtitle} />
                        </View>
                        <Text style={styles.emptyTitle}>
                            {tab === 'favorites' ? 'No favorites yet' : 'No photos yet'}
                        </Text>
                        <Text style={styles.emptySubtitle}>
                            {tab === 'favorites'
                                ? 'Long-press a photo to add it to favorites.'
                                : 'Photos from notes, chemicals, equipment, and other logs appear here by date.'}
                        </Text>
                    </View>
                }
            />

            {/* Source filter sheet */}
            <Modal visible={showFilter} transparent animationType="slide" onRequestClose={() => setShowFilter(false)}>
                <Pressable style={styles.sheetBackdrop} onPress={() => setShowFilter(false)}>
                    <Pressable
                        style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
                        onPress={(e) => e.stopPropagation()}
                    >
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>Filter by source</Text>
                        <ScrollView style={styles.sheetScroll}>
                            {ALL_SOURCES.map((src) => {
                                const on = sourceFilter.has(src);
                                return (
                                    <TouchableOpacity
                                        key={src}
                                        style={[styles.sheetRow, on && styles.sheetRowOn]}
                                        onPress={() => {
                                            setSourceFilter((prev) => {
                                                const next = new Set(prev);
                                                if (next.has(src)) next.delete(src);
                                                else next.add(src);
                                                return next;
                                            });
                                        }}
                                    >
                                        <Text style={styles.sheetRowText}>{SOURCE_LABELS[src]}</Text>
                                        {on ? (
                                            <Ionicons name="checkmark-circle" size={22} color={COLORS.brand} />
                                        ) : (
                                            <Ionicons name="ellipse-outline" size={22} color={COLORS.muted} />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                        <TouchableOpacity
                            style={styles.sheetPrimary}
                            onPress={() => {
                                setSourceFilter(new Set(ALL_SOURCES));
                                setShowFilter(false);
                            }}
                        >
                            <Text style={styles.sheetPrimaryText}>Show all sources</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.sheetDone} onPress={() => setShowFilter(false)}>
                            <Text style={styles.sheetDoneText}>Done</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Lightbox */}
            <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
                <View style={styles.lightbox}>
                    <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} />
                    {selected ? (
                        <View style={styles.lightboxContent}>
                            <Image source={{ uri: selected.uri }} style={styles.lightboxImage} resizeMode="contain" />
                            <TouchableOpacity
                                style={[styles.lightboxBtn, { top: insets.top + 8 }]}
                                onPress={() => setSelected(null)}
                            >
                                <Ionicons name="close" size={26} color="#fff" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.lightboxBtn, { top: insets.top + 8, left: 56 }]}
                                onPress={() => void toggleFavorite(selected.uri)}
                            >
                                <Ionicons
                                    name={favorites.has(selected.uri) ? 'heart' : 'heart-outline'}
                                    size={26}
                                    color={favorites.has(selected.uri) ? COLORS.brand : '#fff'}
                                />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.lightboxBtn, { top: insets.top + 8, left: 104 }]}
                                onPress={() => void handleShareSelected()}
                            >
                                <Ionicons name="share-outline" size={24} color="#fff" />
                            </TouchableOpacity>
                            <View style={[styles.lightboxMeta, { paddingBottom: insets.bottom + 16 }]}>
                                <Text style={styles.lightboxSource}>
                                    {SOURCE_LABELS[selected.source] ?? selected.source}
                                </Text>
                                <Text style={styles.lightboxDate}>
                                    {formatSectionTitle(selected.dateKey)}
                                    {selected.dateKey !== 'unknown' ? ` · ${selected.dateKey}` : ''}
                                </Text>
                            </View>
                        </View>
                    ) : null}
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: H_PAD,
        paddingBottom: 8,
    },
    backBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: COLORS.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        color: COLORS.white,
        fontSize: 17,
        fontWeight: '600',
    },
    headerSpacer: { width: 36 },
    searchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: H_PAD,
        gap: 10,
        marginBottom: 12,
    },
    searchBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 44,
    },
    searchInput: { flex: 1, color: COLORS.white, fontSize: 16, paddingVertical: 0 },
    filterBtn: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: COLORS.surface,
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterBtnActive: { backgroundColor: COLORS.brand + '22', borderWidth: 1, borderColor: COLORS.brand },
    tabBar: {
        flexDirection: 'row',
        marginHorizontal: H_PAD,
        backgroundColor: COLORS.surface,
        borderRadius: 10,
        padding: 3,
        marginBottom: 8,
    },
    tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
    tabActive: { backgroundColor: COLORS.card2 },
    tabText: { color: COLORS.subtitle, fontSize: 14, fontWeight: '600' },
    tabTextActive: { color: COLORS.white },
    countLine: {
        color: COLORS.muted,
        fontSize: 12,
        paddingHorizontal: H_PAD,
        marginBottom: 4,
    },
    listContent: { paddingBottom: 48 },
    listContentEmpty: { flexGrow: 1 },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        paddingHorizontal: H_PAD,
        paddingTop: 18,
        paddingBottom: 10,
        backgroundColor: COLORS.bg,
    },
    sectionTitle: { color: COLORS.white, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
    sectionCount: { color: COLORS.muted, fontSize: 14, fontWeight: '500' },
    gridRow: {
        flexDirection: 'row',
        paddingHorizontal: H_PAD,
        gap: GAP,
        marginBottom: GAP,
    },
    thumbWrap: { width: THUMB_SIZE, height: THUMB_SIZE },
    thumb: { width: THUMB_SIZE, height: THUMB_SIZE, backgroundColor: COLORS.surface },
    thumbPad: { width: THUMB_SIZE, height: THUMB_SIZE },
    favDot: {
        position: 'absolute',
        top: 4,
        right: 4,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: 'rgba(0,0,0,0.55)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyState: { alignItems: 'center', paddingTop: 64, paddingHorizontal: 36, gap: 12 },
    emptyIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: COLORS.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    emptyTitle: { color: COLORS.white, fontSize: 18, fontWeight: '700' },
    emptySubtitle: { color: COLORS.subtitle, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: COLORS.card,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 16,
        paddingTop: 10,
        maxHeight: '70%',
    },
    sheetHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: COLORS.border,
        alignSelf: 'center',
        marginBottom: 14,
    },
    sheetTitle: { color: COLORS.white, fontSize: 17, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
    sheetScroll: { maxHeight: 320 },
    sheetRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: COLORS.border,
    },
    sheetRowOn: {},
    sheetRowText: { color: COLORS.white, fontSize: 16 },
    sheetPrimary: {
        marginTop: 12,
        paddingVertical: 14,
        alignItems: 'center',
        borderRadius: 12,
        backgroundColor: COLORS.surface,
    },
    sheetPrimaryText: { color: COLORS.brand, fontSize: 15, fontWeight: '600' },
    sheetDone: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
    sheetDoneText: { color: COLORS.subtitle, fontSize: 16, fontWeight: '600' },
    lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
    lightboxContent: { flex: 1, justifyContent: 'center' },
    lightboxImage: { width: '100%', height: '78%' },
    lightboxBtn: {
        position: 'absolute',
        left: 16,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    lightboxMeta: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        alignItems: 'center',
        gap: 4,
    },
    lightboxSource: { color: COLORS.white, fontSize: 15, fontWeight: '600' },
    lightboxDate: { color: COLORS.subtitle, fontSize: 13 },
});
