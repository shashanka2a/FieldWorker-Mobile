import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    Image,
    StyleSheet,
    Modal,
    Pressable,
    Dimensions,
    RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import AsyncStorage from '@react-native-async-storage/async-storage';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
};

const { width } = Dimensions.get('window');
const THUMB_SIZE = (width - 48 - 8) / 3;

interface GalleryPhoto {
    uri: string;
    source: string;
    dateKey?: string;
}

async function getAllPhotos(): Promise<GalleryPhoto[]> {
    const photos: GalleryPhoto[] = [];
    try {
        const keys = await AsyncStorage.getAllKeys();
        const filtered = keys.filter(
            (k) => k.startsWith('notes_') || k.startsWith('metrics_') || k.startsWith('chemicals_') || k.startsWith('equipment_') || k.startsWith('attachments_')
        );
        const values = await AsyncStorage.multiGet(filtered);
        for (const [key, value] of values) {
            if (!value) continue;
            try {
                const data = JSON.parse(value);
                const items = Array.isArray(data) ? data : [data];
                for (const item of items) {
                    const uris: string[] = item?.photos ?? item?.previews ?? [];
                    for (const uri of uris) {
                        if (uri) photos.push({ uri, source: key.split('_')[0], dateKey: key });
                    }
                }
            } catch { }
        }
    } catch { }
    return photos;
}

export default function GalleryScreen() {
    const insets = useSafeAreaInsets();
    const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
    const [selected, setSelected] = useState<GalleryPhoto | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const loadPhotos = useCallback(async () => {
        const data = await getAllPhotos();
        setPhotos(data);
    }, []);

    useEffect(() => { loadPhotos(); }, [loadPhotos]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadPhotos();
        setRefreshing(false);
    };

    const SOURCE_LABELS: Record<string, string> = {
        notes: 'Notes',
        metrics: 'Metrics',
        chemicals: 'Chemicals',
        equipment: 'Equipment',
        attachments: 'Attachments',
    };

    return (
        <View style={[styles.container, { paddingTop: 0 }]}>
            <ScreenHeader title="Gallery" subtitle={`${photos.length} photos`} />
            <FlatList
                data={photos}
                numColumns={3}
                keyExtractor={(_, i) => i.toString()}
                contentContainerStyle={styles.grid}
                columnWrapperStyle={styles.row}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Ionicons name="images-outline" size={56} color={COLORS.subtitle} />
                        <Text style={styles.emptyTitle}>No Photos Yet</Text>
                        <Text style={styles.emptySubtitle}>Photos you capture while logging will appear here.</Text>
                    </View>
                }
                renderItem={({ item }) => (
                    <TouchableOpacity onPress={() => setSelected(item)} activeOpacity={0.85}>
                        <Image source={{ uri: item.uri }} style={styles.thumb} />
                        <View style={styles.sourceBadge}>
                            <Text style={styles.sourceText}>{SOURCE_LABELS[item.source] ?? item.source}</Text>
                        </View>
                    </TouchableOpacity>
                )}
            />

            {/* Lightbox */}
            <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
                <View style={styles.lightbox}>
                    <Pressable style={styles.lightboxBackdrop} onPress={() => setSelected(null)} />
                    {selected && (
                        <View style={styles.lightboxContent}>
                            <Image source={{ uri: selected.uri }} style={styles.lightboxImage} resizeMode="contain" />
                            <TouchableOpacity style={styles.lightboxClose} onPress={() => setSelected(null)}>
                                <Ionicons name="close-circle" size={32} color="#fff" />
                            </TouchableOpacity>
                            <View style={styles.lightboxMeta}>
                                <Text style={styles.lightboxSource}>{SOURCE_LABELS[selected.source] ?? selected.source}</Text>
                            </View>
                        </View>
                    )}
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    grid: { padding: 16, paddingBottom: 40 },
    row: { gap: 4, marginBottom: 4 },
    thumb: { width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: 8, position: 'relative' },
    sourceBadge: { position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
    sourceText: { color: '#fff', fontSize: 9, fontWeight: '600' },
    emptyState: { alignItems: 'center', paddingTop: 80, gap: 12, paddingHorizontal: 32 },
    emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
    emptySubtitle: { color: COLORS.subtitle, fontSize: 14, textAlign: 'center' },
    lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
    lightboxBackdrop: { ...StyleSheet.absoluteFillObject },
    lightboxContent: { width: '100%', height: '80%', alignItems: 'center', justifyContent: 'center' },
    lightboxImage: { width: '100%', height: '100%' },
    lightboxClose: { position: 'absolute', top: 16, right: 16 },
    lightboxMeta: { position: 'absolute', bottom: 16 },
    lightboxSource: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
});
