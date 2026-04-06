import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Image,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '@/context/AppContext';
import {
    getReportForDate,
    ReportData,
    getDateKey,
    EquipmentChecklistEntry,
    ObservationEntry,
    IncidentEntry,
    saveUnsignedReport,
} from '@/lib/dailyReportStorage';
import { generateReportPdf } from '@/lib/reportPdf';

const C = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    success: '#30D158',
    warning: '#FFD60A',
    white: '#FFFFFF',
};

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <View style={rs.section}>
            <View style={rs.sectionHeader}>
                <Text style={rs.sectionTitle}>{title}</Text>
            </View>
            {children}
        </View>
    );
}

function Row({ label, value }: { label: string; value?: string }) {
    return (
        <View style={rs.row}>
            <Text style={rs.rowLabel}>{label}</Text>
            <Text style={rs.rowValue}>{value || '—'}</Text>
        </View>
    );
}

export default function ReportPreviewScreen() {
    const { selectedDate, selectedProject } = useAppContext();
    const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
    const insets = useSafeAreaInsets();

    const [report, setReport] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    const reportDate = dateParam
        ? (() => { const [y, m, d] = dateParam.split('-').map(Number); return new Date(y, m - 1, d); })()
        : selectedDate;

    const loadReport = useCallback(async () => {
        setLoading(true);
        const data = await getReportForDate(reportDate, selectedProject.name);
        setReport(data);
        setLoading(false);
    }, [reportDate, selectedProject.name]);

    useEffect(() => { loadReport(); }, [loadReport]);

    const handleSyncUnsigned = async () => {
        if (!report) return;
        setSyncing(true);
        try {
            const dateKey = getDateKey(reportDate);
            // Generate unsigned PDF
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

    const dateLabel = reportDate.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });

    if (loading) {
        return (
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <Ionicons name="chevron-back" size={22} color="#fff" />
                        <Text style={styles.backText}>Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Daily Report</Text>
                    <View style={{ minWidth: 72 }} />
                </View>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color={C.brand} size="large" />
                    <Text style={styles.loadingText}>Building report...</Text>
                </View>
            </View>
        );
    }

    const isSigned = !!report?.signed;
    const dateKey = getDateKey(reportDate);

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
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

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                {/* Report Paper */}
                <View style={styles.paper}>
                    {/* Report Header */}
                    <View style={styles.reportHeader}>
                        <View style={styles.reportLogoWrap}>
                            <View style={styles.reportLogo}>
                                <Text style={styles.reportLogoText}>FW</Text>
                            </View>
                        </View>
                        <Text style={styles.reportCompany}>FieldWorker</Text>
                        <Text style={styles.reportTitle}>Daily Field Report</Text>
                        <View style={styles.reportMeta}>
                            <Text style={styles.reportMetaText}>Date: {dateLabel}</Text>
                            <Text style={styles.reportMetaText}>Project: {report?.projectName}</Text>
                        </View>
                    </View>

                    {/* General Notes */}
                    {report && report.notes.length > 0 && (
                        <SectionBlock title="General Notes">
                            {report.notes.map((note, i) => (
                                <View key={note.id} style={rs.noteEntry}>
                                    <View style={rs.noteBullet} />
                                    <View style={rs.noteContent}>
                                        <Text style={rs.noteCat}>{note.category}</Text>
                                        <Text style={rs.noteText}>{note.notes}</Text>
                                        {note.photos && note.photos.length > 0 && (
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
                                                {note.photos.map((uri, i) => (
                                                    <Image key={i} source={{ uri }} style={rs.photoPreview} />
                                                ))}
                                            </ScrollView>
                                        )}
                                        <Text style={rs.noteTime}>{new Date(note.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text>
                                    </View>
                                </View>
                            ))}
                        </SectionBlock>
                    )}

                    {/* Daily Metrics */}
                    {report && report.metrics.length > 0 && (
                        <SectionBlock title="Daily Metrics">
                            {report.metrics.map((m) => (
                                <View key={m.id}>
                                    {m.waterUsage && <Row label="Water Usage" value={`${m.waterUsage} GAL`} />}
                                    {m.acresCompleted && <Row label="Acres Completed" value={`${m.acresCompleted} acres`} />}
                                    {m.numberOfOperators && <Row label="Operators" value={m.numberOfOperators} />}
                                    {m.notes && <Row label="Notes" value={m.notes} />}
                                    {m.photos && m.photos.length > 0 && (
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
                                            {m.photos.map((uri, i) => (
                                                <Image key={i} source={{ uri }} style={rs.photoPreview} />
                                            ))}
                                        </ScrollView>
                                    )}
                                </View>
                            ))}
                        </SectionBlock>
                    )}

                    {/* Chemicals */}
                    {report && report.chemicals.length > 0 && (
                        <SectionBlock title="Chemicals Left on Truck">
                            {report.chemicals.map((entry) => (
                                <View key={entry.id}>
                                    <View style={{ paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#F8F8F8' }}>
                                        <Text style={{ color: '#666', fontSize: 11, fontWeight: '600' }}>
                                            Method: {entry.applicationType === 'wicking' ? 'Wicking' : 'Spraying'}
                                        </Text>
                                    </View>
                                    {entry.chemicals.map((chem, ci) => (
                                        <Row key={`${entry.id}-${ci}`} label={chem.name} value={`${chem.quantity} ${chem.unit}`} />
                                    ))}
                                    {entry.photos && entry.photos.length > 0 && (
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
                                            {entry.photos.map((uri, i) => (
                                                <Image key={i} source={{ uri }} style={rs.photoPreview} />
                                            ))}
                                        </ScrollView>
                                    )}
                                </View>
                            ))}
                        </SectionBlock>
                    )}

                    {/* Equipment Checklist */}
                    {report && report.equipment.filter((e) => (e as any).type === 'checklist').length > 0 && (
                        <SectionBlock title="Equipment Checklist">
                            {report.equipment
                                .filter((e) => (e as any).type === 'checklist')
                                .map((entry) => {
                                    const cl = entry as EquipmentChecklistEntry;
                                    return (
                                        <View key={cl.id}>
                                            <Row label="Machine #" value={cl.formData.machineNumber} />
                                            <Row label="Operator" value={cl.formData.operatorName} />
                                            <Row label="Site" value={cl.formData.siteName} />
                                            <Row label="ASV Hours" value={cl.formData.asvHours} />
                                            <Row label="Motor Oil" value={cl.formData.motorOil} />
                                            <Row label="Coolant" value={cl.formData.coolant} />
                                            <Row label="Hydraulic Oil" value={cl.formData.hydraulicOil} />
                                            <Row label="Hoses" value={cl.formData.hoses} />
                                            <Row label="Fan Belt" value={cl.formData.fanBelt} />
                                            {cl.formData.repairsNotes && <Row label="Repairs/Issues" value={cl.formData.repairsNotes} />}
                                            {cl.photos && cl.photos.length > 0 && (
                                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
                                                    {cl.photos.map((uri, i) => (
                                                        <Image key={i} source={{ uri }} style={rs.photoPreview} />
                                                    ))}
                                                </ScrollView>
                                            )}
                                        </View>
                                    );
                                })}
                        </SectionBlock>
                    )}

                    {/* Observations */}
                    {report && report.observations.length > 0 && (
                        <SectionBlock title="Observations">
                            {report.observations.map((obs) => (
                                <View key={obs.id} style={rs.noteEntry}>
                                    <View style={[rs.noteBullet, {
                                        backgroundColor: obs.category === 'Negative' ? '#FF453A' : '#30D158',
                                    }]} />
                                    <View style={rs.noteContent}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Text style={[rs.noteCat, {
                                                color: obs.category === 'Negative' ? '#FF453A' : '#30D158',
                                            }]}>
                                                {obs.category}
                                            </Text>
                                            <View style={{
                                                backgroundColor: obs.priority === 'Critical' ? '#FF453A20' : obs.priority === 'High' ? '#FF663320' : '#98989D20',
                                                borderRadius: 4,
                                                paddingHorizontal: 6,
                                                paddingVertical: 1,
                                            }}>
                                                <Text style={{
                                                    fontSize: 10,
                                                    fontWeight: '700',
                                                    color: obs.priority === 'Critical' ? '#FF453A' : obs.priority === 'High' ? '#FF6633' : '#666',
                                                }}>{obs.priority}</Text>
                                            </View>
                                        </View>
                                        <Text style={rs.noteText}>{obs.type}</Text>
                                        {obs.description ? (
                                            <Text style={[rs.noteText, { color: '#666', fontSize: 12 }]}>{obs.description}</Text>
                                        ) : null}
                                        {(obs.attachments?.length || obs.resolutionPhotos?.length) ? (
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
                                                {obs.attachments?.map((uri, i) => (
                                                    <Image key={`att-${i}`} source={{ uri }} style={rs.photoPreview} />
                                                ))}
                                                {obs.resolutionPhotos?.map((uri, i) => (
                                                    <Image key={`res-${i}`} source={{ uri }} style={rs.photoPreview} />
                                                ))}
                                            </ScrollView>
                                        ) : null}
                                        <Text style={rs.noteTime}>Status: {obs.status}</Text>
                                    </View>
                                </View>
                            ))}
                        </SectionBlock>
                    )}

                    {/* Incidents */}
                    {report && report.incidents.length > 0 && (
                        <SectionBlock title="Incidents">
                            {report.incidents.map((inc) => (
                                <View key={inc.id} style={rs.noteEntry}>
                                    <View style={[rs.noteBullet, { backgroundColor: '#FF453A' }]} />
                                    <View style={rs.noteContent}>
                                        <Text style={rs.noteText}>{inc.title || 'Untitled Incident'}</Text>
                                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
                                            <Text style={rs.noteTime}>Status: {inc.status}</Text>
                                            {inc.recordable && <Text style={[rs.noteTime, { color: '#FF453A' }]}>Recordable</Text>}
                                        </View>
                                        {inc.injuryIllnessType ? (
                                            <Text style={[rs.noteText, { color: '#666', fontSize: 12, marginTop: 2 }]}>Type: {inc.injuryIllnessType}</Text>
                                        ) : null}
                                        {inc.description ? (
                                            <Text style={[rs.noteText, { color: '#666', fontSize: 12, marginTop: 2 }]}>{inc.description}</Text>
                                        ) : null}
                                        {inc.photos && inc.photos.length > 0 && (
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
                                                {inc.photos.map((uri, i) => (
                                                    <Image key={i} source={{ uri }} style={rs.photoPreview} />
                                                ))}
                                            </ScrollView>
                                        )}
                                    </View>
                                </View>
                            ))}
                        </SectionBlock>
                    )}

                    {/* Survey */}
                    {report && report.survey.length > 0 && (
                        <SectionBlock title="Site Survey">
                            {report.survey[report.survey.length - 1].questions.map((q) => (
                                <View key={q.id} style={rs.surveyRow}>
                                    <Text style={rs.surveyQ} numberOfLines={3}>{q.question}</Text>
                                    <View style={[rs.surveyAns, {
                                        backgroundColor: q.answer === 'Yes' ? '#FF453A20' : q.answer === 'No' ? '#30D15820' : '#98989D20'
                                    }]}>
                                        <Text style={[rs.surveyAnsText, {
                                            color: q.answer === 'Yes' ? '#FF453A' : q.answer === 'No' ? '#30D158' : '#98989D'
                                        }]}>{q.answer || '—'}</Text>
                                    </View>
                                </View>
                            ))}
                        </SectionBlock>
                    )}

                    {/* Attachments */}
                    {report && report.attachments.length > 0 && (
                        <SectionBlock title="General Attachments">
                            {report.attachments.map((att) => (
                                <View key={att.id} style={rs.noteEntry}>
                                    <View style={rs.noteBullet} />
                                    <View style={rs.noteContent}>
                                        {att.notes && <Text style={rs.noteText}>{att.notes}</Text>}
                                        {att.previews && att.previews.length > 0 && (
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 8 }}>
                                                {att.previews.map((uri, i) => (
                                                    <Image key={i} source={{ uri }} style={rs.photoPreview} />
                                                ))}
                                            </ScrollView>
                                        )}
                                        <Text style={rs.noteTime}>{new Date(att.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text>
                                    </View>
                                </View>
                            ))}
                        </SectionBlock>
                    )}

                    {/* Empty report */}
                    {report && !report.notes.length && !report.metrics.length && !report.chemicals.length && !report.equipment.length && !report.survey.length && !report.observations.length && !report.incidents.length && !report.attachments.length && (
                        <View style={rs.emptyReport}>
                            <Ionicons name="document-outline" size={40} color="#ccc" />
                            <Text style={rs.emptyReportText}>No data logged for this date</Text>
                        </View>
                    )}

                    {/* Signature block */}
                    <View style={rs.signBlock}>
                        <Text style={rs.signTitle}>Prepared By</Text>
                        {isSigned ? (
                            <View style={rs.signedInfo}>
                                <Ionicons name="checkmark-circle" size={18} color={C.success} />
                                <View>
                                    <Text style={rs.signedName}>{report?.signed?.preparedBy}</Text>
                                    <Text style={rs.signedDate}>Signed {report?.signed?.signedAt ? new Date(report.signed.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</Text>
                                </View>
                            </View>
                        ) : (
                            <View style={rs.unsignedBox}>
                                <Text style={rs.unsignedText}>Not yet signed</Text>
                            </View>
                        )}
                    </View>
                </View>
            </ScrollView>

            {/* Footer */}
            {!isSigned && (
                <View style={[styles.footer, { paddingBottom: insets.bottom + 16, gap: 12 }]}>
                    <TouchableOpacity
                        style={[styles.syncBtn, syncing && { opacity: 0.7 }]}
                        onPress={handleSyncUnsigned}
                        disabled={syncing}
                    >
                        {syncing ? <ActivityIndicator color={C.brand} size="small" /> : <Ionicons name="cloud-upload" size={18} color={C.brand} />}
                        <Text style={styles.syncBtnText}>{syncing ? 'Syncing...' : 'Sync Unsigned Report'}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.signBtn}
                        onPress={() => router.push(`/report/sign?date=${dateKey}`)}
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
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border, backgroundColor: C.card },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 72 },
    backText: { color: '#fff', fontSize: 15, fontWeight: '500' },
    headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: '700' },
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    loadingText: { color: C.subtitle, fontSize: 14 },
    scroll: { flex: 1, backgroundColor: '#E5E5E5' },
    scrollContent: { padding: 16, paddingBottom: 40 },
    paper: { backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
    reportHeader: { backgroundColor: C.brand, padding: 20, alignItems: 'center', gap: 6 },
    reportLogoWrap: { marginBottom: 4 },
    reportLogo: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
    reportLogoText: { color: '#fff', fontSize: 18, fontWeight: '900' },
    reportCompany: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600', letterSpacing: 1 },
    reportTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
    reportMeta: { marginTop: 4, gap: 2, alignItems: 'center' },
    reportMetaText: { color: 'rgba(255,255,255,0.9)', fontSize: 12 },
    signedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.success + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    signedBadgeText: { color: C.success, fontSize: 12, fontWeight: '600' },
    footer: { backgroundColor: C.card, padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
    signBtn: { backgroundColor: C.brand, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: C.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
    signBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    syncBtn: { backgroundColor: 'transparent', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 2, borderColor: C.brand },
    syncBtnText: { color: C.brand, fontSize: 16, fontWeight: '700' },
});

const rs = StyleSheet.create({
    section: { borderTopWidth: 1, borderTopColor: '#E5E5E5' },
    sectionHeader: { backgroundColor: '#F8F8F8', paddingHorizontal: 16, paddingVertical: 8 },
    sectionTitle: { color: '#333', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
    rowLabel: { color: '#666', fontSize: 13, flex: 1 },
    rowValue: { color: '#111', fontSize: 13, fontWeight: '500', flex: 1, textAlign: 'right' },
    noteEntry: { flexDirection: 'row', gap: 10, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
    noteBullet: { width: 3, backgroundColor: C.brand, borderRadius: 2, marginTop: 4 },
    noteContent: { flex: 1, gap: 2 },
    noteCat: { color: C.brand, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
    noteText: { color: '#111', fontSize: 14, lineHeight: 20 },
    noteTime: { color: '#999', fontSize: 11 },
    surveyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0', gap: 12 },
    surveyQ: { flex: 1, color: '#333', fontSize: 12, lineHeight: 17 },
    surveyAns: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    surveyAnsText: { fontSize: 12, fontWeight: '700' },
    signBlock: { padding: 16, backgroundColor: '#FAFAFA', gap: 10 },
    signTitle: { color: '#666', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
    signedInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    signedName: { color: '#111', fontSize: 15, fontWeight: '700' },
    signedDate: { color: '#999', fontSize: 12 },
    unsignedBox: { height: 50, borderRadius: 8, borderWidth: 1, borderColor: '#DDD', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
    unsignedText: { color: '#BBB', fontSize: 13 },
    emptyReport: { padding: 40, alignItems: 'center', gap: 10 },
    emptyReportText: { color: '#999', fontSize: 14 },
    attachmentPreview: { width: 100, height: 100, borderRadius: 8, backgroundColor: '#f0f0f0' }, // DEPRECATED: use photoPreview
    photoPreview: { width: 100, height: 100, borderRadius: 8, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#eee' },
});
