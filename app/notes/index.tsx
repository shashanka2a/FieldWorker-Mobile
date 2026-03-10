import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';
import { getDateKey, getNotesForDate, NoteEntry } from '@/lib/dailyReportStorage';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    blue: '#0A84FF',
};

const CATEGORY_COLORS: Record<string, string> = {
    General: COLORS.blue,
    Safety: '#30D158',
    Equipment: '#FF9F0A',
    Weather: '#64D2FF',
    Incident: '#FF453A',
};

export default function NotesListScreen() {
    const { selectedDate } = useAppContext();
    const [notes, setNotes] = useState<NoteEntry[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const loadNotes = useCallback(async () => {
        const dateKey = getDateKey(selectedDate);
        const data = await getNotesForDate(dateKey);
        setNotes(data.reverse()); // newest first
    }, [selectedDate]);

    useFocusEffect(useCallback(() => { loadNotes(); }, [loadNotes]));

    const onRefresh = async () => {
        setRefreshing(true);
        await loadNotes();
        setRefreshing(false);
    };

    const dateLabel = selectedDate.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
    });

    return (
        <View style={styles.container}>
            <ScreenHeader title="Notes" subtitle={dateLabel} />
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
            >
                {notes.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="create-outline" size={40} color={COLORS.brand} />
                        </View>
                        <Text style={styles.emptyTitle}>No Notes Yet</Text>
                        <Text style={styles.emptySubtitle}>Tap the button below to add your first note for {dateLabel}</Text>
                        <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/notes/add')}>
                            <Ionicons name="add" size={18} color="#fff" />
                            <Text style={styles.emptyBtnText}>Add Note</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    notes.map((note) => {
                        const categoryColor = CATEGORY_COLORS[note.category] ?? COLORS.brand;
                        return (
                            <TouchableOpacity
                                key={note.id}
                                style={styles.noteCard}
                                onPress={() => router.push(`/notes/add?editId=${note.id}`)}
                                activeOpacity={0.8}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <View style={[styles.categoryBadge, { backgroundColor: categoryColor + '20' }]}>
                                        <Text style={[styles.categoryText, { color: categoryColor }]}>{note.category}</Text>
                                    </View>
                                    <Text style={styles.noteTime}>
                                        {new Date(note.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                    </Text>
                                </View>
                                <Text style={styles.noteText} numberOfLines={3}>{note.notes}</Text>
                                {note.photos && note.photos.length > 0 && (
                                    <View style={styles.photoCount}>
                                        <Ionicons name="image-outline" size={12} color={COLORS.subtitle} />
                                        <Text style={styles.photoCountText}>{note.photos.length} photo{note.photos.length !== 1 ? 's' : ''}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => router.push('/notes/add')}
                activeOpacity={0.85}
            >
                <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scrollView: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 100, gap: 12 },
    emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
    emptyIconWrap: { width: 72, height: 72, borderRadius: 20, backgroundColor: COLORS.brand + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
    emptySubtitle: { color: COLORS.subtitle, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.brand, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12, marginTop: 8 },
    emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    noteCard: {
        backgroundColor: COLORS.card,
        borderRadius: 16,
        padding: 14,
        gap: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    categoryBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    categoryText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    noteText: { color: '#fff', fontSize: 15, lineHeight: 22 },
    noteTime: { color: COLORS.subtitle, fontSize: 12 },
    photoCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    photoCountText: { color: COLORS.subtitle, fontSize: 12 },
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

