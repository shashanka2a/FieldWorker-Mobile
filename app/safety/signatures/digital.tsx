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
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import SignatureCanvas from 'react-native-signature-canvas';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';
import { getTemplateById } from '@/lib/safetyTemplates';
import { addConductedSafetyTalk } from '@/lib/safetyStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchEmployeesFromSupabase } from '@/lib/supabaseSync';

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
    signature: string;
}

export default function DigitalSignaturesScreen() {
    const { selectedProject } = useAppContext();
    const { templateId } = useLocalSearchParams<{ templateId?: string }>();
    const template = getTemplateById(templateId ?? '');
    const sigRef = useRef<any>(null);

    const [attendees, setAttendees] = useState<Attendee[]>([]);
    const [currentName, setCurrentName] = useState('');
    const [draftSignature, setDraftSignature] = useState<string>('');
    const [draftCaptured, setDraftCaptured] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [showEmployeePicker, setShowEmployeePicker] = useState(false);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const [employees, setEmployees] = useState<{ name: string; company: string }[]>([]);
    const [employeeSearch, setEmployeeSearch] = useState('');

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
        sigRef.current?.clearSignature();
        setDraftSignature('');
        setDraftCaptured(false);
    }, []);

    /** Auto-capture when user lifts finger (so they don't have to tap Confirm inside the WebView). */
    const handleSignatureEnd = useCallback(() => {
        sigRef.current?.readSignature();
    }, []);

    const handleCapture = (sig: string) => {
        setDraftSignature(sig);
        setDraftCaptured(true);
    };

    const addAttendeeFromDraft = useCallback(() => {
        if (!currentName.trim()) {
            Alert.alert('Required', 'Enter the attendee name first.');
            return;
        }
        if (!draftCaptured || !draftSignature) {
            Alert.alert('Required', 'Please draw a signature first.');
            return;
        }
        setAttendees((prev) => [...prev, { name: currentName.trim(), signature: draftSignature }]);
        setCurrentName('');
        clearDraftSignature();
    }, [clearDraftSignature, currentName, draftCaptured, draftSignature]);

    const removeAttendee = (idx: number) => {
        setAttendees((prev) => prev.filter((_, i) => i !== idx));
    };

    const handleDone = async () => {
        if (attendees.length === 0) {
            Alert.alert('Required', 'Collect at least one signature before completing.');
            return;
        }
        setSaving(true);
        try {
            const now = new Date();
            const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            // Save signature data
            const key = `safety_sig_digital_${templateId}_${Date.now()}`;
            await AsyncStorage.setItem(key, JSON.stringify({
                templateId,
                templateName: template?.name ?? '',
                attendees,
                completedAt: new Date().toISOString(),
            }));
            if (templateId) {
                await addConductedSafetyTalk(dateKey, templateId, template?.name ?? '');
            }
            setSaved(true);
            setTimeout(() => router.replace('/safety?tab=conducted' as any), 500);
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
                    attendees.length > 0 ? (
                        <TouchableOpacity style={styles.doneBtn} onPress={handleDone} disabled={saving}>
                            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.doneBtnText}>Done</Text>}
                        </TouchableOpacity>
                    ) : null
                }
            />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

                {/* Attendee list */}
                {attendees.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Signed Attendees ({attendees.length})</Text>
                        {attendees.map((att, idx) => (
                            <View key={idx} style={styles.attendeeRow}>
                                <View style={styles.attendeeAvatar}>
                                    <Text style={styles.attendeeInitial}>{att.name[0].toUpperCase()}</Text>
                                </View>
                                <Text style={styles.attendeeName}>{att.name}</Text>
                                <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                                <TouchableOpacity onPress={() => removeAttendee(idx)}>
                                    <Ionicons name="close-circle" size={18} color={COLORS.danger} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>
                )}

                {/* Add new attendee */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Add Attendee</Text>
                    <TextInput
                        style={styles.nameInput}
                        value={currentName}
                        onChangeText={setCurrentName}
                        placeholder="Attendee name"
                        placeholderTextColor={COLORS.subtitle}
                        autoCapitalize="words"
                    />
                    <TouchableOpacity
                        style={styles.pickBtn}
                        onPress={() => {
                            setEmployeeSearch('');
                            setShowEmployeePicker(true);
                        }}
                    >
                        <Ionicons name="people-outline" size={18} color={COLORS.brand} />
                        <Text style={styles.pickBtnText}>Pick from employee directory</Text>
                    </TouchableOpacity>

                    <Text style={styles.canvasLabel}>Signature</Text>
                    <View style={styles.canvasWrap}>
                        <SignatureCanvas
                            ref={sigRef}
                            onOK={handleCapture}
                            onEmpty={() => {
                                setDraftSignature('');
                                setDraftCaptured(false);
                            }}
                            onClear={() => {
                                setDraftSignature('');
                                setDraftCaptured(false);
                            }}
                            onEnd={handleSignatureEnd}
                            minDistance={2}
                            descriptionText="Draw signature (lift finger to capture)"
                            clearText="Clear"
                            confirmText={draftCaptured ? '✓ Captured' : 'Confirm'}
                            backgroundColor="#FFFFFF"
                            penColor="#111111"
                            dataURL={draftSignature}
                            webStyle={`
                body { background: #FFFFFF; margin: 0; }
                .m-signature-pad { box-shadow: none; border: none; background: #FFFFFF; }
                .m-signature-pad--body { background: #FFFFFF; border: none; border-radius: 12px; }
                .m-signature-pad--footer { background: #FFFFFF; padding: 8px; }
                .button { background: #FF6633; border-radius: 10px; color: white; font-weight: 700; padding: 10px 20px; }
                .button.clear { background: #E5E7EB; color: #111827; }
              `}
                            style={styles.signatureCanvas}
                        />
                    </View>

                    <View style={styles.sigActionRow}>
                        <TouchableOpacity
                            style={[styles.sigActionBtn, styles.sigClearBtn, !draftCaptured && { opacity: 0.7 }]}
                            onPress={clearDraftSignature}
                        >
                            <Ionicons name="refresh" size={16} color="#111827" />
                            <Text style={styles.sigClearText}>Clear</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.sigActionBtn, styles.sigAddBtn, (!currentName.trim() || !draftCaptured) && { opacity: 0.6 }]}
                            onPress={addAttendeeFromDraft}
                            disabled={!currentName.trim() || !draftCaptured}
                        >
                            <Ionicons name="person-add" size={16} color="#fff" />
                            <Text style={styles.sigAddText}>Add Signature</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Complete button */}
                {attendees.length > 0 && (
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

            <Modal
                visible={showEmployeePicker}
                transparent
                animationType="slide"
                onRequestClose={() => setShowEmployeePicker(false)}
            >
                <Pressable style={styles.sheetBackdrop} onPress={() => setShowEmployeePicker(false)}>
                    <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>Employees</Text>
                        <View style={styles.searchWrap}>
                            <Ionicons name="search-outline" size={16} color={COLORS.subtitle} />
                            <TextInput
                                style={styles.searchInput}
                                value={employeeSearch}
                                onChangeText={setEmployeeSearch}
                                placeholder="Search employees..."
                                placeholderTextColor={COLORS.subtitle}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
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
                            <ScrollView style={{ maxHeight: 360 }}>
                                {filteredEmployees.map((emp) => (
                                    <TouchableOpacity
                                        key={emp.name}
                                        style={styles.empRow}
                                        onPress={() => {
                                            setCurrentName(emp.name);
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
                                ))}
                            </ScrollView>
                        )}

                        <TouchableOpacity style={styles.sheetDoneBtn} onPress={() => setShowEmployeePicker(false)}>
                            <Text style={styles.sheetDoneText}>Done</Text>
                        </TouchableOpacity>
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
    attendeeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    attendeeAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.brand + '25', alignItems: 'center', justifyContent: 'center' },
    attendeeInitial: { color: COLORS.brand, fontSize: 16, fontWeight: '700' },
    attendeeName: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '500' },
    nameInput: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, color: '#fff', fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    pickBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 8 },
    pickBtnText: { color: COLORS.brand, fontSize: 13, fontWeight: '700' },
    canvasLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
    canvasWrap: { height: 260, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#FFFFFF', backgroundColor: '#FFFFFF' },
    signatureCanvas: { flex: 1 },
    sigActionRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
    sigActionBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    sigClearBtn: { backgroundColor: '#E5E7EB' },
    sigAddBtn: { backgroundColor: COLORS.brand },
    sigClearText: { color: '#111827', fontSize: 14, fontWeight: '700' },
    sigAddText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    completeBtn: { backgroundColor: COLORS.success, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: COLORS.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
    completeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
    sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 12 },
    sheetTitle: { color: COLORS.subtitle, fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
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
