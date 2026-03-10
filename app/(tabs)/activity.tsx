import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    white: '#FFFFFF',
    blue: '#0A84FF',
    success: '#30D158',
    warning: '#FFD60A',
    danger: '#FF453A',
    amber: '#FF9F0A',
};

type FilterType = 'all' | 'today' | 'week';

interface ActivityItem {
    id: string;
    type: 'notes' | 'chemicals' | 'metrics' | 'survey' | 'equipment' | 'attachments' | 'report';
    title: string;
    subtitle: string;
    timestamp: string;
    icon: string;
    color: string;
}

const ACTIVITY_ICON_MAP: Record<string, { icon: string; color: string }> = {
    notes: { icon: 'document-text', color: COLORS.blue },
    chemicals: { icon: 'flask', color: COLORS.amber },
    metrics: { icon: 'speedometer', color: COLORS.success },
    survey: { icon: 'clipboard', color: COLORS.brand },
    equipment: { icon: 'construct', color: COLORS.amber },
    attachments: { icon: 'camera', color: COLORS.blue },
    report: { icon: 'bar-chart', color: COLORS.success },
};

export default function ActivityScreen() {
    const [filter, setFilter] = useState<FilterType>('all');
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const loadActivities = useCallback(async () => {
        // Future implementation: aggregate all submission types from AsyncStorage
        // For now, show empty state with a helpful message
        setActivities([]);
    }, []);

    useEffect(() => {
        loadActivities();
    }, [loadActivities]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadActivities();
        setRefreshing(false);
    };

    const FILTERS: { key: FilterType; label: string }[] = [
        { key: 'all', label: 'All' },
        { key: 'today', label: 'Today' },
        { key: 'week', label: 'This Week' },
    ];

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title}>Activity</Text>
            </View>

            {/* Filter Tabs */}
            <View style={styles.filterRow}>
                {FILTERS.map((f) => (
                    <TouchableOpacity
                        key={f.key}
                        style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
                        onPress={() => setFilter(f.key)}
                    >
                        <Text style={[styles.filterLabel, filter === f.key && styles.filterLabelActive]}>
                            {f.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor={COLORS.brand}
                    />
                }
            >
                {activities.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIcon}>
                            <Ionicons name="time-outline" size={48} color={COLORS.subtitle} />
                        </View>
                        <Text style={styles.emptyTitle}>No Activity Yet</Text>
                        <Text style={styles.emptySubtitle}>
                            Start logging your field work — notes, chemicals, metrics, and more will appear here.
                        </Text>
                    </View>
                ) : (
                    activities.map((item) => {
                        const meta = ACTIVITY_ICON_MAP[item.type] ?? ACTIVITY_ICON_MAP.notes;
                        return (
                            <View key={item.id} style={styles.activityCard}>
                                <View style={[styles.activityIcon, { backgroundColor: meta.color + '20' }]}>
                                    <Ionicons name={meta.icon as any} size={22} color={meta.color} />
                                </View>
                                <View style={styles.activityContent}>
                                    <Text style={styles.activityTitle}>{item.title}</Text>
                                    <Text style={styles.activitySubtitle}>{item.subtitle}</Text>
                                </View>
                                <Text style={styles.activityTime}>{item.timestamp}</Text>
                            </View>
                        );
                    })
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#1C1C1E' },
    header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
    title: { color: '#fff', fontSize: 28, fontWeight: '700' },

    filterRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        marginBottom: 12,
        backgroundColor: COLORS.card,
        marginHorizontal: 16,
        borderRadius: 12,
        padding: 4,
    },
    filterTab: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 10,
    },
    filterTabActive: { backgroundColor: COLORS.brand },
    filterLabel: { color: COLORS.subtitle, fontSize: 13, fontWeight: '600' },
    filterLabelActive: { color: '#fff' },

    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 100 },

    emptyState: { flex: 1, alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
    emptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: COLORS.card,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
    emptySubtitle: { color: COLORS.subtitle, fontSize: 14, textAlign: 'center', lineHeight: 22 },

    activityCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.card,
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
        gap: 12,
    },
    activityIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    activityContent: { flex: 1 },
    activityTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
    activitySubtitle: { color: COLORS.subtitle, fontSize: 12, marginTop: 2 },
    activityTime: { color: COLORS.subtitle, fontSize: 11 },
});
