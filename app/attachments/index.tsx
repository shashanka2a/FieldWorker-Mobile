import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';
import { getDateKey, getAttachmentsForDate, AttachmentEntry } from '@/lib/dailyReportStorage';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
};

export default function AttachmentsScreen() {
    const { selectedDate } = useAppContext();
    const [entries, setEntries] = useState<AttachmentEntry[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const dateLabel = selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    const loadData = useCallback(async () => {
        const dateKey = getDateKey(selectedDate);
        const data = await getAttachmentsForDate(dateKey);
        setEntries(data.reverse());
    }, [selectedDate]);

    useEffect(() => { loadData(); }, [loadData]);

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
                            {entry.previews && entry.previews.length > 0 && (
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                    {entry.previews.map((uri, i) => (
                                        <Image key={i} source={{ uri }} style={styles.preview} />
                                    ))}
                                </ScrollView>
                            )}
                            <View style={styles.fileList}>
                                {entry.fileNames.map((name, i) => (
                                    <View key={i} style={styles.fileRow}>
                                        <Ionicons name="document-outline" size={14} color={COLORS.subtitle} />
                                        <Text style={styles.fileName} numberOfLines={1}>{name}</Text>
                                    </View>
                                ))}
                            </View>
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

