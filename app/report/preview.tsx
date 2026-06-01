import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Alert, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '@/context/AppContext';
import { buildDailyReportDashboardUrl } from '@/lib/reportDashboardUrl';
import { patchDashboardReportHtml, fetchDashboardReportHtmlForExport } from '@/lib/reportDashboardHtml';
import { getReportForDate, ReportData, getDateKey, parseDateKeyLocal, saveUnsignedReport, resyncSignedReportToSupabaseIfPresent } from '@/lib/dailyReportStorage';
import { generateReportPdf } from '@/lib/reportPdf';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

const C = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    success: '#30D158',
};

export default function ReportPreviewScreen() {
    const { selectedDate, setSelectedDate, selectedProject, currentUser } = useAppContext();
    const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
    const insets = useSafeAreaInsets();

    const [report, setReport] = useState<ReportData | null>(null);
    const [localLoading, setLocalLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [webLoading, setWebLoading] = useState(true);
    const [dashboardHtml, setDashboardHtml] = useState<string | null>(null);
    const [dashboardBaseUrl, setDashboardBaseUrl] = useState<string | undefined>(undefined);
    const [downloading, setDownloading] = useState(false);
    /** Avoid duplicate resync spam when parent re-renders with same date + project. */
    const signedResyncKeyRef = useRef<string | null>(null);

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
            { projectId: selectedProject.id },
        );
        setReport(data);
        setLocalLoading(false);
    }, [selectedDate, selectedProject]);

    const dashboardAvailable = useMemo(() => {
        const n = selectedProject?.name?.trim() ?? '';
        return n.length > 0 && n !== 'No Project Selected';
    }, [selectedProject.name]);

    const dateKey = getDateKey(selectedDate);

    useEffect(() => {
        signedResyncKeyRef.current = null;
    }, [dateKey, selectedProject.id]);

    useEffect(() => {
        if (localLoading || !report?.signed?.isSigned) return;
        const pid = selectedProject.id?.trim();
        if (!pid || selectedProject.name === 'No Project Selected') return;

        const key = `${dateKey}|${pid}`;
        if (signedResyncKeyRef.current === key) return;
        signedResyncKeyRef.current = key;

        void resyncSignedReportToSupabaseIfPresent(dateKey, {
            id: selectedProject.id,
            name: selectedProject.name,
        }).then((r) => {
            if (r && !r.ok) {
                console.warn('[ReportPreview] signed report cloud resync failed:', r.error);
            }
        });
    }, [localLoading, report?.signed?.isSigned, dateKey, selectedProject.id, selectedProject.name]);

    const dashboardUri = useMemo(() => {
        if (!dashboardAvailable) return null;
        const pb = (report?.signed?.preparedBy || currentUser.name || '').trim();
        return buildDailyReportDashboardUrl(dateKey, selectedProject.name, pb || undefined);
    }, [dashboardAvailable, dateKey, selectedProject.name, currentUser.name, report?.signed?.preparedBy]);

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

            const syncRes = await saveUnsignedReport(dateKey, {
                reportDate: dateKey,
                preparedBy: report.signed?.preparedBy || currentUser.name || 'Draft',
                projectName: selectedProject.name,
                projectId: selectedProject.id?.trim() || undefined,
                unsignedReportUrl: unsignedReportUrl || undefined,
                isSigned: false,
            });
            if (!syncRes.ok) {
                Alert.alert(
                    'Cloud sync failed',
                    `${syncRes.error}\n\nYour device saved a draft, but Supabase did not update. Check you are signed in, the project is selected, and RLS allows INSERT/UPDATE on daily_signed_reports.`,
                );
                return;
            }
            Alert.alert('Success', 'Unsigned report synced to cloud.');
            loadReport();
        } catch (e) {
            console.error(e);
            alert('Failed to sync report.');
        } finally {
            setSyncing(false);
        }
    };

    const isSigned = report?.signed?.isSigned === true;
    const signedInfo = report?.signed ?? null;
    const signedReportUrl = signedInfo?.reportUrl ?? null;

    /** PDF matches the on-screen dashboard preview (not the separate declaration PDF). */
    const handleDownloadReport = useCallback(async () => {
        if (!dashboardUri) {
            Alert.alert('Not available', 'Select a project to export the report.');
            return;
        }
        try {
            setDownloading(true);

            const patchParams = {
                preparedBy: (signedInfo?.preparedBy || currentUser.name || '').trim(),
                isSignedWithSignature: !!(isSigned && signedInfo?.signatureDataUrl),
                signatureDataUrl: signedInfo?.signatureDataUrl,
            };

            const exported = await fetchDashboardReportHtmlForExport(dashboardUri, patchParams);

            if (exported && (await Sharing.isAvailableAsync())) {
                const { uri } = await Print.printToFileAsync({
                    html: exported.htmlForPrint,
                    margins: { top: 12, bottom: 12, left: 12, right: 12 },
                });
                await Sharing.shareAsync(uri);
                return;
            }

            // Legacy: hosted PDF from sign flow (may differ from preview).
            if (isSigned && signedReportUrl) {
                if (await Sharing.isAvailableAsync()) {
                    const dest = `${FileSystem.cacheDirectory}fw_signed_report_${dateKey}.pdf`;
                    const result = signedReportUrl.startsWith('file://')
                        ? { uri: signedReportUrl }
                        : await FileSystem.downloadAsync(signedReportUrl, dest);
                    await Sharing.shareAsync(result.uri);
                    return;
                }
                if (await Linking.canOpenURL(signedReportUrl)) {
                    await Linking.openURL(signedReportUrl);
                    return;
                }
            }

            Alert.alert(
                'Export failed',
                'Could not build a PDF from the report page. Check your connection and try again.',
            );
        } catch {
            Alert.alert('Error', 'Failed to export the report.');
        } finally {
            setDownloading(false);
        }
    }, [
        dashboardUri,
        dateKey,
        isSigned,
        signedInfo?.preparedBy,
        signedInfo?.signatureDataUrl,
        signedReportUrl,
        currentUser.name,
    ]);

    const preparedByForHtml = useMemo(() => {
        return (signedInfo?.preparedBy || currentUser.name || '').trim();
    }, [signedInfo?.preparedBy, currentUser.name]);

    useEffect(() => {
        let cancelled = false;
        async function loadDashboardHtml() {
            if (!dashboardUri) {
                setDashboardHtml(null);
                setDashboardBaseUrl(undefined);
                return;
            }
            setWebLoading(true);
            try {
                const res = await fetch(dashboardUri, { method: 'GET' });
                const html = await res.text();
                if (cancelled) return;

                const patched = patchDashboardReportHtml(html, {
                    preparedBy: preparedByForHtml,
                    isSignedWithSignature: !!(isSigned && signedInfo?.signatureDataUrl),
                    signatureDataUrl: signedInfo?.signatureDataUrl,
                });

                // Base URL helps relative assets resolve.
                try {
                    const u = new URL(dashboardUri);
                    setDashboardBaseUrl(`${u.protocol}//${u.host}`);
                } catch {
                    setDashboardBaseUrl(undefined);
                }

                setDashboardHtml(patched);
            } catch {
                // Fallback: if fetch fails, let WebView load by uri.
                setDashboardHtml(null);
                setDashboardBaseUrl(undefined);
            } finally {
                if (!cancelled) setWebLoading(false);
            }
        }
        void loadDashboardHtml();
        return () => {
            cancelled = true;
        };
    }, [dashboardUri, preparedByForHtml, isSigned, signedInfo]);

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
                    source={
                        dashboardHtml
                            ? { html: dashboardHtml, baseUrl: dashboardBaseUrl }
                            : { uri: dashboardUri }
                    }
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
                <View style={styles.headerRight}>
                    {dashboardUri ? (
                        <TouchableOpacity
                            style={[styles.downloadBtn, downloading && { opacity: 0.7 }]}
                            onPress={handleDownloadReport}
                            disabled={downloading}
                            hitSlop={10}
                            accessibilityLabel="Download or share report PDF"
                        >
                            {downloading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Ionicons name="download-outline" size={18} color="#fff" />
                            )}
                        </TouchableOpacity>
                    ) : null}
                    {isSigned ? (
                        <View style={styles.signedBadge}>
                            <Ionicons name="checkmark-circle" size={14} color={C.success} />
                            <Text style={styles.signedBadgeText}>Signed</Text>
                        </View>
                    ) : null}
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
    headerRight: { minWidth: 72, alignItems: 'flex-end', flexDirection: 'row', gap: 10 },
    downloadBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: C.brand,
        alignItems: 'center',
        justifyContent: 'center',
    },
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
