import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
    Switch,
    Image,
    ActivityIndicator,
    Modal,
    Pressable,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '@/context/AppContext';
import {
    getDateKey,
    saveIncident,
    updateIncident,
    getIncidentsForDate,
    IncidentEntry,
} from '@/lib/dailyReportStorage';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    card2: '#3A3A3C',
    border: '#3A3A3C',
    subtitle: '#98989D',
    blue: '#0A84FF',
    success: '#30D158',
    warning: '#FFD60A',
    danger: '#FF453A',
    muted: '#48484A',
};

const INJURY_TYPES = [
    'Bruise / Contusion',
    'Cut / Laceration',
    'Fracture',
    'Sprain / Strain',
    'Burn',
    'Chemical Exposure',
    'Electrical Shock',
    'Heat Illness',
    'Respiratory',
    'Eye Injury',
    'Back Injury',
    'Other',
];

const STATUSES: IncidentEntry['status'][] = ['Open', 'Closed'];

export default function AddIncidentScreen() {
    const { selectedDate, selectedProject } = useAppContext();
    const { editId } = useLocalSearchParams<{ editId?: string }>();
    const insets = useSafeAreaInsets();
    const isEditing = !!editId;

    // Form state
    const [title, setTitle] = useState('');
    const [status, setStatus] = useState<IncidentEntry['status']>('Open');
    const [recordable, setRecordable] = useState(false);
    const [incidentDate, setIncidentDate] = useState(new Date().toISOString());
    const [incidentTime, setIncidentTime] = useState(
        new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    );
    const [location, setLocation] = useState('');
    const [injuryIllnessType, setInjuryIllnessType] = useState('');
    const [description, setDescription] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [injuredEmployeeInfo, setInjuredEmployeeInfo] = useState<string[]>([]);
    const [incidentInvestigation, setIncidentInvestigation] = useState<string[]>([]);
    const [incidentOutcome, setIncidentOutcome] = useState<string[]>([]);

    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    // Picker modals
    const [showStatusPicker, setShowStatusPicker] = useState(false);
    const [showInjuryTypePicker, setShowInjuryTypePicker] = useState(false);
    const [showEmployeeInfoSheet, setShowEmployeeInfoSheet] = useState(false);
    const [showInvestigationSheet, setShowInvestigationSheet] = useState(false);
    const [showOutcomeSheet, setShowOutcomeSheet] = useState(false);

    // Temp text for adding items
    const [tempText, setTempText] = useState('');
    const [activeSheet, setActiveSheet] = useState<'employee' | 'investigation' | 'outcome' | null>(null);

    // Load existing incident
    useEffect(() => {
        if (editId) {
            (async () => {
                const dateKey = getDateKey(selectedDate);
                const all = await getIncidentsForDate(dateKey);
                const existing = all.find((o) => o.id === editId);
                if (existing) {
                    setTitle(existing.title);
                    setStatus(existing.status);
                    setRecordable(existing.recordable);
                    setIncidentDate(existing.incidentDate);
                    setIncidentTime(existing.incidentTime);
                    setLocation(existing.location);
                    setInjuryIllnessType(existing.injuryIllnessType ?? '');
                    setDescription(existing.description ?? '');
                    setPhotos(existing.photos ?? []);
                    setInjuredEmployeeInfo(existing.injuredEmployeeInfo ?? []);
                    setIncidentInvestigation(existing.incidentInvestigation ?? []);
                    setIncidentOutcome(existing.incidentOutcome ?? []);
                }
            })();
        }
    }, [editId, selectedDate]);

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow photo library access in Settings.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            quality: 0.8,
        });
        if (!result.canceled) {
            setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
        }
    };

    const handleSubmit = async () => {
        if (!title.trim()) {
            Alert.alert('Required', 'Please enter a title for the incident.');
            return;
        }
        setSubmitting(true);
        try {
            const dateKey = getDateKey(selectedDate);
            const entry: IncidentEntry = {
                id: editId ?? Date.now().toString(),
                project: selectedProject,
                timestamp: new Date().toISOString(),
                title: title.trim(),
                status,
                recordable,
                incidentDate,
                incidentTime,
                location: location.trim(),
                injuryIllnessType: injuryIllnessType || undefined,
                description: description.trim() || undefined,
                photos: photos.length > 0 ? photos : undefined,
                injuredEmployeeInfo: injuredEmployeeInfo.length > 0 ? injuredEmployeeInfo : undefined,
                incidentInvestigation: incidentInvestigation.length > 0 ? incidentInvestigation : undefined,
                incidentOutcome: incidentOutcome.length > 0 ? incidentOutcome : undefined,
            };
            if (isEditing) {
                await updateIncident(dateKey, entry);
            } else {
                await saveIncident(dateKey, entry);
            }
            setSuccess(true);
            setTimeout(() => router.back(), 1000);
        } catch {
            Alert.alert('Error', 'Failed to save incident.');
        } finally {
            setSubmitting(false);
        }
    };

    const incidentDateLabel = (() => {
        try {
            return new Date(incidentDate).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
            });
        } catch {
            return 'Not set';
        }
    })();

    // Helper to show an add-item sheet
    const openAddSheet = (type: 'employee' | 'investigation' | 'outcome') => {
        setActiveSheet(type);
        setTempText('');
        if (type === 'employee') setShowEmployeeInfoSheet(true);
        else if (type === 'investigation') setShowInvestigationSheet(true);
        else setShowOutcomeSheet(true);
    };

    const addItemToList = () => {
        if (!tempText.trim()) return;
        if (activeSheet === 'employee') {
            setInjuredEmployeeInfo((prev) => [...prev, tempText.trim()]);
        } else if (activeSheet === 'investigation') {
            setIncidentInvestigation((prev) => [...prev, tempText.trim()]);
        } else if (activeSheet === 'outcome') {
            setIncidentOutcome((prev) => [...prev, tempText.trim()]);
        }
        setTempText('');
    };

    const removeFromList = (type: 'employee' | 'investigation' | 'outcome', index: number) => {
        if (type === 'employee') setInjuredEmployeeInfo((prev) => prev.filter((_, i) => i !== index));
        else if (type === 'investigation') setIncidentInvestigation((prev) => prev.filter((_, i) => i !== index));
        else setIncidentOutcome((prev) => prev.filter((_, i) => i !== index));
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {isEditing ? 'Edit incident' : 'New incident'}
                </Text>
                <TouchableOpacity onPress={handleSubmit} disabled={submitting || success}>
                    {submitting ? (
                        <ActivityIndicator size="small" color={COLORS.brand} />
                    ) : success ? (
                        <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                    ) : (
                        <Text style={[styles.saveText, !title.trim() && { opacity: 0.4 }]}>Save</Text>
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                {/* Title + Status + Recordable Card */}
                <View style={styles.fieldCard}>
                    {/* Title */}
                    <View style={styles.fieldColumn}>
                        <TextInput
                            style={styles.titleInput}
                            value={title}
                            onChangeText={setTitle}
                            placeholder="Title"
                            placeholderTextColor={COLORS.subtitle}
                        />
                    </View>

                    <View style={styles.fieldDivider} />

                    {/* Status */}
                    <TouchableOpacity
                        style={styles.fieldRow}
                        onPress={() => setShowStatusPicker(true)}
                    >
                        <View style={{ flex: 1 }}>
                            <Text style={styles.fieldSubLabel}>Status</Text>
                            <Text style={styles.fieldValue}>{status}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
                    </TouchableOpacity>

                    <View style={styles.fieldDivider} />

                    {/* Recordable */}
                    <View style={styles.recordableRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.fieldValue}>Recordable</Text>
                            <Text style={styles.recordableHint}>
                                Switch on if this incident is classified as{'\n'}a recordable by your regulatory agency
                            </Text>
                        </View>
                        <Switch
                            value={recordable}
                            onValueChange={setRecordable}
                            trackColor={{ false: COLORS.card2, true: COLORS.success }}
                            thumbColor="#fff"
                        />
                    </View>
                </View>

                {/* Incident Details Section */}
                <Text style={styles.sectionTitle}>Incident details</Text>

                <View style={styles.fieldCard}>
                    {/* Incident Date */}
                    <TouchableOpacity style={styles.fieldRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.fieldSubLabel}>Incident Date</Text>
                            <Text style={styles.fieldValue}>{incidentDateLabel}</Text>
                        </View>
                        <Ionicons name="calendar-outline" size={20} color={COLORS.subtitle} />
                    </TouchableOpacity>

                    <View style={styles.fieldDivider} />

                    {/* Incident Time */}
                    <TouchableOpacity style={styles.fieldRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.fieldSubLabel}>Incident Time</Text>
                            <Text style={styles.fieldValue}>{incidentTime}</Text>
                        </View>
                        <Ionicons name="time-outline" size={20} color={COLORS.subtitle} />
                    </TouchableOpacity>

                    <View style={styles.fieldDivider} />

                    {/* Incident Location */}
                    <View style={styles.fieldRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.fieldSubLabel}>Incident location</Text>
                            <TextInput
                                style={styles.inlineInput}
                                value={location}
                                onChangeText={setLocation}
                                placeholder="Enter location..."
                                placeholderTextColor={COLORS.muted}
                            />
                        </View>
                        {location.length > 0 && (
                            <TouchableOpacity onPress={() => setLocation('')}>
                                <Ionicons name="close-circle-outline" size={22} color={COLORS.subtitle} />
                            </TouchableOpacity>
                        )}
                    </View>

                    <View style={styles.fieldDivider} />

                    {/* Injury/illness type */}
                    <TouchableOpacity
                        style={styles.fieldRow}
                        onPress={() => setShowInjuryTypePicker(true)}
                    >
                        <Text style={[styles.fieldLabel, !injuryIllnessType && { color: COLORS.subtitle }]}>
                            {injuryIllnessType || 'Injury/illness type'}
                        </Text>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
                    </TouchableOpacity>
                </View>

                {/* Description */}
                <View style={styles.fieldCard}>
                    <View style={styles.fieldColumn}>
                        <Text style={styles.fieldSubLabel}>Description</Text>
                        <TextInput
                            style={styles.textArea}
                            value={description}
                            onChangeText={setDescription}
                            placeholder="Describe what happened..."
                            placeholderTextColor={COLORS.muted}
                            multiline
                            numberOfLines={4}
                            textAlignVertical="top"
                        />
                    </View>
                </View>

                {/* Photos */}
                <TouchableOpacity style={styles.attachmentRow} onPress={pickImage}>
                    <Text style={styles.fieldLabel}>Photos ({photos.length})</Text>
                    <Ionicons name="camera-outline" size={22} color={COLORS.subtitle} />
                </TouchableOpacity>
                {photos.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: -8 }}>
                        {photos.map((uri, idx) => (
                            <View key={idx} style={styles.photoThumbWrap}>
                                <Image source={{ uri }} style={styles.photoThumb} />
                                <TouchableOpacity
                                    style={styles.removePhoto}
                                    onPress={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                                >
                                    <Ionicons name="close-circle" size={20} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                )}

                {/* Expandable Sections */}
                <TouchableOpacity
                    style={styles.expandableRow}
                    onPress={() => openAddSheet('employee')}
                >
                    <Text style={styles.expandableTitle}>Injured employee info</Text>
                    <View style={styles.expandableRight}>
                        <Text style={styles.expandableCount}>{injuredEmployeeInfo.length}/5</Text>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
                    </View>
                </TouchableOpacity>

                {injuredEmployeeInfo.map((info, idx) => (
                    <View key={idx} style={styles.listItem}>
                        <Text style={styles.listItemText} numberOfLines={2}>{info}</Text>
                        <TouchableOpacity onPress={() => removeFromList('employee', idx)}>
                            <Ionicons name="close-circle" size={18} color={COLORS.subtitle} />
                        </TouchableOpacity>
                    </View>
                ))}

                <TouchableOpacity
                    style={styles.expandableRow}
                    onPress={() => openAddSheet('investigation')}
                >
                    <Text style={styles.expandableTitle}>Incident investigation</Text>
                    <View style={styles.expandableRight}>
                        <Text style={styles.expandableCount}>{incidentInvestigation.length}/5</Text>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
                    </View>
                </TouchableOpacity>

                {incidentInvestigation.map((info, idx) => (
                    <View key={idx} style={styles.listItem}>
                        <Text style={styles.listItemText} numberOfLines={2}>{info}</Text>
                        <TouchableOpacity onPress={() => removeFromList('investigation', idx)}>
                            <Ionicons name="close-circle" size={18} color={COLORS.subtitle} />
                        </TouchableOpacity>
                    </View>
                ))}

                <TouchableOpacity
                    style={styles.expandableRow}
                    onPress={() => openAddSheet('outcome')}
                >
                    <Text style={styles.expandableTitle}>Incident outcome</Text>
                    <View style={styles.expandableRight}>
                        <Text style={styles.expandableCount}>{incidentOutcome.length}/5</Text>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
                    </View>
                </TouchableOpacity>

                {incidentOutcome.map((info, idx) => (
                    <View key={idx} style={styles.listItem}>
                        <Text style={styles.listItemText} numberOfLines={2}>{info}</Text>
                        <TouchableOpacity onPress={() => removeFromList('outcome', idx)}>
                            <Ionicons name="close-circle" size={18} color={COLORS.subtitle} />
                        </TouchableOpacity>
                    </View>
                ))}

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Status Picker */}
            <Modal
                visible={showStatusPicker}
                transparent
                animationType="slide"
                onRequestClose={() => setShowStatusPicker(false)}
            >
                <Pressable style={styles.sheetBackdrop} onPress={() => setShowStatusPicker(false)}>
                    <View style={styles.sheetContainer}>
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>Status</Text>
                        {STATUSES.map((s) => (
                            <TouchableOpacity
                                key={s}
                                style={[styles.sheetOption, status === s && styles.sheetOptionActive]}
                                onPress={() => { setStatus(s); setShowStatusPicker(false); }}
                            >
                                <View style={[styles.statusDot, {
                                    backgroundColor: s === 'Open' ? COLORS.warning : COLORS.success,
                                }]} />
                                <Text style={styles.sheetOptionText}>{s}</Text>
                                {status === s && (
                                    <Ionicons name="checkmark" size={18} color={COLORS.brand} style={{ marginLeft: 'auto' }} />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </Pressable>
            </Modal>

            {/* Injury Type Picker */}
            <Modal
                visible={showInjuryTypePicker}
                transparent
                animationType="slide"
                onRequestClose={() => setShowInjuryTypePicker(false)}
            >
                <Pressable style={styles.sheetBackdrop} onPress={() => setShowInjuryTypePicker(false)}>
                    <View style={styles.sheetContainer}>
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>Injury / Illness Type</Text>
                        <ScrollView style={{ maxHeight: 400 }}>
                            {INJURY_TYPES.map((t) => (
                                <TouchableOpacity
                                    key={t}
                                    style={[styles.sheetOption, injuryIllnessType === t && styles.sheetOptionActive]}
                                    onPress={() => { setInjuryIllnessType(t); setShowInjuryTypePicker(false); }}
                                >
                                    <Text style={styles.sheetOptionText}>{t}</Text>
                                    {injuryIllnessType === t && (
                                        <Ionicons name="checkmark" size={18} color={COLORS.brand} style={{ marginLeft: 'auto' }} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </Pressable>
            </Modal>

            {/* Add Item Sheet (reused for employee info, investigation, outcome) */}
            <Modal
                visible={showEmployeeInfoSheet || showInvestigationSheet || showOutcomeSheet}
                transparent
                animationType="slide"
                onRequestClose={() => {
                    setShowEmployeeInfoSheet(false);
                    setShowInvestigationSheet(false);
                    setShowOutcomeSheet(false);
                }}
            >
                <Pressable
                    style={styles.sheetBackdrop}
                    onPress={() => {
                        setShowEmployeeInfoSheet(false);
                        setShowInvestigationSheet(false);
                        setShowOutcomeSheet(false);
                    }}
                >
                    <Pressable style={styles.sheetContainer} onPress={(e) => e.stopPropagation()}>
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>
                            {activeSheet === 'employee'
                                ? 'Injured Employee Info'
                                : activeSheet === 'investigation'
                                    ? 'Incident Investigation'
                                    : 'Incident Outcome'}
                        </Text>

                        {/* Existing items */}
                        {(activeSheet === 'employee' ? injuredEmployeeInfo :
                            activeSheet === 'investigation' ? incidentInvestigation :
                                incidentOutcome
                        ).map((item, idx) => (
                            <View key={idx} style={styles.sheetListItem}>
                                <Text style={styles.sheetListItemText} numberOfLines={2}>{item}</Text>
                                <TouchableOpacity onPress={() => removeFromList(activeSheet!, idx)}>
                                    <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                                </TouchableOpacity>
                            </View>
                        ))}

                        {/* Add new */}
                        <View style={styles.addItemRow}>
                            <TextInput
                                style={styles.addItemInput}
                                value={tempText}
                                onChangeText={setTempText}
                                placeholder="Add new entry..."
                                placeholderTextColor={COLORS.subtitle}
                                multiline
                            />
                            <TouchableOpacity
                                style={[styles.addItemBtn, !tempText.trim() && { opacity: 0.4 }]}
                                onPress={addItemToList}
                                disabled={!tempText.trim()}
                            >
                                <Ionicons name="add-circle" size={28} color={COLORS.brand} />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            style={styles.sheetDoneBtn}
                            onPress={() => {
                                setShowEmployeeInfoSheet(false);
                                setShowInvestigationSheet(false);
                                setShowOutcomeSheet(false);
                            }}
                        >
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

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: COLORS.card,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: COLORS.border,
    },
    cancelText: { color: COLORS.blue, fontSize: 16, fontWeight: '500' },
    headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
    saveText: { color: COLORS.brand, fontSize: 16, fontWeight: '700' },

    scrollView: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 48, gap: 16 },

    // Field card
    fieldCard: {
        backgroundColor: COLORS.card,
        borderRadius: 14,
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    fieldRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 10,
    },
    fieldColumn: { paddingHorizontal: 14, paddingVertical: 12 },
    fieldLabel: { color: '#fff', fontSize: 15, fontWeight: '500', flex: 1 },
    fieldSubLabel: { color: COLORS.subtitle, fontSize: 12, fontWeight: '500', marginBottom: 4 },
    fieldValue: { color: '#fff', fontSize: 16, fontWeight: '600' },
    fieldDivider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: 14 },


    // Title
    titleInput: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '500',
        paddingVertical: 4,
    },

    // Recordable
    recordableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 12,
    },
    recordableHint: {
        color: COLORS.subtitle,
        fontSize: 12,
        lineHeight: 17,
        marginTop: 3,
    },

    // Section title
    sectionTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
        marginTop: 4,
    },

    // Inline text input
    inlineInput: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        padding: 0,
    },

    // Text area
    textArea: {
        backgroundColor: COLORS.surface,
        borderRadius: 10,
        padding: 12,
        color: '#fff',
        fontSize: 14,
        minHeight: 80,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
        lineHeight: 20,
    },

    // Attachment
    attachmentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.card,
        borderRadius: 14,
        padding: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },

    // Photo
    photoThumbWrap: { position: 'relative', marginRight: 8 },
    photoThumb: { width: 70, height: 70, borderRadius: 10 } as const,
    removePhoto: { position: 'absolute', top: -6, right: -6 },

    // Expandable rows
    expandableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.card,
        borderRadius: 14,
        padding: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    expandableTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
    expandableRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    expandableCount: { color: COLORS.subtitle, fontSize: 14, fontWeight: '500' },

    // List items (inline)
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.card,
        borderRadius: 10,
        padding: 12,
        marginTop: -8,
        gap: 8,
        marginLeft: 16,
        marginRight: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    listItemText: { flex: 1, color: '#fff', fontSize: 14 },

    // Status dot
    statusDot: { width: 8, height: 8, borderRadius: 4 },

    // Sheet
    sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheetContainer: {
        backgroundColor: COLORS.card,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 16,
        paddingBottom: 40,
        paddingTop: 12,
    },
    sheetHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: COLORS.border,
        alignSelf: 'center',
        marginBottom: 16,
    },
    sheetTitle: { color: COLORS.subtitle, fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
    sheetOption: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 14,
        paddingHorizontal: 4,
    },
    sheetOptionActive: { backgroundColor: COLORS.border + '40', borderRadius: 12, paddingHorizontal: 12 },
    sheetOptionText: { color: '#fff', fontSize: 16, fontWeight: '500' },

    // Sheet list items
    sheetListItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: COLORS.border,
    },
    sheetListItemText: { flex: 1, color: '#fff', fontSize: 15 },

    // Add item
    addItemRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
        marginTop: 12,
    },
    addItemInput: {
        flex: 1,
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        padding: 12,
        color: '#fff',
        fontSize: 14,
        minHeight: 44,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    addItemBtn: {
        paddingBottom: 6,
    },

    // Done button
    sheetDoneBtn: {
        backgroundColor: COLORS.surface,
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 16,
    },
    sheetDoneText: { color: COLORS.blue, fontSize: 17, fontWeight: '600' },
});
