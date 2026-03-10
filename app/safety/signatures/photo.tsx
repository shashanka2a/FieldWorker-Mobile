import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    Image,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader } from '@/components/ScreenHeader';
import { getTemplateById } from '@/lib/safetyTemplates';
import AsyncStorage from '@react-native-async-storage/async-storage';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    success: '#30D158',
};

export default function PhotoSignaturesScreen() {
    const { templateId } = useLocalSearchParams<{ templateId?: string }>();
    const template = getTemplateById(templateId ?? '');

    const [photos, setPhotos] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow camera access.');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
        if (!result.canceled) {
            setPhotos((prev) => [...prev, result.assets[0].uri]);
        }
    };

    const pickFromLibrary = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission needed', 'Please allow photo access.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsMultipleSelection: true,
            quality: 0.85,
        });
        if (!result.canceled) {
            setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
        }
    };

    const handleComplete = async () => {
        if (photos.length === 0) {
            Alert.alert('Required', 'Please take at least one photo of the signed sheet.');
            return;
        }
        setSaving(true);
        try {
            const key = `safety_sig_photo_${templateId}_${Date.now()}`;
            await AsyncStorage.setItem(key, JSON.stringify({
                templateId,
                templateName: template?.name ?? '',
                photos,
                completedAt: new Date().toISOString(),
            }));
            setSaved(true);
            setTimeout(() => router.push('/safety' as any), 1000);
        } catch {
            Alert.alert('Error', 'Failed to save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <View style={styles.container}>
            <ScreenHeader title="Photo Signatures" subtitle={template?.name ?? 'Safety Talk'} />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

                {/* Instructions */}
                <View style={styles.instructionCard}>
                    <Ionicons name="information-circle-outline" size={20} color={COLORS.brand} />
                    <Text style={styles.instructionText}>
                        Have all attendees sign a physical paper sheet, then photograph it clearly. Multiple sheets are supported.
                    </Text>
                </View>

                {/* Photo capture buttons */}
                <View style={styles.actionRow}>
                    <TouchableOpacity style={styles.actionBtn} onPress={takePhoto}>
                        <View style={styles.actionIcon}>
                            <Ionicons name="camera" size={28} color={COLORS.brand} />
                        </View>
                        <Text style={styles.actionLabel}>Take Photo</Text>
                        <Text style={styles.actionSub}>Use camera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { borderColor: '#98989D50' }]} onPress={pickFromLibrary}>
                        <View style={[styles.actionIcon, { backgroundColor: '#98989D20' }]}>
                            <Ionicons name="images" size={28} color={COLORS.subtitle} />
                        </View>
                        <Text style={styles.actionLabel}>From Library</Text>
                        <Text style={styles.actionSub}>Choose existing</Text>
                    </TouchableOpacity>
                </View>

                {/* Photos grid */}
                {photos.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Captured Sheets ({photos.length})</Text>
                        <View style={styles.photoGrid}>
                            {photos.map((uri, idx) => (
                                <View key={idx} style={styles.photoWrap}>
                                    <Image source={{ uri }} style={styles.photo} />
                                    <TouchableOpacity
                                        style={styles.removeBtn}
                                        onPress={() => setPhotos((p) => p.filter((_, i) => i !== idx))}
                                    >
                                        <Ionicons name="close-circle" size={24} color="#fff" />
                                    </TouchableOpacity>
                                    <View style={styles.photoNum}>
                                        <Text style={styles.photoNumText}>Sheet {idx + 1}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Complete button */}
                <TouchableOpacity
                    style={[styles.completeBtn, (saving || saved || photos.length === 0) && { opacity: 0.6 }]}
                    onPress={handleComplete}
                    disabled={saving || saved || photos.length === 0}
                >
                    {saving ? <ActivityIndicator color="#fff" /> :
                        saved ? (
                            <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.completeBtnText}>Completed!</Text></>
                        ) : (
                            <><Ionicons name="shield-checkmark" size={20} color="#fff" /><Text style={styles.completeBtnText}>Complete Talk ({photos.length} sheet{photos.length !== 1 ? 's' : ''})</Text></>
                        )}
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 48, gap: 16 },
    instructionCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: COLORS.brand + '15', borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.brand + '40' },
    instructionText: { flex: 1, color: COLORS.subtitle, fontSize: 14, lineHeight: 21 },
    actionRow: { flexDirection: 'row', gap: 12 },
    actionBtn: { flex: 1, backgroundColor: COLORS.card, borderRadius: 18, padding: 20, alignItems: 'center', gap: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.brand + '50' },
    actionIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: COLORS.brand + '20', alignItems: 'center', justifyContent: 'center' },
    actionLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
    actionSub: { color: COLORS.subtitle, fontSize: 12 },
    section: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    sectionTitle: { color: COLORS.brand, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    photoWrap: { width: '48%', aspectRatio: 1.2, position: 'relative' },
    photo: { width: '100%', height: '100%', borderRadius: 12 },
    removeBtn: { position: 'absolute', top: -8, right: -8 },
    photoNum: { position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    photoNumText: { color: '#fff', fontSize: 11, fontWeight: '600' },
    completeBtn: { backgroundColor: COLORS.success, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, shadowColor: COLORS.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
    completeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
