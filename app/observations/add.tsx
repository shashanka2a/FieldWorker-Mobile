import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
    Image,
    ActivityIndicator,
    Modal,
    Pressable,
    Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppContext } from '@/context/AppContext';
import { useFieldPhotoWatermark } from '@/components/FieldPhotoWatermarkProvider';
import {
    createUuid,
    getDateKey,
    getSubmittedAtIso,
    saveObservation,
    updateObservation,
    getObservationsForDate,
    ObservationEntry,
    ObservationAssignee,
} from '@/lib/dailyReportStorage';
import { fetchEmployeesFromSupabase } from '@/lib/supabaseSync';
import { useFormDraft, clearFormDraft } from '@/hooks/useFormDraft';
import { KeyboardAwareScrollView, KeyboardField, ScrollInputField } from '@/components/KeyboardAwareScrollView';

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
    negative: '#FF453A',
    positive: '#30D158',
};

const OBSERVATION_TYPES = [
    'Hazardous Materials – Chemicals',
    'Personal Protective Equipment',
    'Fall Protection',
    'Housekeeping',
    'Electrical Safety',
    'Fire Safety',
    'Excavation / Trenching',
    'Scaffolding',
    'Tool Condition',
    'Environmental',
    'Vehicle / Equipment',
    'Training / Certification',
    'Other',
];

const STATUSES: ObservationEntry['status'][] = ['Open', 'In Progress', 'Resolved', 'Closed'];
const PRIORITIES: ObservationEntry['priority'][] = ['Low', 'Medium', 'High', 'Critical'];

const STATUS_COLORS: Record<string, string> = {
    'Open': COLORS.subtitle,
    'In Progress': COLORS.warning,
    'Resolved': COLORS.success,
    'Closed': COLORS.card2,
};

const PRIORITY_COLORS: Record<string, string> = {
    'Low': COLORS.success,
    'Medium': COLORS.warning,
    'High': COLORS.brand,
    'Critical': COLORS.danger,
};

export default function AddObservationScreen() {
    const { selectedDate, selectedProject } = useAppContext();
    const { applyCameraWatermark } = useFieldPhotoWatermark();
    const { editId, category: paramCategory } = useLocalSearchParams<{
        editId?: string;
        category?: string;
    }>();
    const insets = useSafeAreaInsets();

    const isEditing = !!editId;

    // Form state
    const [category, setCategory] = useState<'Negative' | 'Positive'>(
        (paramCategory as 'Negative' | 'Positive') ?? 'Negative'
    );
    const [type, setType] = useState(OBSERVATION_TYPES[0]);
    const [status, setStatus] = useState<ObservationEntry['status']>('Open');
    const [priority, setPriority] = useState<ObservationEntry['priority']>('High');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [assignees, setAssignees] = useState<ObservationAssignee[]>([]);
    const [dueDate, setDueDate] = useState('');
    const [resolutionPhotos, setResolutionPhotos] = useState<string[]>([]);
    const [attachments, setAttachments] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [showMoreInfo, setShowMoreInfo] = useState(false);

    // Picker modals
    const [showTypePicker, setShowTypePicker] = useState(false);
    const [showStatusPicker, setShowStatusPicker] = useState(false);
    const [showPriorityPicker, setShowPriorityPicker] = useState(false);
    const [showAssigneeSheet, setShowAssigneeSheet] = useState(false);
    const [showDueDatePicker, setShowDueDatePicker] = useState(false);
    const [employeeDirectory, setEmployeeDirectory] = useState<ObservationAssignee[]>([]);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const dateKey = useMemo(() => getDateKey(selectedDate), [selectedDate]);
    const draftKey = useMemo(() => `fw_draft_observation_${dateKey}_${editId ?? 'new'}`, [dateKey, editId]);
    const [baselineReady, setBaselineReady] = useState(!isEditing);

    const loadEmployees = useCallback(async () => {
        setEmployeesLoading(true);
        try {
            const rows = await fetchEmployeesFromSupabase({
                projectId: selectedProject.id,
                projectName: selectedProject.name,
            });
            setEmployeeDirectory(rows.filter((r) => r.name.length > 0));
        } finally {
            setEmployeesLoading(false);
        }
    }, [selectedProject.id, selectedProject.name]);

    useEffect(() => {
        loadEmployees();
    }, [loadEmployees]);

    useEffect(() => {
        if (showAssigneeSheet) loadEmployees();
    }, [showAssigneeSheet, loadEmployees]);

    useEffect(() => {
        if (!editId) {
            setBaselineReady(true);
            return;
        }
        setBaselineReady(false);
        (async () => {
            const all = await getObservationsForDate(dateKey);
            const existing = all.find((o) => o.id === editId);
            if (existing) {
                setCategory(existing.category);
                setType(existing.type);
                setStatus(existing.status);
                setPriority(existing.priority);
                setDescription(existing.description ?? '');
                setLocation(existing.location ?? '');
                setAssignees(existing.assignees);
                setDueDate(existing.dueDate ?? '');
                setResolutionPhotos(existing.resolutionPhotos ?? []);
                setAttachments(existing.attachments ?? []);
            }
            setBaselineReady(true);
        })();
    }, [editId, dateKey]);

    // Set default due date (3 days from now)
    useEffect(() => {
        if (!editId && !dueDate) {
            const d = new Date();
            d.setDate(d.getDate() + 3);
            setDueDate(d.toISOString());
        }
    }, []);

    const observationDraftSnapshot = useMemo(
        () =>
            JSON.stringify({
                category,
                type,
                status,
                priority,
                description,
                location,
                assignees,
                dueDate,
                attachments,
                resolutionPhotos,
            }),
        [
            category,
            type,
            status,
            priority,
            description,
            location,
            assignees,
            dueDate,
            attachments,
            resolutionPhotos,
        ]
    );

    useFormDraft({
        storageKey: draftKey,
        active: baselineReady,
        snapshotJson: observationDraftSnapshot,
        hydrate: (parsed) => {
            if (!parsed || typeof parsed !== 'object') return;
            const p = parsed as Record<string, unknown>;
            if (p.category === 'Negative' || p.category === 'Positive') setCategory(p.category);
            if (typeof p.type === 'string' && OBSERVATION_TYPES.includes(p.type)) setType(p.type);
            if (typeof p.status === 'string' && (STATUSES as readonly string[]).includes(p.status)) {
                setStatus(p.status as ObservationEntry['status']);
            }
            if (typeof p.priority === 'string' && (PRIORITIES as readonly string[]).includes(p.priority)) {
                setPriority(p.priority as ObservationEntry['priority']);
            }
            if (typeof p.description === 'string') setDescription(p.description);
            if (typeof p.location === 'string') setLocation(p.location);
            if (typeof p.dueDate === 'string') setDueDate(p.dueDate);
            if (Array.isArray(p.assignees)) {
                const rows = p.assignees.filter(
                    (a): a is ObservationAssignee =>
                        !!a &&
                        typeof a === 'object' &&
                        typeof (a as ObservationAssignee).name === 'string'
                ) as ObservationAssignee[];
                setAssignees(rows.map((a) => ({ name: a.name, company: a.company ?? '' })));
            }
            if (Array.isArray(p.attachments)) {
                setAttachments(p.attachments.filter((x): x is string => typeof x === 'string'));
            }
            if (Array.isArray(p.resolutionPhotos)) {
                setResolutionPhotos(p.resolutionPhotos.filter((x): x is string => typeof x === 'string'));
            }
        },
        isNonEmpty: () =>
            !!(
                description.trim() ||
                location.trim() ||
                assignees.length > 0 ||
                attachments.length > 0 ||
                resolutionPhotos.length > 0 ||
                type !== OBSERVATION_TYPES[0] ||
                status !== 'Open' ||
                priority !== 'High'
            ),
    });

    const pickImage = async (target: 'resolution' | 'attachment') => {
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
            const uris = result.assets.map((a) => a.uri);
            if (target === 'resolution') {
                setResolutionPhotos((prev) => [...prev, ...uris]);
            } else {
                setAttachments((prev) => [...prev, ...uris]);
            }
        }
    };

    const takePhoto = async (target: 'resolution' | 'attachment') => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow camera access in Settings.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
        if (!result.canceled) {
            const uri = await applyCameraWatermark(result.assets[0].uri);
            if (target === 'resolution') {
                setResolutionPhotos((prev) => [...prev, uri]);
            } else {
                setAttachments((prev) => [...prev, uri]);
            }
        }
    };

    const removeAssignee = (index: number) => {
        setAssignees((prev) => prev.filter((_, i) => i !== index));
    };

    const addAssignee = (assignee: ObservationAssignee) => {
        if (!assignees.find((a) => a.name === assignee.name)) {
            setAssignees((prev) => [...prev, assignee]);
        }
        setShowAssigneeSheet(false);
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const entry: ObservationEntry = {
                id: editId ?? createUuid(),
                project: selectedProject,
                timestamp: getSubmittedAtIso(),
                category,
                type,
                status,
                priority,
                description: description.trim() || undefined,
                location: location.trim() || undefined,
                assignees,
                dueDate: dueDate || undefined,
                resolutionPhotos: resolutionPhotos.length > 0 ? resolutionPhotos : undefined,
                attachments: attachments.length > 0 ? attachments : undefined,
            };

            if (isEditing) {
                await updateObservation(dateKey, entry);
            } else {
                await saveObservation(dateKey, entry);
            }
            await clearFormDraft(draftKey);
            setSuccess(true);
            setTimeout(() => router.back(), 1000);
        } catch (e) {
            Alert.alert('Error', 'Failed to save observation. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const dueDateLabel = dueDate
        ? new Date(dueDate).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        })
        : 'Not set';

    const dueDateAsDate = useMemo(() => {
        if (!dueDate) return new Date();
        const d = new Date(dueDate);
        return Number.isNaN(d.getTime()) ? new Date() : d;
    }, [dueDate]);

    const onDueDatePickerChange = (event: DateTimePickerEvent, selected?: Date) => {
        if (Platform.OS === 'android') {
            setShowDueDatePicker(false);
        }
        if (event.type === 'dismissed') return;
        if (selected) setDueDate(selected.toISOString());
    };

    const initials = (name: string) => {
        const parts = name.split(' ');
        return parts.map((p) => p[0]).join('').substring(0, 2).toUpperCase();
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {isEditing ? 'Edit observation' : 'New observation'}
                </Text>
                <TouchableOpacity onPress={handleSubmit} disabled={submitting || success}>
                    {submitting ? (
                        <ActivityIndicator size="small" color={COLORS.brand} />
                    ) : success ? (
                        <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                    ) : (
                        <Text style={styles.saveText}>Save</Text>
                    )}
                </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Attachments */}
                <TouchableOpacity
                    style={styles.attachmentRow}
                    onPress={() => pickImage('attachment')}
                >
                    <Text style={styles.attachmentLabel}>Attachments</Text>
                    <Ionicons name="camera-outline" size={22} color={COLORS.subtitle} />
                </TouchableOpacity>
                {attachments.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
                        {attachments.map((uri, idx) => (
                            <View key={idx} style={styles.photoThumbWrap}>
                                <Image source={{ uri }} style={styles.photoThumb} />
                                <TouchableOpacity
                                    style={styles.removePhoto}
                                    onPress={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                                >
                                    <Ionicons name="close-circle" size={20} color="#fff" />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                )}

                {/* Main Fields Card */}
                <View style={styles.fieldCard}>
                    {/* Category */}
                    <TouchableOpacity
                        style={styles.fieldRow}
                        onPress={() => setCategory(category === 'Negative' ? 'Positive' : 'Negative')}
                    >
                        <Text style={styles.fieldLabel}>Observation Category</Text>
                        <View style={[
                            styles.categoryBadge,
                            { backgroundColor: category === 'Negative' ? COLORS.negative : COLORS.positive }
                        ]}>
                            <Text style={styles.categoryBadgeText}>{category}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
                    </TouchableOpacity>

                    <View style={styles.fieldDivider} />

                    {/* Type */}
                    <TouchableOpacity
                        style={styles.fieldRow}
                        onPress={() => setShowTypePicker(true)}
                    >
                        <View style={{ flex: 1 }}>
                            <Text style={styles.fieldSubLabel}>Type</Text>
                            <Text style={styles.fieldValue}>{type}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
                    </TouchableOpacity>

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

                    {/* Priority */}
                    <TouchableOpacity
                        style={styles.fieldRow}
                        onPress={() => setShowPriorityPicker(true)}
                    >
                        <View style={{ flex: 1 }}>
                            <Text style={styles.fieldSubLabel}>Priority</Text>
                            <Text style={[styles.fieldValue, { color: PRIORITY_COLORS[priority] }]}>
                                {priority}
                            </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
                    </TouchableOpacity>
                </View>

                {/* MORE INFO toggle */}
                <TouchableOpacity
                    style={styles.moreInfoToggle}
                    onPress={() => setShowMoreInfo(!showMoreInfo)}
                >
                    <Text style={styles.moreInfoText}>MORE INFO</Text>
                    <Ionicons
                        name={showMoreInfo ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={COLORS.brand}
                    />
                </TouchableOpacity>

                {showMoreInfo && (
                    <View style={styles.fieldCard}>
                        {/* Description */}
                        <KeyboardField style={styles.fieldColumn}>
                            <Text style={styles.fieldSubLabel}>Description</Text>
                            <ScrollInputField>
                                <TextInput
                                    style={styles.textArea}
                                    value={description}
                                    onChangeText={setDescription}
                                    placeholder="Describe the observation..."
                                    placeholderTextColor={COLORS.subtitle}
                                    multiline
                                    numberOfLines={4}
                                    textAlignVertical="top"
                                />
                            </ScrollInputField>
                        </KeyboardField>

                        <View style={styles.fieldDivider} />

                        {/* Location */}
                        <KeyboardField style={styles.fieldColumn}>
                            <Text style={styles.fieldSubLabel}>Location</Text>
                            <ScrollInputField>
                                <TextInput
                                    style={styles.textInput}
                                    value={location}
                                    onChangeText={setLocation}
                                    placeholder="e.g. Zone A, Building 3..."
                                    placeholderTextColor={COLORS.subtitle}
                                />
                            </ScrollInputField>
                        </KeyboardField>
                    </View>
                )}

                {/* Assignees Section */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Assignees ({assignees.length})</Text>
                    <TouchableOpacity onPress={() => setShowAssigneeSheet(true)}>
                        <Ionicons name="add-circle-outline" size={24} color={COLORS.brand} />
                    </TouchableOpacity>
                </View>

                {assignees.map((assignee, idx) => (
                    <View key={idx} style={styles.assigneeCard}>
                        <View style={styles.assigneeAvatar}>
                            <Text style={styles.assigneeInitials}>{initials(assignee.name)}</Text>
                        </View>
                        <View style={styles.assigneeInfo}>
                            <Text style={styles.assigneeName}>{assignee.name}</Text>
                            <Text style={styles.assigneeCompany}>{assignee.company}</Text>
                        </View>
                        <TouchableOpacity onPress={() => removeAssignee(idx)}>
                            <Ionicons name="trash-outline" size={20} color={COLORS.subtitle} />
                        </TouchableOpacity>
                    </View>
                ))}

                {/* Due Date */}
                <View style={styles.fieldCard}>
                    <TouchableOpacity
                        style={styles.fieldRow}
                        onPress={() => setShowDueDatePicker(true)}
                        activeOpacity={0.7}
                    >
                        <View style={{ flex: 1 }}>
                            <Text style={styles.fieldSubLabel}>Due Date</Text>
                            <Text style={[styles.fieldValue, !dueDate && { color: COLORS.subtitle }]}>
                                {dueDateLabel}
                            </Text>
                        </View>
                        <Ionicons name="calendar-outline" size={22} color={COLORS.subtitle} />
                    </TouchableOpacity>
                    {dueDate ? (
                        <TouchableOpacity
                            style={styles.clearDueDateRow}
                            onPress={() => setDueDate('')}
                            hitSlop={{ top: 8, bottom: 8 }}
                        >
                            <Text style={styles.clearDueDateText}>Clear due date</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>

                {/* Resolution Photos */}
                <View style={styles.resolutionSection}>
                    <View style={styles.resolutionRow}>
                        <Text style={styles.fieldLabel}>Resolution Photos:</Text>
                        <Text style={[
                            styles.resolutionStatus,
                            { color: resolutionPhotos.length > 0 ? COLORS.success : COLORS.danger }
                        ]}>
                            {resolutionPhotos.length > 0
                                ? `${resolutionPhotos.length} added`
                                : 'Not added'}
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={styles.addResolutionBtn}
                        onPress={() => pickImage('resolution')}
                    >
                        <Text style={styles.addResolutionText}>Add Resolution</Text>
                    </TouchableOpacity>

                    {resolutionPhotos.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
                            {resolutionPhotos.map((uri, idx) => (
                                <View key={idx} style={styles.photoThumbWrap}>
                                    <Image source={{ uri }} style={styles.photoThumb} />
                                    <TouchableOpacity
                                        style={styles.removePhoto}
                                        onPress={() => setResolutionPhotos((prev) => prev.filter((_, i) => i !== idx))}
                                    >
                                        <Ionicons name="close-circle" size={20} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </ScrollView>
                    )}
                </View>

                {/* Bottom spacing */}
                <View style={{ height: 40 }} />
            </KeyboardAwareScrollView>

            {showDueDatePicker && Platform.OS === 'android' ? (
                <DateTimePicker
                    value={dueDateAsDate}
                    mode="date"
                    display="default"
                    onChange={onDueDatePickerChange}
                />
            ) : null}

            <Modal
                visible={showDueDatePicker && Platform.OS === 'ios'}
                transparent
                animationType="slide"
                onRequestClose={() => setShowDueDatePicker(false)}
            >
                <Pressable style={styles.sheetBackdrop} onPress={() => setShowDueDatePicker(false)}>
                    <Pressable
                        style={[styles.sheetContainer, { paddingBottom: insets.bottom + 20 }]}
                        onPress={(e) => e.stopPropagation()}
                    >
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>Due date</Text>
                        <DateTimePicker
                            value={dueDateAsDate}
                            mode="date"
                            display="spinner"
                            themeVariant="dark"
                            onChange={(_, date) => {
                                if (date) setDueDate(date.toISOString());
                            }}
                        />
                        <TouchableOpacity
                            style={styles.sheetCancelBtn}
                            onPress={() => setShowDueDatePicker(false)}
                        >
                            <Text style={styles.sheetCancelText}>Done</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Type Picker Modal */}
            <Modal
                visible={showTypePicker}
                transparent
                animationType="slide"
                onRequestClose={() => setShowTypePicker(false)}
            >
                <Pressable style={styles.sheetBackdrop} onPress={() => setShowTypePicker(false)}>
                    <View style={styles.sheetContainer}>
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>Observation Type</Text>
                        <ScrollView style={{ maxHeight: 400 }}>
                            {OBSERVATION_TYPES.map((t) => (
                                <TouchableOpacity
                                    key={t}
                                    style={[styles.sheetOption, type === t && styles.sheetOptionActive]}
                                    onPress={() => {
                                        setType(t);
                                        setShowTypePicker(false);
                                    }}
                                >
                                    <Text style={styles.sheetOptionText}>{t}</Text>
                                    {type === t && (
                                        <Ionicons name="checkmark" size={18} color={COLORS.brand} style={{ marginLeft: 'auto' }} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </Pressable>
            </Modal>

            {/* Status Picker Modal */}
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
                                onPress={() => {
                                    setStatus(s);
                                    setShowStatusPicker(false);
                                }}
                            >
                                <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[s] }]} />
                                <Text style={styles.sheetOptionText}>{s}</Text>
                                {status === s && (
                                    <Ionicons name="checkmark" size={18} color={COLORS.brand} style={{ marginLeft: 'auto' }} />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </Pressable>
            </Modal>

            {/* Priority Picker Modal */}
            <Modal
                visible={showPriorityPicker}
                transparent
                animationType="slide"
                onRequestClose={() => setShowPriorityPicker(false)}
            >
                <Pressable style={styles.sheetBackdrop} onPress={() => setShowPriorityPicker(false)}>
                    <View style={styles.sheetContainer}>
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>Priority</Text>
                        {PRIORITIES.map((p) => (
                            <TouchableOpacity
                                key={p}
                                style={[styles.sheetOption, priority === p && styles.sheetOptionActive]}
                                onPress={() => {
                                    setPriority(p);
                                    setShowPriorityPicker(false);
                                }}
                            >
                                <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLORS[p] }]} />
                                <Text style={[styles.sheetOptionText, { color: PRIORITY_COLORS[p] }]}>{p}</Text>
                                {priority === p && (
                                    <Ionicons name="checkmark" size={18} color={COLORS.brand} style={{ marginLeft: 'auto' }} />
                                )}
                            </TouchableOpacity>
                        ))}
                    </View>
                </Pressable>
            </Modal>

            {/* Add Assignee Sheet */}
            <Modal
                visible={showAssigneeSheet}
                transparent
                animationType="slide"
                onRequestClose={() => setShowAssigneeSheet(false)}
            >
                <Pressable style={styles.sheetBackdrop} onPress={() => setShowAssigneeSheet(false)}>
                    <View style={styles.sheetContainer}>
                        <View style={styles.sheetHandle} />
                        <Text style={styles.sheetTitle}>Add Assignee</Text>
                        {employeesLoading ? (
                            <View style={styles.sheetLoading}>
                                <ActivityIndicator color={COLORS.brand} />
                            </View>
                        ) : employeeDirectory.length === 0 ? (
                            <Text style={styles.sheetEmptyText}>
                                No employees found. Your admin can add people to the employees table in Supabase.
                            </Text>
                        ) : (
                            employeeDirectory.map((person) => {
                                const isAssigned = assignees.some((a) => a.name === person.name);
                                return (
                                    <TouchableOpacity
                                        key={person.name}
                                        style={[styles.sheetOption, isAssigned && styles.sheetOptionActive]}
                                        onPress={() => addAssignee(person)}
                                        disabled={isAssigned}
                                    >
                                        <View style={styles.sheetAvatar}>
                                            <Text style={styles.sheetAvatarText}>{initials(person.name)}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.sheetOptionText}>{person.name}</Text>
                                            <Text style={styles.sheetOptionSubtext}>
                                                {person.company || '—'}
                                            </Text>
                                        </View>
                                        {isAssigned && (
                                            <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                                        )}
                                    </TouchableOpacity>
                                );
                            })
                        )}
                        <TouchableOpacity
                            style={styles.sheetCancelBtn}
                            onPress={() => setShowAssigneeSheet(false)}
                        >
                            <Text style={styles.sheetCancelText}>Done</Text>
                        </TouchableOpacity>
                    </View>
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

    // Attachment row
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
    attachmentLabel: { color: '#fff', fontSize: 15, fontWeight: '500' },

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
    fieldLabel: { color: '#fff', fontSize: 14, fontWeight: '500', flex: 1 },
    fieldSubLabel: { color: COLORS.subtitle, fontSize: 12, fontWeight: '500', marginBottom: 4 },
    fieldValue: { color: '#fff', fontSize: 16, fontWeight: '600' },
    fieldDivider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: 14 },

    // Category badge
    categoryBadge: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
    categoryBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

    // More Info
    moreInfoToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    moreInfoText: { color: COLORS.brand, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },

    // Text inputs
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
    textInput: {
        backgroundColor: COLORS.surface,
        borderRadius: 10,
        padding: 12,
        color: '#fff',
        fontSize: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },

    // Section header
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },

    // Assignee card
    assigneeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.card,
        borderRadius: 14,
        padding: 14,
        gap: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    assigneeAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: COLORS.success,
        alignItems: 'center',
        justifyContent: 'center',
    },
    assigneeInitials: { color: '#fff', fontSize: 16, fontWeight: '700' },
    assigneeInfo: { flex: 1, gap: 2 },
    assigneeName: { color: '#fff', fontSize: 15, fontWeight: '600' },
    assigneeCompany: { color: COLORS.subtitle, fontSize: 13 },

    // Due date
    clearDueDateRow: { paddingHorizontal: 14, paddingBottom: 12, paddingTop: 0 },
    clearDueDateText: { color: COLORS.subtitle, fontSize: 13, fontWeight: '500' },

    // Resolution
    resolutionSection: {
        backgroundColor: COLORS.card,
        borderRadius: 14,
        padding: 14,
        gap: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    resolutionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    resolutionStatus: { fontSize: 14, fontWeight: '500' },
    addResolutionBtn: {
        alignSelf: 'flex-start',
        backgroundColor: COLORS.brand + '20',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: COLORS.brand,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    addResolutionText: { color: COLORS.brand, fontSize: 14, fontWeight: '700' },

    // Photo
    photoRow: { marginTop: 4 },
    photoThumbWrap: { position: 'relative', marginRight: 8 },
    photoThumb: { width: 70, height: 70, borderRadius: 10 },
    removePhoto: { position: 'absolute', top: -6, right: -6 },

    // Status dot
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    priorityDot: { width: 8, height: 8, borderRadius: 4 },

    sheetLoading: { paddingVertical: 28, alignItems: 'center' },
    sheetEmptyText: {
        color: COLORS.subtitle,
        fontSize: 14,
        textAlign: 'center',
        paddingVertical: 20,
        paddingHorizontal: 8,
        lineHeight: 20,
    },

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
    sheetOptionSubtext: { color: COLORS.subtitle, fontSize: 12, marginTop: 1 },
    sheetAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: COLORS.brand,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sheetAvatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    sheetCancelBtn: {
        backgroundColor: COLORS.surface,
        borderRadius: 14,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 12,
    },
    sheetCancelText: { color: COLORS.blue, fontSize: 17, fontWeight: '600' },
});
