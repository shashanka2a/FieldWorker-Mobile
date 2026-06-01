import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    TextInput,
    Modal,
    Pressable,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';
import { getSafetyTalks, SafetyTalk, safetyTalkMatchesProject } from '@/lib/safetyStorage';
import { syncSafetyTalkToSupabase } from '@/lib/supabaseSync';
import AsyncStorage from '@react-native-async-storage/async-storage';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    success: '#30D158',
    warning: '#FFD60A',
    danger: '#FF453A',
};

type TabType = 'upcoming' | 'missed' | 'conducted';

const TAB_CONFIG: { key: TabType; label: string; color: string }[] = [
    { key: 'upcoming', label: 'Upcoming', color: COLORS.brand },
    { key: 'missed', label: 'Missed', color: COLORS.danger },
    { key: 'conducted', label: 'Done', color: COLORS.success },
];

function formatDate(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
    });
}

const NO_PROJECT = 'No Project Selected';

export default function SafetyListScreen() {
    const { tab } = useLocalSearchParams<{ tab?: string }>();
    const { selectedProject } = useAppContext();
    const [activeTab, setActiveTab] = useState<TabType>('upcoming');
    const [talks, setTalks] = useState<SafetyTalk[]>([]);
    const [completedMeta, setCompletedMeta] = useState<Record<string, { attendeeCount?: number }>>({});
    const [search, setSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [showMenu, setShowMenu] = useState(false);

    const loadTalks = useCallback(async () => {
        const data = await getSafetyTalks();
        setTalks(data);

        const pid = selectedProject?.id?.trim();
        const pname = selectedProject?.name ?? '';

        // Best-effort: conducted talks should exist in Supabase; re-upsert covers offline/legacy failures.
        // Do not append audit_log rows on every tab visit (would duplicate Activity feed entries).
        for (const t of data) {
            if (t.status === 'conducted' && safetyTalkMatchesProject(t, pid, pname)) {
                syncSafetyTalkToSupabase(t, { skipAuditLog: true }).catch(console.error);
            }
        }

        // Load attendee counts for completed talks (best-effort).
        const conducted = data.filter(
            (t) => t.status === 'conducted' && safetyTalkMatchesProject(t, pid, pname)
        );
        if (conducted.length === 0) {
            setCompletedMeta({});
            return;
        }
        try {
            const keys = conducted.map((t) => `safety_talk_completed_${t.id}`);
            const pairs = await AsyncStorage.multiGet(keys);
            const meta: Record<string, { attendeeCount?: number }> = {};
            for (const [k, v] of pairs) {
                if (!v) continue;
                try {
                    const parsed = JSON.parse(v);
                    const talkId = String(parsed?.talkId ?? '').trim() || k.replace('safety_talk_completed_', '');
                    const count = typeof parsed?.attendeeCount === 'number' ? parsed.attendeeCount : undefined;
                    meta[talkId] = { attendeeCount: count };
                } catch { }
            }
            setCompletedMeta(meta);
        } catch {
            setCompletedMeta({});
        }
    }, [selectedProject?.id, selectedProject?.name]);

    useEffect(() => {
        if (tab === 'conducted' || tab === 'upcoming' || tab === 'missed') {
            setActiveTab(tab);
        }
    }, [tab]);

    // Reload talks on every focus (handles back navigation)
    useFocusEffect(
        useCallback(() => {
            loadTalks();
        }, [loadTalks])
    );

    const onRefresh = async () => {
        setRefreshing(true);
        await loadTalks();
        setRefreshing(false);
    };

    const projectTalks = useMemo(
        () =>
            talks.filter((t) =>
                safetyTalkMatchesProject(t, selectedProject?.id, selectedProject?.name)
            ),
        [talks, selectedProject?.id, selectedProject?.name]
    );

    const hasProject =
        !!selectedProject?.name?.trim() && selectedProject.name !== NO_PROJECT;

    const filtered = projectTalks
        .filter((t) => t.status === activeTab)
        .filter((t) => !search || t.templateName.toLowerCase().includes(search.toLowerCase()));

    const tabColor = TAB_CONFIG.find((t) => t.key === activeTab)?.color ?? COLORS.brand;

    return (
        <View style={styles.container}>
            <ScreenHeader
                title="Safety Talks"
                subtitle={hasProject ? selectedProject.name : 'Select a project on Home'}
            />

            {/* Search */}
            <View style={styles.searchWrap}>
                <Ionicons name="search-outline" size={16} color={COLORS.subtitle} />
                <TextInput
                    style={styles.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search safety talks..."
                    placeholderTextColor={COLORS.subtitle}
                />
                {search !== '' && (
                    <TouchableOpacity onPress={() => setSearch('')}>
                        <Ionicons name="close-circle" size={16} color={COLORS.subtitle} />
                    </TouchableOpacity>
                )}
            </View>

            {/* Tab Bar Segmented Control */}
            <View style={styles.segmentedControl}>
                {TAB_CONFIG.map((tab) => {
                    const count = projectTalks.filter((t) => t.status === tab.key).length;
                    const isActive = activeTab === tab.key;
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            style={[styles.segment, isActive && styles.segmentActive]}
                            onPress={() => setActiveTab(tab.key)}
                        >
                            <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
            >
                {!hasProject ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="folder-open-outline" size={40} color={COLORS.subtitle} />
                        </View>
                        <Text style={styles.emptyTitle}>No project selected</Text>
                        <Text style={styles.emptySubtitle}>
                            Choose a field project on the Home tab. Safety talks are listed per project.
                        </Text>
                    </View>
                ) : filtered.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="shield-checkmark-outline" size={40} color={COLORS.brand} />
                        </View>
                        <Text style={styles.emptyTitle}>No {activeTab} talks</Text>
                        <Text style={styles.emptySubtitle}>
                            {activeTab === 'upcoming'
                                ? 'Use the buttons below to start or schedule a safety talk for this project.'
                                : `No ${activeTab} safety talks for ${selectedProject.name}.`}
                        </Text>
                    </View>
                ) : (
                    filtered.map((talk) => (
                        <TouchableOpacity
                            key={talk.id}
                            style={styles.talkCard}
                            onPress={() => {
                                if (activeTab === 'upcoming' || activeTab === 'missed') {
                                    router.push(`/safety/schedule?id=${talk.id}`);
                                } else {
                                    router.push(`/safety/read?talkId=${talk.id}`);
                                }
                            }}
                            activeOpacity={0.8}
                        >
                            <View style={[styles.talkIconWrap, { backgroundColor: tabColor + '20' }]}>
                                <Ionicons name="shield-checkmark-outline" size={22} color={tabColor} />
                            </View>
                            <View style={styles.talkInfo}>
                                <Text style={styles.talkName} numberOfLines={2}>{talk.templateName}</Text>
                                <Text style={styles.talkDate}>
                                    {formatDate(talk.date)}
                                    {completedMeta[talk.id]?.attendeeCount
                                        ? `  •  ${completedMeta[talk.id]!.attendeeCount} attendee${completedMeta[talk.id]!.attendeeCount === 1 ? '' : 's'}`
                                        : ''}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={COLORS.subtitle} />
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>

            {/* FAB button */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => setShowMenu(true)}
                activeOpacity={0.85}
            >
                <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>

            {/* Action Menu */}
            <Modal visible={showMenu} transparent animationType="slide" onRequestClose={() => setShowMenu(false)}>
                <Pressable style={styles.modalBackdrop} onPress={() => setShowMenu(false)}>
                    <View style={styles.menuSheet}>
                        <Text style={styles.menuTitle}>Create new</Text>
                        <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/safety/template?mode=start'); }}>
                            <Text style={styles.menuItemTextLink}>Start talk</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('/safety/template?mode=schedule'); }}>
                            <Text style={styles.menuItemTextLink}>Schedule talks</Text>
                        </TouchableOpacity>
                        <View style={{ height: 8, backgroundColor: 'transparent' }} />
                        <TouchableOpacity style={styles.menuCancelBtn} onPress={() => setShowMenu(false)}>
                            <Text style={styles.menuCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 16, marginBottom: 12, backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
    searchInput: { flex: 1, color: '#fff', fontSize: 16 },

    segmentedControl: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: COLORS.card, borderRadius: 8, padding: 2, marginBottom: 16 },
    segment: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 6, flexDirection: 'row', justifyContent: 'center', gap: 6 },
    segmentActive: { backgroundColor: COLORS.brand },
    segmentText: { color: COLORS.subtitle, fontSize: 13, fontWeight: '600' },
    segmentTextActive: { color: '#fff' },
    badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
    badgeText: { fontSize: 11, fontWeight: '700' },

    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 120, gap: 10 },
    emptyState: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
    emptyIconWrap: { width: 72, height: 72, borderRadius: 20, backgroundColor: COLORS.brand + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
    emptySubtitle: { color: COLORS.subtitle, fontSize: 14, textAlign: 'center', lineHeight: 22 },
    talkCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    talkIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    talkInfo: { flex: 1, gap: 4 },
    talkName: { color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 20 },
    talkDate: { color: COLORS.subtitle, fontSize: 12 },
    
    fab: { position: 'absolute', bottom: 32, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
    
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    menuSheet: { paddingHorizontal: 16, paddingBottom: 36, gap: 0 },
    menuTitle: { color: COLORS.subtitle, fontSize: 13, fontWeight: '500', textAlign: 'center', paddingVertical: 12, backgroundColor: COLORS.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
    menuItem: { backgroundColor: COLORS.card, paddingVertical: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
    menuItemTextLink: { color: '#0A84FF', fontSize: 20, textAlign: 'center' },
    menuCancelBtn: { backgroundColor: COLORS.card, paddingVertical: 18, borderRadius: 16, marginTop: 8 },
    menuCancelText: { color: '#0A84FF', fontSize: 20, fontWeight: '600', textAlign: 'center' },
});

