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
import { ScreenHeader } from '@/components/ScreenHeader';
import { getTemplateById } from '@/lib/safetyTemplates';
import { markSafetyTalkConducted } from '@/lib/safetyStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    const { templateId } = useLocalSearchParams<{ templateId?: string }>();
    const template = getTemplateById(templateId ?? '');
    const sigRef = useRef<any>(null);

    const [attendees, setAttendees] = useState<Attendee[]>([]);
    const [currentName, setCurrentName] = useState('');
    const [capturing, setCapturing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleCapture = (sig: string) => {
        if (!sig || !currentName.trim()) return;
        setAttendees((prev) => [...prev, { name: currentName.trim(), signature: sig }]);
        setCurrentName('');
        sigRef.current?.clearSignature();
        setCapturing(false);
    };

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
            // Save signature data
            const key = `safety_sig_digital_${templateId}_${Date.now()}`;
            await AsyncStorage.setItem(key, JSON.stringify({
                templateId,
                templateName: template?.name ?? '',
                attendees,
                completedAt: new Date().toISOString(),
            }));
            // Mark talk as conducted if id provided
            // (This is a simplified version; in a full app you'd use the talk id)
            setSaved(true);
            setTimeout(() => router.push('/safety' as any), 1000);
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

                    <Text style={styles.canvasLabel}>Signature</Text>
                    <View style={styles.canvasWrap}>
                        <SignatureCanvas
                            ref={sigRef}
                            onOK={handleCapture}
                            onEmpty={() => Alert.alert('Empty', 'Please draw a signature before confirming.')}
                            descriptionText=""
                            clearText="Clear"
                            confirmText="Confirm"
                            webStyle={`
                .m-signature-pad { box-shadow: none; border: none; background: #2C2C2E; }
                .m-signature-pad--body { background: #2C2C2E; border: 1px solid #3A3A3C; border-radius: 12px; }
                .m-signature-pad--footer { background: #2C2C2E; padding: 8px; }
                .button { background: #FF6633; border-radius: 10px; color: white; font-weight: 700; padding: 10px 20px; }
                .button.clear { background: #3A3A3C; }
                body { background: #2C2C2E; margin: 0; }
              `}
                            style={styles.signatureCanvas}
                        />
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
    canvasLabel: { color: '#fff', fontSize: 13, fontWeight: '600' },
    canvasWrap: { height: 260, borderRadius: 12, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    signatureCanvas: { flex: 1 },
    completeBtn: { backgroundColor: COLORS.success, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: COLORS.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
    completeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
