import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    StyleSheet,
    RefreshControl,
    Modal,
    Pressable,
    Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';
import {
    getDateKey,
    getObservationsForDate,
    deleteObservation,
    ObservationEntry,
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
    negative: '#FF453A',
    positive: '#30D158',
    muted: '#48484A',
};

const STATUS_COLORS: Record<string, string> = {
    'Open': COLORS.subtitle,
    'In Progress': COLORS.warning,
    'Resolved': COLORS.success,
    'Closed': COLORS.muted,
};

const PRIORITY_COLORS: Record<string, string> = {
    'Low': COLORS.success,
    'Medium': COLORS.warning,
    'High': COLORS.brand,
    'Critical': COLORS.danger,
};

export default function ObservationsListScreen() {
    const { selectedDate } = useAppContext();
    const [observations, setObservations] = useState<ObservationEntry[]>([]);
    const [filteredObservations, setFilteredObservations] = useState<ObservationEntry[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateSheet, setShowCreateSheet] = useState(false);
    const [showFilterSheet, setShowFilterSheet] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string | null>(null);

    const loadObservations = useCallback(async () => {
        const dateKey = getDateKey(selectedDate);
        const data = await getObservationsForDate(dateKey);
        setObservations(data.reverse());
    }, [selectedDate]);

    useEffect(() => { loadObservations(); }, [loadObservations]);

    // Filter + Search
    useEffect(() => {
        let filtered = observations;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(
                (o) =>
                    o.type.toLowerCase().includes(q) ||
                    (o.description ?? '').toLowerCase().includes(q) ||
                    o.status.toLowerCase().includes(q)
            );
        }
        if (filterStatus) {
            filtered = filtered.filter((o) => o.status === filterStatus);
        }
        setFilteredObservations(filtered);
    }, [observations, searchQuery, filterStatus]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadObservations();
        setRefreshing(false);
    };

    const handleDelete = (id: string) => {
        Alert.alert('Delete Observation', 'Are you sure you want to delete this observation?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    const dateKey = getDateKey(selectedDate);
                    await deleteObservation(dateKey, id);
                    await loadObservations();
                },
            },
        ]);
    };

    const handleCreate = (category: 'Negative' | 'Positive') => {
        setShowCreateSheet(false);
        router.push(`/observations/add?category=${category}`);
    };

    const dateLabel = selectedDate.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
    });

    return (
        <View style={styles.container}>
            <ScreenHeader title="Observations" subtitle={dateLabel} />

            {/* Search + Filter Bar */}
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
                <TouchableOpacity
                    style={[styles.filterBtn, filterStatus && styles.filterBtnActive]}
                    onPress={() => setShowFilterSheet(true)}
                >
                    <Ionicons name="options-outline" size={18} color={filterStatus ? '#fff' : COLORS.subtitle} />
                </TouchableOpacity>
            </View>

            {/* Active Filter Chip */}
            {filterStatus && (
                <View style={styles.activeFilterRow}>
                    <TouchableOpacity
                        style={styles.activeFilterChip}
                        onPress={() => setFilterStatus(null)}
                    >
                        <Text style={styles.activeFilterText}>{filterStatus}</Text>
                        <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                </View>
            )}

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
            >
                {filteredObservations.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconWrap}>
                            <Ionicons name="eye-outline" size={40} color={COLORS.brand} />
                        </View>
                        <Text style={styles.emptyTitle}>No Observations</Text>
                        <Text style={styles.emptySubtitle}>
                            Tap the button below to create your first observation for {dateLabel}
                        </Text>
                        <TouchableOpacity
                            style={styles.emptyBtn}
                            onPress={() => setShowCreateSheet(true)}
                        >
                            <Ionicons name="add" size={18} color="#fff" />
                            <Text style={styles.emptyBtnText}>New Observation</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    filteredObservations.map((obs) => {
                        const statusColor = STATUS_COLORS[obs.status] ?? COLORS.subtitle;
                        const priorityColor = PRIORITY_COLORS[obs.priority] ?? COLORS.subtitle;
                        const createdDate = new Date(obs.timestamp).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                        });
                        const firstAssignee = obs.assignees[0]?.name ?? 'Unassigned';

                        return (
                            <TouchableOpacity
                                key={obs.id}
                                style={styles.observationCard}
                                onPress={() => router.push(`/observations/add?editId=${obs.id}`)}
                                activeOpacity={0.8}
                                onLongPress={() => handleDelete(obs.id)}
                            >
                                <View style={styles.cardTopRow}>
                                    <Text style={styles.cardType} numberOfLines={2}>{obs.type}</Text>
                                    <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
                                </View>

                                <View style={styles.cardMetaRow}>
                                    <View style={styles.cardMetaItem}>
                                        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                                        <Text style={styles.cardMetaText}>{obs.status}</Text>
                                    </View>
                                    <View style={styles.cardMetaItem}>
                                        <Ionicons name="calendar-outline" size={12} color={COLORS.subtitle} />
                                        <Text style={styles.cardMetaText}>{createdDate}</Text>
                                    </View>
                                    <View style={styles.cardMetaItem}>
                                        <Ionicons name="person-outline" size={12} color={COLORS.subtitle} />
                                        <Text style={styles.cardMetaText}>{firstAssignee}</Text>
                                    </View>
                                </View>

                                <View style={styles.cardBadgeRow}>
                                    <View style={[
                                        styles.categoryBadge,
                                        { backgroundColor: obs.category === 'Negative' ? COLORS.negative + '20' : COLORS.positive + '20' }
                                    ]}>
                                        <Text style={[
                                            styles.categoryBadgeText,
                                            { color: obs.category === 'Negative' ? COLORS.negative : COLORS.positive }
                                        ]}>
                                            {obs.category}
                                        </Text>
                                    </View>
                                    <View style={[styles.priorityBadge, { backgroundColor: priorityColor + '20' }]}>
                                        <Text style={[styles.priorityBadgeText, { color: priorityColor }]}>
                                            {obs.priority}
                                        </Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => setShowCreateSheet(true)}
                activeOpacity={0.85}
            >
                <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>

            {/* Create Action Sheet */}
            <Modal
                visible={showCreateSheet}
                transparent
                animationType="slide"
                onRequestClose={() => setShowCreateSheet(false)}
            >
                <Pressable style={styles.sheetBackdrop} onPress={() => setShowCreateSheet(false)}>
                    <View style={styles.sheetContainer}>
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>Create new</Text>

                        <TouchableOpacity
                            style={styles.sheetOption}
                            onPress={() => handleCreate('Negative')}
                        >
                            <Ionicons name="alert-circle-outline" size={22} color={COLORS.negative} />
                            <Text style={[styles.sheetOptionText, { color: COLORS.blue }]}>Negative observation</Text>
                        </TouchableOpacity>

                        <View style={styles.sheetDivider} />

                        <TouchableOpacity
                            style={styles.sheetOption}
                            onPress={() => handleCreate('Positive')}
                        >
                            <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.positive} />
                            <Text style={[styles.sheetOptionText, { color: COLORS.blue }]}>Positive observation</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.sheetCancelBtn}
                            onPress={() => setShowCreateSheet(false)}
                        >
                            <Text style={styles.sheetCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>

            {/* Filter Sheet */}
            <Modal
                visible={showFilterSheet}
                transparent
                animationType="slide"
                onRequestClose={() => setShowFilterSheet(false)}
            >
                <Pressable style={styles.sheetBackdrop} onPress={() => setShowFilterSheet(false)}>
                    <View style={styles.sheetContainer}>
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>Filter by Status</Text>

                        {['Open', 'In Progress', 'Resolved', 'Closed'].map((status) => (
                            <TouchableOpacity
                                key={status}
                                style={[styles.sheetOption, filterStatus === status && styles.sheetOptionActive]}
                                onPress={() => {
                                    setFilterStatus(filterStatus === status ? null : status);
                                    setShowFilterSheet(false);
                                }}
                            >
                                <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status] }]} />
                                <Text style={styles.sheetOptionText}>{status}</Text>
                                {filterStatus === status && (
                                    <Ionicons name="checkmark" size={18} color={COLORS.brand} style={{ marginLeft: 'auto' }} />
                                )}
                            </TouchableOpacity>
                        ))}

                        {filterStatus && (
                            <TouchableOpacity
                                style={styles.sheetOption}
                                onPress={() => {
                                    setFilterStatus(null);
                                    setShowFilterSheet(false);
                                }}
                            >
                                <Ionicons name="close-circle-outline" size={18} color={COLORS.danger} />
                                <Text style={[styles.sheetOptionText, { color: COLORS.danger }]}>Clear Filter</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={styles.sheetCancelBtn}
                            onPress={() => setShowFilterSheet(false)}
                        >
                            <Text style={styles.sheetCancelText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scrollView: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 100, gap: 12 },

    // Search
    searchBar: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
    searchInputWrap: {
        flex: 1,
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
    filterBtn: {
        width: 40,
        height: 40,
        backgroundColor: COLORS.card,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    filterBtnActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },

    // Active filter
    activeFilterRow: { paddingHorizontal: 16, paddingBottom: 4 },
    activeFilterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 6,
        backgroundColor: COLORS.brand,
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 5,
    },
    activeFilterText: { color: '#fff', fontSize: 12, fontWeight: '600' },

    // Empty
    emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
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
    emptyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: COLORS.brand,
        borderRadius: 14,
        paddingHorizontal: 24,
        paddingVertical: 12,
        marginTop: 8,
    },
    emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

    // Observation card
    observationCard: {
        backgroundColor: COLORS.card,
        borderRadius: 16,
        padding: 14,
        gap: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    cardType: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1 },
    cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    cardMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statusDot: { width: 7, height: 7, borderRadius: 3.5 },
    cardMetaText: { color: COLORS.subtitle, fontSize: 12 },
    cardBadgeRow: { flexDirection: 'row', gap: 8 },
    categoryBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    categoryBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
    priorityBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    priorityBadgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },

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

    // Sheet
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheetContainer: {
        backgroundColor: COLORS.card,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 16,
        paddingBottom: 40,
        paddingTop: 12,
    },
    sheetHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: COLORS.border,
        alignSelf: 'center',
        marginBottom: 16,
    },
    sheetTitle: { color: COLORS.subtitle, fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
    sheetOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 4,
    },
    sheetOptionActive: { backgroundColor: COLORS.border + '40', borderRadius: 12, paddingHorizontal: 12 },
    sheetOptionText: { color: '#fff', fontSize: 16, fontWeight: '500' },
    sheetDivider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
    sheetCancelBtn: {
        backgroundColor: COLORS.surface,
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 12,
    },
    sheetCancelText: { color: COLORS.blue, fontSize: 17, fontWeight: '600' },
});
