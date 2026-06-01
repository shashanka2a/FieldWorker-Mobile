import React, { useCallback, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDateKey, EquipmentChecklistEntry } from '@/lib/dailyReportStorage';
import { loadEquipmentChecklistsForProject } from '@/lib/equipmentChecklistLoad';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
};

export default function ChecklistListScreen() {
    const { selectedDate, selectedProject } = useAppContext();
    const insets = useSafeAreaInsets();
    const [entries, setEntries] = useState<EquipmentChecklistEntry[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const dateLabel = selectedDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    });

    const loadChecklists = useCallback(async () => {
        const dateKey = getDateKey(selectedDate);
        const checklists = await loadEquipmentChecklistsForProject(
            dateKey,
            selectedDate,
            selectedProject?.id ?? '',
            selectedProject?.name ?? ''
        );
        setEntries(checklists);
    }, [selectedDate, selectedProject?.id, selectedProject?.name]);

    useFocusEffect(useCallback(() => { void loadChecklists(); }, [loadChecklists]));

    const onRefresh = async () => {
        setRefreshing(true);
        await loadChecklists();
        setRefreshing(false);
    };

    return (
        <View style={styles.container}>
            <ScreenHeader title="Equipment Checklist" subtitle={`${selectedProject.name} • ${dateLabel}`} />
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
            >
                {entries.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="construct-outline" size={40} color={COLORS.brand} />
                        </View>
                        <Text style={styles.emptyTitle}>No checklists yet</Text>
                        <Text style={styles.emptySubtitle}>
                            Use the Add checklist button below for this day and project.
                        </Text>
                    </View>
                ) : (
                    entries.map((e) => {
                        const fd = e.formData as Record<string, string>;
                        const machine = fd.machineNumber?.trim() || '—';
                        const machineType = fd.machineType?.trim();
                        const operator = fd.operatorName?.trim() || '—';
                        const photoCount = e.photos?.length ?? 0;
                        return (
                            <TouchableOpacity
                                key={e.id}
                                style={styles.card}
                                onPress={() => router.push(`/checklist/add?editId=${e.id}`)}
                                activeOpacity={0.8}
                            >
                                <View style={styles.cardTop}>
                                    <Text style={styles.cardTitle}>Machine {machine}</Text>
                                    <Text style={styles.cardTime}>
                                        {new Date(e.timestamp).toLocaleTimeString('en-US', {
                                            hour: 'numeric',
                                            minute: '2-digit',
                                        })}
                                    </Text>
                                </View>
                                <Text style={styles.cardSub}>
                                    {machineType ? `${machineType} · ` : ''}Operator: {operator}
                                </Text>
                                {photoCount > 0 ? (
                                    <View style={styles.photoRow}>
                                        <Ionicons name="image-outline" size={14} color={COLORS.subtitle} />
                                        <Text style={styles.photoText}>
                                            {photoCount} photo{photoCount !== 1 ? 's' : ''}
                                        </Text>
                                    </View>
                                ) : null}
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                <TouchableOpacity
                    style={styles.footerBtn}
                    onPress={() => router.push('/checklist/add')}
                    activeOpacity={0.85}
                >
                    <Ionicons name="add" size={22} color="#fff" />
                    <Text style={styles.footerBtnText}>
                        {entries.length > 0 ? 'Add another checklist' : 'Add checklist'}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 16, gap: 12 },
    emptyState: { alignItems: 'center', paddingTop: 72, gap: 12 },
    emptyIconWrap: {
        width: 72,
        height: 72,
        borderRadius: 20,
        backgroundColor: COLORS.brand + '18',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
    emptySubtitle: { color: COLORS.subtitle, fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    card: {
        backgroundColor: COLORS.card,
        borderRadius: 16,
        padding: 14,
        gap: 6,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    cardTitle: { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 },
    cardTime: { color: COLORS.subtitle, fontSize: 12 },
    cardSub: { color: COLORS.subtitle, fontSize: 14, lineHeight: 20 },
    photoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    photoText: { color: COLORS.subtitle, fontSize: 12 },
    footer: {
        paddingHorizontal: 16,
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: COLORS.border,
        backgroundColor: COLORS.surface,
    },
    footerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: COLORS.brand,
        borderRadius: 14,
        paddingVertical: 14,
        shadowColor: COLORS.brand,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 4,
    },
    footerBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
