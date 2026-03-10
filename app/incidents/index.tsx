import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    RefreshControl,
    Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';
import {
    getDateKey,
    getIncidentsForDate,
    deleteIncident,
    IncidentEntry,
} from '@/lib/dailyReportStorage';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    blue: '#0A84FF',
    success: '#30D158',
    warning: '#FFD60A',
    danger: '#FF453A',
    muted: '#48484A',
};

export default function IncidentsListScreen() {
    const { selectedDate } = useAppContext();
    const [incidents, setIncidents] = useState<IncidentEntry[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'Open' | 'Closed'>('Open');

    const loadIncidents = useCallback(async () => {
        const dateKey = getDateKey(selectedDate);
        const data = await getIncidentsForDate(dateKey);
        setIncidents(data.reverse());
    }, [selectedDate]);

    useEffect(() => { loadIncidents(); }, [loadIncidents]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadIncidents();
        setRefreshing(false);
    };

    // Filter by tab + search
    const filteredIncidents = incidents.filter((inc) => {
        const matchesTab = inc.status === activeTab;
        if (!searchQuery.trim()) return matchesTab;
        const q = searchQuery.toLowerCase();
        return matchesTab && (
            inc.title.toLowerCase().includes(q) ||
            inc.location.toLowerCase().includes(q) ||
            (inc.injuryIllnessType ?? '').toLowerCase().includes(q)
        );
    });

    const handleDelete = (id: string) => {
        Alert.alert('Delete Incident', 'Are you sure you want to delete this incident?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    const dateKey = getDateKey(selectedDate);
                    await deleteIncident(dateKey, id);
                    await loadIncidents();
                },
            },
        ]);
    };

    const dateLabel = selectedDate.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
    });

    const openCount = incidents.filter((i) => i.status === 'Open').length;
    const closedCount = incidents.filter((i) => i.status === 'Closed').length;

    return (
        <View style={styles.container}>
            <ScreenHeader title="Incidents" subtitle={dateLabel} />

            {/* Search Bar */}
            <View style={styles.searchBar}>
                <View style={styles.searchInputWrap}>
                    <Ionicons name="search" size={16} color={COLORS.subtitle} />
                    <TextInput
                        style={styles.searchInput}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search"
                        placeholderTextColor={COLORS.subtitle}
                        returnKeyType="search"
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery('')}>
                            <Ionicons name="close-circle" size={16} color={COLORS.subtitle} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Open / Closed Tabs */}
            <View style={styles.tabBar}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'Open' && styles.tabActive]}
                    onPress={() => setActiveTab('Open')}
                >
                    <Text style={[styles.tabText, activeTab === 'Open' && styles.tabTextActive]}>
                        Open{openCount > 0 ? ` (${openCount})` : ''}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'Closed' && styles.tabActive]}
                    onPress={() => setActiveTab('Closed')}
                >
                    <Text style={[styles.tabText, activeTab === 'Closed' && styles.tabTextActive]}>
                        Closed{closedCount > 0 ? ` (${closedCount})` : ''}
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
            >
                {filteredIncidents.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="construct-outline" size={44} color={COLORS.subtitle} />
                        </View>
                        <Text style={styles.emptyTitle}>No incidents</Text>
                        <Text style={styles.emptySubtitle}>
                            You currently have no incidents.{'\n'}Add a new incident by tapping the + Icon!
                        </Text>
                    </View>
                ) : (
                    filteredIncidents.map((inc) => {
                        const incDate = new Date(inc.incidentDate).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                        });
                        return (
                            <TouchableOpacity
                                key={inc.id}
                                style={styles.incidentCard}
                                onPress={() => router.push(`/incidents/add?editId=${inc.id}`)}
                                onLongPress={() => handleDelete(inc.id)}
                                activeOpacity={0.8}
                            >
                                <View style={styles.cardTopRow}>
                                    <Text style={styles.cardTitle} numberOfLines={1}>{inc.title || 'Untitled Incident'}</Text>
                                    {inc.recordable && (
                                        <View style={styles.recordableBadge}>
                                            <Text style={styles.recordableBadgeText}>REC</Text>
                                        </View>
                                    )}
                                </View>

                                <View style={styles.cardMetaRow}>
                                    <View style={styles.cardMetaItem}>
                                        <View style={[
                                            styles.statusDot,
                                            { backgroundColor: inc.status === 'Open' ? COLORS.warning : COLORS.success }
                                        ]} />
                                        <Text style={styles.cardMetaText}>{inc.status}</Text>
                                    </View>
                                    <View style={styles.cardMetaItem}>
                                        <Ionicons name="calendar-outline" size={12} color={COLORS.subtitle} />
                                        <Text style={styles.cardMetaText}>{incDate}</Text>
                                    </View>
                                    <View style={styles.cardMetaItem}>
                                        <Ionicons name="time-outline" size={12} color={COLORS.subtitle} />
                                        <Text style={styles.cardMetaText}>{inc.incidentTime}</Text>
                                    </View>
                                </View>

                                {inc.location ? (
                                    <View style={styles.cardMetaItem}>
                                        <Ionicons name="location-outline" size={13} color={COLORS.subtitle} />
                                        <Text style={styles.cardMetaText} numberOfLines={1}>{inc.location}</Text>
                                    </View>
                                ) : null}

                                {inc.injuryIllnessType ? (
                                    <View style={styles.typeBadgeRow}>
                                        <View style={styles.typeBadge}>
                                            <Text style={styles.typeBadgeText}>{inc.injuryIllnessType}</Text>
                                        </View>
                                    </View>
                                ) : null}
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => router.push('/incidents/add')}
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

    // Search
    searchBar: { paddingHorizontal: 16, paddingVertical: 10 },
    searchInputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.card,
        borderRadius: 12,
        paddingHorizontal: 12,
        gap: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    searchInput: { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 10 },

    // Tabs
    tabBar: {
        flexDirection: 'row',
        marginHorizontal: 16,
        backgroundColor: COLORS.card,
        borderRadius: 10,
        padding: 3,
        marginBottom: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: 'center',
    },
    tabActive: {
        backgroundColor: COLORS.muted,
    },
    tabText: { color: COLORS.subtitle, fontSize: 14, fontWeight: '600' },
    tabTextActive: { color: '#fff' },

    // Empty
    emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
    emptyIconWrap: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: COLORS.card,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
    emptySubtitle: { color: COLORS.subtitle, fontSize: 14, textAlign: 'center', lineHeight: 20, paddingHorizontal: 32 },

    // Incident card
    incidentCard: {
        backgroundColor: COLORS.card,
        borderRadius: 16,
        padding: 14,
        gap: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    cardTitle: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1 },
    cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    cardMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statusDot: { width: 7, height: 7, borderRadius: 3.5 },
    cardMetaText: { color: COLORS.subtitle, fontSize: 12 },
    recordableBadge: {
        backgroundColor: COLORS.danger + '25',
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    recordableBadgeText: { color: COLORS.danger, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    typeBadgeRow: { flexDirection: 'row' },
    typeBadge: {
        backgroundColor: COLORS.brand + '20',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    typeBadgeText: { color: COLORS.brand, fontSize: 11, fontWeight: '700' },

    // FAB
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
