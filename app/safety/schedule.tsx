import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import {
    getSafetyTalks,
    addScheduledSafetyTalk,
    updateScheduledSafetyTalk,
    deleteScheduledSafetyTalk,
    SafetyTalk,
} from '@/lib/safetyStorage';
import { getTemplateById, SAFETY_TEMPLATES } from '@/lib/safetyTemplates';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    danger: '#FF453A',
    success: '#30D158',
};

function formatDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export default function SafetyScheduleScreen() {
    const { id, templateId: paramTemplateId, templateName: paramTemplateName } =
        useLocalSearchParams<{ id?: string; templateId?: string; templateName?: string }>();

    const [talk, setTalk] = useState<SafetyTalk | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>(paramTemplateId ?? '');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Load existing talk if editing
    useEffect(() => {
        if (id) {
            setLoading(true);
            getSafetyTalks().then((talks) => {
                const found = talks.find((t) => t.id === id);
                if (found) {
                    setTalk(found);
                    setSelectedTemplateId(found.templateId);
                    const [y, m, d] = found.date.split('-').map(Number);
                    setSelectedDate(new Date(y, m - 1, d));
                }
                setLoading(false);
            });
        }
    }, [id]);

    // Build a 30-day date option list
    const dateOptions: Date[] = [];
    for (let i = 0; i < 30; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        dateOptions.push(d);
    }

    const selectedTemplate = getTemplateById(selectedTemplateId);

    const handleSave = async () => {
        if (!selectedTemplateId) {
            Alert.alert('Required', 'Please select a safety talk template.');
            return;
        }
        const templateName = selectedTemplate?.name ?? paramTemplateName ?? '';
        const dateKey = formatDateKey(selectedDate);

        setSubmitting(true);
        try {
            if (id && talk) {
                await updateScheduledSafetyTalk(id, dateKey, selectedTemplateId, templateName);
            } else {
                await addScheduledSafetyTalk(dateKey, selectedTemplateId, templateName);
            }
            router.back();
        } catch {
            Alert.alert('Error', 'Failed to save. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = () => {
        Alert.alert(
            'Delete Talk',
            'Are you sure you want to delete this scheduled talk?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        if (id) {
                            await deleteScheduledSafetyTalk(id);
                            router.back();
                        }
                    },
                },
            ]
        );
    };

    if (loading) {
        return (
            <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
                <ActivityIndicator color={COLORS.brand} size="large" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScreenHeader
                title={id ? 'Edit Schedule' : 'Schedule Talk'}
                rightElement={
                    id ? (
                        <TouchableOpacity onPress={handleDelete}>
                            <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
                        </TouchableOpacity>
                    ) : null
                }
            />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

                {/* Template selection */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Template</Text>
                    {SAFETY_TEMPLATES.map((template) => (
                        <TouchableOpacity
                            key={template.id}
                            style={[styles.templateOption, selectedTemplateId === template.id && styles.templateOptionActive]}
                            onPress={() => setSelectedTemplateId(template.id)}
                        >
                            <Ionicons
                                name={selectedTemplateId === template.id ? 'radio-button-on' : 'radio-button-off'}
                                size={20}
                                color={selectedTemplateId === template.id ? COLORS.brand : COLORS.subtitle}
                            />
                            <View style={styles.templateContent}>
                                <Text style={styles.templateName}>{template.name}</Text>
                                {template.description && <Text style={styles.templateDesc}>{template.description}</Text>}
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Date Selection */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Schedule Date</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
                        {dateOptions.map((date, idx) => {
                            const isSelected = date.toDateString() === selectedDate.toDateString();
                            const isToday = date.toDateString() === today.toDateString();
                            const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
                            const dayNum = date.getDate();
                            const month = date.toLocaleDateString('en-US', { month: 'short' });
                            return (
                                <TouchableOpacity
                                    key={idx}
                                    style={[styles.dateChip, isSelected && styles.dateChipActive]}
                                    onPress={() => setSelectedDate(new Date(date))}
                                >
                                    <Text style={[styles.dateDayName, isSelected && styles.dateTextActive]}>
                                        {isToday ? 'Today' : dayName}
                                    </Text>
                                    <Text style={[styles.dateDayNum, isSelected && styles.dateTextActive]}>{dayNum}</Text>
                                    <Text style={[styles.dateMonth, isSelected && styles.dateTextActive]}>{month}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* Summary */}
                {selectedTemplateId && (
                    <View style={styles.summaryCard}>
                        <Ionicons name="calendar-outline" size={18} color={COLORS.brand} />
                        <Text style={styles.summaryText}>
                            "{selectedTemplate?.name}" will be scheduled for{' '}
                            <Text style={styles.summaryDate}>
                                {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                            </Text>
                        </Text>
                    </View>
                )}

                <TouchableOpacity
                    style={[styles.saveBtn, (submitting || !selectedTemplateId) && { opacity: 0.6 }]}
                    onPress={handleSave}
                    disabled={submitting || !selectedTemplateId}
                >
                    {submitting ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <>
                            <Ionicons name="checkmark-circle" size={20} color="#fff" />
                            <Text style={styles.saveBtnText}>{id ? 'Update Schedule' : 'Schedule Talk'}</Text>
                        </>
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
    section: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    sectionTitle: { color: COLORS.brand, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    templateOption: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 10, borderRadius: 12 },
    templateOptionActive: { backgroundColor: COLORS.brand + '10' },
    templateContent: { flex: 1, gap: 2 },
    templateName: { color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 20 },
    templateDesc: { color: COLORS.subtitle, fontSize: 12 },
    dateRow: { gap: 8, paddingVertical: 4 },
    dateChip: { alignItems: 'center', gap: 2, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, minWidth: 64 },
    dateChipActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
    dateDayName: { color: COLORS.subtitle, fontSize: 11, fontWeight: '600' },
    dateDayNum: { color: '#fff', fontSize: 20, fontWeight: '700' },
    dateMonth: { color: COLORS.subtitle, fontSize: 11 },
    dateTextActive: { color: '#fff' },
    summaryCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: COLORS.brand + '15', borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.brand + '40' },
    summaryText: { flex: 1, color: COLORS.subtitle, fontSize: 14, lineHeight: 21 },
    summaryDate: { color: '#fff', fontWeight: '600' },
    saveBtn: { backgroundColor: COLORS.brand, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
    saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
