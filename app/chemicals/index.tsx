import React, { useState, useEffect } from 'react';
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
import { getDateKey, saveChemicals, getChemicalsForDate, ChemicalEntry } from '@/lib/dailyReportStorage';

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
    const [applicationType, setApplicationType] = useState<ApplicationType>('spraying');
    const [chemicals, setChemicals] = useState<Chemical[]>(DEFAULT_CHEMICALS.map(c => ({ ...c })));
    const [notes, setNotes] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [showUnitPicker, setShowUnitPicker] = useState<number | null>(null);

    const dateLabel = selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    useFocusEffect(
        React.useCallback(() => {
            let active = true;
            (async () => {
                const dateKey = getDateKey(selectedDate);
                const data = await getChemicalsForDate(dateKey);
                if (data.length > 0 && active) {
                    const latest = data[data.length - 1]; // if multiple, use latest
                    setApplicationType(latest.applicationType as ApplicationType);
                    setNotes(latest.notes || '');
                    setPhotos(latest.photos || []);

                    // Map the loaded chemicals back
                    if (latest.chemicals && latest.chemicals.length > 0) {
                        const loadedChems = latest.chemicals.map((c) => ({
                            name: c.name,
                            quantity: c.quantity,
                            unit: c.unit,
                        }));
                        // Ensure defaults exist or are overwritten
                        const mergedChems = [...DEFAULT_CHEMICALS.map(dc => ({ ...dc }))];
                        loadedChems.forEach((lc, idx) => {
                            if (idx < mergedChems.length) {
                                mergedChems[idx] = lc;
                            } else {
                                mergedChems.push(lc);
                            }
                        });
                        setChemicals(mergedChems);
                    }
                }
            })();
            return () => { active = false; };
        }, [selectedDate])
    );

    const updateChemical = (index: number, field: keyof Chemical, value: string) => {
        setChemicals((prev) => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    const addCustomChemical = () => {
        setChemicals((prev) => [...prev, { name: '', quantity: '', unit: 'GAL' }]);
    };

    const removeChemical = (index: number) => {
        if (index < DEFAULT_CHEMICALS.length) return; // protect defaults
        setChemicals((prev) => prev.filter((_, i) => i !== index));
    };

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
        if (!result.canceled) setPhotos((prev) => [...prev, result.assets[0].uri]);
    };

    const handleSubmit = async () => {
        const filled = chemicals.filter((c) => c.quantity.trim() !== '');
        if (filled.length === 0) {
            Alert.alert('Required', 'Enter at least one chemical quantity.');
            return;
        }
        setSubmitting(true);
        try {
            const dateKey = getDateKey(selectedDate);
            await saveChemicals(dateKey, {
                id: Date.now().toString(),
                project: selectedProject,
                timestamp: new Date().toISOString(),
                applicationType,
                chemicals: chemicals.map((c) => ({ name: c.name, quantity: c.quantity, unit: c.unit })),
                notes: notes.trim() || undefined,
                photos: photos.length > 0 ? photos : undefined,
            });
            setSuccess(true);
            setTimeout(() => router.back(), 1200);
        } catch {
            Alert.alert('Error', 'Failed to save. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.container}>
            <ScreenHeader title="Chemicals" subtitle={dateLabel} />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

                {/* Application Type Toggle */}
                <View style={styles.toggleSection}>
                    <Text style={styles.toggleLabel}>Application Method</Text>
                    <View style={styles.toggleRow}>
                        <TouchableOpacity
                            style={[styles.toggleBtn, applicationType === 'spraying' && styles.toggleBtnActive]}
                            onPress={() => setApplicationType('spraying')}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name="water"
                                size={18}
                                color={applicationType === 'spraying' ? '#fff' : COLORS.subtitle}
                            />
                            <Text style={[styles.toggleBtnText, applicationType === 'spraying' && styles.toggleBtnTextActive]}>Spraying</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.toggleBtn, applicationType === 'wicking' && styles.toggleBtnActive]}
                            onPress={() => setApplicationType('wicking')}
                            activeOpacity={0.7}
                        >
                            <Ionicons
                                name="brush"
                                size={18}
                                color={applicationType === 'wicking' ? '#fff' : COLORS.subtitle}
                            />
                            <Text style={[styles.toggleBtnText, applicationType === 'wicking' && styles.toggleBtnTextActive]}>Wicking</Text>
                        </TouchableOpacity>
                    </View>
                </View>


                {/* Chemical rows */}
                {chemicals.map((chem, idx) => {
                    const warning = getWarning(chem.name, chem.quantity, chem.unit);
                    const isDefault = idx < DEFAULT_CHEMICALS.length;
                    return (
                        <View key={idx} style={styles.chemRow}>
                            <View style={styles.chemHeader}>
                                {isDefault ? (
                                    <Text style={styles.chemName}>{chem.name}</Text>
                                ) : (
                                    <TextInput
                                        style={styles.chemNameInput}
                                        value={chem.name}
                                        onChangeText={(v) => updateChemical(idx, 'name', v)}
                                        placeholder="Chemical name"
                                        placeholderTextColor={COLORS.subtitle}
                                    />
                                )}
                                {!isDefault && (
                                    <TouchableOpacity onPress={() => removeChemical(idx)}>
                                        <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                                    </TouchableOpacity>
                                )}
                            </View>
                            <View style={styles.chemInputRow}>
                                <TextInput
                                    style={[styles.qtyInput, warning ? styles.qtyInputWarning : null]}
                                    value={chem.quantity}
                                    onChangeText={(v) => updateChemical(idx, 'quantity', v)}
                                    placeholder="0.0"
                                    placeholderTextColor={COLORS.subtitle}
                                    keyboardType="decimal-pad"
                                />
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
                        </View>
                    );
                })}

                {/* Add custom */}
                <TouchableOpacity style={styles.addCustomBtn} onPress={addCustomChemical}>
                    <Ionicons name="add-circle-outline" size={18} color={COLORS.brand} />
                    <Text style={styles.addCustomText}>Add Custom Chemical</Text>
                </TouchableOpacity>

                {/* Notes */}
                <View style={styles.field}>
                    <Text style={styles.label}>Notes (optional)</Text>
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
                </View>

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
            </ScrollView>

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
    toggleSection: { gap: 8 },
    toggleLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
    toggleRow: { flexDirection: 'row', gap: 10, backgroundColor: COLORS.card, borderRadius: 16, padding: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12 },
    toggleBtnActive: { backgroundColor: COLORS.brand },
    toggleBtnText: { color: COLORS.subtitle, fontSize: 15, fontWeight: '600' },
    toggleBtnTextActive: { color: '#fff' },

    chemRow: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, gap: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    chemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    chemName: { color: '#fff', fontSize: 15, fontWeight: '600' },
    chemNameInput: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600', borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingBottom: 4 },
    chemInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    qtyInput: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: '#fff', fontSize: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    qtyInputWarning: { borderColor: COLORS.warning },
    unitSelectDrop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.surface, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, width: 95 },
    unitSelectText: { color: '#fff', fontSize: 16, fontWeight: '500' },
    warningRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    warningText: { color: COLORS.warning, fontSize: 12 },
    addCustomBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.brand, paddingVertical: 12, justifyContent: 'center', borderStyle: 'dashed' },
    addCustomText: { color: COLORS.brand, fontWeight: '600', fontSize: 14 },
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

