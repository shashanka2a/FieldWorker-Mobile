import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';
import { getDateKey, saveNotes, getNotesForDate, NoteEntry } from '@/lib/dailyReportStorage';

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

const CATEGORIES = ['General', 'Safety', 'Equipment', 'Weather', 'Incident'];

export default function AddNoteScreen() {
    const { selectedDate, selectedProject } = useAppContext();
    const { editId } = useLocalSearchParams<{ editId?: string }>();
    const [category, setCategory] = useState('General');
    const [notes, setNotes] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const isEditing = !!editId;

    // Load existing note for editing
    useEffect(() => {
        if (editId) {
            (async () => {
                const dateKey = getDateKey(selectedDate);
                const allNotes = await getNotesForDate(dateKey);
                const existing = allNotes.find((n) => n.id === editId);
                if (existing) {
                    setCategory(existing.category);
                    setNotes(existing.notes);
                    setPhotos(existing.photos ?? []);
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

    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow camera access in Settings.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
        if (!result.canceled) {
            setPhotos((prev) => [...prev, result.assets[0].uri]);
        }
    };

    const handleSubmit = async () => {
        if (!notes.trim()) {
            Alert.alert('Required', 'Please enter a note before saving.');
            return;
        }
        setSubmitting(true);
        try {
            const dateKey = getDateKey(selectedDate);
            await saveNotes(dateKey, {
                id: editId ?? Date.now().toString(),
                project: selectedProject,
                timestamp: isEditing ? new Date().toISOString() : new Date().toISOString(),
                category,
                notes: notes.trim(),
                photos,
            });
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
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

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
                </View>

                {/* Notes input */}
                <View style={styles.field}>
                    <Text style={styles.label}>Notes <Text style={styles.required}>*</Text></Text>
                    <TextInput
                        style={styles.textArea}
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="Enter your field notes here..."
                        placeholderTextColor={COLORS.subtitle}
                        multiline
                        numberOfLines={6}
                        textAlignVertical="top"
                    />
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
            </ScrollView>
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
    textArea: {
        backgroundColor: COLORS.card,
        borderRadius: 14,
        padding: 14,
        color: '#fff',
        fontSize: 15,
        minHeight: 140,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
        lineHeight: 22,
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
