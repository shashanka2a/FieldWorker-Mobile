import React, { useState, useEffect, useMemo, useRef } from 'react';
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
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import { KeyboardAwareScrollView, KeyboardField, ScrollInputField } from '@/components/KeyboardAwareScrollView';
import { useAppContext } from '@/context/AppContext';
import { useFieldPhotoWatermark } from '@/components/FieldPhotoWatermarkProvider';
import { createUuid, getDateKey, getSubmittedAtIso, saveNotes, getNotesForDate } from '@/lib/dailyReportStorage';
import { useFormDraft, clearFormDraft } from '@/hooks/useFormDraft';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    card2: '#3A3A3C',
    border: '#3A3A3C',
    subtitle: '#98989D',
    blue: '#0A84FF',
    success: '#30D158',
};

const CATEGORIES = ['General', 'Safety', 'Equipment', 'Weather', 'Incident', 'Custom'] as const;

export default function AddNoteScreen() {
    const { selectedDate, selectedProject } = useAppContext();
    const { applyCameraWatermark } = useFieldPhotoWatermark();
    const { editId } = useLocalSearchParams<{ editId?: string }>();
    const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('General');
    const [customCategory, setCustomCategory] = useState('');
    const [notes, setNotes] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [showNoteEditor, setShowNoteEditor] = useState(false);
    const [noteEditorDraft, setNoteEditorDraft] = useState('');
    const noteInputRef = useRef<TextInput>(null);
    const [noteEditorBodyHeight, setNoteEditorBodyHeight] = useState(0);
    const isEditing = !!editId;

    const dateKey = useMemo(() => getDateKey(selectedDate), [selectedDate]);
    const projectKey = (selectedProject?.id || selectedProject?.name || 'project').replace(/\s+/g, '_');
    const draftKey = useMemo(
        () => `fw_draft_note_${dateKey}_${projectKey}_${editId ?? 'new'}`,
        [dateKey, projectKey, editId]
    );
    const [baselineReady, setBaselineReady] = useState(!isEditing);

    useEffect(() => {
        if (!editId) {
            setBaselineReady(true);
            return;
        }
        setBaselineReady(false);
        (async () => {
            const allNotes = await getNotesForDate(dateKey);
            const existing = allNotes.find((n) => n.id === editId && n.project?.name === selectedProject?.name);
            if (existing) {
                const isPreset = (CATEGORIES as readonly string[]).includes(existing.category);
                if (isPreset) {
                    setCategory(existing.category as (typeof CATEGORIES)[number]);
                    setCustomCategory('');
                } else {
                    setCategory('Custom');
                    setCustomCategory(existing.category ?? '');
                }
                setNotes(existing.notes);
                setPhotos(existing.photos ?? []);
            }
            setBaselineReady(true);
        })();
    }, [editId, dateKey, selectedProject?.name]);

    const noteDraftSnapshot = useMemo(
        () => JSON.stringify({ category, customCategory, notes, photos }),
        [category, customCategory, notes, photos]
    );

    useFormDraft({
        storageKey: draftKey,
        active: baselineReady,
        snapshotJson: noteDraftSnapshot,
        hydrate: (parsed) => {
            if (!parsed || typeof parsed !== 'object') return;
            const p = parsed as Record<string, unknown>;
            if (typeof p.notes === 'string') setNotes(p.notes);
            if (typeof p.customCategory === 'string') setCustomCategory(p.customCategory);
            const c = p.category;
            if (typeof c === 'string' && (CATEGORIES as readonly string[]).includes(c)) {
                setCategory(c as (typeof CATEGORIES)[number]);
            }
            if (Array.isArray(p.photos)) {
                setPhotos(p.photos.filter((x): x is string => typeof x === 'string'));
            }
        },
        isNonEmpty: () =>
            !!(
                notes.trim() ||
                customCategory.trim() ||
                photos.length > 0 ||
                (category !== 'General' && category !== 'Custom') ||
                (category === 'Custom' && customCategory.trim())
            ),
    });

    const openNoteEditor = () => {
        setNoteEditorDraft(notes);
        setShowNoteEditor(true);
    };

    useEffect(() => {
        if (!showNoteEditor) return;
        const timer = setTimeout(() => noteInputRef.current?.focus(), 120);
        return () => clearTimeout(timer);
    }, [showNoteEditor]);

    const saveNoteEditor = () => {
        setNotes(noteEditorDraft);
        setShowNoteEditor(false);
    };

    const closeNoteEditor = () => {
        setShowNoteEditor(false);
    };

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

    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow camera access in Settings.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
        if (!result.canceled) {
            const uri = await applyCameraWatermark(result.assets[0].uri);
            setPhotos((prev) => [...prev, uri]);
        }
    };

    const handleSubmit = async () => {
        if (!notes.trim()) {
            Alert.alert('Required', 'Please enter a note before saving.');
            return;
        }
        const categoryToSave =
            category === 'Custom'
                ? (customCategory.trim() || 'General')
                : category;
        setSubmitting(true);
        try {
            await saveNotes(dateKey, {
                id: editId ?? createUuid(),
                project: selectedProject,
                timestamp: getSubmittedAtIso(),
                category: categoryToSave,
                notes: notes.trim(),
                photos,
            });
            await clearFormDraft(draftKey);
            setSuccess(true);
            setTimeout(() => router.back(), 1200);
        } catch (e) {
            Alert.alert('Error', 'Failed to save note. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.container}>
            <ScreenHeader title={isEditing ? "Edit Note" : "Add Note"} subtitle={selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
            <KeyboardAwareScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>

                {/* Project (read-only) */}
                <View style={styles.field}>
                    <Text style={styles.label}>Project</Text>
                    <View style={styles.readOnly}>
                        <Text style={styles.readOnlyText}>{selectedProject.name}</Text>
                    </View>
                </View>

                {/* Category Picker */}
                <View style={styles.field}>
                    <Text style={styles.label}>Category</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
                        {CATEGORIES.map((cat) => (
                            <TouchableOpacity
                                key={cat}
                                style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
                                onPress={() => setCategory(cat)}
                            >
                                <Text style={[styles.categoryChipText, category === cat && styles.categoryChipTextActive]}>
                                    {cat}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    {category === 'Custom' && (
                        <KeyboardField style={{ marginTop: 10 }}>
                            <ScrollInputField>
                                <TextInput
                                    style={styles.customCategoryInput}
                                    value={customCategory}
                                    onChangeText={setCustomCategory}
                                    placeholder="Enter custom category…"
                                    placeholderTextColor={COLORS.subtitle}
                                    autoCapitalize="words"
                                />
                            </ScrollInputField>
                        </KeyboardField>
                    )}
                </View>

                {/* Notes — tap to open full-screen editor */}
                <View style={styles.field}>
                    <Text style={styles.label}>Notes <Text style={styles.required}>*</Text></Text>
                    <TouchableOpacity
                        style={styles.notePreview}
                        onPress={openNoteEditor}
                        activeOpacity={0.85}
                        accessibilityRole="button"
                        accessibilityLabel="Edit notes"
                    >
                        <Text
                            style={[styles.notePreviewText, !notes.trim() && styles.notePreviewPlaceholder]}
                            numberOfLines={8}
                        >
                            {notes.trim() || 'Tap to enter your field notes…'}
                        </Text>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} style={styles.notePreviewIcon} />
                    </TouchableOpacity>
                </View>

                {/* Photos */}
                <View style={styles.field}>
                    <Text style={styles.label}>Photos</Text>
                    <View style={styles.photoButtons}>
                        <TouchableOpacity style={styles.photoBtn} onPress={takePhoto}>
                            <Ionicons name="camera-outline" size={18} color={COLORS.brand} />
                            <Text style={styles.photoBtnText}>Camera</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.photoBtn} onPress={pickImage}>
                            <Ionicons name="images-outline" size={18} color={COLORS.brand} />
                            <Text style={styles.photoBtnText}>Library</Text>
                        </TouchableOpacity>
                    </View>
                    {photos.length > 0 && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoPreview}>
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
                </View>

                {/* Submit */}
                <TouchableOpacity
                    style={[styles.submitBtn, (submitting || success) && styles.submitBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={submitting || success}
                >
                    {submitting ? (
                        <ActivityIndicator color="#fff" />
                    ) : success ? (
                        <>
                            <Ionicons name="checkmark-circle" size={20} color="#fff" />
                            <Text style={styles.submitBtnText}>Saved!</Text>
                        </>
                    ) : (
                        <Text style={styles.submitBtnText}>{isEditing ? 'Update Note' : 'Save Note'}</Text>
                    )}
                </TouchableOpacity>
            </KeyboardAwareScrollView>

            <Modal
                visible={showNoteEditor}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={closeNoteEditor}
            >
                <KeyboardAvoidingView
                    style={styles.noteEditorContainer}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <SafeAreaView style={styles.noteEditorInner} edges={['top', 'bottom']}>
                        <View style={styles.noteEditorHeader}>
                            <TouchableOpacity
                                onPress={closeNoteEditor}
                                hitSlop={12}
                                style={styles.noteEditorHeaderAction}
                                accessibilityLabel="Close"
                            >
                                <Ionicons name="close" size={28} color="#fff" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={saveNoteEditor}
                                hitSlop={12}
                                style={styles.noteEditorHeaderAction}
                                accessibilityLabel="Save"
                            >
                                <Ionicons name="checkmark" size={30} color={COLORS.brand} />
                            </TouchableOpacity>
                        </View>

                        <View
                            style={styles.noteEditorBody}
                            onLayout={(e) => setNoteEditorBodyHeight(e.nativeEvent.layout.height)}
                        >
                            <TextInput
                                ref={noteInputRef}
                                style={[
                                    styles.noteEditorInput,
                                    noteEditorBodyHeight > 0 && { height: noteEditorBodyHeight },
                                ]}
                                value={noteEditorDraft}
                                onChangeText={setNoteEditorDraft}
                                placeholder="Enter your field notes here..."
                                placeholderTextColor={COLORS.subtitle}
                                multiline
                                textAlignVertical="top"
                                autoCorrect
                                autoCapitalize="sentences"
                                scrollEnabled
                            />
                        </View>
                    </SafeAreaView>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scrollView: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 48, gap: 20 },
    field: { gap: 8 },
    label: { color: '#fff', fontSize: 14, fontWeight: '600' },
    required: { color: COLORS.brand },
    readOnly: { backgroundColor: COLORS.card, borderRadius: 12, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    readOnlyText: { color: COLORS.subtitle, fontSize: 15 },
    categoryRow: { gap: 8 },
    categoryChip: { paddingHorizontal: 16, paddingVertical: 9, backgroundColor: COLORS.card, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    categoryChipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
    categoryChipText: { color: COLORS.subtitle, fontSize: 14, fontWeight: '600' },
    categoryChipTextActive: { color: '#fff' },
    customCategoryInput: { backgroundColor: COLORS.card, borderRadius: 12, padding: 14, color: '#fff', fontSize: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    notePreview: {
        backgroundColor: COLORS.card,
        borderRadius: 14,
        padding: 14,
        minHeight: 140,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    notePreviewText: {
        flex: 1,
        color: '#fff',
        fontSize: 15,
        lineHeight: 22,
    },
    notePreviewPlaceholder: {
        color: COLORS.subtitle,
    },
    notePreviewIcon: {
        marginTop: 2,
    },
    noteEditorContainer: {
        flex: 1,
        backgroundColor: COLORS.surface,
    },
    noteEditorInner: {
        flex: 1,
        backgroundColor: COLORS.surface,
    },
    noteEditorHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: COLORS.surface,
    },
    noteEditorHeaderAction: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    noteEditorBody: {
        flex: 1,
    },
    noteEditorInput: {
        flex: 1,
        width: '100%',
        paddingHorizontal: 16,
        paddingTop: 4,
        paddingBottom: 8,
        backgroundColor: COLORS.surface,
        color: '#fff',
        fontSize: 16,
        lineHeight: 24,
    },
    photoButtons: { flexDirection: 'row', gap: 10 },
    photoBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: COLORS.card,
        borderRadius: 14,
        paddingVertical: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    photoBtnText: { color: COLORS.brand, fontWeight: '600', fontSize: 14 },
    photoPreview: { marginTop: 8 },
    photoThumbWrap: { position: 'relative', marginRight: 8 },
    photoThumb: { width: 80, height: 80, borderRadius: 10 },
    removePhoto: { position: 'absolute', top: -6, right: -6 },
    submitBtn: {
        backgroundColor: COLORS.brand,
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginTop: 8,
        shadowColor: COLORS.brand,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 6,
    },
    submitBtnDisabled: { opacity: 0.7 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
