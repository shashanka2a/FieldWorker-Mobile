import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { getSignedReportDateKeys, getSignedReport, SignedReportEntry } from '@/lib/dailyReportStorage';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    success: '#30D158',
};

interface ReportSummary {
    dateKey: string;
    entry: SignedReportEntry;
}

export default function ReportsScreen() {
    const [reports, setReports] = useState<ReportSummary[]>([]);
    const [refreshing, setRefreshing] = useState(false);

    const loadReports = useCallback(async () => {
        const keys = await getSignedReportDateKeys();
        const entries = await Promise.all(
            keys.map(async (k) => {
                const entry = await getSignedReport(k);
                return entry ? { dateKey: k, entry } : null;
            })
        );
        setReports(entries.filter(Boolean) as ReportSummary[]);
    }, []);

    useEffect(() => { loadReports(); }, [loadReports]);

    const onRefresh = async () => {
        setRefreshing(true);
        await loadReports();
        setRefreshing(false);
    };

    const formatDate = (key: string) => {
        const [y, m, d] = key.split('-').map(Number);
        return new Date(y, m - 1, d).toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        });
    };

    return (
        <View style={styles.container}>
            <ScreenHeader title="Signed Reports" subtitle={`${reports.length} total`} />
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
            >
                {reports.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="document-text-outline" size={56} color={COLORS.subtitle} />
                        <Text style={styles.emptyTitle}>No Signed Reports</Text>
                        <Text style={styles.emptySubtitle}>
                            Complete a daily report and sign it to see it appear here.
                        </Text>
                    </View>
                ) : (
                    reports.map((r) => (
                        <TouchableOpacity
                            key={r.dateKey}
                            style={styles.reportCard}
                            onPress={() => router.push(`/report/preview?date=${r.dateKey}`)}
                            activeOpacity={0.8}
                        >
                            <View style={styles.reportIconWrap}>
                                <Ionicons name="document-text" size={24} color={COLORS.success} />
                            </View>
                            <View style={styles.reportInfo}>
                                <Text style={styles.reportDate}>{formatDate(r.dateKey)}</Text>
                                <Text style={styles.reportProject}>{r.entry.projectName}</Text>
                                <Text style={styles.reportSigner}>Signed by {r.entry.preparedBy}</Text>
                            </View>
                            <View style={styles.reportMeta}>
                                <View style={styles.signedBadge}>
                                    <Ionicons name="checkmark-circle" size={12} color={COLORS.success} />
                                    <Text style={styles.signedText}>Signed</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={16} color={COLORS.subtitle} />
                            </View>
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 40, gap: 10 },
    emptyState: { alignItems: 'center', paddingTop: 80, gap: 12, paddingHorizontal: 32 },
    emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
    emptySubtitle: { color: COLORS.subtitle, fontSize: 14, textAlign: 'center', lineHeight: 22 },
    reportCard: {
        backgroundColor: COLORS.card,
        borderRadius: 16,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    reportIconWrap: {
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: COLORS.success + '20',
        alignItems: 'center',
        justifyContent: 'center',
    },
    reportInfo: { flex: 1, gap: 3 },
    reportDate: { color: '#fff', fontSize: 14, fontWeight: '700' },
    reportProject: { color: COLORS.subtitle, fontSize: 12 },
    reportSigner: { color: COLORS.subtitle, fontSize: 12 },
    reportMeta: { alignItems: 'flex-end', gap: 6 },
    signedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.success + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
    signedText: { color: COLORS.success, fontSize: 11, fontWeight: '600' },
});
