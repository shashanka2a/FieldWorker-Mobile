import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    Image,
    ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader } from '@/components/ScreenHeader';
import { KeyboardAwareScrollView, KeyboardField, ScrollInputField } from '@/components/KeyboardAwareScrollView';
import { useAppContext } from '@/context/AppContext';
import { useFieldPhotoWatermark } from '@/components/FieldPhotoWatermarkProvider';
import {
    createUuid,
    getDateKey,
    getSubmittedAtIso,
    saveEquipmentChecklist,
    EquipmentChecklistEntry,
} from '@/lib/dailyReportStorage';
import { loadEquipmentChecklistsForProject } from '@/lib/equipmentChecklistLoad';
import { useFormDraft, clearFormDraft } from '@/hooks/useFormDraft';

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
    machineType: string;
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
    attachmentNumber: string;
    attachmentCondition: AttachmentCondition;
    repairsNotes: string;
}

function emptyForm(projectName: string): FormData {
    return {
        machineNumber: '',
        machineType: '',
        lastFourVin: '',
        operatorName: '',
        siteName: projectName || '',
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
        attachmentNumber: '',
        attachmentCondition: '',
        repairsNotes: '',
    };
}

function checklistDraftIsNonEmpty(f: FormData, ph: string[]): boolean {
    if (ph.length > 0) return true;
    if (f.machineNumber.trim() || f.machineType.trim() || f.operatorName.trim() || f.lastFourVin.trim() || f.asvHours.trim()) return true;
    if (f.motorOil === 'FULL' || f.motorOil === 'LOW' || f.coolant === 'FULL' || f.coolant === 'LOW' || f.hydraulicOil === 'FULL' || f.hydraulicOil === 'LOW')
        return true;
    if (f.motorOilAmount.trim() || f.coolantAmount.trim() || f.hydraulicOilAmount.trim()) return true;
    if (f.hoses || f.fanBelt) return true;
    if (f.attachmentApplicable === 'Yes' || f.attachmentName.trim() || f.attachmentNumber.trim()) return true;
    if (f.repairsNotes.trim()) return true;
    return false;
}

function hydrateFormFromEntry(entry: EquipmentChecklistEntry, projectName: string): { form: FormData; photos: string[] } {
    const loaded = entry.formData as unknown as Partial<FormData> & { attachment?: string };
    const attachmentApplicable = loaded.attachmentApplicable ?? (loaded.attachment ? 'Yes' : 'N/A');
    const attachmentName = loaded.attachmentName ?? loaded.attachment ?? '';
    const attachmentNumber = loaded.attachmentNumber ?? '';
    const attachmentCondition = loaded.attachmentCondition ?? '';

    return {
        form: {
            machineNumber: loaded.machineNumber ?? '',
            machineType: loaded.machineType ?? '',
            lastFourVin: loaded.lastFourVin ?? '',
            operatorName: loaded.operatorName ?? '',
            siteName: loaded.siteName ?? projectName ?? '',
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
            attachmentNumber,
            attachmentCondition: (attachmentCondition ?? '') as AttachmentCondition,
            repairsNotes: loaded.repairsNotes ?? '',
        },
        photos: entry.photos ?? [],
    };
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

export default function AddChecklistScreen() {
    const { selectedDate, selectedProject } = useAppContext();
    const { applyCameraWatermark } = useFieldPhotoWatermark();
    const { editId } = useLocalSearchParams<{ editId?: string }>();
    const isEditing = !!editId?.trim();

    const [entryId, setEntryId] = useState<string | null>(null);
    const [form, setForm] = useState<FormData>(() => emptyForm(selectedProject?.name ?? ''));
    const [photos, setPhotos] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [loadingEntry, setLoadingEntry] = useState(!!editId?.trim());
    /** When `editId` goes from set → cleared in-place, reset form; skip on first open of “new” so draft can hydrate. */
    const prevRouteEditIdRef = useRef<string | undefined>(undefined);

    const dateKey = useMemo(() => getDateKey(selectedDate), [selectedDate]);
    const dateLabel = selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const pn = selectedProject?.name ?? '';
    const projectKey = (selectedProject?.id || selectedProject?.name || 'project').replace(/\s+/g, '_');
    const draftKey = useMemo(
        () => `fw_draft_checklist_${dateKey}_${projectKey}_${editId?.trim() || 'new'}`,
        [dateKey, projectKey, editId]
    );

    const checklistDraftSnapshot = useMemo(() => JSON.stringify({ form, photos }), [form, photos]);

    useFormDraft({
        storageKey: draftKey,
        active: !loadingEntry,
        snapshotJson: checklistDraftSnapshot,
        hydrate: (parsed) => {
            if (!parsed || typeof parsed !== 'object') return;
            const p = parsed as { form?: Partial<FormData>; photos?: unknown };
            const base = emptyForm(selectedProject?.name ?? '');
            if (p.form && typeof p.form === 'object') {
                setForm({ ...base, ...p.form } as FormData);
            }
            if (Array.isArray(p.photos)) {
                setPhotos(p.photos.filter((x): x is string => typeof x === 'string' && x.length > 0));
            }
        },
        isNonEmpty: () => checklistDraftIsNonEmpty(form, photos),
    });

    const loadMergedChecklists = useCallback(
        () =>
            loadEquipmentChecklistsForProject(
                dateKey,
                selectedDate,
                selectedProject?.id ?? '',
                selectedProject?.name ?? ''
            ),
        [dateKey, selectedDate, selectedProject?.id, selectedProject?.name]
    );

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const id = editId?.trim();
            if (!id) {
                setEntryId(null);
                setLoadingEntry(false);
                if (prevRouteEditIdRef.current) {
                    setForm(emptyForm(selectedProject?.name ?? ''));
                    setPhotos([]);
                }
                prevRouteEditIdRef.current = undefined;
                return;
            }
            prevRouteEditIdRef.current = id;
            setLoadingEntry(true);
            const list = await loadMergedChecklists();
            const found = list.find((e) => e.id === id);
            if (cancelled) return;
            if (found) {
                setEntryId(found.id);
                const { form: nextForm, photos: nextPhotos } = hydrateFormFromEntry(found, pn);
                setForm(nextForm);
                setPhotos(nextPhotos);
            } else {
                setEntryId(null);
                setForm(emptyForm(selectedProject?.name ?? ''));
                setPhotos([]);
                Alert.alert('Not found', 'This checklist could not be loaded. You can fill a new one and save.');
            }
            setLoadingEntry(false);
        })();
        return () => { cancelled = true; };
    }, [editId, loadMergedChecklists, pn, selectedProject?.name]);

    useEffect(() => {
        if (!isEditing) {
            setForm((prev) => ({ ...prev, siteName: selectedProject?.name || '' }));
        }
    }, [selectedProject?.name, isEditing]);

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
            const idToSave = entryId ?? createUuid();
            await saveEquipmentChecklist(dateKey, {
                id: idToSave,
                type: 'checklist',
                timestamp: getSubmittedAtIso(),
                project: { id: selectedProject.id, name: selectedProject.name },
                formData: { ...form, siteName: selectedProject?.name || 'Unknown Site' } as unknown as Record<string, string>,
                photos: photos.length > 0 ? photos : undefined,
            });
            setEntryId(idToSave);
            await clearFormDraft(draftKey);
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                router.back();
            }, 900);
        } catch {
            Alert.alert('Error', 'Failed to save checklist. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loadingEntry) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ScreenHeader title={isEditing ? 'Edit checklist' : 'Add checklist'} subtitle={dateLabel} />
                <ActivityIndicator color={COLORS.brand} size="large" />
                <Text style={styles.loadingText}>Loading…</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScreenHeader
                title={isEditing ? 'Edit checklist' : 'Add checklist'}
                subtitle={`${selectedProject.name} • ${dateLabel}`}
            />
            <KeyboardAwareScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                bottomPadding={64}
            >

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
                        <KeyboardField style={[styles.field, { flex: 1 }]}>
                            <Text style={styles.label}>Machine # <Text style={styles.req}>*</Text></Text>
                        <ScrollInputField style={{ flex: 1 }}>
                            <TextInput style={styles.input} value={form.machineNumber} onChangeText={(v) => update('machineNumber', v)} placeholder="e.g. ASV-01" placeholderTextColor={COLORS.subtitle} />
                        </ScrollInputField>
                        </KeyboardField>
                        <KeyboardField style={[styles.field, { flex: 1 }]}>
                            <Text style={styles.label}>Machine Type</Text>
                        <ScrollInputField style={{ flex: 1 }}>
                            <TextInput style={styles.input} value={form.machineType} onChangeText={(v) => update('machineType', v)} placeholder="e.g. ASV, Skid Steer" placeholderTextColor={COLORS.subtitle} />
                        </ScrollInputField>
                        </KeyboardField>
                    </View>
                    <KeyboardField style={[styles.field, { alignSelf: 'flex-start', width: '48%' }]}>
                        <Text style={styles.label}>Last 4 VIN</Text>
                    <ScrollInputField>
                        <TextInput style={styles.input} value={form.lastFourVin} onChangeText={(v) => update('lastFourVin', v)} placeholder="1234" placeholderTextColor={COLORS.subtitle} maxLength={4} keyboardType="number-pad" />
                    </ScrollInputField>
                    </KeyboardField>
                    <KeyboardField style={styles.field}>
                        <Text style={styles.label}>Operator Name <Text style={styles.req}>*</Text></Text>
                    <ScrollInputField>
                        <TextInput style={styles.input} value={form.operatorName} onChangeText={(v) => update('operatorName', v)} placeholder="Full name" placeholderTextColor={COLORS.subtitle} />
                    </ScrollInputField>
                    </KeyboardField>
                    <KeyboardField style={styles.field}>
                        <Text style={styles.label}>Hours</Text>
                    <ScrollInputField>
                        <TextInput style={styles.input} value={form.asvHours} onChangeText={(v) => update('asvHours', v)} placeholder="0.0 hrs" placeholderTextColor={COLORS.subtitle} keyboardType="decimal-pad" />
                    </ScrollInputField>
                    </KeyboardField>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Fluid Levels</Text>
                    {[
                        { key: 'motorOil' as const, amountKey: 'motorOilAmount' as const, unitKey: 'motorOilUnit' as const, label: 'Motor Oil' },
                        { key: 'coolant' as const, amountKey: 'coolantAmount' as const, unitKey: 'coolantUnit' as const, label: 'Coolant' },
                        { key: 'hydraulicOil' as const, amountKey: 'hydraulicOilAmount' as const, unitKey: 'hydraulicOilUnit' as const, label: 'Hydraulic Oil' },
                    ].map(({ key, amountKey, unitKey, label }) => (
                        <KeyboardField key={key} style={styles.fluidRow}>
                            <Text style={styles.fluidLabel}>{label}</Text>
                            <View style={styles.fluidToggles}>
                                <ToggleButton
                                    label="NONE"
                                    selected={form[key] === ''}
                                    onPress={() => update(key, '')}
                                    color={COLORS.subtitle}
                                />
                                <ToggleButton
                                    label="FULL"
                                    selected={form[key] === 'FULL'}
                                    onPress={() => update(key, 'FULL')}
                                    color={COLORS.success}
                                />
                                <ToggleButton
                                    label="LOW"
                                    selected={form[key] === 'LOW'}
                                    onPress={() => update(key, 'LOW')}
                                    color={COLORS.amber}
                                />
                            </View>
                            {form[key] === 'LOW' && (
                                <View style={styles.amountRow}>
                                    <ScrollInputField style={{ flex: 1 }}>
                                    <TextInput
                                        style={[styles.amountInput, { flex: 1 }]}
                                        value={form[amountKey]}
                                        onChangeText={(v) => update(amountKey, v)}
                                        placeholder="Amount added"
                                        placeholderTextColor={COLORS.subtitle}
                                        keyboardType="decimal-pad"
                                    />
                                    </ScrollInputField>
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
                        </KeyboardField>
                    ))}
                </View>

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
                                    update('attachmentNumber', '');
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
                            <KeyboardField style={styles.field}>
                                <Text style={styles.label}>Name of Attachment</Text>
                            <ScrollInputField>
                                <TextInput
                                    style={styles.input}
                                    value={form.attachmentName}
                                    onChangeText={(v) => update('attachmentName', v)}
                                    placeholder="e.g. Brush hog, sprayer..."
                                    placeholderTextColor={COLORS.subtitle}
                                />
                            </ScrollInputField>
                            </KeyboardField>

                            <KeyboardField style={styles.field}>
                                <Text style={styles.label}>Attachment number</Text>
                            <ScrollInputField>
                                <TextInput
                                    style={styles.input}
                                    value={form.attachmentNumber}
                                    onChangeText={(v) => update('attachmentNumber', v)}
                                    placeholder="Serial or asset #"
                                    placeholderTextColor={COLORS.subtitle}
                                    keyboardType="default"
                                />
                            </ScrollInputField>
                            </KeyboardField>

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

                <KeyboardField style={styles.section}>
                    <Text style={styles.sectionTitle}>Repairs & Issues</Text>
                    <ScrollInputField>
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
                    </ScrollInputField>
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
                </KeyboardField>

                <TouchableOpacity
                    style={[styles.submitBtn, (submitting || success) && { opacity: 0.7 }]}
                    onPress={handleSubmit}
                    disabled={submitting || success}
                >
                    {submitting ? <ActivityIndicator color="#fff" /> :
                        success ? <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.submitText}>Saved!</Text></> :
                            <Text style={styles.submitText}>Save Checklist</Text>}
                </TouchableOpacity>
            </KeyboardAwareScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    centered: { justifyContent: 'center', alignItems: 'center', gap: 12 },
    loadingText: { color: COLORS.subtitle, fontSize: 14 },
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
    fluidRow: { gap: 8 },
    fluidLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
    fluidToggles: { flexDirection: 'row', gap: 8 },
    toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, alignItems: 'center' },
    toggleText: { color: COLORS.subtitle, fontSize: 12, fontWeight: '700' },
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
});
