import React, { useMemo, useState } from 'react';
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
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';
import { createUuid, getDateKey, getSubmittedAtIso, saveMetrics, getMetricsForDate, MetricsEntry } from '@/lib/dailyReportStorage';
import { mergeLocalRemotePreferSupabase, matchProjectPredicate } from '@/lib/mergeLocalRemote';
import { fetchMetricsFromSupabase } from '@/lib/supabaseSync';
import { useFormDraft, clearFormDraft } from '@/hooks/useFormDraft';
import { KeyboardAwareScrollView, KeyboardField, ScrollInputField } from '@/components/KeyboardAwareScrollView';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
};

interface MetricField {
    key: 'waterUsage' | 'acresCompleted' | 'greenSpaceCompleted' | 'numberOfOperators';
    label: string;
    unit: string;
    icon: string;
    placeholder: string;
    keyboardType: 'decimal-pad' | 'number-pad';
}

const METRIC_FIELDS: MetricField[] = [
    { key: 'waterUsage', label: 'Water Usage', unit: 'GAL', icon: 'water-outline', placeholder: '0.0', keyboardType: 'decimal-pad' },
    { key: 'acresCompleted', label: 'Acres Completed', unit: 'acres', icon: 'map-outline', placeholder: '0.0', keyboardType: 'decimal-pad' },
    { key: 'greenSpaceCompleted', label: 'Green Space Completed', unit: 'acres', icon: 'leaf-outline', placeholder: '0.0', keyboardType: 'decimal-pad' },
    { key: 'numberOfOperators', label: 'Number of Operators', unit: 'people', icon: 'people-outline', placeholder: '0', keyboardType: 'number-pad' },
];

export default function MetricsScreen() {
    const { selectedDate, selectedProject } = useAppContext();
    const dateKey = useMemo(() => getDateKey(selectedDate), [selectedDate]);
    const projectKey = (selectedProject?.id || selectedProject?.name || 'project').replace(/\s+/g, '_');
    const [values, setValues] = useState<Record<string, string>>({
        waterUsage: '',
        acresCompleted: '',
        greenSpaceCompleted: '',
        numberOfOperators: '',
    });
    const [notes, setNotes] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [entryId, setEntryId] = useState<string | null>(null);
    const [mode, setMode] = useState<'overview' | 'edit'>('edit');
    const [metricsLoadReady, setMetricsLoadReady] = useState(false);
    const metricsDraftKey = useMemo(
        () => `fw_draft_metrics_${dateKey}_${projectKey}_${entryId ?? 'new'}`,
        [dateKey, projectKey, entryId]
    );

    const dateLabel = selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    useFocusEffect(
        React.useCallback(() => {
            let active = true;
            setMetricsLoadReady(false);
            (async () => {
                try {
                    const localData = await getMetricsForDate(dateKey);
                    const remoteData = await fetchMetricsFromSupabase(
                        dateKey,
                        selectedDate,
                        selectedProject?.id ?? '',
                        selectedProject?.name ?? ''
                    );
                    const data = mergeLocalRemotePreferSupabase(
                        localData,
                        remoteData,
                        matchProjectPredicate<MetricsEntry>(selectedProject?.name)
                    );
                    const sortedMetrics = [...data].sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
                    // Pre-fill with the first/most recent metric entry if it exists
                    if (sortedMetrics.length > 0 && active) {
                        const latest = sortedMetrics[sortedMetrics.length - 1];
                        setEntryId(latest.id);
                        setMode('overview');
                        setValues({
                            waterUsage: latest.waterUsage || '',
                            acresCompleted: latest.acresCompleted || '',
                            greenSpaceCompleted: latest.greenSpaceCompleted || '',
                            numberOfOperators: latest.numberOfOperators || '',
                        });
                        setNotes(latest.notes || '');
                        setPhotos(latest.photos || []);
                    } else if (active) {
                        setEntryId(null);
                        setMode('edit');
                    }
                } finally {
                    if (active) setMetricsLoadReady(true);
                }
            })();
            return () => { active = false; };
        }, [dateKey, selectedDate, selectedProject?.id, selectedProject?.name])
    );

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo access.'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.8 });
        if (!result.canceled) setPhotos((prev) => [...prev, ...result.assets.map((a) => a.uri)]);
    };

    const metricsDraftSnapshot = useMemo(
        () => JSON.stringify({ values, notes, photos }),
        [values, notes, photos]
    );

    useFormDraft({
        storageKey: metricsDraftKey,
        active: metricsLoadReady && mode === 'edit',
        snapshotJson: metricsDraftSnapshot,
        hydrate: (parsed) => {
            if (!parsed || typeof parsed !== 'object') return;
            const p = parsed as Record<string, unknown>;
            if (p.values && typeof p.values === 'object' && p.values !== null) {
                const v = p.values as Record<string, unknown>;
                setValues((prev) => ({
                    waterUsage: typeof v.waterUsage === 'string' ? v.waterUsage : prev.waterUsage,
                    acresCompleted: typeof v.acresCompleted === 'string' ? v.acresCompleted : prev.acresCompleted,
                    greenSpaceCompleted:
                        typeof v.greenSpaceCompleted === 'string' ? v.greenSpaceCompleted : prev.greenSpaceCompleted,
                    numberOfOperators:
                        typeof v.numberOfOperators === 'string' ? v.numberOfOperators : prev.numberOfOperators,
                }));
            }
            if (typeof p.notes === 'string') setNotes(p.notes);
            if (Array.isArray(p.photos)) {
                setPhotos(p.photos.filter((x): x is string => typeof x === 'string'));
            }
        },
        isNonEmpty: () =>
            !!(
                Object.values(values).some((v) => v.trim() !== '') ||
                notes.trim() ||
                photos.length > 0
            ),
    });

    const handleSubmit = async () => {
        const hasValue = Object.values(values).some((v) => v.trim() !== '');
        if (!hasValue) {
            Alert.alert('Required', 'Enter at least one metric value.');
            return;
        }
        setSubmitting(true);
        try {
            const id = entryId ?? createUuid();
            await saveMetrics(dateKey, {
                id,
                project: selectedProject,
                timestamp: getSubmittedAtIso(),
                waterUsage: values.waterUsage || undefined,
                acresCompleted: values.acresCompleted || undefined,
                greenSpaceCompleted: values.greenSpaceCompleted || undefined,
                numberOfOperators: values.numberOfOperators || undefined,
                notes: notes.trim() || undefined,
                photos: photos.length > 0 ? photos : undefined,
            });
            await clearFormDraft(metricsDraftKey);
            setEntryId(id);
            setSuccess(true);
            setMode('overview');
            setTimeout(() => setSuccess(false), 1200);
        } catch {
            Alert.alert('Error', 'Failed to save metrics. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <View style={styles.container}>
            <ScreenHeader title="Daily Metrics" subtitle={dateLabel} />
            <KeyboardAwareScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                {mode === 'overview' && (
                    <View style={styles.overviewCard}>
                        <View style={styles.overviewHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={styles.overviewIconWrap}>
                                    <Ionicons name="stats-chart-outline" size={18} color={COLORS.brand} />
                                </View>
                                <View>
                                    <Text style={styles.overviewTitle}>Submitted metrics</Text>
                                    <Text style={styles.overviewSub}>{selectedProject.name}</Text>
                                </View>
                            </View>
                            <TouchableOpacity style={styles.editBtn} onPress={() => setMode('edit')} activeOpacity={0.85}>
                                <Ionicons name="create-outline" size={16} color="#fff" />
                                <Text style={styles.editBtnText}>Edit</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.overviewGrid}>
                            {METRIC_FIELDS.map((f) => {
                                const v = values[f.key]?.trim();
                                if (!v) return null;
                                return (
                                    <View key={f.key} style={styles.overviewMetric}>
                                        <View style={styles.overviewMetricTop}>
                                            <Ionicons name={f.icon as any} size={14} color={COLORS.subtitle} />
                                            <Text style={styles.overviewMetricLabel}>{f.label}</Text>
                                        </View>
                                        <Text style={styles.overviewMetricValue}>
                                            {v}
                                            <Text style={styles.overviewMetricUnit}> {f.unit}</Text>
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>

                        {(notes?.trim() || photos.length > 0) && <View style={styles.overviewDivider} />}

                        {notes?.trim() ? (
                            <View style={styles.overviewMetaRow}>
                                <Ionicons name="chatbox-ellipses-outline" size={14} color={COLORS.subtitle} />
                                <Text style={styles.overviewMetaText} numberOfLines={3}>{notes.trim()}</Text>
                            </View>
                        ) : null}

                        {photos.length > 0 ? (
                            <View style={styles.overviewMetaRow}>
                                <Ionicons name="images-outline" size={14} color={COLORS.subtitle} />
                                <Text style={styles.overviewMetaText}>{photos.length} photo{photos.length !== 1 ? 's' : ''} attached</Text>
                            </View>
                        ) : null}
                    </View>
                )}

                {mode === 'edit' && (
                    <>

                {/* Project display */}
                <View style={styles.projectCard}>
                    <Ionicons name="business-outline" size={16} color={COLORS.subtitle} />
                    <Text style={styles.projectText}>{selectedProject.name}</Text>
                </View>

                {/* Metric cards */}
                {METRIC_FIELDS.map((field) => (
                    <KeyboardField key={field.key} style={styles.metricCard}>
                        <View style={styles.metricHeader}>
                            <View style={styles.metricIconWrap}>
                                <Ionicons name={field.icon as any} size={20} color={COLORS.brand} />
                            </View>
                            <Text style={styles.metricLabel}>{field.label}</Text>
                        </View>
                        <View style={styles.metricInputRow}>
                            <ScrollInputField style={{ flex: 1 }}>
                                <TextInput
                                    style={styles.metricInput}
                                    value={values[field.key]}
                                    onChangeText={(v) => setValues((prev) => ({ ...prev, [field.key]: v }))}
                                    placeholder={field.placeholder}
                                    placeholderTextColor={COLORS.subtitle}
                                    keyboardType={field.keyboardType}
                                />
                            </ScrollInputField>
                            <Text style={styles.metricUnit}>{field.unit}</Text>
                        </View>
                    </KeyboardField>
                ))}

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
                <TouchableOpacity style={styles.photoBtn} onPress={pickImage}>
                    <Ionicons name="images-outline" size={18} color={COLORS.brand} />
                    <Text style={styles.photoBtnText}>Attach Photos</Text>
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

                <TouchableOpacity
                    style={[styles.submitBtn, (submitting || success) && { opacity: 0.7 }]}
                    onPress={handleSubmit}
                    disabled={submitting || success}
                >
                    {submitting ? <ActivityIndicator color="#fff" /> :
                        success ? <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.submitText}>Saved!</Text></> :
                            <Text style={styles.submitText}>Save Metrics</Text>}
                </TouchableOpacity>
                    </>
                )}
            </KeyboardAwareScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 48, gap: 16 },
    overviewCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    overviewHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    overviewIconWrap: { width: 34, height: 34, borderRadius: 12, backgroundColor: COLORS.brand + '18', alignItems: 'center', justifyContent: 'center' },
    overviewTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
    overviewSub: { color: COLORS.subtitle, fontSize: 12, marginTop: 2 },
    overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    overviewMetric: { flexGrow: 1, flexBasis: '46%', backgroundColor: COLORS.surface, borderRadius: 14, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    overviewMetricTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    overviewMetricLabel: { color: COLORS.subtitle, fontSize: 12, fontWeight: '600' },
    overviewMetricValue: { color: '#fff', fontSize: 18, fontWeight: '800' },
    overviewMetricUnit: { color: COLORS.subtitle, fontSize: 12, fontWeight: '700' },
    overviewDivider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginTop: 2 },
    overviewMetaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    overviewMetaText: { color: COLORS.subtitle, fontSize: 13, lineHeight: 18, flex: 1 },
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.brand, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
    editBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    projectCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.card, borderRadius: 12, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    projectText: { color: COLORS.subtitle, fontSize: 14 },
    metricCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    metricHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    metricIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.brand + '20', alignItems: 'center', justifyContent: 'center' },
    metricLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
    metricInputRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    metricInput: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, color: '#fff', fontSize: 24, fontWeight: '700', flex: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, textAlign: 'center' },
    metricUnit: { color: COLORS.subtitle, fontSize: 16, fontWeight: '500', minWidth: 50 },
    field: { gap: 8 },
    label: { color: '#fff', fontSize: 14, fontWeight: '600' },
    textArea: { backgroundColor: COLORS.card, borderRadius: 14, padding: 14, color: '#fff', fontSize: 15, minHeight: 90, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, textAlignVertical: 'top' },
    photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.card, borderRadius: 14, paddingVertical: 14, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    photoBtnText: { color: COLORS.brand, fontWeight: '600', fontSize: 14 },
    thumb: { width: 80, height: 80, borderRadius: 10 },
    removeBtn: { position: 'absolute', top: -6, right: -6 },
    submitBtn: { backgroundColor: COLORS.brand, borderRadius: 16, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8, shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
