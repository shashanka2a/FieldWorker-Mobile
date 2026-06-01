import React, { useState, useEffect, useMemo } from 'react';
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
    Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView, KeyboardField, ScrollInputField } from '@/components/KeyboardAwareScrollView';
import { useAppContext } from '@/context/AppContext';
import {
    createUuid,
    getDateKey,
    getSubmittedAtIso,
    saveIncident,
    updateIncident,
    getIncidentsForDate,
    IncidentEntry,
} from '@/lib/dailyReportStorage';
import { useFormDraft, clearFormDraft } from '@/hooks/useFormDraft';
import {
    emptyInjuredEmployee,
    formatInjuredEmployeeDateLabel,
    formatInjuredEmployeeSummary,
    INJURED_EMPLOYEE_GENDERS,
    MAX_INJURED_EMPLOYEES,
    normalizeInjuredEmployeeList,
    type InjuredEmployeeGender,
    type InjuredEmployeeRecord,
} from '@/lib/injuredEmployeeInfo';
import {
    emptyIncidentOutcome,
    formatIncidentOutcomeSummary,
    INCIDENT_OUTCOME_TYPES,
    incidentOutcomeHasData,
    normalizeIncidentOutcome,
    type IncidentOutcomeRecord,
    type IncidentYesNo,
} from '@/lib/incidentOutcomeInfo';
import {
    emptyIncidentInvestigation,
    formatIncidentInvestigationSummary,
    INCIDENT_INVESTIGATION_FIELDS,
    incidentInvestigationHasData,
    normalizeIncidentInvestigation,
    type IncidentInvestigationRecord,
} from '@/lib/incidentInvestigationInfo';

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

const REGULATORY_FORM_HINT = 'These are required for submission to regulatory authorities.';

function formatIncidentTimeLabel(d: Date): string {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function isoDateFromDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function dateFromIso(iso: string): Date {
    if (iso && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
        const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
        if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
}

function parseIncidentTimeToDate(timeStr: string, baseDateIso?: string): Date {
    const base = baseDateIso ? new Date(baseDateIso) : new Date();
    const fallback = Number.isNaN(base.getTime()) ? new Date() : new Date(base);

    const trimmed = timeStr.trim();
    const m24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m24) {
        const d = new Date(fallback);
        d.setHours(parseInt(m24[1]!, 10), parseInt(m24[2]!, 10), m24[3] ? parseInt(m24[3], 10) : 0, 0);
        return d;
    }

    const parsed = Date.parse(`1970-01-01 ${trimmed}`);
    if (!Number.isNaN(parsed)) {
        const t = new Date(parsed);
        const d = new Date(fallback);
        d.setHours(t.getHours(), t.getMinutes(), 0, 0);
        return d;
    }

    return new Date();
}

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
    const [injuredEmployeeInfo, setInjuredEmployeeInfo] = useState<InjuredEmployeeRecord[]>([]);
    const [incidentInvestigation, setIncidentInvestigation] = useState<IncidentInvestigationRecord | undefined>(
        undefined
    );
    const [incidentOutcome, setIncidentOutcome] = useState<IncidentOutcomeRecord | undefined>(undefined);

    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    // Picker modals
    const [showStatusPicker, setShowStatusPicker] = useState(false);
    const [showInjuryTypePicker, setShowInjuryTypePicker] = useState(false);
    const [showIncidentTimePicker, setShowIncidentTimePicker] = useState(false);
    const [showIncidentDatePicker, setShowIncidentDatePicker] = useState(false);
    const [showInjuredEmployeeForm, setShowInjuredEmployeeForm] = useState(false);
    const [editingInjuredIndex, setEditingInjuredIndex] = useState<number | null>(null);
    const [injuredFormDraft, setInjuredFormDraft] = useState<InjuredEmployeeRecord>(emptyInjuredEmployee());
    const [showGenderPicker, setShowGenderPicker] = useState(false);
    const [showDobPicker, setShowDobPicker] = useState(false);
    const [showHireDatePicker, setShowHireDatePicker] = useState(false);
    const [showInvestigationForm, setShowInvestigationForm] = useState(false);
    const [investigationFormDraft, setInvestigationFormDraft] = useState<IncidentInvestigationRecord>(
        emptyIncidentInvestigation()
    );
    const [showOutcomeForm, setShowOutcomeForm] = useState(false);
    const [outcomeFormDraft, setOutcomeFormDraft] = useState<IncidentOutcomeRecord>(emptyIncidentOutcome());
    const [showOutcomeTypePicker, setShowOutcomeTypePicker] = useState(false);

    const dateKey = useMemo(() => getDateKey(selectedDate), [selectedDate]);
    const draftKey = useMemo(
        () => `fw_draft_incident_${dateKey}_${editId ?? 'new'}`,
        [dateKey, editId]
    );
    const [baselineReady, setBaselineReady] = useState(!isEditing);

    // Load existing incident for edit; gate draft restore until baseline is loaded.
    useEffect(() => {
        if (!editId) {
            setBaselineReady(true);
            return;
        }
        setBaselineReady(false);
        (async () => {
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
                setInjuredEmployeeInfo(normalizeInjuredEmployeeList(existing.injuredEmployeeInfo));
                setIncidentInvestigation(normalizeIncidentInvestigation(existing.incidentInvestigation));
                setIncidentOutcome(normalizeIncidentOutcome(existing.incidentOutcome));
            }
            setBaselineReady(true);
        })();
    }, [editId, dateKey]);

    const incidentDraftSnapshot = useMemo(
        () =>
            JSON.stringify({
                title,
                status,
                recordable,
                incidentDate,
                incidentTime,
                location,
                injuryIllnessType,
                description,
                injuredEmployeeInfo,
                incidentInvestigation,
                incidentOutcome,
                photos,
            }),
        [
            title,
            status,
            recordable,
            incidentDate,
            incidentTime,
            location,
            injuryIllnessType,
            description,
            injuredEmployeeInfo,
            incidentInvestigation,
            incidentOutcome,
            photos,
        ]
    );

    useFormDraft({
        storageKey: draftKey,
        active: baselineReady,
        snapshotJson: incidentDraftSnapshot,
        hydrate: (parsed) => {
            if (!parsed || typeof parsed !== 'object') return;
            const p = parsed as Record<string, unknown>;
            if (typeof p.title === 'string') setTitle(p.title);
            if (p.status === 'Open' || p.status === 'Closed') setStatus(p.status);
            if (typeof p.recordable === 'boolean') setRecordable(p.recordable);
            if (typeof p.incidentDate === 'string') setIncidentDate(p.incidentDate);
            if (typeof p.incidentTime === 'string') setIncidentTime(p.incidentTime);
            if (typeof p.location === 'string') setLocation(p.location);
            if (typeof p.injuryIllnessType === 'string') setInjuryIllnessType(p.injuryIllnessType);
            if (typeof p.description === 'string') setDescription(p.description);
            if (Array.isArray(p.injuredEmployeeInfo)) {
                setInjuredEmployeeInfo(normalizeInjuredEmployeeList(p.injuredEmployeeInfo));
            }
            if (p.incidentInvestigation !== undefined) {
                setIncidentInvestigation(normalizeIncidentInvestigation(p.incidentInvestigation));
            }
            if (p.incidentOutcome !== undefined) {
                setIncidentOutcome(normalizeIncidentOutcome(p.incidentOutcome));
            }
            if (Array.isArray(p.photos)) {
                setPhotos(p.photos.filter((x): x is string => typeof x === 'string'));
            }
        },
        isNonEmpty: () =>
            !!(
                title.trim() ||
                location.trim() ||
                description.trim() ||
                injuredEmployeeInfo.length > 0 ||
                incidentInvestigationHasData(incidentInvestigation) ||
                incidentOutcomeHasData(incidentOutcome) ||
                photos.length > 0
            ),
    });

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
            const entry: IncidentEntry = {
                id: editId ?? createUuid(),
                project: selectedProject,
                timestamp: getSubmittedAtIso(),
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
                incidentInvestigation: incidentInvestigationHasData(incidentInvestigation)
                    ? incidentInvestigation
                    : undefined,
                incidentOutcome: incidentOutcomeHasData(incidentOutcome) ? incidentOutcome : undefined,
            };
            if (isEditing) {
                await updateIncident(dateKey, entry);
            } else {
                await saveIncident(dateKey, entry);
            }
            await clearFormDraft(draftKey);
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

    const incidentTimeAsDate = useMemo(
        () => parseIncidentTimeToDate(incidentTime, incidentDate),
        [incidentTime, incidentDate]
    );

    const incidentDateAsDate = useMemo(() => dateFromIso(incidentDate), [incidentDate]);

    const onIncidentDatePickerChange = (event: DateTimePickerEvent, selected?: Date) => {
        if (Platform.OS === 'android') {
            setShowIncidentDatePicker(false);
        }
        if (event.type === 'dismissed') return;
        if (selected) {
            setIncidentDate(isoDateFromDate(selected));
        }
    };

    const onIncidentTimePickerChange = (event: DateTimePickerEvent, selected?: Date) => {
        if (Platform.OS === 'android') {
            setShowIncidentTimePicker(false);
        }
        if (event.type === 'dismissed') return;
        if (selected) {
            setIncidentTime(formatIncidentTimeLabel(selected));
        }
    };

    const openInvestigationForm = () => {
        setInvestigationFormDraft(
            incidentInvestigation ? { ...incidentInvestigation } : emptyIncidentInvestigation()
        );
        setShowInvestigationForm(true);
    };

    const closeInvestigationForm = () => {
        setShowInvestigationForm(false);
        setInvestigationFormDraft(emptyIncidentInvestigation());
    };

    const saveInvestigationForm = () => {
        if (incidentInvestigationHasData(investigationFormDraft)) {
            setIncidentInvestigation({ ...investigationFormDraft });
        } else {
            setIncidentInvestigation(undefined);
        }
        closeInvestigationForm();
    };

    const updateInvestigationDraft = <K extends keyof IncidentInvestigationRecord>(
        key: K,
        value: IncidentInvestigationRecord[K]
    ) => {
        setInvestigationFormDraft((prev) => ({ ...prev, [key]: value }));
    };

    const openOutcomeForm = () => {
        setOutcomeFormDraft(incidentOutcome ? { ...incidentOutcome } : emptyIncidentOutcome());
        setShowOutcomeForm(true);
    };

    const closeOutcomeForm = () => {
        setShowOutcomeForm(false);
        setShowOutcomeTypePicker(false);
        setOutcomeFormDraft(emptyIncidentOutcome());
    };

    const saveOutcomeForm = () => {
        if (incidentOutcomeHasData(outcomeFormDraft)) {
            setIncidentOutcome({ ...outcomeFormDraft });
        } else {
            setIncidentOutcome(undefined);
        }
        closeOutcomeForm();
    };

    const updateOutcomeDraft = <K extends keyof IncidentOutcomeRecord>(
        key: K,
        value: IncidentOutcomeRecord[K]
    ) => {
        setOutcomeFormDraft((prev) => ({ ...prev, [key]: value }));
    };

    const removeInjuredEmployee = (index: number) => {
        setInjuredEmployeeInfo((prev) => prev.filter((_, i) => i !== index));
    };

    const openInjuredEmployeeForm = (index?: number) => {
        if (index !== undefined) {
            setInjuredFormDraft({ ...injuredEmployeeInfo[index]! });
            setEditingInjuredIndex(index);
        } else {
            if (injuredEmployeeInfo.length >= MAX_INJURED_EMPLOYEES) {
                Alert.alert('Limit', `You can add up to ${MAX_INJURED_EMPLOYEES} injured employee entries.`);
                return;
            }
            setInjuredFormDraft(emptyInjuredEmployee());
            setEditingInjuredIndex(null);
        }
        setShowInjuredEmployeeForm(true);
    };

    const closeInjuredEmployeeForm = () => {
        setShowInjuredEmployeeForm(false);
        setShowGenderPicker(false);
        setShowDobPicker(false);
        setShowHireDatePicker(false);
        setEditingInjuredIndex(null);
        setInjuredFormDraft(emptyInjuredEmployee());
    };

    const saveInjuredEmployeeForm = () => {
        if (!injuredFormDraft.name.trim()) {
            Alert.alert('Required', 'Enter employee name.');
            return;
        }
        const next = { ...injuredFormDraft, name: injuredFormDraft.name.trim(), jobTitle: injuredFormDraft.jobTitle.trim() };
        if (editingInjuredIndex !== null) {
            setInjuredEmployeeInfo((prev) => prev.map((row, i) => (i === editingInjuredIndex ? next : row)));
        } else {
            setInjuredEmployeeInfo((prev) => [...prev, next]);
        }
        closeInjuredEmployeeForm();
    };

    const updateInjuredDraft = <K extends keyof InjuredEmployeeRecord>(key: K, value: InjuredEmployeeRecord[K]) => {
        setInjuredFormDraft((prev) => ({ ...prev, [key]: value }));
    };

    const onInjuredDatePicked = (field: 'dateOfBirth' | 'dateOfHire', event: DateTimePickerEvent, selected?: Date) => {
        if (Platform.OS === 'android') {
            if (field === 'dateOfBirth') setShowDobPicker(false);
            else setShowHireDatePicker(false);
        }
        if (event.type === 'dismissed') return;
        if (selected) updateInjuredDraft(field, isoDateFromDate(selected));
    };

    const renderFormPickerOverlay = (
        visible: boolean,
        onClose: () => void,
        title: string,
        children: React.ReactNode
    ) => {
        if (!visible) return null;
        return (
            <Pressable style={styles.inModalOverlay} onPress={onClose}>
                <Pressable style={styles.inModalPickerCard} onPress={(e) => e.stopPropagation()}>
                    <View style={styles.sheetHandle} />
                    <Text style={styles.inModalPickerTitle}>{title}</Text>
                    {children}
                </Pressable>
            </Pressable>
        );
    };

    const renderYesNoPills = (
        value: IncidentYesNo,
        onSelect: (next: IncidentYesNo) => void
    ) => (
        <View style={styles.yesNoRow}>
            {(['Yes', 'No'] as const).map((opt) => {
                const selected = value === opt;
                return (
                    <TouchableOpacity
                        key={opt}
                        style={[styles.yesNoPill, selected && styles.yesNoPillSelected]}
                        onPress={() => onSelect(opt)}
                        activeOpacity={0.85}
                    >
                        <Text style={[styles.yesNoPillText, selected && styles.yesNoPillTextSelected]}>
                            {opt}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );

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

            <KeyboardAwareScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Title + Status + Recordable Card */}
                <View style={styles.fieldCard}>
                    {/* Title */}
                    <KeyboardField style={styles.fieldColumn}>
                        <ScrollInputField>
                            <TextInput
                                style={styles.titleInput}
                                value={title}
                                onChangeText={setTitle}
                                placeholder="Title"
                                placeholderTextColor={COLORS.subtitle}
                            />
                        </ScrollInputField>
                    </KeyboardField>

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
                    <TouchableOpacity
                        style={styles.fieldRow}
                        onPress={() => setShowIncidentDatePicker(true)}
                    >
                        <View style={{ flex: 1 }}>
                            <Text style={styles.fieldSubLabel}>Incident Date</Text>
                            <Text style={styles.fieldValue}>{incidentDateLabel}</Text>
                        </View>
                        <Ionicons name="calendar-outline" size={20} color={COLORS.subtitle} />
                    </TouchableOpacity>

                    <View style={styles.fieldDivider} />

                    {/* Incident Time */}
                    <TouchableOpacity
                        style={styles.fieldRow}
                        onPress={() => setShowIncidentTimePicker(true)}
                    >
                        <View style={{ flex: 1 }}>
                            <Text style={styles.fieldSubLabel}>Incident Time</Text>
                            <Text style={styles.fieldValue}>{incidentTime}</Text>
                        </View>
                        <Ionicons name="time-outline" size={20} color={COLORS.subtitle} />
                    </TouchableOpacity>

                    <View style={styles.fieldDivider} />

                    {/* Incident Location */}
                    <View style={styles.fieldRow}>
                        <KeyboardField style={{ flex: 1 }}>
                            <Text style={styles.fieldSubLabel}>Incident location</Text>
                            <ScrollInputField>
                                <TextInput
                                    style={styles.inlineInput}
                                    value={location}
                                    onChangeText={setLocation}
                                    placeholder="Enter location..."
                                    placeholderTextColor={COLORS.muted}
                                />
                            </ScrollInputField>
                        </KeyboardField>
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
                    <KeyboardField style={styles.fieldColumn}>
                        <Text style={styles.fieldSubLabel}>Description</Text>
                        <ScrollInputField>
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
                        </ScrollInputField>
                    </KeyboardField>
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
                    onPress={() => openInjuredEmployeeForm()}
                >
                    <Text style={styles.expandableTitle}>Injured employee info</Text>
                    <View style={styles.expandableRight}>
                        <Text style={styles.expandableCount}>{injuredEmployeeInfo.length}/{MAX_INJURED_EMPLOYEES}</Text>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
                    </View>
                </TouchableOpacity>

                {injuredEmployeeInfo.map((emp, idx) => (
                    <TouchableOpacity
                        key={idx}
                        style={styles.listItem}
                        onPress={() => openInjuredEmployeeForm(idx)}
                        activeOpacity={0.85}
                    >
                        <View style={{ flex: 1 }}>
                            <Text style={styles.listItemText} numberOfLines={1}>
                                {formatInjuredEmployeeSummary(emp)}
                            </Text>
                            {(emp.dateOfBirth || emp.dateOfHire) ? (
                                <Text style={styles.listItemSubtext} numberOfLines={1}>
                                    {[
                                        emp.dateOfBirth ? `DOB ${formatInjuredEmployeeDateLabel(emp.dateOfBirth)}` : '',
                                        emp.dateOfHire ? `Hired ${formatInjuredEmployeeDateLabel(emp.dateOfHire)}` : '',
                                    ].filter(Boolean).join(' · ')}
                                </Text>
                            ) : null}
                        </View>
                        <TouchableOpacity
                            onPress={() => removeInjuredEmployee(idx)}
                            hitSlop={8}
                        >
                            <Ionicons name="close-circle" size={18} color={COLORS.subtitle} />
                        </TouchableOpacity>
                    </TouchableOpacity>
                ))}

                <TouchableOpacity
                    style={styles.expandableRow}
                    onPress={openInvestigationForm}
                >
                    <Text style={styles.expandableTitle}>Incident investigation</Text>
                    <View style={styles.expandableRight}>
                        {incidentInvestigationHasData(incidentInvestigation) ? (
                            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                        ) : null}
                        <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
                    </View>
                </TouchableOpacity>

                {incidentInvestigationHasData(incidentInvestigation) && incidentInvestigation ? (
                    <TouchableOpacity
                        style={styles.listItem}
                        onPress={openInvestigationForm}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.listItemText} numberOfLines={2}>
                            {formatIncidentInvestigationSummary(incidentInvestigation)}
                        </Text>
                        <TouchableOpacity
                            onPress={() => setIncidentInvestigation(undefined)}
                            hitSlop={8}
                        >
                            <Ionicons name="close-circle" size={18} color={COLORS.subtitle} />
                        </TouchableOpacity>
                    </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                    style={styles.expandableRow}
                    onPress={openOutcomeForm}
                >
                    <Text style={styles.expandableTitle}>Incident outcome</Text>
                    <View style={styles.expandableRight}>
                        {incidentOutcomeHasData(incidentOutcome) ? (
                            <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
                        ) : null}
                        <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
                    </View>
                </TouchableOpacity>

                {incidentOutcomeHasData(incidentOutcome) && incidentOutcome ? (
                    <TouchableOpacity
                        style={styles.listItem}
                        onPress={openOutcomeForm}
                        activeOpacity={0.85}
                    >
                        <Text style={styles.listItemText} numberOfLines={2}>
                            {formatIncidentOutcomeSummary(incidentOutcome)}
                        </Text>
                        <TouchableOpacity
                            onPress={() => setIncidentOutcome(undefined)}
                            hitSlop={8}
                        >
                            <Ionicons name="close-circle" size={18} color={COLORS.subtitle} />
                        </TouchableOpacity>
                    </TouchableOpacity>
                ) : null}

                <View style={{ height: 40 }} />
            </KeyboardAwareScrollView>

            {showIncidentDatePicker && Platform.OS === 'android' ? (
                <DateTimePicker
                    value={incidentDateAsDate}
                    mode="date"
                    display="default"
                    maximumDate={new Date()}
                    onChange={onIncidentDatePickerChange}
                />
            ) : null}

            {showIncidentTimePicker && Platform.OS === 'android' ? (
                <DateTimePicker
                    value={incidentTimeAsDate}
                    mode="time"
                    display="default"
                    onChange={onIncidentTimePickerChange}
                />
            ) : null}

            <Modal
                visible={showIncidentDatePicker && Platform.OS === 'ios'}
                transparent
                animationType="slide"
                onRequestClose={() => setShowIncidentDatePicker(false)}
            >
                <Pressable style={styles.sheetBackdrop} onPress={() => setShowIncidentDatePicker(false)}>
                    <Pressable
                        style={[styles.sheetContainer, { paddingBottom: insets.bottom + 20 }]}
                        onPress={(e) => e.stopPropagation()}
                    >
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>Incident date</Text>
                        <DateTimePicker
                            value={incidentDateAsDate}
                            mode="date"
                            display="spinner"
                            themeVariant="dark"
                            maximumDate={new Date()}
                            onChange={(_, date) => {
                                if (date) setIncidentDate(isoDateFromDate(date));
                            }}
                        />
                        <TouchableOpacity
                            style={styles.sheetDoneBtn}
                            onPress={() => setShowIncidentDatePicker(false)}
                        >
                            <Text style={styles.sheetDoneText}>Done</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>

            <Modal
                visible={showIncidentTimePicker && Platform.OS === 'ios'}
                transparent
                animationType="slide"
                onRequestClose={() => setShowIncidentTimePicker(false)}
            >
                <Pressable style={styles.sheetBackdrop} onPress={() => setShowIncidentTimePicker(false)}>
                    <Pressable
                        style={[styles.sheetContainer, { paddingBottom: insets.bottom + 20 }]}
                        onPress={(e) => e.stopPropagation()}
                    >
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>Incident time</Text>
                        <DateTimePicker
                            value={incidentTimeAsDate}
                            mode="time"
                            display="spinner"
                            themeVariant="dark"
                            onChange={(_, date) => {
                                if (date) setIncidentTime(formatIncidentTimeLabel(date));
                            }}
                        />
                        <TouchableOpacity
                            style={styles.sheetDoneBtn}
                            onPress={() => setShowIncidentTimePicker(false)}
                        >
                            <Text style={styles.sheetDoneText}>Done</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>

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

            {/* Injured employee info form */}
            <Modal
                visible={showInjuredEmployeeForm}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={closeInjuredEmployeeForm}
            >
                <SafeAreaView style={styles.injuredFormContainer} edges={['top', 'bottom']}>
                    <View style={styles.injuredFormHeader}>
                        <TouchableOpacity
                            style={styles.formHeaderBtn}
                            onPress={closeInjuredEmployeeForm}
                            hitSlop={8}
                            accessibilityLabel="Close"
                        >
                            <Ionicons name="close" size={28} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.injuredFormTitle}>Injured employee info</Text>
                        <TouchableOpacity
                            style={styles.formHeaderBtn}
                            onPress={saveInjuredEmployeeForm}
                            hitSlop={8}
                            accessibilityLabel="Save"
                        >
                            <Ionicons name="checkmark-circle" size={28} color={COLORS.brand} />
                        </TouchableOpacity>
                    </View>

                    <KeyboardAwareScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.injuredFormContent}
                        bottomPadding={80}
                    >
                        <Text style={styles.injuredFormHint}>{REGULATORY_FORM_HINT}</Text>

                        <View style={styles.fieldCard}>
                            <View style={styles.fieldRow}>
                                <ScrollInputField style={{ flex: 1 }}>
                                    <TextInput
                                        style={styles.inlineInput}
                                        value={injuredFormDraft.name}
                                        onChangeText={(v) => updateInjuredDraft('name', v)}
                                        placeholder="Employee name"
                                        placeholderTextColor={COLORS.muted}
                                        autoCapitalize="words"
                                    />
                                </ScrollInputField>
                                <Ionicons name="information-circle-outline" size={22} color={COLORS.subtitle} />
                            </View>

                            <View style={styles.fieldDivider} />

                            <KeyboardField style={styles.fieldColumn}>
                                <ScrollInputField>
                                    <TextInput
                                        style={styles.inlineInput}
                                        value={injuredFormDraft.jobTitle}
                                        onChangeText={(v) => updateInjuredDraft('jobTitle', v)}
                                        placeholder="Employee job title"
                                        placeholderTextColor={COLORS.muted}
                                        autoCapitalize="words"
                                    />
                                </ScrollInputField>
                            </KeyboardField>

                            <View style={styles.fieldDivider} />

                            <TouchableOpacity
                                style={styles.formPickerRow}
                                onPress={() => {
                                    setShowDobPicker(false);
                                    setShowHireDatePicker(false);
                                    setShowGenderPicker(true);
                                }}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.fieldSubLabel}>Gender</Text>
                                    <Text style={styles.fieldValue}>{injuredFormDraft.gender}</Text>
                                </View>
                                <Ionicons name="chevron-down" size={20} color={COLORS.subtitle} />
                            </TouchableOpacity>

                            <View style={styles.fieldDivider} />

                            <TouchableOpacity
                                style={styles.formPickerRow}
                                onPress={() => {
                                    setShowGenderPicker(false);
                                    setShowHireDatePicker(false);
                                    setShowDobPicker(true);
                                }}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.fieldSubLabel}>Date of birth</Text>
                                    <Text style={[styles.fieldValue, !injuredFormDraft.dateOfBirth && { color: COLORS.muted }]}>
                                        {injuredFormDraft.dateOfBirth
                                            ? formatInjuredEmployeeDateLabel(injuredFormDraft.dateOfBirth)
                                            : 'Select date'}
                                    </Text>
                                </View>
                                <Ionicons name="calendar-outline" size={22} color={COLORS.subtitle} />
                            </TouchableOpacity>

                            <View style={styles.fieldDivider} />

                            <TouchableOpacity
                                style={styles.formPickerRow}
                                onPress={() => {
                                    setShowGenderPicker(false);
                                    setShowDobPicker(false);
                                    setShowHireDatePicker(true);
                                }}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.fieldSubLabel}>Date of hire</Text>
                                    <Text style={[styles.fieldValue, !injuredFormDraft.dateOfHire && { color: COLORS.muted }]}>
                                        {injuredFormDraft.dateOfHire
                                            ? formatInjuredEmployeeDateLabel(injuredFormDraft.dateOfHire)
                                            : 'Select date'}
                                    </Text>
                                </View>
                                <Ionicons name="calendar-outline" size={22} color={COLORS.subtitle} />
                            </TouchableOpacity>
                        </View>
                    </KeyboardAwareScrollView>

                    {renderFormPickerOverlay(showGenderPicker, () => setShowGenderPicker(false), 'Gender', (
                        <>
                            {INJURED_EMPLOYEE_GENDERS.map((g) => (
                                <TouchableOpacity
                                    key={g}
                                    style={[
                                        styles.outcomeTypePill,
                                        injuredFormDraft.gender === g && styles.outcomeTypePillSelected,
                                    ]}
                                    onPress={() => {
                                        updateInjuredDraft('gender', g as InjuredEmployeeGender);
                                        setShowGenderPicker(false);
                                    }}
                                >
                                    <Text
                                        style={[
                                            styles.outcomeTypePillText,
                                            injuredFormDraft.gender === g && styles.outcomeTypePillTextSelected,
                                        ]}
                                    >
                                        {g}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </>
                    ))}

                    {renderFormPickerOverlay(showDobPicker, () => setShowDobPicker(false), 'Date of birth', (
                        <>
                            <DateTimePicker
                                value={dateFromIso(injuredFormDraft.dateOfBirth)}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                themeVariant="dark"
                                maximumDate={new Date()}
                                onChange={(e, date) => onInjuredDatePicked('dateOfBirth', e, date)}
                            />
                            <TouchableOpacity style={styles.sheetDoneBtn} onPress={() => setShowDobPicker(false)}>
                                <Text style={styles.sheetDoneText}>Done</Text>
                            </TouchableOpacity>
                        </>
                    ))}

                    {renderFormPickerOverlay(showHireDatePicker, () => setShowHireDatePicker(false), 'Date of hire', (
                        <>
                            <DateTimePicker
                                value={dateFromIso(injuredFormDraft.dateOfHire)}
                                mode="date"
                                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                                themeVariant="dark"
                                maximumDate={new Date()}
                                onChange={(e, date) => onInjuredDatePicked('dateOfHire', e, date)}
                            />
                            <TouchableOpacity style={styles.sheetDoneBtn} onPress={() => setShowHireDatePicker(false)}>
                                <Text style={styles.sheetDoneText}>Done</Text>
                            </TouchableOpacity>
                        </>
                    ))}
                </SafeAreaView>
            </Modal>

            {/* Incident investigation form */}
            <Modal
                visible={showInvestigationForm}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={closeInvestigationForm}
            >
                <SafeAreaView style={styles.injuredFormContainer} edges={['top', 'bottom']}>
                    <View style={styles.injuredFormHeader}>
                        <TouchableOpacity
                            style={styles.formHeaderBtn}
                            onPress={closeInvestigationForm}
                            hitSlop={8}
                            accessibilityLabel="Close"
                        >
                            <Ionicons name="close" size={28} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.injuredFormTitle}>Incident investigation</Text>
                        <TouchableOpacity
                            style={styles.formHeaderBtn}
                            onPress={saveInvestigationForm}
                            hitSlop={8}
                            accessibilityLabel="Save"
                        >
                            <Ionicons name="checkmark-circle" size={28} color={COLORS.brand} />
                        </TouchableOpacity>
                    </View>

                    <KeyboardAwareScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.injuredFormContent}
                        bottomPadding={80}
                    >
                        <Text style={styles.injuredFormHint}>{REGULATORY_FORM_HINT}</Text>

                        <View style={styles.fieldCard}>
                            {INCIDENT_INVESTIGATION_FIELDS.map(({ key, label, placeholder }, index) => (
                                <React.Fragment key={key}>
                                    {index > 0 ? <View style={styles.fieldDivider} /> : null}
                                    <KeyboardField style={styles.investigationFieldBlock}>
                                        <Text style={styles.investigationFieldLabel}>{label}</Text>
                                        <ScrollInputField>
                                            <TextInput
                                                style={styles.investigationInput}
                                                value={investigationFormDraft[key]}
                                                onChangeText={(v) => updateInvestigationDraft(key, v)}
                                                placeholder={placeholder}
                                                placeholderTextColor={COLORS.muted}
                                                multiline
                                                numberOfLines={3}
                                                textAlignVertical="top"
                                            />
                                        </ScrollInputField>
                                    </KeyboardField>
                                </React.Fragment>
                            ))}
                        </View>
                    </KeyboardAwareScrollView>
                </SafeAreaView>
            </Modal>

            {/* Incident outcome form */}
            <Modal
                visible={showOutcomeForm}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={closeOutcomeForm}
            >
                <SafeAreaView style={styles.injuredFormContainer} edges={['top', 'bottom']}>
                    <View style={styles.injuredFormHeader}>
                        <TouchableOpacity
                            style={styles.formHeaderBtn}
                            onPress={closeOutcomeForm}
                            hitSlop={8}
                            accessibilityLabel="Close"
                        >
                            <Ionicons name="close" size={28} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.injuredFormTitle}>Incident outcome</Text>
                        <TouchableOpacity
                            style={styles.formHeaderBtn}
                            onPress={saveOutcomeForm}
                            hitSlop={8}
                            accessibilityLabel="Save"
                        >
                            <Ionicons name="checkmark-circle" size={28} color={COLORS.brand} />
                        </TouchableOpacity>
                    </View>

                    <KeyboardAwareScrollView
                        style={styles.scrollView}
                        contentContainerStyle={styles.injuredFormContent}
                        bottomPadding={80}
                    >
                        <Text style={styles.injuredFormHint}>{REGULATORY_FORM_HINT}</Text>

                        <View style={styles.fieldCard}>
                            <View style={styles.fieldColumn}>
                                <Text style={styles.outcomeQuestion}>
                                    Was the employee treated in the emergency room?
                                </Text>
                                {renderYesNoPills(outcomeFormDraft.emergencyRoomTreated, (v) =>
                                    updateOutcomeDraft('emergencyRoomTreated', v)
                                )}
                            </View>
                        </View>

                        <View style={styles.fieldCard}>
                            <View style={styles.fieldColumn}>
                                <Text style={styles.outcomeQuestion}>
                                    Was the employee hospitalized as an in patient?
                                </Text>
                                {renderYesNoPills(outcomeFormDraft.hospitalizedInPatient, (v) =>
                                    updateOutcomeDraft('hospitalizedInPatient', v)
                                )}
                            </View>
                        </View>

                        <View style={styles.fieldCard}>
                            <TouchableOpacity
                                style={styles.formPickerRow}
                                onPress={() => setShowOutcomeTypePicker((v) => !v)}
                            >
                                <View style={{ flex: 1 }}>
                                    {outcomeFormDraft.outcomeType ? (
                                        <>
                                            <Text style={styles.fieldSubLabel}>Incident outcome</Text>
                                            <Text style={styles.fieldValue}>{outcomeFormDraft.outcomeType}</Text>
                                        </>
                                    ) : (
                                        <Text style={[styles.fieldLabel, { color: COLORS.subtitle }]}>
                                            Incident outcome
                                        </Text>
                                    )}
                                </View>
                                <Ionicons
                                    name={showOutcomeTypePicker ? 'chevron-up' : 'chevron-down'}
                                    size={20}
                                    color={COLORS.subtitle}
                                />
                            </TouchableOpacity>

                            {showOutcomeTypePicker ? (
                                <View style={styles.outcomeTypePopover}>
                                    <Text style={styles.inModalPickerTitle}>Incident outcome</Text>
                                    {INCIDENT_OUTCOME_TYPES.map((t) => (
                                        <TouchableOpacity
                                            key={t}
                                            style={[
                                                styles.outcomeTypePill,
                                                outcomeFormDraft.outcomeType === t && styles.outcomeTypePillSelected,
                                            ]}
                                            onPress={() => {
                                                updateOutcomeDraft('outcomeType', t);
                                                setShowOutcomeTypePicker(false);
                                            }}
                                        >
                                            <Text
                                                style={[
                                                    styles.outcomeTypePillText,
                                                    outcomeFormDraft.outcomeType === t && styles.outcomeTypePillTextSelected,
                                                ]}
                                            >
                                                {t}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            ) : null}
                        </View>

                        <View style={styles.fieldCard}>
                            <KeyboardField style={styles.daysFieldBlock}>
                                <Text style={styles.fieldSubLabel}>No. of days away from work</Text>
                                <ScrollInputField>
                                    <TextInput
                                        style={styles.daysInputFull}
                                        value={outcomeFormDraft.daysAwayFromWork}
                                        onChangeText={(v) =>
                                            updateOutcomeDraft('daysAwayFromWork', v.replace(/[^\d]/g, '') || '0')
                                        }
                                        keyboardType="number-pad"
                                        placeholder="0"
                                        placeholderTextColor={COLORS.muted}
                                    />
                                </ScrollInputField>
                            </KeyboardField>

                            <View style={styles.fieldDivider} />

                            <KeyboardField style={styles.daysFieldBlock}>
                                <Text style={styles.fieldSubLabel}>No. of days on job transfer/restriction</Text>
                                <ScrollInputField>
                                    <TextInput
                                        style={styles.daysInputFull}
                                        value={outcomeFormDraft.daysOnJobTransferRestriction}
                                        onChangeText={(v) =>
                                            updateOutcomeDraft(
                                                'daysOnJobTransferRestriction',
                                                v.replace(/[^\d]/g, '') || '0'
                                            )
                                        }
                                        keyboardType="number-pad"
                                        placeholder="0"
                                        placeholderTextColor={COLORS.muted}
                                    />
                                </ScrollInputField>
                            </KeyboardField>
                        </View>
                    </KeyboardAwareScrollView>
                </SafeAreaView>
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
    listItemSubtext: { color: COLORS.subtitle, fontSize: 12, marginTop: 2 },

    injuredFormContainer: { flex: 1, backgroundColor: COLORS.surface },
    injuredFormHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: COLORS.border,
        backgroundColor: COLORS.card,
    },
    formHeaderBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.surface,
    },
    formHeaderSpacer: { width: 44, height: 44 },
    inModalOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'flex-end',
        zIndex: 10,
    },
    inModalPickerCard: {
        backgroundColor: COLORS.card,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 16,
        paddingBottom: 32,
        paddingTop: 12,
    },
    inModalPickerTitle: {
        color: COLORS.subtitle,
        fontSize: 13,
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: 16,
    },
    formPickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 10,
    },
    outcomeTypePopover: {
        paddingHorizontal: 14,
        paddingBottom: 14,
        gap: 10,
    },
    outcomeTypePill: {
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderRadius: 999,
        backgroundColor: COLORS.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
        alignItems: 'center',
    },
    outcomeTypePillSelected: {
        backgroundColor: COLORS.brand + '22',
        borderColor: COLORS.brand,
    },
    outcomeTypePillText: { color: '#fff', fontSize: 15, fontWeight: '600' },
    outcomeTypePillTextSelected: { color: COLORS.brand },
    daysFieldBlock: {
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    daysInputFull: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        paddingVertical: 4,
        minHeight: 28,
    },
    injuredFormTitle: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' },
    injuredFormContent: { padding: 16, paddingBottom: 40, gap: 16 },
    injuredFormHint: {
        color: COLORS.subtitle,
        fontSize: 14,
        lineHeight: 20,
        textAlign: 'center',
        paddingHorizontal: 8,
    },
    piiNotice: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        paddingHorizontal: 4,
    },
    piiNoticeText: {
        flex: 1,
        color: COLORS.subtitle,
        fontSize: 14,
        lineHeight: 20,
    },
    investigationFieldBlock: {
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 8,
    },
    investigationFieldLabel: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    investigationInput: {
        backgroundColor: COLORS.surface,
        borderRadius: 10,
        padding: 12,
        color: '#fff',
        fontSize: 14,
        minHeight: 72,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
        lineHeight: 20,
    },
    yesNoRow: { flexDirection: 'row', gap: 10 },
    yesNoPill: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 999,
        backgroundColor: COLORS.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
        alignItems: 'center',
    },
    yesNoPillSelected: {
        backgroundColor: COLORS.brand + '22',
        borderColor: COLORS.brand,
    },
    yesNoPillText: { color: COLORS.subtitle, fontSize: 15, fontWeight: '700' },
    yesNoPillTextSelected: { color: COLORS.brand },
    outcomeQuestion: { color: '#fff', fontSize: 15, fontWeight: '600', lineHeight: 21, marginBottom: 12 },
    daysInput: {
        minWidth: 56,
        textAlign: 'right',
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        paddingVertical: 4,
        paddingHorizontal: 8,
    },

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
    sheetLoading: { paddingVertical: 28, alignItems: 'center' },
    sheetEmptyText: {
        color: COLORS.subtitle,
        fontSize: 14,
        textAlign: 'center',
        paddingVertical: 16,
        paddingHorizontal: 8,
        lineHeight: 20,
    },
    employeeDirectoryBlock: { marginBottom: 8 },
    employeeDirectoryLabel: {
        color: COLORS.subtitle,
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    employeeSearchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
        marginBottom: 10,
    },
    employeeSearchInput: { flex: 1, color: '#fff', fontSize: 16 },
    employeeDirectoryScroll: { maxHeight: 260, marginBottom: 8 },
    employeeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: COLORS.border,
    },
    employeeRowDisabled: { opacity: 0.55 },
    sheetAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: COLORS.brand + '28',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sheetAvatarText: { color: COLORS.brand, fontSize: 13, fontWeight: '700' },
    sheetOptionSubtext: { color: COLORS.subtitle, fontSize: 12, marginTop: 2 },
    employeeManualLabel: {
        color: COLORS.subtitle,
        fontSize: 12,
        fontWeight: '600',
        marginTop: 10,
        marginBottom: 4,
    },
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
