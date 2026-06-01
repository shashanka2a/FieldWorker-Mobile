import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    Image,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import SignatureCanvas from 'react-native-signature-canvas';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '@/context/AppContext';
import { KeyboardAwareScrollView } from '@/components/KeyboardAwareScrollView';
import { saveSignedReport, getDateKey, getReportForDate, parseDateKeyLocal } from '@/lib/dailyReportStorage';
import { generateReportPdf } from '@/lib/reportPdf';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    success: '#30D158',
};

export default function SignReportScreen() {
    const { selectedDate, setSelectedDate, selectedProject, currentUser } = useAppContext();
    const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
    const insets = useSafeAreaInsets();
    const sigRef = useRef<any>(null);

    const [signatureData, setSignatureData] = useState<string>('');
    const [sigCaptured, setSigCaptured] = useState(false);
    const [isSigning, setIsSigning] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return;
        if (dateParam === getDateKey(selectedDate)) return;
        void setSelectedDate(parseDateKeyLocal(dateParam));
    }, [dateParam, selectedDate, setSelectedDate]);

    const dateLabel = selectedDate.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });

    const handleSignatureOK = (sig: string) => {
        setSignatureData(sig);
        setSigCaptured(true);
    };

    const clearSignature = () => {
        sigRef.current?.clearSignature();
        setSignatureData('');
        setSigCaptured(false);
    };

    const handleSignatureBegin = useCallback(() => {
        setIsSigning(true);
    }, []);

    const handleSignatureEnd = useCallback(() => {
        setIsSigning(false);
    }, []);

    const confirmSignatureCapture = useCallback(() => {
        sigRef.current?.readSignature();
    }, []);

    const handleSubmit = async () => {
        const preparedBy = (currentUser.name ?? '').trim();
        if (!preparedBy) {
            Alert.alert('Required', 'Your user profile is missing a name. Please sign in again.');
            return;
        }
        if (!sigCaptured || !signatureData) {
            Alert.alert('Required', 'Draw your signature in the box, then tap “Done signing” before submitting the report.');
            return;
        }
        setSaving(true);
        try {
            const dateKey = getDateKey(selectedDate);

            // Get existing report from storage to preserve links if any
            const existingReportData = await getReportForDate(
                selectedDate,
                selectedProject.name,
                selectedProject.address,
                selectedProject.zipcode,
                { projectId: selectedProject.id },
            );
            const existingSignedInfo = existingReportData.signed;
            
            // Temporary signed report object for PDF generation
            const signedReportInfo = {
                reportDate: dateKey,
                signedAt: new Date().toISOString(),
                preparedBy,
                signatureDataUrl: signatureData,
                projectName: selectedProject.name,
                projectId: selectedProject.id?.trim() || undefined,
                isSigned: true,
                unsignedReportUrl: existingSignedInfo?.unsignedReportUrl,
            };
            
            // Generate the signed PDF
            const reportPdfUrl = await generateReportPdf({
                ...existingReportData,
                signed: signedReportInfo
            }, true);

            const syncRes = await saveSignedReport(dateKey, {
                ...signedReportInfo,
                reportUrl: reportPdfUrl || undefined,
            });
            if (!syncRes.ok) {
                Alert.alert(
                    'Saved on device only',
                    `${syncRes.error}\n\nYour signature is saved on this phone, but the server did not record it. Stay on Wi‑Fi, confirm you are logged in, then tap the report again to retry sync. If it persists, run the RLS policies in schema.sql for daily_signed_reports and projects in the Supabase SQL editor.`,
                );
                return;
            }
            setSaved(true);
            setTimeout(() => {
                router.back();
                router.back(); // go back past report preview
            }, 1200);
        } catch {
            Alert.alert('Error', 'Failed to sign report. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={22} color="#fff" />
                    <Text style={styles.backText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Sign Report</Text>
                <View style={{ minWidth: 72 }} />
            </View>

            <KeyboardAwareScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                nestedScrollEnabled
                scrollEnabled={!isSigning}
            >

                {/* Report Info Card */}
                <View style={styles.infoCard}>
                    <View style={styles.infoRow}>
                        <Ionicons name="document-text-outline" size={16} color={COLORS.subtitle} />
                        <Text style={styles.infoLabel}>Report Date</Text>
                        <Text style={styles.infoValue}>{dateLabel}</Text>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.infoRow}>
                        <Ionicons name="business-outline" size={16} color={COLORS.subtitle} />
                        <Text style={styles.infoLabel}>Project</Text>
                        <Text style={styles.infoValue}>{selectedProject.name}</Text>
                    </View>
                    {(selectedProject.address || selectedProject.zipcode) && (
                        <>
                            <View style={styles.divider} />
                            <View style={styles.infoRow}>
                                <Ionicons name="location-outline" size={16} color={COLORS.subtitle} />
                                <Text style={styles.infoLabel}>Address</Text>
                                <Text style={styles.infoValue}>
                                    {[selectedProject.address, selectedProject.zipcode].filter(Boolean).join(', ')}
                                </Text>
                            </View>
                        </>
                    )}
                </View>

                {/* Warning */}
                <View style={styles.warningCard}>
                    <Ionicons name="warning-outline" size={18} color="#FFD60A" />
                    <Text style={styles.warningText}>
                        By signing, you certify that all information in this daily report is accurate and complete.
                    </Text>
                </View>

                {/* Prepared By */}
                <View style={styles.field}>
                    <Text style={styles.label}>Prepared By <Text style={styles.req}>*</Text></Text>
                    <TextInput
                        style={styles.input}
                        value={currentUser.name}
                        editable={false}
                        placeholder="—"
                        placeholderTextColor={COLORS.subtitle}
                        autoCapitalize="words"
                    />
                </View>

                {/* Signature pad */}
                <View style={styles.field}>
                    <Text style={styles.label}>
                        Signature <Text style={styles.req}>*</Text>
                    </Text>
                    <Text style={styles.sigHint}>
                        {sigCaptured
                            ? 'Signature saved. Tap “Sign again” to redraw, or submit the report below.'
                            : 'Sign in the white box with your finger, then tap the orange button to confirm.'}
                    </Text>
                    <View style={[styles.canvasWrap, sigCaptured && styles.canvasCaptured]}>
                        {sigCaptured && !!signatureData ? (
                            <Image
                                source={{ uri: signatureData }}
                                style={styles.sigCapturedImage}
                                resizeMode="contain"
                            />
                        ) : (
                            <SignatureCanvas
                                ref={sigRef}
                                onOK={handleSignatureOK}
                                onEmpty={() => {
                                    setSignatureData('');
                                    setSigCaptured(false);
                                }}
                                onClear={() => {
                                    setSignatureData('');
                                    setSigCaptured(false);
                                }}
                                onBegin={handleSignatureBegin}
                                onEnd={handleSignatureEnd}
                                minDistance={2}
                                descriptionText=""
                                clearText=""
                                confirmText=""
                                backgroundColor="#FFFFFF"
                                penColor="#111111"
                                dataURL={signatureData}
                                webStyle={`
                body { background: #FFFFFF; margin: 0; padding: 0; }
                .m-signature-pad { box-shadow: none; margin: 0; }
                .m-signature-pad--body { background: #FFFFFF; border: none; flex: 1; }
                .m-signature-pad--body canvas { border-radius: 12px; background: #FFFFFF; }
                .m-signature-pad--footer { display: none !important; height: 0 !important; padding: 0 !important; margin: 0 !important; }
              `}
                                style={{ flex: 1 }}
                            />
                        )}
                    </View>
                    {sigCaptured ? (
                        <View style={styles.sigPostActions}>
                            <View style={styles.sigConfirmed}>
                                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                                <Text style={styles.sigConfirmedText}>Signature ready</Text>
                            </View>
                            <TouchableOpacity
                                onPress={clearSignature}
                                style={styles.sigSecondaryBtn}
                                accessibilityRole="button"
                                accessibilityLabel="Sign again"
                            >
                                <Ionicons name="pencil" size={18} color="#fff" />
                                <Text style={styles.sigSecondaryBtnText}>Sign again</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            onPress={confirmSignatureCapture}
                            style={styles.sigDoneBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Done signing"
                        >
                            <Ionicons name="checkmark-circle" size={22} color="#fff" />
                            <Text style={styles.sigDoneBtnText}>Done signing</Text>
                        </TouchableOpacity>
                    )}
                </View>

            </KeyboardAwareScrollView>

            {/* Sticky footer submit (so it never “disappears” offscreen) */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
                <TouchableOpacity
                    style={[styles.submitBtn, (saving || saved || !sigCaptured || !(currentUser.name ?? '').trim()) && { opacity: 0.6 }]}
                    onPress={handleSubmit}
                    disabled={saving || saved || !sigCaptured || !(currentUser.name ?? '').trim()}
                >
                    {saving ? <ActivityIndicator color="#fff" /> :
                        saved ? (
                            <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.submitText}>Report Signed!</Text></>
                        ) : (
                            <><Ionicons name="pencil" size={20} color="#fff" /><Text style={styles.submitText}>Submit & Sign Report</Text></>
                        )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, backgroundColor: COLORS.card },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minWidth: 72 },
    backText: { color: '#fff', fontSize: 15, fontWeight: '500' },
    headerTitle: { flex: 1, textAlign: 'center', color: '#fff', fontSize: 16, fontWeight: '700' },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 120, gap: 16 },
    infoCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, gap: 0, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    infoLabel: { color: COLORS.subtitle, fontSize: 13, flex: 1 },
    infoValue: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'right', flex: 1 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
    warningCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FFD60A15', borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFD60A40' },
    warningText: { flex: 1, color: '#FFD60A', fontSize: 13, lineHeight: 20 },
    field: { gap: 8 },
    label: { color: '#fff', fontSize: 14, fontWeight: '600' },
    req: { color: COLORS.brand },
    input: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, color: '#fff', fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    sigHint: { color: COLORS.subtitle, fontSize: 13, lineHeight: 19 },
    canvasWrap: { height: 280, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#FFFFFF', backgroundColor: '#FFFFFF' },
    canvasCaptured: { borderColor: COLORS.success },
    sigDoneBtn: {
        backgroundColor: COLORS.brand,
        borderRadius: 14,
        paddingVertical: 16,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginTop: 4,
    },
    sigDoneBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
    sigPostActions: { gap: 10, marginTop: 4 },
    sigConfirmed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 },
    sigConfirmedText: { color: COLORS.success, fontSize: 15, fontWeight: '700' },
    sigSecondaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 14,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.card,
    },
    sigSecondaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    sigCapturedImage: { flex: 1, width: '100%', height: '100%', backgroundColor: '#FFFFFF' },
    footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
    submitBtn: { backgroundColor: COLORS.brand, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
