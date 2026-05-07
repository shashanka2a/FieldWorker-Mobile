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
import { useFieldPhotoWatermark } from '@/components/FieldPhotoWatermarkProvider';
import {
    createUuid,
    getDateKey,
    getTimestampForReportingDay,
    saveEquipmentChecklist,
    getEquipmentForDate,
    EquipmentChecklistEntry,
} from '@/lib/dailyReportStorage';
import { fetchEquipmentFromSupabase } from '@/lib/supabaseSync';

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



type FluidLevel = 'FULL' | 'LOW' | '';
type HoseCondition = 'GOOD' | 'BAD' | '';
type BeltCondition = 'TIGHT' | 'LOOSE' | '';
type AttachmentApplicable = 'N/A' | 'Yes' | '';
type AttachmentCondition = 'Good' | 'Fair' | 'Bad' | '';
type VolumeUnit = 'qt' | 'gal' | 'L';

interface FormData {
    machineNumber: string;
    lastFourVin: string;
    operatorName: string;
    siteName: string;
    asvHours: string;
    motorOil: FluidLevel;
    motorOilAmount: string;
    motorOilUnit: VolumeUnit;
    coolant: FluidLevel;
    coolantAmount: string;
    coolantUnit: VolumeUnit;
    hydraulicOil: FluidLevel;
    hydraulicOilAmount: string;
    hydraulicOilUnit: VolumeUnit;
    hoses: HoseCondition;
    fanBelt: BeltCondition;
    attachmentApplicable: AttachmentApplicable;
    attachmentName: string;
    attachmentCondition: AttachmentCondition;
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

const VOLUME_UNITS: VolumeUnit[] = ['qt', 'gal', 'L'];

function nextUnit(current: VolumeUnit): VolumeUnit {
    const idx = VOLUME_UNITS.indexOf(current);
    return VOLUME_UNITS[(idx + 1) % VOLUME_UNITS.length] ?? 'qt';
}

export default function ChecklistScreen() {
    const { selectedDate, selectedProject } = useAppContext();
    const { applyCameraWatermark } = useFieldPhotoWatermark();
    const [entryId, setEntryId] = useState<string | null>(null);
    const [mode, setMode] = useState<'overview' | 'edit'>('edit');
    const [fluidPickerKey, setFluidPickerKey] = useState<'motorOil' | 'coolant' | 'hydraulicOil' | null>(null);
    const [form, setForm] = useState<FormData>({
        machineNumber: '',
        lastFourVin: '',
        operatorName: '',
        siteName: selectedProject?.name || '',
        asvHours: '',
        motorOil: '',
        motorOilAmount: '',
        motorOilUnit: 'qt',
        coolant: '',
        coolantAmount: '',
        coolantUnit: 'qt',
        hydraulicOil: '',
        hydraulicOilAmount: '',
        hydraulicOilUnit: 'qt',
        hoses: '',
        fanBelt: '',
        attachmentApplicable: 'N/A',
        attachmentName: '',
        attachmentCondition: '',
        repairsNotes: '',
    });
    const [photos, setPhotos] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const dateLabel = selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    useFocusEffect(
        React.useCallback(() => {
            let active = true;
            (async () => {
                const dateKey = getDateKey(selectedDate);
                const localData = await getEquipmentForDate(dateKey);
                const remoteData = await fetchEquipmentFromSupabase(
                    dateKey,
                    selectedDate,
                    selectedProject?.id ?? '',
                    selectedProject?.name ?? ''
                );
                const data = [...localData, ...remoteData];
                // Pre-fill with the first/most recent checklist entry if it exists
                if (data.length > 0 && active) {
                    const checklistEntries = data.filter((d): d is EquipmentChecklistEntry =>
                        'formData' in d && (d.formData as any)?.siteName === selectedProject?.name
                    );
                    if (checklistEntries.length > 0) {
                        const latest = checklistEntries[checklistEntries.length - 1];
                        setEntryId(latest.id);
                        setMode('overview');
                        const loaded = latest.formData as unknown as Partial<FormData> & { attachment?: string };
                        const attachmentApplicable = loaded.attachmentApplicable ?? (loaded.attachment ? 'Yes' : 'N/A');
                        const attachmentName = loaded.attachmentName ?? loaded.attachment ?? '';
                        const attachmentCondition = loaded.attachmentCondition ?? '';

                        setForm({
                            machineNumber: loaded.machineNumber ?? '',
                            lastFourVin: loaded.lastFourVin ?? '',
                            operatorName: loaded.operatorName ?? '',
                            siteName: loaded.siteName ?? selectedProject?.name ?? '',
                            asvHours: loaded.asvHours ?? '',
                            motorOil: (loaded.motorOil ?? '') as FluidLevel,
                            motorOilAmount: loaded.motorOilAmount ?? '',
                            motorOilUnit: (loaded.motorOilUnit ?? 'qt') as VolumeUnit,
                            coolant: (loaded.coolant ?? '') as FluidLevel,
                            coolantAmount: loaded.coolantAmount ?? '',
                            coolantUnit: (loaded.coolantUnit ?? 'qt') as VolumeUnit,
                            hydraulicOil: (loaded.hydraulicOil ?? '') as FluidLevel,
                            hydraulicOilAmount: loaded.hydraulicOilAmount ?? '',
                            hydraulicOilUnit: (loaded.hydraulicOilUnit ?? 'qt') as VolumeUnit,
                            hoses: (loaded.hoses ?? '') as HoseCondition,
                            fanBelt: (loaded.fanBelt ?? '') as BeltCondition,
                            attachmentApplicable: (attachmentApplicable ?? 'N/A') as AttachmentApplicable,
                            attachmentName,
                            attachmentCondition: (attachmentCondition ?? '') as AttachmentCondition,
                            repairsNotes: loaded.repairsNotes ?? '',
                        });
                        setPhotos(latest.photos || []);
                    }
                } else if (active) {
                    setEntryId(null);
                    setMode('edit');
                }
            })();
            return () => { active = false; };
        }, [selectedDate, selectedProject?.name])
    );

    const update = (key: keyof FormData, value: string) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access.'); return; }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
        if (!result.canceled) {
            const uri = await applyCameraWatermark(result.assets[0].uri);
            setPhotos((prev) => [...prev, uri]);
        }
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
                id: entryId ?? createUuid(),
                type: 'checklist',
                timestamp: getTimestampForReportingDay(selectedDate),
                formData: { ...form, siteName: selectedProject?.name || 'Unknown Site' } as unknown as Record<string, string>,
                photos: photos.length > 0 ? photos : undefined,
            });
            setSuccess(true);
            setMode('overview');
            setTimeout(() => setSuccess(false), 1200);
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
                {mode === 'overview' && (
                    <View style={styles.overviewCard}>
                        <View style={styles.overviewHeader}>
                            <Text style={styles.overviewTitle}>Submitted checklist</Text>
                            <TouchableOpacity style={styles.editBtn} onPress={() => setMode('edit')} activeOpacity={0.85}>
                                <Ionicons name="create-outline" size={16} color="#fff" />
                                <Text style={styles.editBtnText}>Edit</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.overviewSub}>{selectedProject?.name}</Text>
                        <Text style={styles.overviewLine}>Machine: {form.machineNumber || '—'} • Operator: {form.operatorName || '—'}</Text>
                        <Text style={styles.overviewLine}>Motor Oil: {form.motorOil || '—'}{form.motorOil === 'LOW' && form.motorOilAmount ? ` (${form.motorOilAmount} ${form.motorOilUnit})` : ''}</Text>
                        <Text style={styles.overviewLine}>Coolant: {form.coolant || '—'}{form.coolant === 'LOW' && form.coolantAmount ? ` (${form.coolantAmount} ${form.coolantUnit})` : ''}</Text>
                        <Text style={styles.overviewLine}>Hydraulic: {form.hydraulicOil || '—'}{form.hydraulicOil === 'LOW' && form.hydraulicOilAmount ? ` (${form.hydraulicOilAmount} ${form.hydraulicOilUnit})` : ''}</Text>
                        <Text style={styles.overviewLine}>Hoses: {form.hoses || '—'} • Fan Belt: {form.fanBelt || '—'}</Text>
                        <Text style={styles.overviewLine}>
                            Attachment: {form.attachmentApplicable}{form.attachmentApplicable === 'Yes' && form.attachmentName ? ` (${form.attachmentName}, ${form.attachmentCondition || '—'})` : ''}
                        </Text>
                        {form.repairsNotes?.trim() ? <Text style={styles.overviewLine}>Repairs: {form.repairsNotes.trim()}</Text> : null}
                        {photos.length > 0 ? <Text style={styles.overviewLine}>Photos: {photos.length}</Text> : null}
                    </View>
                )}

                {mode === 'edit' && (
                    <>

                {/* Machine Info */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Machine Information</Text>
                    <View style={styles.field}>
                        <Text style={styles.label}>Site Name <Text style={styles.req}>(Locked)</Text></Text>
                        <View style={[styles.select, { opacity: 0.7, backgroundColor: COLORS.surface }]}>
                            <Text style={styles.selectText}>
                                {selectedProject?.name || 'No project selected'}
                            </Text>
                            <Ionicons name="lock-closed" size={16} color={COLORS.subtitle} />
                        </View>
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
                        { key: 'motorOil' as const, amountKey: 'motorOilAmount' as const, unitKey: 'motorOilUnit' as const, label: 'Motor Oil' },
                        { key: 'coolant' as const, amountKey: 'coolantAmount' as const, unitKey: 'coolantUnit' as const, label: 'Coolant' },
                        { key: 'hydraulicOil' as const, amountKey: 'hydraulicOilAmount' as const, unitKey: 'hydraulicOilUnit' as const, label: 'Hydraulic Oil' },
                    ].map(({ key, amountKey, unitKey, label }) => (
                        <View key={key} style={styles.fluidRow}>
                            <Text style={styles.fluidLabel}>{label}</Text>
                            <TouchableOpacity
                                style={styles.dropdown}
                                onPress={() => setFluidPickerKey(key)}
                                activeOpacity={0.85}
                            >
                                <Text style={[styles.dropdownText, !form[key] && styles.dropdownPlaceholder]}>
                                    {form[key] || 'Select'}
                                </Text>
                                <Ionicons name="chevron-down" size={16} color={COLORS.subtitle} />
                            </TouchableOpacity>
                            {form[key] === 'LOW' && (
                                <View style={styles.amountRow}>
                                    <TextInput
                                        style={[styles.amountInput, { flex: 1 }]}
                                        value={form[amountKey]}
                                        onChangeText={(v) => update(amountKey, v)}
                                        placeholder="Amount added"
                                        placeholderTextColor={COLORS.subtitle}
                                        keyboardType="decimal-pad"
                                    />
                                    <TouchableOpacity
                                        style={styles.unitPill}
                                        onPress={() => update(unitKey, nextUnit(form[unitKey]))}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={styles.unitPillText}>{form[unitKey]}</Text>
                                        <Ionicons name="chevron-down" size={14} color={COLORS.subtitle} />
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    ))}
                </View>

                {/* Fluid dropdown modal */}
                <Modal
                    visible={fluidPickerKey !== null}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setFluidPickerKey(null)}
                >
                    <Pressable style={styles.modalBackdrop} onPress={() => setFluidPickerKey(null)}>
                        <View style={styles.pickerSheet}>
                            <View style={styles.pickerHandle} />
                            <Text style={styles.pickerTitle}>Select level</Text>

                            {(['FULL', 'LOW'] as FluidLevel[]).map((lvl) => {
                                const selected = fluidPickerKey ? (form[fluidPickerKey] as any) === lvl : false;
                                return (
                                    <TouchableOpacity
                                        key={lvl}
                                        style={[styles.pickerItem, selected && styles.pickerItemActive]}
                                        onPress={() => {
                                            if (!fluidPickerKey) return;
                                            update(fluidPickerKey, lvl);
                                            setFluidPickerKey(null);
                                        }}
                                    >
                                        <Text style={styles.pickerItemText}>{lvl}</Text>
                                        {selected && <Ionicons name="checkmark" size={18} color={COLORS.brand} />}
                                    </TouchableOpacity>
                                );
                            })}

                            <TouchableOpacity
                                style={styles.pickerItem}
                                onPress={() => {
                                    if (!fluidPickerKey) return;
                                    update(fluidPickerKey, '');
                                    setFluidPickerKey(null);
                                }}
                            >
                                <Text style={[styles.pickerItemText, { color: COLORS.subtitle }]}>Clear</Text>
                                <Ionicons name="close" size={18} color={COLORS.subtitle} />
                            </TouchableOpacity>
                        </View>
                    </Pressable>
                </Modal>

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
                </View>

                {/* Attachment */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Attachment</Text>
                    <View style={styles.fluidRow}>
                        <Text style={styles.fluidLabel}>Attachment</Text>
                        <View style={styles.fluidToggles}>
                            <ToggleButton
                                label="N/A"
                                selected={form.attachmentApplicable === 'N/A'}
                                onPress={() => {
                                    update('attachmentApplicable', 'N/A');
                                    update('attachmentName', '');
                                    update('attachmentCondition', '');
                                }}
                                color={COLORS.subtitle}
                            />
                            <ToggleButton
                                label="YES"
                                selected={form.attachmentApplicable === 'Yes'}
                                onPress={() => update('attachmentApplicable', 'Yes')}
                                color={COLORS.brand}
                            />
                        </View>
                    </View>

                    {form.attachmentApplicable === 'Yes' && (
                        <>
                            <View style={styles.field}>
                                <Text style={styles.label}>Name of Attachment</Text>
                                <TextInput
                                    style={styles.input}
                                    value={form.attachmentName}
                                    onChangeText={(v) => update('attachmentName', v)}
                                    placeholder="e.g. Brush hog, sprayer..."
                                    placeholderTextColor={COLORS.subtitle}
                                />
                            </View>

                            <View style={styles.fluidRow}>
                                <Text style={styles.fluidLabel}>Attachment Condition</Text>
                                <View style={styles.fluidToggles}>
                                    <ToggleButton
                                        label="GOOD"
                                        selected={form.attachmentCondition === 'Good'}
                                        onPress={() => update('attachmentCondition', 'Good')}
                                        color={COLORS.success}
                                    />
                                    <ToggleButton
                                        label="FAIR"
                                        selected={form.attachmentCondition === 'Fair'}
                                        onPress={() => update('attachmentCondition', 'Fair')}
                                        color={COLORS.amber}
                                    />
                                    <ToggleButton
                                        label="BAD"
                                        selected={form.attachmentCondition === 'Bad'}
                                        onPress={() => update('attachmentCondition', 'Bad')}
                                        color={COLORS.danger}
                                    />
                                </View>
                            </View>
                        </>
                    )}
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
                    </>
                )}
            </ScrollView>


        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 48, gap: 16 },
    overviewCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    overviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    overviewTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
    overviewSub: { color: COLORS.subtitle, fontSize: 13 },
    overviewLine: { color: COLORS.subtitle, fontSize: 13, lineHeight: 18 },
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.brand, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
    editBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
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
    dropdown: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    dropdownText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    dropdownPlaceholder: { color: COLORS.subtitle, fontWeight: '600' },
    amountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    amountInput: { backgroundColor: COLORS.surface, borderRadius: 10, padding: 10, color: '#fff', fontSize: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.danger + '60' },
    unitPill: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6,
        minWidth: 80,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: COLORS.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    unitPillText: { color: '#fff', fontSize: 14, fontWeight: '700' },
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

