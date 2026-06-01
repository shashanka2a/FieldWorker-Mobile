import React, { useState, useMemo } from 'react';
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
    Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';
import { useFieldPhotoWatermark } from '@/components/FieldPhotoWatermarkProvider';
import { createUuid, getDateKey, getSubmittedAtIso, saveAttachments } from '@/lib/dailyReportStorage';
import { useFormDraft, clearFormDraft } from '@/hooks/useFormDraft';
import { KeyboardAwareScrollView, KeyboardField, ScrollInputField } from '@/components/KeyboardAwareScrollView';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    danger: '#FF453A',
};

const WIN = Dimensions.get('window');

interface PickedFile {
    uri: string;
    name: string;
    type: string;
}

export default function AddAttachmentsScreen() {
    const { selectedDate, selectedProject } = useAppContext();
    const { applyCameraWatermark } = useFieldPhotoWatermark();
    const [files, setFiles] = useState<PickedFile[]>([]);
    const [notes, setNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [previewUri, setPreviewUri] = useState<string | null>(null);

    const dateLabel = selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const dateKey = useMemo(() => getDateKey(selectedDate), [selectedDate]);
    const projectKey = (selectedProject?.id || selectedProject?.name || 'project').replace(/\s+/g, '_');
    const draftKey = useMemo(
        () => `fw_draft_attachments_${dateKey}_${projectKey}`,
        [dateKey, projectKey]
    );
    const attachmentNotesDraft = useMemo(() => JSON.stringify({ notes }), [notes]);

    useFormDraft({
        storageKey: draftKey,
        active: true,
        snapshotJson: attachmentNotesDraft,
        hydrate: (parsed) => {
            if (!parsed || typeof parsed !== 'object') return;
            const p = parsed as Record<string, unknown>;
            if (typeof p.notes === 'string') setNotes(p.notes);
        },
        isNonEmpty: () => !!notes.trim(),
    });

    const pickImages = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access.'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            quality: 0.85,
        });
        if (!result.canceled) {
            const picked: PickedFile[] = result.assets.map((a, i) => ({
                uri: a.uri,
                name: a.fileName ?? `photo_${Date.now()}_${i}.jpg`,
                type: 'image',
            }));
            setFiles((prev) => [...prev, ...picked]);
        }
    };

    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow camera access.'); return; }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
        if (!result.canceled) {
            const uri = await applyCameraWatermark(result.assets[0].uri);
            setFiles((prev) => [...prev, {
                uri,
                name: `photo_${Date.now()}.jpg`,
                type: 'image',
            }]);
        }
    };

    const removeFile = (idx: number) => {
        setFiles((prev) => prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = async () => {
        if (files.length === 0) {
            Alert.alert('Required', 'Please add at least one photo or file.');
            return;
        }
        const projectId = selectedProject?.id?.trim() ?? '';
        const projectName = selectedProject?.name?.trim() ?? '';
        if (!projectName || projectName === 'No Project Selected' || !projectId) {
            Alert.alert('Select a project', 'Choose a field project on the Home tab before saving attachments.');
            return;
        }
        setSubmitting(true);
        try {
            await saveAttachments(dateKey, {
                id: createUuid(),
                project: { id: projectId, name: projectName },
                timestamp: getSubmittedAtIso(),
                fileNames: files.map((f) => f.name),
                notes: notes.trim() || undefined,
                previews: files.filter((f) => f.type === 'image').map((f) => f.uri),
            });
            await clearFormDraft(draftKey);
            setSuccess(true);
            setTimeout(() => router.back(), 1200);
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Failed to save attachments. Please try again.';
            Alert.alert('Could not save', message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.container}>
            <ScreenHeader title="Add Attachments" subtitle={dateLabel} />
            <KeyboardAwareScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                <Text style={styles.reportDayHint}>
                    Attachments are filed under the report day on the home calendar (shown above), not necessarily the day the photo was taken.
                </Text>

                {/* Action Buttons */}
                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.actionBtn} onPress={takePhoto}>
                        <View style={styles.actionIcon}>
                            <Ionicons name="camera" size={28} color={COLORS.brand} />
                        </View>
                        <Text style={styles.actionLabel}>Camera</Text>
                        <Text style={styles.actionSub}>Take a photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={pickImages}>
                        <View style={styles.actionIcon}>
                            <Ionicons name="images" size={28} color={COLORS.brand} />
                        </View>
                        <Text style={styles.actionLabel}>Photo Library</Text>
                        <Text style={styles.actionSub}>Select multiple</Text>
                    </TouchableOpacity>
                </View>

                {/* File Grid */}
                {files.length > 0 && (
                    <View style={styles.fileGrid}>
                        {files.map((file, idx) => (
                            <View key={`${file.uri}-${idx}`} style={styles.fileThumbWrap}>
                                {file.type === 'image' ? (
                                    <TouchableOpacity activeOpacity={0.85} onPress={() => setPreviewUri(file.uri)}>
                                        <Image source={{ uri: file.uri }} style={styles.fileThumb} />
                                    </TouchableOpacity>
                                ) : (
                                    <View style={[styles.fileThumb, styles.fileThumbPlaceholder]}>
                                        <Ionicons name="document" size={28} color={COLORS.subtitle} />
                                    </View>
                                )}
                                <TouchableOpacity style={styles.removeBtn} onPress={() => removeFile(idx)}>
                                    <Ionicons name="close-circle" size={22} color="#fff" />
                                </TouchableOpacity>
                                <Text style={styles.fileNameLabel} numberOfLines={1}>{file.name}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {files.length > 0 && (
                    <View style={styles.countBanner}>
                        <Ionicons name="checkmark-circle" size={16} color={COLORS.brand} />
                        <Text style={styles.countText}>{files.length} file{files.length !== 1 ? 's' : ''} ready to upload</Text>
                    </View>
                )}

                {/* Notes */}
                <KeyboardField style={styles.field}>
                    <Text style={styles.label}>Notes (optional)</Text>
                    <ScrollInputField>
                        <TextInput
                            style={styles.textArea}
                            value={notes}
                            onChangeText={setNotes}
                            placeholder="Describe these attachments..."
                            placeholderTextColor={COLORS.subtitle}
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                        />
                    </ScrollInputField>
                </KeyboardField>

                <TouchableOpacity
                    style={[styles.submitBtn, (submitting || success || files.length === 0) && { opacity: 0.7 }]}
                    onPress={handleSubmit}
                    disabled={submitting || success || files.length === 0}
                >
                    {submitting ? <ActivityIndicator color="#fff" /> :
                        success ? <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.submitText}>Saved!</Text></> :
                            <Text style={styles.submitText}>Save Attachments ({files.length})</Text>}
                </TouchableOpacity>
            </KeyboardAwareScrollView>

            <Modal visible={!!previewUri} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
                <View style={styles.lightboxBackdrop}>
                    <TouchableOpacity style={styles.lightboxClose} onPress={() => setPreviewUri(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <Ionicons name="close-circle" size={36} color="#fff" />
                    </TouchableOpacity>
                    {previewUri ? (
                        <Image
                            source={{ uri: previewUri }}
                            style={styles.lightboxImage}
                            resizeMode="contain"
                        />
                    ) : null}
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 48, gap: 16 },
    reportDayHint: { color: COLORS.subtitle, fontSize: 13, lineHeight: 18 },
    actionRow: { flexDirection: 'row', gap: 12 },
    actionBtn: { flex: 1, backgroundColor: COLORS.card, borderRadius: 18, padding: 20, alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    actionIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: COLORS.brand + '20', alignItems: 'center', justifyContent: 'center' },
    actionLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
    actionSub: { color: COLORS.subtitle, fontSize: 12 },
    fileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    fileThumbWrap: { width: 100, alignItems: 'center', gap: 4 },
    fileThumb: { width: 100, height: 100, borderRadius: 12 },
    fileThumbPlaceholder: { backgroundColor: COLORS.card, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    removeBtn: { position: 'absolute', top: -8, right: -8 },
    fileNameLabel: { color: COLORS.subtitle, fontSize: 10, textAlign: 'center', width: 100 },
    countBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.brand + '15', borderRadius: 12, padding: 12 },
    countText: { color: COLORS.brand, fontSize: 14, fontWeight: '600' },
    field: { gap: 8 },
    label: { color: '#fff', fontSize: 14, fontWeight: '600' },
    textArea: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, color: '#fff', fontSize: 15, minHeight: 90, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, textAlignVertical: 'top' },
    submitBtn: { backgroundColor: COLORS.brand, borderRadius: 16, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8, shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    lightboxBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.94)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 12,
    },
    lightboxClose: {
        position: 'absolute',
        top: 52,
        right: 16,
        zIndex: 10,
    },
    lightboxImage: {
        width: WIN.width - 24,
        height: WIN.height * 0.82,
    },
});
