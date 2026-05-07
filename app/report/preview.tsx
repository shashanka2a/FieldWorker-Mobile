import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '@/context/AppContext';
import { buildDailyReportDashboardUrl } from '@/lib/reportDashboardUrl';
import { getReportForDate, ReportData, getDateKey, parseDateKeyLocal, saveUnsignedReport } from '@/lib/dailyReportStorage';
import { generateReportPdf } from '@/lib/reportPdf';

const C = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    success: '#30D158',
};

export default function ReportPreviewScreen() {
    const { selectedDate, setSelectedDate, selectedProject } = useAppContext();
    const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
    const insets = useSafeAreaInsets();

    const [report, setReport] = useState<ReportData | null>(null);
    const [localLoading, setLocalLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [webLoading, setWebLoading] = useState(true);

    useEffect(() => {
        if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return;
        if (dateParam === getDateKey(selectedDate)) return;
        void setSelectedDate(parseDateKeyLocal(dateParam));
    }, [dateParam, selectedDate, setSelectedDate]);

    const loadReport = useCallback(async () => {
        setLocalLoading(true);
        const data = await getReportForDate(
            selectedDate,
            selectedProject.name,
            selectedProject.address,
            selectedProject.zipcode,
        );
        setReport(data);
        setLocalLoading(false);
    }, [selectedDate, selectedProject]);

    const dashboardAvailable = useMemo(() => {
        const n = selectedProject?.name?.trim() ?? '';
        return n.length > 0 && n !== 'No Project Selected';
    }, [selectedProject.name]);

    const dateKey = getDateKey(selectedDate);

    const dashboardUri = useMemo(() => {
        if (!dashboardAvailable) return null;
        return buildDailyReportDashboardUrl(dateKey, selectedProject.name);
    }, [dashboardAvailable, dateKey, selectedProject.name]);

    useEffect(() => {
        if (dashboardUri) setWebLoading(true);
    }, [dashboardUri]);

    useEffect(() => {
        loadReport();
    }, [loadReport]);

    const handleSyncUnsigned = async () => {
        if (!report) return;
        setSyncing(true);
        try {
            const unsignedReportUrl = await generateReportPdf(report, false);

            await saveUnsignedReport(dateKey, {
                reportDate: dateKey,
                preparedBy: report.signed?.preparedBy || 'Draft',
                projectName: selectedProject.name,
                unsignedReportUrl: unsignedReportUrl || undefined,
                isSigned: false,
            });
            alert('Unsigned report synced to cloud!');
            loadReport();
        } catch (e) {
            console.error(e);
            alert('Failed to sync report.');
        } finally {
            setSyncing(false);
        }
    };

    const isSigned = !!report?.signed;

    const renderReportWeb = () => {
        if (!dashboardUri) {
            return (
                <View style={styles.loadingContainer}>
                    <Ionicons name="earth-outline" size={40} color={C.subtitle} />
                    <Text style={styles.loadingText}>Select a project to load the daily report.</Text>
                </View>
            );
        }

        return (
            <View style={styles.webWrap}>
                {webLoading && (
                    <View style={styles.webLoadingOverlay}>
                        <ActivityIndicator color={C.brand} size="large" />
                        <Text style={styles.loadingText}>Loading report…</Text>
                    </View>
                )}
                <WebView
                    key={dashboardUri}
                    source={{ uri: dashboardUri }}
                    style={styles.webview}
                    onLoadStart={() => setWebLoading(true)}
                    onLoadEnd={() => setWebLoading(false)}
                    onError={() => setWebLoading(false)}
                />
            </View>
        );
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={22} color="#fff" />
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Daily Report</Text>
                <View style={{ minWidth: 72, alignItems: 'flex-end' }}>
                    {isSigned && (
                        <View style={styles.signedBadge}>
                            <Ionicons name="checkmark-circle" size={14} color={C.success} />
                            <Text style={styles.signedBadgeText}>Signed</Text>
                        </View>
                    )}
                </View>
            </View>

            <View style={styles.bodyFlex}>{renderReportWeb()}</View>

            {!isSigned && (
                <View style={[styles.footer, { paddingBottom: insets.bottom + 16, gap: 12 }]}>
                    <TouchableOpacity
                        style={[styles.syncBtn, syncing && { opacity: 0.7 }]}
                        onPress={handleSyncUnsigned}
                        disabled={syncing || !report}
                    >
                        {syncing ? (
                            <ActivityIndicator color={C.brand} size="small" />
                        ) : (
                            <Ionicons name="cloud-upload" size={18} color={C.brand} />
                        )}
                        <Text style={styles.syncBtnText}>{syncing ? 'Syncing...' : 'Sync Unsigned Report'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.signBtn}
                        onPress={() => router.push('/report/sign')}
                        disabled={!report || localLoading}
                    >
                        <Ionicons name="pencil" size={18} color="#fff" />
                        <Text style={styles.signBtnText}>Sign Report</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.surface },
    bodyFlex: { flex: 1 },
    webWrap: { flex: 1, backgroundColor: '#fff' },
    webview: { flex: 1, backgroundColor: '#fff' },
    webLoadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        backgroundColor: 'rgba(28,28,30,0.35)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: C.border,
        backgroundColor: C.card,
    },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 72 },
    backText: { color: '#fff', fontSize: 15, fontWeight: '500' },
    headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: '700' },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
    loadingText: { color: C.subtitle, fontSize: 14, textAlign: 'center' },
    signedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: C.success + '20',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    signedBadgeText: { color: C.success, fontSize: 12, fontWeight: '600' },
    footer: {
        backgroundColor: C.card,
        padding: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: C.border,
    },
    signBtn: {
        backgroundColor: C.brand,
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        shadowColor: C.brand,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 6,
    },
    signBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    syncBtn: {
        backgroundColor: 'transparent',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderWidth: 2,
        borderColor: C.brand,
    },
    syncBtnText: { color: C.brand, fontSize: 16, fontWeight: '700' },
});
