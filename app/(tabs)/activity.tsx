import React, { useState, useCallback } from 'react';
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
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useAppContext } from '@/context/AppContext';
import { fetchActivityFeedFromAuditLog, type AuditActivityFeedRow, dailySignedReportRowLooksSigned } from '@/lib/supabaseSync';

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

export type ActivityFeedType =
    | 'notes'
    | 'chemicals'
    | 'metrics'
    | 'survey'
    | 'equipment'
    | 'attachments'
    | 'report'
    | 'observations'
    | 'incidents'
    | 'safety_talks';

interface ActivityItem {
    id: string;
    type: ActivityFeedType;
    title: string;
    subtitle: string;
    timestamp: string;
    timestampDate: Date;
}

const ACTIVITY_ICON_MAP: Record<ActivityFeedType, { icon: string; color: string }> = {
    notes: { icon: 'document-text', color: COLORS.blue },
    chemicals: { icon: 'flask', color: COLORS.amber },
    metrics: { icon: 'speedometer', color: COLORS.success },
    survey: { icon: 'clipboard', color: COLORS.brand },
    equipment: { icon: 'construct', color: COLORS.amber },
    attachments: { icon: 'camera', color: COLORS.blue },
    report: { icon: 'bar-chart', color: COLORS.success },
    observations: { icon: 'eye', color: COLORS.brand },
    incidents: { icon: 'warning', color: COLORS.danger },
    safety_talks: { icon: 'shield-checkmark', color: COLORS.success },
};

function snapshotOf(row: AuditActivityFeedRow): Record<string, unknown> {
    const d = row.details;
    if (!d || typeof d !== 'object') return {};
    const snap = (d as Record<string, unknown>).snapshot;
    if (!snap || typeof snap !== 'object') return {};
    return snap as Record<string, unknown>;
}

function str(v: unknown, max = 120): string {
    if (typeof v !== 'string') return '';
    const t = v.trim();
    if (t.length <= max) return t;
    return `${t.slice(0, max)}…`;
}

function entityTypeToFeedType(entityType: string | null): ActivityFeedType {
    switch (entityType) {
        case 'notes':
            return 'notes';
        case 'chemicals_logs':
            return 'chemicals';
        case 'metrics':
            return 'metrics';
        case 'surveys':
            return 'survey';
        case 'equipment_logs':
        case 'equipment_checklists':
            return 'equipment';
        case 'attachments':
            return 'attachments';
        case 'observations':
            return 'observations';
        case 'incidents':
            return 'incidents';
        case 'daily_signed_reports':
            return 'report';
        case 'safety_talks':
            return 'safety_talks';
        default:
            return 'notes';
    }
}

function auditRowToActivityItem(row: AuditActivityFeedRow): ActivityItem {
    const snap = snapshotOf(row);
    const entity = row.entity_type ?? '';
    const type = entityTypeToFeedType(entity);
    const d = new Date(row.created_at);
    const rd = row.report_date ? ` · ${row.report_date}` : '';

    let title = 'Activity';
    let subtitle =
        typeof (row.details as Record<string, unknown>)?.sync_action === 'string'
            ? String((row.details as Record<string, unknown>).sync_action).replace(/\./g, ' ')
            : row.action.replace(/\./g, ' ');

    if (entity === 'notes') {
        title = 'Note saved';
        subtitle = str(snap.notes_text, 100) || `Notes${rd}`;
    } else if (entity === 'chemicals_logs') {
        title = 'Chemical log';
        const apps = (row.details as Record<string, unknown>)?.related as Record<string, unknown> | undefined;
        const list = apps?.chemical_applications;
        const n = Array.isArray(list) ? list.length : 0;
        subtitle = n > 0 ? `${n} application(s)${rd}` : `Application log${rd}`;
    } else if (entity === 'metrics') {
        title = 'Metrics saved';
        const parts: string[] = [];
        if (snap.water_usage != null) parts.push(`Water ${snap.water_usage}`);
        if (snap.acres_completed != null) parts.push(`Acres ${snap.acres_completed}`);
        subtitle = parts.join(' · ') || `Daily metrics${rd}`;
    } else if (entity === 'surveys') {
        title = 'Site survey';
        const rel = (row.details as Record<string, unknown>)?.related as Record<string, unknown> | undefined;
        const qs = rel?.survey_questions;
        const n = Array.isArray(qs) ? qs.length : 0;
        subtitle = n > 0 ? `${n} questions${rd}` : `Survey${rd}`;
    } else if (entity === 'equipment_logs') {
        title = 'Equipment log';
        subtitle = str(snap.value, 40) || `Equipment${rd}`;
    } else if (entity === 'equipment_checklists') {
        title = 'Equipment checklist';
        const fd = snap.form_data as Record<string, string> | undefined;
        const machineLabel = [fd?.machineType, fd?.machineNumber].filter(Boolean).join(' · ');
        subtitle = machineLabel || fd?.siteName || `Checklist${rd}`;
    } else if (entity === 'attachments') {
        title = 'Attachments';
        const names = snap.file_names;
        const n = Array.isArray(names) ? names.length : 0;
        subtitle = n > 0 ? `${n} file(s)${rd}` : `Upload${rd}`;
    } else if (entity === 'observations') {
        title = `${snap.category ?? 'Observation'}`;
        subtitle = str(snap.type, 80) || str(snap.description, 80) || `Observation${rd}`;
    } else if (entity === 'incidents') {
        title = 'Incident';
        subtitle = str(snap.title, 100) || `Incident${rd}`;
    } else if (entity === 'daily_signed_reports') {
        title = dailySignedReportRowLooksSigned(snap as { signature_url?: string | null; is_signed?: boolean | null })
            ? 'Daily report signed'
            : 'Daily report updated';
        subtitle = str(snap.prepared_by, 60) ? `${str(snap.prepared_by, 60)}${rd}` : `Report${rd}`;
    } else if (entity === 'safety_talks') {
        title = 'Safety talk';
        subtitle = str(snap.template_name, 80) || `Safety${rd}`;
    }

    return {
        id: row.id,
        type,
        title,
        subtitle,
        timestamp: `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        timestampDate: d,
    };
}

const NO_PROJECT = 'No Project Selected';

export default function ActivityScreen() {
    const { session } = useAuth();
    const { selectedProject } = useAppContext();
    const [filter, setFilter] = useState<FilterType>('all');
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const loadActivities = useCallback(async () => {
        const uid = session?.user?.id;
        if (!uid) {
            setActivities([]);
            return;
        }
        const projectName = selectedProject?.name?.trim() ?? '';
        if (!projectName || projectName === NO_PROJECT) {
            setActivities([]);
            return;
        }
        try {
            const rows = await fetchActivityFeedFromAuditLog(uid, selectedProject.id, projectName, {
                limit: 300,
            });
            const allItems = rows.map(auditRowToActivityItem);
            allItems.sort((a, b) => b.timestampDate.getTime() - a.timestampDate.getTime());

            let filtered = allItems;
            if (filter === 'today') {
                const today = new Date();
                filtered = allItems.filter((a) => a.timestampDate.toDateString() === today.toDateString());
            } else if (filter === 'week') {
                const now = new Date();
                const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
                filtered = allItems.filter((a) => a.timestampDate >= weekAgo);
            }

            setActivities(filtered);
        } catch (e) {
            console.error('Error loading activities:', e);
            setActivities([]);
        }
    }, [filter, session?.user?.id, selectedProject?.id, selectedProject?.name]);

    useFocusEffect(
        useCallback(() => {
            loadActivities();
        }, [loadActivities])
    );

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

    const signedOut = !session?.user?.id;
    const noProject =
        !!session?.user?.id &&
        (!selectedProject?.name?.trim() || selectedProject.name === NO_PROJECT);

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.title}>Activity</Text>
                <Text style={styles.titleSub}>Your submissions on this project</Text>
            </View>

            <View style={styles.filterRow}>
                {FILTERS.map((f) => (
                    <TouchableOpacity
                        key={f.key}
                        style={[styles.filterTab, filter === f.key && styles.filterTabActive]}
                        onPress={() => setFilter(f.key)}
                    >
                        <Text style={[styles.filterLabel, filter === f.key && styles.filterLabelActive]}>{f.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
            >
                {signedOut ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIcon}>
                            <Ionicons name="person-outline" size={48} color={COLORS.subtitle} />
                        </View>
                        <Text style={styles.emptyTitle}>Sign in to see your activity</Text>
                        <Text style={styles.emptySubtitle}>
                            Your field submissions are recorded under your account. Log in to view your personal activity
                            feed.
                        </Text>
                    </View>
                ) : noProject ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIcon}>
                            <Ionicons name="folder-open-outline" size={48} color={COLORS.subtitle} />
                        </View>
                        <Text style={styles.emptyTitle}>Select a project</Text>
                        <Text style={styles.emptySubtitle}>
                            Activity is filtered from the audit log for the current project and your account. Choose a
                            project on the Home tab first.
                        </Text>
                    </View>
                ) : activities.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIcon}>
                            <Ionicons name="time-outline" size={48} color={COLORS.subtitle} />
                        </View>
                        <Text style={styles.emptyTitle}>No activity yet</Text>
                        <Text style={styles.emptySubtitle}>
                            When you save notes, chemicals, metrics, and other reports while signed in, they appear here.
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
    titleSub: { color: COLORS.subtitle, fontSize: 13, marginTop: 4, lineHeight: 18 },

    filterRow: {
        flexDirection: 'row',
        marginHorizontal: 16,
        backgroundColor: COLORS.card,
        borderRadius: 8,
        padding: 2,
        marginBottom: 16,
    },
    filterTab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderRadius: 6,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
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
