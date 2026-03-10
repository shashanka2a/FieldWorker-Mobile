import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { getSafetyTalks, SafetyTalk, SafetyTalkStatus } from '@/lib/safetyStorage';

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

export default function SafetyListScreen() {
    const [activeTab, setActiveTab] = useState<TabType>('upcoming');
    const [talks, setTalks] = useState<SafetyTalk[]>([]);
    const [search, setSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);

    const loadTalks = useCallback(async () => {
        const data = await getSafetyTalks();
        setTalks(data);
    }, []);

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

    const filtered = talks
        .filter((t) => t.status === activeTab)
        .filter((t) => !search || t.templateName.toLowerCase().includes(search.toLowerCase()));

    const tabColor = TAB_CONFIG.find((t) => t.key === activeTab)?.color ?? COLORS.brand;

    return (
        <View style={styles.container}>
            <ScreenHeader title="Safety Talks" />

            {/* Tab Bar */}
            <View style={styles.tabBar}>
                {TAB_CONFIG.map((tab) => {
                    const count = talks.filter((t) => t.status === tab.key).length;
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            style={[styles.tab, activeTab === tab.key && { borderBottomColor: tab.color, borderBottomWidth: 2 }]}
                            onPress={() => setActiveTab(tab.key)}
                        >
                            <Text style={[styles.tabText, activeTab === tab.key && { color: tab.color }]}>
                                {tab.label}
                            </Text>
                            {count > 0 && (
                                <View style={[styles.badge, { backgroundColor: tab.color + '25' }]}>
                                    <Text style={[styles.badgeText, { color: tab.color }]}>{count}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>

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

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
            >
                {filtered.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="shield-checkmark-outline" size={40} color={COLORS.brand} />
                        </View>
                        <Text style={styles.emptyTitle}>No {activeTab} talks</Text>
                        <Text style={styles.emptySubtitle}>
                            {activeTab === 'upcoming'
                                ? 'Use the buttons below to start or schedule a safety talk.'
                                : `No ${activeTab} safety talks found.`}
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
                                    router.push(`/safety/read?templateId=${talk.templateId}`);
                                }
                            }}
                            activeOpacity={0.8}
                        >
                            <View style={[styles.talkIconWrap, { backgroundColor: tabColor + '20' }]}>
                                <Ionicons name="shield-checkmark-outline" size={22} color={tabColor} />
                            </View>
                            <View style={styles.talkInfo}>
                                <Text style={styles.talkName} numberOfLines={2}>{talk.templateName}</Text>
                                <Text style={styles.talkDate}>{formatDate(talk.date)}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={COLORS.subtitle} />
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>

            {/* Bottom Action Bar */}
            <View style={styles.bottomBar}>
                <TouchableOpacity
                    style={styles.bottomBtn}
                    onPress={() => router.push('/safety/template?mode=start')}
                    activeOpacity={0.85}
                >
                    <Ionicons name="play" size={20} color="#fff" />
                    <Text style={styles.bottomBtnText}>Start Now</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.bottomBtn, styles.bottomBtnSecondary]}
                    onPress={() => router.push('/safety/template?mode=schedule')}
                    activeOpacity={0.85}
                >
                    <Ionicons name="calendar-outline" size={20} color={COLORS.brand} />
                    <Text style={[styles.bottomBtnText, { color: COLORS.brand }]}>Schedule</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, backgroundColor: COLORS.card },
    tab: { flex: 1, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderBottomWidth: 2, borderBottomColor: 'transparent' },
    tabText: { color: COLORS.subtitle, fontSize: 14, fontWeight: '600' },
    badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
    badgeText: { fontSize: 11, fontWeight: '700' },
    searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, backgroundColor: COLORS.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    searchInput: { flex: 1, color: '#fff', fontSize: 15 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 120, gap: 10 },
    emptyState: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
    emptyIconWrap: { width: 72, height: 72, borderRadius: 20, backgroundColor: COLORS.brand + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
    emptySubtitle: { color: COLORS.subtitle, fontSize: 14, textAlign: 'center', lineHeight: 22 },
    talkCard: {
        backgroundColor: COLORS.card,
        borderRadius: 16,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    talkIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    talkInfo: { flex: 1, gap: 4 },
    talkName: { color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 20 },
    talkDate: { color: COLORS.subtitle, fontSize: 12 },
    bottomBar: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
        paddingBottom: 28,
        backgroundColor: COLORS.card,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: COLORS.border,
    },
    bottomBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: COLORS.brand,
    },
    bottomBtnSecondary: {
        backgroundColor: COLORS.brand + '15',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.brand + '40',
    },
    bottomBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

