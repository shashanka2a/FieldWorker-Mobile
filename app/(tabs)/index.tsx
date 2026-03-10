import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Pressable,
    StyleSheet,
    Dimensions,
    Modal,
    FlatList,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/context/AppContext';
import {
    getDateKey,
    getSignedReport,
    hasDataForDate,
} from '@/lib/dailyReportStorage';

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
    muted: '#48484A',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Task tile icons
const TASK_TILES = [
    { id: 'notes', name: 'Notes', route: '/notes/', icon: 'document-text', color: COLORS.brand },
    { id: 'chemical', name: 'Chemicals', route: '/chemicals/', icon: 'flask', color: COLORS.brand },
    { id: 'metrics', name: 'Metrics', route: '/metrics/', icon: 'speedometer', color: COLORS.brand },
    { id: 'survey', name: 'Survey', route: '/survey/', icon: 'clipboard', color: COLORS.brand },
    { id: 'equipment', name: 'Equipment', route: '/checklist/', icon: 'construct', color: COLORS.brand },
    { id: 'attachments', name: 'Photos', route: '/attachments/', icon: 'camera', color: COLORS.brand },
    { id: 'safety', name: 'Safety', route: '/safety/', icon: 'shield-checkmark', color: COLORS.brand },
    { id: 'observations', name: 'Observations', route: '/observations/', icon: 'eye', color: COLORS.brand },
    { id: 'incidents', name: 'Incidents', route: '/incidents/', icon: 'warning', color: COLORS.brand },
    { id: 'report', name: 'Report', route: '/report/preview', icon: 'bar-chart', color: COLORS.brand },
];

type DayStatus = 'signed' | 'unsigned' | 'missing' | 'none';

export default function HomeScreen() {
    const { selectedDate, setSelectedDate, selectedProject, setSelectedProject, projects } = useAppContext();
    const [showProjectSelector, setShowProjectSelector] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
    const [dayStatuses, setDayStatuses] = useState<Record<string, DayStatus>>({});
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Load day statuses for calendar
    const loadDayStatuses = useCallback(async () => {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const statuses: Record<string, DayStatus> = {};

        const promises = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dayOfWeek = date.getDay();
            // Skip weekends
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;
            if (date > today) continue;

            const dateKey = getDateKey(date);
            promises.push(
                Promise.all([
                    hasDataForDate(dateKey),
                    getSignedReport(dateKey),
                ]).then(([hasData, signed]) => {
                    if (signed) statuses[dateKey] = 'signed';
                    else if (hasData) statuses[dateKey] = 'unsigned';
                    else statuses[dateKey] = 'missing';
                })
            );
        }
        await Promise.all(promises);
        setDayStatuses(statuses);
    }, [selectedDate]);

    useEffect(() => {
        loadDayStatuses();
    }, [loadDayStatuses]);

    // Build weekdays strip: 7 before + selected + 6 after
    const buildWeekdays = (): Date[] => {
        const weekdays: Date[] = [];
        const tmp = new Date(selectedDate);
        let before = 0;
        while (before < 7) {
            tmp.setDate(tmp.getDate() - 1);
            if (tmp.getDay() !== 0 && tmp.getDay() !== 6) {
                weekdays.unshift(new Date(tmp));
                before++;
            }
        }
        if (selectedDate.getDay() !== 0 && selectedDate.getDay() !== 6) {
            weekdays.push(new Date(selectedDate));
        }
        const after = new Date(selectedDate);
        let count = 0;
        while (count < 6) {
            after.setDate(after.getDate() + 1);
            if (after.getDay() !== 0 && after.getDay() !== 6) {
                weekdays.push(new Date(after));
                count++;
            }
        }
        return weekdays;
    };

    // Build calendar grid
    const buildCalendarGrid = () => {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days: (number | null)[] = [];
        for (let i = 0; i < firstDay; i++) days.push(null);
        for (let d = 1; d <= daysInMonth; d++) days.push(d);
        return days;
    };

    const weekdays = buildWeekdays();
    const calendarDays = buildCalendarGrid();
    const monthName = selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const handlePrevMonth = () => {
        const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1);
        setSelectedDate(d);
    };

    const handleNextMonth = () => {
        const d = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1);
        setSelectedDate(d);
    };

    const handleTilePress = (route: string) => {
        setNavigatingTo(route);
        setTimeout(() => {
            router.push(route as any);
            setTimeout(() => setNavigatingTo(null), 500);
        }, 100);
    };

    const reportDateKey = getDateKey(selectedDate);
    const selectedDateLabel = selectedDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.projectLabel}>Current Project</Text>
                    <TouchableOpacity
                        style={styles.projectButton}
                        onPress={() => setShowProjectSelector(true)}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.projectName}>{selectedProject.name}</Text>
                        <Ionicons name="chevron-down" size={18} color="#fff" />
                    </TouchableOpacity>
                </View>

                {/* Daily Logs Section */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Daily Logs</Text>
                    <TouchableOpacity
                        style={styles.calendarButton}
                        onPress={() => setShowCalendar(true)}
                        activeOpacity={0.8}
                    >
                        <Ionicons name="calendar-outline" size={20} color={COLORS.brand} />
                    </TouchableOpacity>
                </View>

                <Text style={styles.reportingFor}>Reporting for: {selectedDateLabel}</Text>

                {/* Horizontal Weekday Strip */}
                <View style={styles.weekdayCard}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.weekdayScroll}
                    >
                        {weekdays.map((date, idx) => {
                            const isSelected = date.toDateString() === selectedDate.toDateString();
                            const isToday = date.toDateString() === today.toDateString();
                            const isFuture = date > today;
                            const dayLetter = date.toLocaleDateString('en-US', { weekday: 'short' })[0];
                            const dayNum = date.getDate();

                            return (
                                <TouchableOpacity
                                    key={idx}
                                    style={styles.weekday}
                                    onPress={() => !isFuture && setSelectedDate(new Date(date))}
                                    disabled={isFuture}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[styles.weekdayLetter, isFuture && styles.mutedText]}>
                                        {dayLetter}
                                    </Text>
                                    <View
                                        style={[
                                            styles.weekdayNum,
                                            isSelected && styles.weekdaySelected,
                                            isToday && !isSelected && styles.weekdayToday,
                                            isFuture && styles.weekdayFuture,
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.weekdayNumText,
                                                isSelected && styles.weekdaySelectedText,
                                                isToday && !isSelected && styles.weekdayTodayText,
                                                isFuture && styles.mutedText,
                                            ]}
                                        >
                                            {dayNum}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Task Grid */}
                <View style={styles.grid}>
                    {TASK_TILES.map((tile) => {
                        const isLoading = navigatingTo === tile.route;
                        return (
                            <TouchableOpacity
                                key={tile.id}
                                style={styles.gridItem}
                                onPress={() => handleTilePress(tile.route)}
                                disabled={!!navigatingTo}
                                activeOpacity={0.8}
                            >
                                <View style={[styles.tileCard, !!navigatingTo && !isLoading && styles.tileDisabled]}>
                                    {isLoading ? (
                                        <ActivityIndicator color={COLORS.brand} size="large" />
                                    ) : (
                                        <Ionicons name={tile.icon as any} size={36} color={tile.color} />
                                    )}
                                </View>
                                <Text style={styles.tileLabel}>{tile.name}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </ScrollView>

            {/* Project Selector Modal */}
            <Modal
                visible={showProjectSelector}
                transparent
                animationType="fade"
                onRequestClose={() => setShowProjectSelector(false)}
            >
                <Pressable style={styles.modalBackdrop} onPress={() => setShowProjectSelector(false)}>
                    <View style={styles.projectDropdown}>
                        {projects.map((project, idx) => (
                            <TouchableOpacity
                                key={project.name}
                                style={[
                                    styles.projectOption,
                                    idx < projects.length - 1 && styles.projectOptionBorder,
                                    selectedProject.name === project.name && styles.projectOptionSelected,
                                ]}
                                onPress={() => {
                                    setSelectedProject(project);
                                    setShowProjectSelector(false);
                                }}
                            >
                                <Text style={styles.projectOptionText}>{project.name}</Text>
                                {selectedProject.name === project.name && (
                                    <Ionicons name="checkmark" size={18} color={COLORS.brand} />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </Pressable>
            </Modal>

            {/* Calendar Modal */}
            <Modal
                visible={showCalendar}
                transparent
                animationType="fade"
                onRequestClose={() => setShowCalendar(false)}
            >
                <Pressable style={styles.modalBackdrop} onPress={() => setShowCalendar(false)}>
                    <Pressable style={styles.calendarModal} onPress={(e) => e.stopPropagation()}>
                        {/* Month Nav */}
                        <View style={styles.calendarHeader}>
                            <Text style={styles.calendarMonthName}>{monthName}</Text>
                            <View style={styles.calendarNavButtons}>
                                <TouchableOpacity style={styles.navBtn} onPress={handlePrevMonth}>
                                    <Ionicons name="chevron-back" size={20} color="#fff" />
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.navBtn} onPress={handleNextMonth}>
                                    <Ionicons name="chevron-forward" size={20} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Day of week headers */}
                        <View style={styles.calendarWeekHeader}>
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                                <Text key={i} style={styles.calendarWeekDay}>{d}</Text>
                            ))}
                        </View>

                        {/* Calendar days */}
                        <View style={styles.calendarGrid}>
                            {calendarDays.map((day, idx) => {
                                if (!day) return <View key={idx} style={styles.calendarDay} />;
                                const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
                                const dateKey = getDateKey(date);
                                const status = dayStatuses[dateKey] ?? 'none';
                                const isSelected = date.toDateString() === selectedDate.toDateString();
                                const isTodayDate = date.toDateString() === today.toDateString();
                                const isFuture = date > today;

                                return (
                                    <TouchableOpacity
                                        key={idx}
                                        style={[
                                            styles.calendarDay,
                                            isSelected && styles.calendarDaySelected,
                                            isTodayDate && !isSelected && styles.calendarDayToday,
                                        ]}
                                        onPress={() => {
                                            if (!isFuture) {
                                                setSelectedDate(new Date(date));
                                                setShowCalendar(false);
                                            }
                                        }}
                                        disabled={isFuture}
                                    >
                                        <Text
                                            style={[
                                                styles.calendarDayText,
                                                isSelected && styles.calendarDayTextSelected,
                                                isTodayDate && !isSelected && styles.calendarDayTextToday,
                                                isFuture && styles.mutedText,
                                            ]}
                                        >
                                            {day}
                                        </Text>
                                        {/* Status indicator */}
                                        <View style={styles.statusIndicator}>
                                            {status === 'signed' && (
                                                <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
                                            )}
                                            {status === 'unsigned' && (
                                                <View style={[styles.bar, { backgroundColor: COLORS.warning }]} />
                                            )}
                                            {status === 'missing' && !isFuture && (
                                                <View style={styles.triangle} />
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        {/* Legend */}
                        <View style={styles.legend}>
                            <View style={styles.legendItem}>
                                <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
                                <Text style={styles.legendText}>Signed</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={[styles.bar, { backgroundColor: COLORS.warning }]} />
                                <Text style={styles.legendText}>Unsigned</Text>
                            </View>
                            <View style={styles.legendItem}>
                                <View style={styles.triangle} />
                                <Text style={styles.legendText}>Missing</Text>
                            </View>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
}

const TILE_SIZE = (SCREEN_WIDTH - 48 - 24) / 3; // 3 cols with padding

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scrollView: { flex: 1 },
    scrollContent: { paddingBottom: 100 },

    // Header
    header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
    projectLabel: { color: COLORS.subtitle, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
    projectButton: {
        backgroundColor: COLORS.brand,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        shadowColor: COLORS.brand,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    projectName: { color: '#fff', fontSize: 17, fontWeight: '700', flex: 1 },

    // Section header
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 4 },
    sectionTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
    calendarButton: { width: 40, height: 40, backgroundColor: COLORS.card, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },

    reportingFor: { color: COLORS.brand, fontSize: 12, fontWeight: '500', paddingHorizontal: 16, marginBottom: 10 },

    // Weekday strip
    weekdayCard: { marginHorizontal: 16, backgroundColor: COLORS.card, borderRadius: 16, paddingVertical: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, marginBottom: 16 },
    weekdayScroll: { paddingHorizontal: 8, gap: 8 },
    weekday: { alignItems: 'center', gap: 4, paddingHorizontal: 4 },
    weekdayLetter: { fontSize: 11, fontWeight: '600', color: COLORS.subtitle, textTransform: 'uppercase' },
    weekdayNum: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    weekdaySelected: { backgroundColor: COLORS.blue },
    weekdayToday: { backgroundColor: 'rgba(10,132,255,0.2)' },
    weekdayFuture: {},
    weekdayNumText: { fontSize: 14, fontWeight: '600', color: '#fff' },
    weekdaySelectedText: { color: '#fff' },
    weekdayTodayText: { color: COLORS.blue },
    mutedText: { color: COLORS.muted },

    // Task grid
    grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12 },
    gridItem: { width: TILE_SIZE, alignItems: 'center', gap: 6 },
    tileCard: {
        width: TILE_SIZE,
        height: TILE_SIZE,
        backgroundColor: COLORS.card,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        elevation: 4,
    },
    tileDisabled: { opacity: 0.6 },
    tileLabel: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },

    // Modal
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },

    // Project dropdown
    projectDropdown: { width: '100%', backgroundColor: COLORS.card, borderRadius: 20, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    projectOption: { paddingHorizontal: 16, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    projectOptionBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
    projectOptionSelected: { backgroundColor: COLORS.border },
    projectOptionText: { color: '#fff', fontSize: 15, fontWeight: '600' },

    // Calendar modal
    calendarModal: { width: '100%', backgroundColor: COLORS.card, borderRadius: 20, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    calendarMonthName: { color: '#fff', fontSize: 16, fontWeight: '700' },
    calendarNavButtons: { flexDirection: 'row', gap: 8 },
    navBtn: { width: 32, height: 32, backgroundColor: COLORS.surface, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    calendarWeekHeader: { flexDirection: 'row', marginBottom: 8 },
    calendarWeekDay: { flex: 1, textAlign: 'center', color: COLORS.subtitle, fontSize: 12, fontWeight: '600' },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    calendarDay: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4, borderRadius: 10 },
    calendarDaySelected: { backgroundColor: COLORS.blue },
    calendarDayToday: { backgroundColor: 'rgba(10,132,255,0.2)' },
    calendarDayText: { color: '#fff', fontSize: 13, fontWeight: '500' },
    calendarDayTextSelected: { color: '#fff', fontWeight: '700' },
    calendarDayTextToday: { color: COLORS.blue, fontWeight: '700' },

    // Status indicators
    statusIndicator: { height: 8, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    bar: { width: 14, height: 3, borderRadius: 1.5 },
    triangle: {
        width: 0,
        height: 0,
        borderLeftWidth: 4,
        borderRightWidth: 4,
        borderBottomWidth: 7,
        borderLeftColor: 'transparent',
        borderRightColor: 'transparent',
        borderBottomColor: '#FF453A',
    },

    // Legend
    legend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendText: { color: COLORS.subtitle, fontSize: 11 },
});
