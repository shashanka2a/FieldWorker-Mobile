import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    Modal,
    Pressable,
    Image,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import SignatureCanvas from 'react-native-signature-canvas';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';
import { getDateKey } from '@/lib/dailyReportStorage';
import { getTemplateById } from '@/lib/safetyTemplates';
import { addConductedSafetyTalk, attendeesToStoredRows } from '@/lib/safetyStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchEmployeesFromSupabase, fetchSafetyTalkTemplateByIdFromSupabase } from '@/lib/supabaseSync';
import { generateCombinedSafetyTalkPdf } from '@/lib/safetyTalkPdf';
import { KeyboardAwareScrollView, ScrollInputField } from '@/components/KeyboardAwareScrollView';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    success: '#30D158',
    danger: '#FF453A',
};

interface Attendee {
    name: string;
    company?: string;
    signature?: string;
}

export default function DigitalSignaturesScreen() {
    const { selectedDate, selectedProject } = useAppContext();
    const { templateId } = useLocalSearchParams<{ templateId?: string }>();
    const fallbackTemplate = getTemplateById(templateId ?? '');
    const [remoteTemplate, setRemoteTemplate] = useState<typeof fallbackTemplate | null>(null);
    const template = remoteTemplate ?? fallbackTemplate;
    const sigRef = useRef<any>(null);
    const pendingSaveAfterCaptureRef = useRef(false);
    const captureTargetIdxRef = useRef<number | null>(null);

    const [attendees, setAttendees] = useState<Attendee[]>([]);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [showEmployeePicker, setShowEmployeePicker] = useState(false);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const [employees, setEmployees] = useState<{ name: string; company: string }[]>([]);
    const [employeeSearch, setEmployeeSearch] = useState('');
    const [activeAttendeeIdx, setActiveAttendeeIdx] = useState<number | null>(null);
    const [signatureData, setSignatureData] = useState<string>('');
    const [sigCaptured, setSigCaptured] = useState(false);
    const [capturingSave, setCapturingSave] = useState(false);

    useEffect(() => {
        let mounted = true;
        const id = (templateId ?? '').trim();
        if (!id) return;
        (async () => {
            const t = await fetchSafetyTalkTemplateByIdFromSupabase(id);
            if (!mounted) return;
            if (t) setRemoteTemplate(t);
        })();
        return () => {
            mounted = false;
        };
    }, [templateId]);

    const filteredEmployees = useMemo(() => {
        const q = employeeSearch.trim().toLowerCase();
        if (!q) return employees;
        return employees.filter((e) => `${e.name} ${e.company}`.toLowerCase().includes(q));
    }, [employeeSearch, employees]);

    useEffect(() => {
        if (!showEmployeePicker) return;
        let mounted = true;
        setEmployeesLoading(true);
        (async () => {
            try {
                const rows = await fetchEmployeesFromSupabase({
                    projectId: selectedProject.id,
                    projectName: selectedProject.name,
                });
                if (mounted) setEmployees(rows);
            } finally {
                if (mounted) setEmployeesLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, [showEmployeePicker, selectedProject.id, selectedProject.name]);

    const clearDraftSignature = useCallback(() => {
        pendingSaveAfterCaptureRef.current = false;
        captureTargetIdxRef.current = null;
        setCapturingSave(false);
        sigRef.current?.clearSignature();
        setSignatureData('');
        setSigCaptured(false);
    }, []);

    const handleCapture = useCallback((sig: string) => {
        setSignatureData(sig);
        setSigCaptured(true);
        if (pendingSaveAfterCaptureRef.current) {
            pendingSaveAfterCaptureRef.current = false;
            setCapturingSave(false);
            const idx = captureTargetIdxRef.current;
            captureTargetIdxRef.current = null;
            if (idx !== null) {
                setAttendees((prev) => prev.map((a, i) => (i === idx ? { ...a, signature: sig } : a)));
                setActiveAttendeeIdx(null);
            }
        }
    }, []);

    const handleSignatureEmpty = useCallback(() => {
        setSignatureData('');
        setSigCaptured(false);
        if (pendingSaveAfterCaptureRef.current) {
            pendingSaveAfterCaptureRef.current = false;
            captureTargetIdxRef.current = null;
            setCapturingSave(false);
            Alert.alert('Required', 'Please draw a signature first.');
        }
    }, []);

    const removeAttendee = (idx: number) => {
        setAttendees((prev) => prev.filter((_, i) => i !== idx));
    };

    const openAttendeeSignature = useCallback((idx: number) => {
        const att = attendees[idx];
        pendingSaveAfterCaptureRef.current = false;
        captureTargetIdxRef.current = null;
        setCapturingSave(false);
        setActiveAttendeeIdx(idx);
        setSignatureData(att.signature ?? '');
        setSigCaptured(!!att.signature);
    }, [attendees]);

    const closeSignatureModal = useCallback(() => {
        pendingSaveAfterCaptureRef.current = false;
        captureTargetIdxRef.current = null;
        setCapturingSave(false);
        setActiveAttendeeIdx(null);
    }, []);

    const saveAttendeeSignature = useCallback(() => {
        if (activeAttendeeIdx === null || capturingSave) return;
        if (sigCaptured && signatureData) {
            setAttendees((prev) =>
                prev.map((a, i) => (i === activeAttendeeIdx ? { ...a, signature: signatureData } : a))
            );
            setActiveAttendeeIdx(null);
            return;
        }
        setCapturingSave(true);
        pendingSaveAfterCaptureRef.current = true;
        captureTargetIdxRef.current = activeAttendeeIdx;
        try {
            sigRef.current?.readSignature();
        } catch {
            pendingSaveAfterCaptureRef.current = false;
            captureTargetIdxRef.current = null;
            setCapturingSave(false);
            Alert.alert('Error', 'Could not read signature. Try again.');
        }
    }, [activeAttendeeIdx, capturingSave, sigCaptured, signatureData]);

    const handleDone = async () => {
        if (attendees.length === 0 || attendees.every((a) => !a.signature)) {
            Alert.alert('Required', 'Collect at least one signature before completing.');
            return;
        }
        if (!selectedProject.id) {
            Alert.alert(
                'Select a project',
                'Choose a field project from the app home screen before completing this safety talk.'
            );
            return;
        }
        setSaving(true);
        try {
            const dateKey = getDateKey(selectedDate);
            const completedAt = new Date().toISOString();
            const resolvedTemplateName = template?.name ?? fallbackTemplate?.name ?? '';

            let combinedPdfUrl: string | null = null;
            const templatePdfUrl = template?.pdfUrl ?? '';
            if (templatePdfUrl) {
                try {
                    const combined = await generateCombinedSafetyTalkPdf({
                        templateName: resolvedTemplateName || 'Safety Talk',
                        templatePdfUrl,
                        completedAtIso: completedAt,
                        attendees,
                    });
                    combinedPdfUrl = combined.uploadedUrl;
                } catch {
                    // Best-effort: signatures are still saved even if PDF merge fails.
                    combinedPdfUrl = null;
                }
            }

            const attendeeRows = attendeesToStoredRows(attendees);

            // Create the completed talk entry (syncs attendees + PDF URL to Supabase) then persist full payload locally.
            const talkId = templateId
                ? await addConductedSafetyTalk(
                      dateKey,
                      templateId,
                      resolvedTemplateName,
                      selectedProject.id,
                      selectedProject.name,
                      {
                          attendees: attendeeRows,
                          attendancePdfUrl: combinedPdfUrl,
                      }
                  )
                : Date.now().toString();
            await AsyncStorage.setItem(`safety_talk_completed_${talkId}`, JSON.stringify({
                talkId,
                templateId,
                templateName: resolvedTemplateName,
                dateKey,
                attendees,
                attendeeCount: attendees.length,
                completedAt,
                combinedPdfUrl,
            }));
            setSaved(true);
            // Jump straight to the completed talk preview (no back-tracing through steps).
            setTimeout(() => router.replace(`/safety/read?talkId=${talkId}` as any), 350);
        } catch {
            Alert.alert('Error', 'Failed to save signatures. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={styles.container}>
            <ScreenHeader
                title="Digital Signatures"
                subtitle={template?.name ?? 'Safety Talk'}
                rightElement={
                    attendees.some((a) => !!a.signature) ? (
                        <TouchableOpacity style={styles.doneBtn} onPress={handleDone} disabled={saving}>
                            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.doneBtnText}>Done</Text>}
                        </TouchableOpacity>
                    ) : null
                }
            />
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
            >

                <View style={styles.section}>
                    <View style={styles.attendeeHeaderRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.sectionTitle}>Attendees: {attendees.length}</Text>
                            <Text style={styles.sectionSubtitle}>
                                Please pass your device to collect signatures from attendees
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={styles.addAttendeeBtn}
                            onPress={() => {
                                setEmployeeSearch('');
                                setShowEmployeePicker(true);
                            }}
                            activeOpacity={0.85}
                        >
                            <Ionicons name="person-add-outline" size={18} color={COLORS.brand} />
                            <Text style={styles.addAttendeeText}>Add attendee</Text>
                        </TouchableOpacity>
                    </View>

                    {attendees.length === 0 ? (
                        <View style={styles.emptyAttendees}>
                            <Ionicons name="people-outline" size={40} color={COLORS.subtitle} />
                            <Text style={styles.emptyAttendeesTitle}>No attendees yet</Text>
                            <Text style={styles.emptyAttendeesSubtitle}>
                                Tap “Add attendee” to select employees from the directory.
                            </Text>
                        </View>
                    ) : (
                        <View style={{ gap: 10 }}>
                            <Text style={styles.groupLabel}>All other employees</Text>
                            {attendees.map((att, idx) => {
                                const signed = !!att.signature;
                                return (
                                    <TouchableOpacity
                                        key={`${att.name}-${att.company ?? ''}-${idx}`}
                                        style={styles.attendeeCard}
                                        onPress={() => openAttendeeSignature(idx)}
                                        activeOpacity={0.85}
                                    >
                                        <View style={styles.attendeeAvatar}>
                                            <Text style={styles.attendeeInitial}>{att.name[0]?.toUpperCase() ?? '?'}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.attendeeName} numberOfLines={1}>{att.name}</Text>
                                            <Text style={styles.attendeeCompany} numberOfLines={1}>{att.company || '—'}</Text>
                                        </View>
                                        <Text style={signed ? styles.signedPill : styles.unsignedPill}>
                                            {signed ? 'Signed' : 'Pending'}
                                        </Text>
                                        <Ionicons name="chevron-forward" size={16} color={COLORS.subtitle} />
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </View>

                {/* Complete button */}
                {attendees.some((a) => !!a.signature) && (
                    <TouchableOpacity
                        style={[styles.completeBtn, (saving || saved) && { opacity: 0.7 }]}
                        onPress={handleDone}
                        disabled={saving || saved}
                    >
                        {saving ? <ActivityIndicator color="#fff" /> :
                            saved ? <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.completeBtnText}>Completed!</Text></> :
                                <><Ionicons name="shield-checkmark" size={20} color="#fff" /><Text style={styles.completeBtnText}>Complete Safety Talk</Text></>}
                    </TouchableOpacity>
                )}
            </ScrollView>

            {/* Signature modal */}
            <Modal
                visible={activeAttendeeIdx !== null}
                transparent
                animationType="slide"
                onRequestClose={closeSignatureModal}
            >
                <Pressable style={styles.sheetBackdrop} onPress={closeSignatureModal}>
                    <Pressable style={styles.signatureSheet} onPress={(e) => e.stopPropagation()}>
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>Collect signature</Text>
                        <Text style={styles.sigName}>
                            {activeAttendeeIdx !== null ? attendees[activeAttendeeIdx]?.name : ''}
                        </Text>
                        <Text style={styles.sigHint}>
                            {sigCaptured
                                ? 'Signature saved for this attendee.'
                                : 'Draw in the box below, then tap Save signature.'}
                        </Text>

                        <View style={[styles.canvasWrap, sigCaptured && styles.canvasCaptured]}>
                            {sigCaptured && !!signatureData ? (
                                <Image source={{ uri: signatureData }} style={styles.sigPreviewImage} resizeMode="contain" />
                            ) : (
                                <SignatureCanvas
                                    ref={sigRef}
                                    onOK={handleCapture}
                                    onEmpty={handleSignatureEmpty}
                                    onClear={() => {
                                        setSignatureData('');
                                        setSigCaptured(false);
                                    }}
                                    minDistance={2}
                                    descriptionText="Draw here — multiple strokes OK"
                                    clearText="Clear"
                                    confirmText="Confirm"
                                    backgroundColor="#FFFFFF"
                                    penColor="#111111"
                                    dataURL={signatureData}
                                    webStyle={`
                        body { background: #FFFFFF; margin: 0; }
                        .m-signature-pad { box-shadow: none; border: none; background: #FFFFFF; height: 100%; display: flex; flex-direction: column; }
                        .m-signature-pad--body { flex: 1; min-height: 0; background: #FFFFFF; border: none; border-radius: 12px; }
                        .m-signature-pad--footer { display: none !important; height: 0 !important; margin: 0 !important; padding: 0 !important; overflow: hidden; }
                        .button { background: #FF6633; border-radius: 10px; color: white; font-weight: 700; padding: 10px 20px; }
                        .button.clear { background: #E5E7EB; color: #111827; }
                      `}
                                    style={styles.signatureCanvas}
                                />
                            )}
                        </View>

                        <TouchableOpacity
                            style={[styles.sigSavePrimaryBtn, capturingSave && { opacity: 0.6 }]}
                            onPress={saveAttendeeSignature}
                            disabled={capturingSave}
                            accessibilityRole="button"
                            accessibilityLabel="Save signature"
                        >
                            {capturingSave ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <Ionicons name="checkmark-circle" size={22} color="#fff" />
                                    <Text style={styles.sigSavePrimaryText}>Save signature</Text>
                                </>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.sigClearLinkBtn}
                            onPress={clearDraftSignature}
                            accessibilityRole="button"
                            accessibilityLabel="Clear signature"
                        >
                            <Ionicons name="refresh" size={16} color={COLORS.subtitle} />
                            <Text style={styles.sigClearLinkText}>Clear and redraw</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal
                visible={showEmployeePicker}
                transparent
                animationType="slide"
                onRequestClose={() => setShowEmployeePicker(false)}
            >
                <Pressable style={styles.sheetBackdrop} onPress={() => setShowEmployeePicker(false)}>
                    <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                        <KeyboardAwareScrollView style={{ maxHeight: 480 }} bottomPadding={24}>
                            <View style={styles.sheetHandle} />
                            <Text style={styles.sheetTitle}>Employees</Text>
                            <View style={styles.searchWrap}>
                                <Ionicons name="search-outline" size={16} color={COLORS.subtitle} />
                                <ScrollInputField style={{ flex: 1 }}>
                                    <TextInput
                                        style={styles.searchInput}
                                        value={employeeSearch}
                                        onChangeText={setEmployeeSearch}
                                        placeholder="Search employees..."
                                        placeholderTextColor={COLORS.subtitle}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                    />
                                </ScrollInputField>
                                {employeeSearch !== '' ? (
                                    <TouchableOpacity onPress={() => setEmployeeSearch('')}>
                                        <Ionicons name="close-circle" size={16} color={COLORS.subtitle} />
                                    </TouchableOpacity>
                                ) : null}
                            </View>

                            {employeesLoading ? (
                                <View style={styles.sheetLoading}>
                                    <ActivityIndicator color={COLORS.brand} />
                                </View>
                            ) : filteredEmployees.length === 0 ? (
                                <Text style={styles.sheetEmpty}>No employees found (or access blocked by RLS).</Text>
                            ) : (
                                filteredEmployees.map((emp) => (
                                    <TouchableOpacity
                                        key={`${emp.name}-${emp.company}`}
                                        style={styles.empRow}
                                        onPress={() => {
                                            setAttendees((prev) => {
                                                const exists = prev.some(
                                                    (a) => a.name === emp.name && (a.company ?? '') === (emp.company ?? '')
                                                );
                                                if (exists) return prev;
                                                return [...prev, { name: emp.name, company: emp.company }];
                                            });
                                            setShowEmployeePicker(false);
                                        }}
                                    >
                                        <View style={styles.empAvatar}>
                                            <Text style={styles.empAvatarText}>{emp.name[0]?.toUpperCase() ?? '?'}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.empName}>{emp.name}</Text>
                                            <Text style={styles.empCompany}>{emp.company || '—'}</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))
                            )}

                            <TouchableOpacity style={styles.sheetDoneBtn} onPress={() => setShowEmployeePicker(false)}>
                                <Text style={styles.sheetDoneText}>Done</Text>
                            </TouchableOpacity>
                        </KeyboardAwareScrollView>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 48, gap: 16 },
    doneBtn: { backgroundColor: COLORS.brand, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 },
    doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    section: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    sectionTitle: { color: COLORS.brand, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    sectionSubtitle: { color: COLORS.subtitle, fontSize: 13, marginTop: 6, lineHeight: 18 },
    attendeeHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    addAttendeeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: COLORS.brand + '60', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: COLORS.surface },
    addAttendeeText: { color: COLORS.brand, fontSize: 13, fontWeight: '700' },
    groupLabel: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 6 },
    attendeeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 12, backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    attendeeAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.brand + '25', alignItems: 'center', justifyContent: 'center' },
    attendeeInitial: { color: COLORS.brand, fontSize: 16, fontWeight: '700' },
    attendeeName: { color: '#fff', fontSize: 15, fontWeight: '700' },
    attendeeCompany: { color: COLORS.subtitle, fontSize: 12, marginTop: 2 },
    signedPill: { color: COLORS.success, fontSize: 13, fontWeight: '700', marginRight: 6 },
    unsignedPill: { color: COLORS.subtitle, fontSize: 13, fontWeight: '700', marginRight: 6 },
    emptyAttendees: { alignItems: 'center', paddingVertical: 18, gap: 10 },
    emptyAttendeesTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
    emptyAttendeesSubtitle: { color: COLORS.subtitle, fontSize: 13, textAlign: 'center', lineHeight: 18 },
    canvasWrap: { height: 260, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#FFFFFF', backgroundColor: '#FFFFFF' },
    canvasCaptured: { borderColor: COLORS.success },
    signatureCanvas: { flex: 1 },
    sigPreviewImage: { flex: 1, width: '100%', height: '100%', backgroundColor: '#FFFFFF' },
    sigHint: { color: COLORS.subtitle, fontSize: 13, lineHeight: 18, textAlign: 'center', marginBottom: 10 },
    sigSavePrimaryBtn: {
        backgroundColor: COLORS.brand,
        borderRadius: 14,
        paddingVertical: 16,
        marginTop: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    sigSavePrimaryText: { color: '#fff', fontSize: 17, fontWeight: '700' },
    sigClearLinkBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        marginTop: 4,
    },
    sigClearLinkText: { color: COLORS.subtitle, fontSize: 14, fontWeight: '600' },
    completeBtn: { backgroundColor: COLORS.success, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: COLORS.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
    completeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
    signatureSheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 12 },
    sheetTitle: { color: COLORS.subtitle, fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
    sigName: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
    searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, marginBottom: 10 },
    searchInput: { flex: 1, color: '#fff', fontSize: 16 },
    sheetLoading: { paddingVertical: 24, alignItems: 'center' },
    sheetEmpty: { color: COLORS.subtitle, textAlign: 'center', paddingVertical: 20 },
    empRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
    empAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.brand + '22', alignItems: 'center', justifyContent: 'center' },
    empAvatarText: { color: COLORS.brand, fontSize: 14, fontWeight: '700' },
    empName: { color: '#fff', fontSize: 15, fontWeight: '600' },
    empCompany: { color: COLORS.subtitle, fontSize: 12, marginTop: 2 },
    sheetDoneBtn: { backgroundColor: COLORS.surface, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
    sheetDoneText: { color: '#0A84FF', fontSize: 17, fontWeight: '600' },
});
