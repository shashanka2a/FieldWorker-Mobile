import React, { useState } from 'react';
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
    Modal,
    Pressable,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';
import { getDateKey, saveEquipmentChecklist, getEquipmentForDate, EquipmentChecklistEntry } from '@/lib/dailyReportStorage';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    success: '#30D158',
    danger: '#FF453A',
    amber: '#FF9F0A',
};

const SITES = [
    'North Valley Solar Farm',
    'East Ridge Pipeline',
    'Mountain View Substation',
    'Other',
];

type FluidLevel = 'FULL' | 'LOW' | '';
type HoseCondition = 'GOOD' | 'BAD' | '';
type BeltCondition = 'TIGHT' | 'LOOSE' | '';

interface FormData {
    machineNumber: string;
    lastFourVin: string;
    operatorName: string;
    siteName: string;
    asvHours: string;
    motorOil: FluidLevel;
    motorOilAmount: string;
    coolant: FluidLevel;
    coolantAmount: string;
    hydraulicOil: FluidLevel;
    hydraulicOilAmount: string;
    hoses: HoseCondition;
    fanBelt: BeltCondition;
    attachment: string;
    repairsNotes: string;
}

function ToggleButton({ label, selected, onPress, color }: {
    label: string;
    selected: boolean;
    onPress: () => void;
    color: string;
}) {
    return (
        <TouchableOpacity
            style={[styles.toggleBtn, selected && { backgroundColor: color + '25', borderColor: color }]}
            onPress={onPress}
        >
            <Text style={[styles.toggleText, selected && { color }]}>{label}</Text>
        </TouchableOpacity>
    );
}

export default function ChecklistScreen() {
    const { selectedDate, selectedProject } = useAppContext();
    const [form, setForm] = useState<FormData>({
        machineNumber: '',
        lastFourVin: '',
        operatorName: '',
        siteName: SITES[0],
        asvHours: '',
        motorOil: '',
        motorOilAmount: '',
        coolant: '',
        coolantAmount: '',
        hydraulicOil: '',
        hydraulicOilAmount: '',
        hoses: '',
        fanBelt: '',
        attachment: '',
        repairsNotes: '',
    });
    const [photos, setPhotos] = useState<string[]>([]);
    const [showSitePicker, setShowSitePicker] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const dateLabel = selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    useFocusEffect(
        React.useCallback(() => {
            let active = true;
            (async () => {
                const dateKey = getDateKey(selectedDate);
                const data = await getEquipmentForDate(dateKey);
                // Pre-fill with the first/most recent checklist entry if it exists
                if (data.length > 0 && active) {
                    const checklistEntries = data.filter((d): d is EquipmentChecklistEntry => 'formData' in d);
                    if (checklistEntries.length > 0) {
                        const latest = checklistEntries[checklistEntries.length - 1];
                        setForm(latest.formData as unknown as FormData);
                        setPhotos(latest.photos || []);
                    }
                }
            })();
            return () => { active = false; };
        }, [selectedDate])
    );

    const update = (key: keyof FormData, value: string) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access.'); return; }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
        if (!result.canceled) setPhotos((prev) => [...prev, result.assets[0].uri]);
    };

    const handleSubmit = async () => {
        if (!form.machineNumber.trim() || !form.operatorName.trim()) {
            Alert.alert('Required', 'Please fill in Machine Number and Operator Name.');
            return;
        }
        setSubmitting(true);
        try {
            const dateKey = getDateKey(selectedDate);
            await saveEquipmentChecklist(dateKey, {
                id: Date.now().toString(),
                type: 'checklist',
                timestamp: new Date().toISOString(),
                formData: form as unknown as Record<string, string>,
                photos: photos.length > 0 ? photos : undefined,
            });
            setSuccess(true);
            setTimeout(() => router.back(), 1200);
        } catch {
            Alert.alert('Error', 'Failed to save checklist. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.container}>
            <ScreenHeader title="Equipment Checklist" subtitle={dateLabel} />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

                {/* Machine Info */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Machine Information</Text>
                    <View style={styles.field}>
                        <Text style={styles.label}>Site Name</Text>
                        <TouchableOpacity style={styles.select} onPress={() => setShowSitePicker(true)}>
                            <Text style={form.siteName ? styles.selectText : styles.selectPlaceholder}>
                                {form.siteName || 'Select site...'}
                            </Text>
                            <Ionicons name="chevron-down" size={16} color={COLORS.subtitle} />
                        </TouchableOpacity>
                    </View>
                    <View style={styles.row2}>
                        <View style={[styles.field, { flex: 1 }]}>
                            <Text style={styles.label}>Machine # <Text style={styles.req}>*</Text></Text>
                            <TextInput style={styles.input} value={form.machineNumber} onChangeText={(v) => update('machineNumber', v)} placeholder="e.g. ASV-01" placeholderTextColor={COLORS.subtitle} />
                        </View>
                        <View style={[styles.field, { flex: 1 }]}>
                            <Text style={styles.label}>Last 4 VIN</Text>
                            <TextInput style={styles.input} value={form.lastFourVin} onChangeText={(v) => update('lastFourVin', v)} placeholder="1234" placeholderTextColor={COLORS.subtitle} maxLength={4} keyboardType="number-pad" />
                        </View>
                    </View>
                    <View style={styles.field}>
                        <Text style={styles.label}>Operator Name <Text style={styles.req}>*</Text></Text>
                        <TextInput style={styles.input} value={form.operatorName} onChangeText={(v) => update('operatorName', v)} placeholder="Full name" placeholderTextColor={COLORS.subtitle} />
                    </View>
                    <View style={styles.field}>
                        <Text style={styles.label}>ASV Hours</Text>
                        <TextInput style={styles.input} value={form.asvHours} onChangeText={(v) => update('asvHours', v)} placeholder="0.0 hrs" placeholderTextColor={COLORS.subtitle} keyboardType="decimal-pad" />
                    </View>
                </View>

                {/* Fluid Levels */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Fluid Levels</Text>
                    {[
                        { key: 'motorOil' as const, amountKey: 'motorOilAmount' as const, label: 'Motor Oil' },
                        { key: 'coolant' as const, amountKey: 'coolantAmount' as const, label: 'Coolant' },
                        { key: 'hydraulicOil' as const, amountKey: 'hydraulicOilAmount' as const, label: 'Hydraulic Oil' },
                    ].map(({ key, amountKey, label }) => (
                        <View key={key} style={styles.fluidRow}>
                            <Text style={styles.fluidLabel}>{label}</Text>
                            <View style={styles.fluidToggles}>
                                <ToggleButton label="FULL" selected={form[key] === 'FULL'} onPress={() => update(key, 'FULL')} color={COLORS.success} />
                                <ToggleButton label="LOW" selected={form[key] === 'LOW'} onPress={() => update(key, 'LOW')} color={COLORS.danger} />
                            </View>
                            {form[key] === 'LOW' && (
                                <TextInput
                                    style={styles.amountInput}
                                    value={form[amountKey]}
                                    onChangeText={(v) => update(amountKey, v)}
                                    placeholder="Amount added"
                                    placeholderTextColor={COLORS.subtitle}
                                    keyboardType="decimal-pad"
                                />
                            )}
                        </View>
                    ))}
                </View>

                {/* Equipment Condition */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Equipment Condition</Text>
                    <View style={styles.fluidRow}>
                        <Text style={styles.fluidLabel}>Hoses</Text>
                        <View style={styles.fluidToggles}>
                            <ToggleButton label="GOOD" selected={form.hoses === 'GOOD'} onPress={() => update('hoses', 'GOOD')} color={COLORS.success} />
                            <ToggleButton label="BAD" selected={form.hoses === 'BAD'} onPress={() => update('hoses', 'BAD')} color={COLORS.danger} />
                        </View>
                    </View>
                    <View style={styles.fluidRow}>
                        <Text style={styles.fluidLabel}>Fan Belt</Text>
                        <View style={styles.fluidToggles}>
                            <ToggleButton label="TIGHT" selected={form.fanBelt === 'TIGHT'} onPress={() => update('fanBelt', 'TIGHT')} color={COLORS.success} />
                            <ToggleButton label="LOOSE" selected={form.fanBelt === 'LOOSE'} onPress={() => update('fanBelt', 'LOOSE')} color={COLORS.amber} />
                        </View>
                    </View>
                    <View style={styles.field}>
                        <Text style={styles.label}>Attachment (optional)</Text>
                        <TextInput style={styles.input} value={form.attachment} onChangeText={(v) => update('attachment', v)} placeholder="e.g. Brush hog, sprayer..." placeholderTextColor={COLORS.subtitle} />
                    </View>
                </View>

                {/* Repairs & Issues */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Repairs & Issues</Text>
                    <TextInput
                        style={styles.textArea}
                        value={form.repairsNotes}
                        onChangeText={(v) => update('repairsNotes', v)}
                        placeholder="Describe any repairs done or issues found..."
                        placeholderTextColor={COLORS.subtitle}
                        multiline
                        numberOfLines={4}
                        textAlignVertical="top"
                    />
                    <TouchableOpacity style={styles.photoBtn} onPress={pickImage}>
                        <Ionicons name="camera-outline" size={18} color={COLORS.brand} />
                        <Text style={styles.photoBtnText}>Take Photo of Issue</Text>
                    </TouchableOpacity>
                    {photos.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                            {photos.map((uri, idx) => (
                                <View key={idx} style={{ position: 'relative' }}>
                                    <Image source={{ uri }} style={styles.thumb} />
                                    <TouchableOpacity style={styles.removeBtn} onPress={() => setPhotos((p) => p.filter((_, i) => i !== idx))}>
                                        <Ionicons name="close-circle" size={20} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </ScrollView>
                    )}
                </View>

                <TouchableOpacity
                    style={[styles.submitBtn, (submitting || success) && { opacity: 0.7 }]}
                    onPress={handleSubmit}
                    disabled={submitting || success}
                >
                    {submitting ? <ActivityIndicator color="#fff" /> :
                        success ? <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.submitText}>Saved!</Text></> :
                            <Text style={styles.submitText}>Save Checklist</Text>}
                </TouchableOpacity>
            </ScrollView>

            {/* Site Picker Modal */}
            <Modal visible={showSitePicker} transparent animationType="slide" onRequestClose={() => setShowSitePicker(false)}>
                <Pressable style={styles.modalBackdrop} onPress={() => setShowSitePicker(false)}>
                    <View style={styles.pickerSheet}>
                        <View style={styles.pickerHandle} />
                        <Text style={styles.pickerTitle}>Select Site</Text>
                        {SITES.map((site) => (
                            <TouchableOpacity
                                key={site}
                                style={[styles.pickerItem, form.siteName === site && styles.pickerItemActive]}
                                onPress={() => { update('siteName', site); setShowSitePicker(false); }}
                            >
                                <Text style={[styles.pickerItemText, form.siteName === site && { color: COLORS.brand }]}>{site}</Text>
                                {form.siteName === site && <Ionicons name="checkmark" size={18} color={COLORS.brand} />}
                            </TouchableOpacity>
                        ))}
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 48, gap: 16 },
    section: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, gap: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    sectionTitle: { color: COLORS.brand, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    row2: { flexDirection: 'row', gap: 12 },
    field: { gap: 6 },
    label: { color: '#fff', fontSize: 13, fontWeight: '600' },
    req: { color: COLORS.brand },
    input: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, color: '#fff', fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    select: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    selectText: { color: '#fff', fontSize: 15 },
    selectPlaceholder: { color: COLORS.subtitle, fontSize: 15 },
    fluidRow: { gap: 8 },
    fluidLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
    fluidToggles: { flexDirection: 'row', gap: 8 },
    toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, alignItems: 'center' },
    toggleText: { color: COLORS.subtitle, fontSize: 13, fontWeight: '700' },
    amountInput: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 10, color: '#fff', fontSize: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.danger + '60' },
    textArea: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, color: '#fff', fontSize: 14, minHeight: 100, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, textAlignVertical: 'top' },
    photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface, borderRadius: 12, paddingVertical: 12, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    photoBtnText: { color: COLORS.brand, fontWeight: '600', fontSize: 14 },
    thumb: { width: 80, height: 80, borderRadius: 10 },
    removeBtn: { position: 'absolute', top: -6, right: -6 },
    submitBtn: { backgroundColor: COLORS.brand, borderRadius: 16, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8, shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    pickerSheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, gap: 4 },
    pickerHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
    pickerTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
    pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
    pickerItemActive: {},
    pickerItemText: { color: '#fff', fontSize: 15 },
});

