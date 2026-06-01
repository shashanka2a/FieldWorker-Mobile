import React, { useMemo, useRef, useState } from 'react';
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
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';
import { useFieldPhotoWatermark } from '@/components/FieldPhotoWatermarkProvider';
import { createUuid, getDateKey, getSubmittedAtIso, saveChemicals, getChemicalsForDate, ChemicalEntry } from '@/lib/dailyReportStorage';
import { mergeLocalRemotePreferSupabase, matchProjectPredicate } from '@/lib/mergeLocalRemote';
import { fetchChemicalsFromSupabase, fetchCompanyChemicalPresetsFromSupabase } from '@/lib/supabaseSync';
import { useFormDraft, clearFormDraft } from '@/hooks/useFormDraft';
import { KeyboardAwareScrollView, KeyboardField, ScrollInputField } from '@/components/KeyboardAwareScrollView';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    warning: '#FFD60A',
    danger: '#FF453A',
};

type ApplicationType = 'wicking' | 'spraying';

interface Chemical {
    name: string;
    quantity: string;
    unit: string;
}

const DEFAULT_CHEMICALS: Chemical[] = [
    { name: 'Glyphosate', quantity: '', unit: 'GAL' },
    { name: 'Surfactant', quantity: '', unit: 'oz' },
    { name: 'Super Dye', quantity: '', unit: 'oz' },
    { name: '2,4-D', quantity: '', unit: 'GAL' },
    { name: 'Ecomazapyr 2SL', quantity: '', unit: 'GAL' },
    { name: 'Regular Dye', quantity: '', unit: 'oz' },
];

const UNITS = ['GAL', 'oz', 'L'];

function getWarning(name: string, quantity: string, unit: string): string | null {
    const qty = parseFloat(quantity);
    if (isNaN(qty)) return null;
    if (name === 'Glyphosate' && unit === 'GAL' && qty > 100) return 'High quantity — verify before submitting';
    if (name === 'Surfactant' && unit === 'oz' && qty > 128) return 'High quantity — verify before submitting';
    return null;
}

export default function ChemicalsScreen() {
    const { selectedDate, selectedProject } = useAppContext();
    const { applyCameraWatermark } = useFieldPhotoWatermark();
    const dateKey = useMemo(() => getDateKey(selectedDate), [selectedDate]);
    const projectKey = (selectedProject?.id || selectedProject?.name || 'project').replace(/\s+/g, '_');
    const [activeType, setActiveType] = useState<ApplicationType | null>(null);
    const [chemicals, setChemicals] = useState<Chemical[]>(DEFAULT_CHEMICALS.map(c => ({ ...c })));
    const [presetsByType, setPresetsByType] = useState<Record<ApplicationType, { name: string; unit: string }[]>>({
        spraying: [],
        wicking: [],
    });
    const [notes, setNotes] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [showUnitPicker, setShowUnitPicker] = useState<number | null>(null);
    const [entryId, setEntryId] = useState<string | null>(null);
    const [mode, setMode] = useState<'choose' | 'edit'>('choose');
    const [switchingToNext, setSwitchingToNext] = useState(false);
    const [submittedByType, setSubmittedByType] = useState<Record<ApplicationType, ChemicalEntry | null>>({
        spraying: null,
        wicking: null,
    });
    const [chemicalsFocusReady, setChemicalsFocusReady] = useState(false);
    const chemicalsDraftKey = useMemo(
        () => `fw_draft_chemicals_${dateKey}_${projectKey}_${activeType ?? '__'}`,
        [dateKey, projectKey, activeType]
    );
    const modeRef = useRef(mode);
    modeRef.current = mode;

    const dateLabel = selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const buildBaseChemicals = (type: ApplicationType, existing?: ChemicalEntry | null): Chemical[] => {
        const presets = presetsByType[type];
        const base: Chemical[] =
            presets && presets.length > 0
                ? presets.map((p) => ({ name: p.name, quantity: '', unit: p.unit }))
                : DEFAULT_CHEMICALS.map((c) => ({ ...c }));

        if (!existing?.chemicals?.length) return base;

        const byName = new Map(
            existing.chemicals
                .filter((c) => String(c?.name ?? '').trim().length > 0)
                .map((c) => [String(c.name).trim().toLowerCase(), c] as const)
        );

        const used = new Set<string>();
        const merged = base.map((b) => {
            const k = b.name.trim().toLowerCase();
            const match = byName.get(k);
            if (!match) return b;
            used.add(k);
            return {
                name: match.name,
                quantity: String(match.quantity ?? ''),
                unit: String(match.unit ?? b.unit),
            };
        });

        // Preserve extra chemicals that were logged before presets changed.
        for (const c of existing.chemicals) {
            const k = String(c?.name ?? '').trim().toLowerCase();
            if (!k || used.has(k)) continue;
            merged.push({
                name: String(c.name ?? '').trim(),
                quantity: String(c.quantity ?? ''),
                unit: String(c.unit ?? 'oz'),
            });
        }

        return merged;
    };

    const resetFormForType = (type: ApplicationType, existing?: ChemicalEntry | null) => {
        setActiveType(type);
        setEntryId(existing?.id ?? null);
        setNotes(existing?.notes ?? '');
        setPhotos(existing?.photos ?? []);

        setChemicals(buildBaseChemicals(type, existing));
    };

    useFocusEffect(
        React.useCallback(() => {
            let active = true;
            setChemicalsFocusReady(false);
            (async () => {
                try {
                    const [sprayingPresets, wickingPresets] = await Promise.all([
                        fetchCompanyChemicalPresetsFromSupabase('spraying'),
                        fetchCompanyChemicalPresetsFromSupabase('wicking'),
                    ]);
                    if (active) {
                        setPresetsByType({
                            spraying: sprayingPresets,
                            wicking: wickingPresets,
                        });
                    }

                    const localData = await getChemicalsForDate(dateKey);
                    const remoteData = await fetchChemicalsFromSupabase(
                        dateKey,
                        selectedDate,
                        selectedProject?.id ?? '',
                        selectedProject?.name ?? ''
                    );
                    const data = mergeLocalRemotePreferSupabase(
                        localData,
                        remoteData,
                        matchProjectPredicate<ChemicalEntry>(selectedProject?.name)
                    );
                    if (!active) return;

                    const sorted = [...data].sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
                    const latestSpraying = [...sorted].reverse().find((e) => e.applicationType === 'spraying') ?? null;
                    const latestWicking = [...sorted].reverse().find((e) => e.applicationType === 'wicking') ?? null;
                    setSubmittedByType({ spraying: latestSpraying, wicking: latestWicking });

                    if (modeRef.current === 'choose') {
                        setActiveType(null);
                        setEntryId(null);
                    }
                } finally {
                    if (active) setChemicalsFocusReady(true);
                }
            })();
            return () => { active = false; };
        }, [dateKey, selectedDate, selectedProject?.id, selectedProject?.name])
    );

    const updateChemical = (index: number, field: keyof Chemical, value: string) => {
        setChemicals((prev) => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    // Custom chemicals are intentionally disabled (company presets only).

    const chemicalsDraftSnapshot = useMemo(
        () => JSON.stringify({ chemicals, notes, photos }),
        [chemicals, notes, photos]
    );

    useFormDraft({
        storageKey: chemicalsDraftKey,
        active: chemicalsFocusReady && mode === 'edit' && activeType !== null,
        snapshotJson: chemicalsDraftSnapshot,
        hydrate: (parsed) => {
            if (!parsed || typeof parsed !== 'object') return;
            const p = parsed as Record<string, unknown>;
            if (typeof p.notes === 'string') setNotes(p.notes);
            if (Array.isArray(p.photos)) {
                setPhotos(p.photos.filter((x): x is string => typeof x === 'string'));
            }
            if (!Array.isArray(p.chemicals)) return;
            const draftRows = p.chemicals.filter(
                (c): c is Chemical =>
                    !!c &&
                    typeof c === 'object' &&
                    typeof (c as Chemical).name === 'string' &&
                    typeof (c as Chemical).quantity === 'string' &&
                    typeof (c as Chemical).unit === 'string'
            );
            if (draftRows.length === 0) return;
            setChemicals((cur) =>
                cur.map((c, i) => {
                    const byName = draftRows.find(
                        (d) => d.name.trim().toLowerCase() === c.name.trim().toLowerCase()
                    );
                    const d = byName ?? draftRows[i];
                    if (!d) return c;
                    return { ...c, quantity: d.quantity, unit: d.unit };
                })
            );
        },
        isNonEmpty: () =>
            !!(
                chemicals.some((c) => c.quantity.trim() !== '') ||
                notes.trim() ||
                photos.length > 0
            ),
    });

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access.'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.8 });
        if (!result.canceled) setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    };

    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access.'); return; }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
        if (!result.canceled) {
            const uri = await applyCameraWatermark(result.assets[0].uri);
            setPhotos((prev) => [...prev, uri]);
        }
    };

    const handleSubmit = async () => {
        if (!activeType) return;
        const filled = chemicals.filter((c) => c.quantity.trim() !== '');
        if (filled.length === 0) {
            Alert.alert('Required', 'Enter at least one chemical quantity.');
            return;
        }
        setSubmitting(true);
        try {
            const draftKeyToClear = chemicalsDraftKey;
            const saved: ChemicalEntry = {
                id: entryId ?? createUuid(),
                project: selectedProject,
                timestamp: getSubmittedAtIso(),
                applicationType: activeType,
                chemicals: chemicals.map((c) => ({ name: c.name, quantity: c.quantity, unit: c.unit })),
                notes: notes.trim() || undefined,
                photos: photos.length > 0 ? photos : undefined,
            };
            await saveChemicals(dateKey, saved);
            await clearFormDraft(draftKeyToClear);
            setSuccess(true);
            setSubmittedByType((prev) => ({ ...prev, [activeType]: saved }));
            setTimeout(() => setSuccess(false), 800);

            // Smooth transition to the next form (Spraying → Wicking).
            if (activeType === 'spraying' && !submittedByType.wicking) {
                setSwitchingToNext(true);
                setTimeout(() => {
                    resetFormForType('wicking', submittedByType.wicking);
                    setSwitchingToNext(false);
                    setMode('edit');
                }, 250);
            } else {
                setMode('choose');
                setActiveType(null);
            }
        } catch {
            Alert.alert('Error', 'Failed to save. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.container}>
            <ScreenHeader title="Chemicals" subtitle={dateLabel} />
            <KeyboardAwareScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                {mode === 'choose' && (
                    <>
                        {(['spraying', 'wicking'] as ApplicationType[]).map((t) => {
                            const entry = submittedByType[t];
                            const filledCount = entry?.chemicals?.filter((c) => String(c.quantity ?? '').trim() !== '').length ?? 0;
                            return (
                                <TouchableOpacity
                                    key={t}
                                    style={styles.card}
                                    activeOpacity={0.85}
                                    onPress={() => {
                                        resetFormForType(t, entry);
                                        setMode('edit');
                                    }}
                                >
                                    <View style={styles.cardHeaderRow}>
                                        <Text style={styles.cardTitle}>{t === 'spraying' ? 'Spraying' : 'Wicking'}</Text>
                                        {entry ? (
                                            <TouchableOpacity
                                                style={styles.cardEditBtn}
                                                onPress={() => {
                                                    resetFormForType(t, entry);
                                                    setMode('edit');
                                                }}
                                                activeOpacity={0.85}
                                            >
                                                <Ionicons name="create-outline" size={16} color="#fff" />
                                                <Text style={styles.cardEditBtnText}>Edit</Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <Text style={styles.cardHintText}>Not entered</Text>
                                        )}
                                    </View>
                                    <Text style={styles.cardSub}>{selectedProject?.name}</Text>
                                    {entry ? (
                                        <Text style={styles.cardMeta}>
                                            {filledCount} chemical{filledCount !== 1 ? 's' : ''} • {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                        </Text>
                                    ) : (
                                        <Text style={styles.cardMeta}>Tap to enter values</Text>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </>
                )}

                {mode === 'edit' && (
                    <>
                        <View style={styles.cardHeaderRow}>
                            <Text style={styles.cardTitle}>
                                {activeType === 'spraying' ? 'Spraying' : 'Wicking'}
                            </Text>
                            <TouchableOpacity
                                style={styles.switchTypeBtn}
                                onPress={() => {
                                    setMode('choose');
                                    setActiveType(null);
                                }}
                                activeOpacity={0.85}
                            >
                                <Ionicons name="swap-horizontal" size={16} color={COLORS.subtitle} />
                                <Text style={styles.switchTypeText}>Switch</Text>
                            </TouchableOpacity>
                        </View>

                        {switchingToNext && (
                            <View style={styles.switchingRow}>
                                <ActivityIndicator color={COLORS.brand} />
                                <Text style={styles.switchingText}>Loading Wicking…</Text>
                            </View>
                        )}


                {/* Chemical rows */}
                {chemicals.map((chem, idx) => {
                    const warning = getWarning(chem.name, chem.quantity, chem.unit);
                    return (
                        <KeyboardField key={idx} style={styles.chemRow}>
                            <View style={styles.chemHeader}>
                                <Text style={styles.chemName}>{chem.name}</Text>
                            </View>
                            <View style={styles.chemInputRow}>
                                <ScrollInputField style={{ flex: 1 }}>
                                    <TextInput
                                        style={[styles.qtyInput, warning ? styles.qtyInputWarning : null]}
                                        value={chem.quantity}
                                        onChangeText={(v) => updateChemical(idx, 'quantity', v)}
                                        placeholder="0.0"
                                        placeholderTextColor={COLORS.subtitle}
                                        keyboardType="decimal-pad"
                                    />
                                </ScrollInputField>
                                <TouchableOpacity
                                    style={styles.unitSelectDrop}
                                    onPress={() => setShowUnitPicker(idx)}
                                >
                                    <Text style={styles.unitSelectText}>{chem.unit}</Text>
                                    <Ionicons name="chevron-down" size={14} color={COLORS.subtitle} />
                                </TouchableOpacity>
                            </View>
                            {warning && (
                                <View style={styles.warningRow}>
                                    <Ionicons name="warning-outline" size={14} color={COLORS.warning} />
                                    <Text style={styles.warningText}>{warning}</Text>
                                </View>
                            )}
                        </KeyboardField>
                    );
                })}

                {/* Notes */}
                <KeyboardField style={styles.field}>
                    <Text style={styles.label}>Notes (optional)</Text>
                    <ScrollInputField>
                        <TextInput
                            style={styles.textArea}
                            value={notes}
                            onChangeText={setNotes}
                            placeholder="Additional notes..."
                            placeholderTextColor={COLORS.subtitle}
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                        />
                    </ScrollInputField>
                </KeyboardField>

                {/* Photos */}
                <View style={styles.photoRow}>
                    <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
                        <Ionicons name="camera" size={20} color={COLORS.brand} />
                        <Text style={styles.photoBtnText}>Take Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.photoBtn} onPress={pickImage}>
                        <Ionicons name="images-outline" size={20} color={COLORS.brand} />
                        <Text style={styles.photoBtnText}>Photo Library</Text>
                    </TouchableOpacity>
                </View>
                {photos.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {photos.map((uri, idx) => (
                            <View key={idx} style={{ position: 'relative', marginRight: 8 }}>
                                <Image source={{ uri }} style={styles.thumb} />
                                <TouchableOpacity style={styles.removeBtn} onPress={() => setPhotos((p) => p.filter((_, i) => i !== idx))}>
                                    <Ionicons name="close-circle" size={20} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                )}

                <TouchableOpacity
                    style={[styles.submitBtn, (submitting || success) && { opacity: 0.7 }]}
                    onPress={handleSubmit}
                    disabled={submitting || success}
                >
                    {submitting ? <ActivityIndicator color="#fff" /> :
                        success ? <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.submitText}>Saved!</Text></> :
                            <Text style={styles.submitText}>Save Chemical Log</Text>}
                </TouchableOpacity>
                    </>
                )}
            </KeyboardAwareScrollView>

            {/* Unit Picker Modal */}
            <Modal visible={showUnitPicker !== null} transparent animationType="slide" onRequestClose={() => setShowUnitPicker(null)}>
                <Pressable style={styles.modalBackdrop} onPress={() => setShowUnitPicker(null)}>
                    <View style={styles.pickerSheet}>
                        <View style={styles.pickerHandle} />
                        <Text style={styles.pickerTitle}>Select Unit</Text>
                        {UNITS.map((u) => {
                            const isSelected = showUnitPicker !== null && chemicals[showUnitPicker]?.unit === u;
                            return (
                                <TouchableOpacity
                                    key={u}
                                    style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                                    onPress={() => {
                                        if (showUnitPicker !== null) {
                                            updateChemical(showUnitPicker, 'unit', u);
                                        }
                                        setShowUnitPicker(null);
                                    }}
                                >
                                    <Text style={[styles.pickerItemText, isSelected && { color: COLORS.brand }]}>{u}</Text>
                                    {isSelected && <Ionicons name="checkmark" size={18} color={COLORS.brand} />}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </Pressable>
            </Modal>
        </View >
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 48, gap: 14 },
    card: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    cardTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
    cardSub: { color: COLORS.subtitle, fontSize: 13 },
    cardMeta: { color: COLORS.subtitle, fontSize: 13 },
    cardEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.brand, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
    cardEditBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
    cardHintText: { color: COLORS.subtitle, fontSize: 12, fontWeight: '700' },
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.brand, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
    editBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    switchTypeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, backgroundColor: COLORS.card },
    switchTypeText: { color: COLORS.subtitle, fontWeight: '700', fontSize: 13 },
    switchingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.brand + '10', borderRadius: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.brand + '30' },
    switchingText: { color: COLORS.subtitle, fontSize: 13, fontWeight: '600' },

    chemRow: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    chemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    chemName: { color: '#fff', fontSize: 15, fontWeight: '600' },
    chemInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    qtyInput: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: '#fff', fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    qtyInputWarning: { borderColor: COLORS.warning },
    unitSelectDrop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, width: 95 },
    unitSelectText: { color: '#fff', fontSize: 16, fontWeight: '500' },
    warningRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    warningText: { color: COLORS.warning, fontSize: 12 },
    field: { gap: 8 },
    label: { color: '#fff', fontSize: 14, fontWeight: '600' },
    textArea: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, color: '#fff', fontSize: 15, minHeight: 90, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, textAlignVertical: 'top' },
    photoRow: { flexDirection: 'row', gap: 10 },
    photoBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 14, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
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

