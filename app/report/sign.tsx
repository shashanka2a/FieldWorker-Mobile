import React, { useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import SignatureCanvas from 'react-native-signature-canvas';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '@/context/AppContext';
import { saveSignedReport, getDateKey } from '@/lib/dailyReportStorage';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    success: '#30D158',
};

export default function SignReportScreen() {
    const { selectedDate, selectedProject, currentUser } = useAppContext();
    const { date: dateParam } = useLocalSearchParams<{ date?: string }>();
    const insets = useSafeAreaInsets();
    const sigRef = useRef<any>(null);

    const [name, setName] = useState(currentUser.name);
    const [signatureData, setSignatureData] = useState<string>('');
    const [sigCaptured, setSigCaptured] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const reportDate = dateParam
        ? (() => { const [y, m, d] = dateParam.split('-').map(Number); return new Date(y, m - 1, d); })()
        : selectedDate;

    const dateLabel = reportDate.toLocaleDateString('en-US', {
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

    const handleSubmit = async () => {
        if (!name.trim()) {
            Alert.alert('Required', 'Please enter the preparer\'s full name.');
            return;
        }
        if (!sigCaptured || !signatureData) {
            Alert.alert('Required', 'Please draw your signature below before submitting.');
            return;
        }
        setSaving(true);
        try {
            const dateKey = getDateKey(reportDate);
            await saveSignedReport(dateKey, {
                signedAt: new Date().toISOString(),
                preparedBy: name.trim(),
                signatureDataUrl: signatureData,
                projectName: selectedProject.name,
            });
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

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

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
                    <Text style={styles.label}>Prepared By (Full Name) <Text style={styles.req}>*</Text></Text>
                    <TextInput
                        style={styles.input}
                        value={name}
                        onChangeText={setName}
                        placeholder="Enter full name"
                        placeholderTextColor={COLORS.subtitle}
                        autoCapitalize="words"
                    />
                </View>

                {/* Signature pad */}
                <View style={styles.field}>
                    <View style={styles.sigHeader}>
                        <Text style={styles.label}>Signature <Text style={styles.req}>*</Text></Text>
                        {sigCaptured && (
                            <TouchableOpacity onPress={clearSignature} style={styles.clearSigBtn}>
                                <Ionicons name="refresh" size={14} color={COLORS.subtitle} />
                                <Text style={styles.clearSigText}>Clear</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <View style={[styles.canvasWrap, sigCaptured && styles.canvasCaptured]}>
                        <SignatureCanvas
                            ref={sigRef}
                            onOK={handleSignatureOK}
                            onEmpty={() => { }}
                            descriptionText="Draw your signature here"
                            clearText="Clear"
                            confirmText={sigCaptured ? '✓ Captured' : 'Confirm Signature'}
                            webStyle={`
                body { background: #2C2C2E; margin: 0; padding: 0; }
                .m-signature-pad { box-shadow: none; margin: 0; }
                .m-signature-pad--body { background: #2C2C2E; border: none; }
                .m-signature-pad--body canvas { border-radius: 12px; background: #2C2C2E; }
                .m-signature-pad--footer { padding: 10px 16px; background: #2C2C2E; }
                .m-signature-pad--footer .description { color: #98989D; font-size: 13px; }
                .button { border-radius: 12px; padding: 10px 20px; font-weight: 700; font-size: 14px; }
                .button.clear { background: #3A3A3C; color: #fff; }
                .button.save { background: #FF6633; color: #fff; }
              `}
                            style={{ flex: 1 }}
                        />
                    </View>
                    {sigCaptured && (
                        <View style={styles.sigConfirmed}>
                            <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                            <Text style={styles.sigConfirmedText}>Signature captured</Text>
                        </View>
                    )}
                </View>

                {/* Submit */}
                <TouchableOpacity
                    style={[styles.submitBtn, (saving || saved || !sigCaptured || !name.trim()) && { opacity: 0.6 }]}
                    onPress={handleSubmit}
                    disabled={saving || saved || !sigCaptured || !name.trim()}
                >
                    {saving ? <ActivityIndicator color="#fff" /> :
                        saved ? (
                            <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.submitText}>Report Signed!</Text></>
                        ) : (
                            <><Ionicons name="pencil" size={20} color="#fff" /><Text style={styles.submitText}>Submit & Sign Report</Text></>
                        )}
                </TouchableOpacity>
            </ScrollView>
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
    scrollContent: { padding: 16, paddingBottom: 48, gap: 16 },
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
    sigHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    clearSigBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    clearSigText: { color: COLORS.subtitle, fontSize: 13 },
    canvasWrap: { height: 280, borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, backgroundColor: COLORS.card },
    canvasCaptured: { borderColor: COLORS.success },
    sigConfirmed: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sigConfirmedText: { color: COLORS.success, fontSize: 13, fontWeight: '600' },
    submitBtn: { backgroundColor: COLORS.brand, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
