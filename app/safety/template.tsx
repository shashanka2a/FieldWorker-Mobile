import React from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SAFETY_TEMPLATES } from '@/lib/safetyTemplates';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
};

export default function SafetyTemplateScreen() {
    const { mode } = useLocalSearchParams<{ mode: 'start' | 'schedule' }>();

    const handleSelect = (templateId: string, templateName: string) => {
        if (mode === 'start') {
            router.push(`/safety/read?templateId=${templateId}&mode=start`);
        } else {
            router.push(`/safety/schedule?templateId=${templateId}&templateName=${encodeURIComponent(templateName)}`);
        }
    };

    return (
        <View style={styles.container}>
            <ScreenHeader
                title={mode === 'start' ? 'Start Safety Talk' : 'Schedule Safety Talk'}
                subtitle="Select a template"
            />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                <View style={styles.modeChip}>
                    <Ionicons name={mode === 'start' ? 'play-circle' : 'calendar'} size={14} color={COLORS.brand} />
                    <Text style={styles.modeText}>{mode === 'start' ? 'Starting talk now' : 'Scheduling for later'}</Text>
                </View>

                <Text style={styles.sectionLabel}>Available Templates</Text>

                {SAFETY_TEMPLATES.map((template) => (
                    <TouchableOpacity
                        key={template.id}
                        style={styles.templateCard}
                        onPress={() => handleSelect(template.id, template.name)}
                        activeOpacity={0.8}
                    >
                        <View style={styles.templateIcon}>
                            <Ionicons name="shield-checkmark-outline" size={24} color={COLORS.brand} />
                        </View>
                        <View style={styles.templateInfo}>
                            <Text style={styles.templateName}>{template.name}</Text>
                            {template.description && (
                                <Text style={styles.templateDesc}>{template.description}</Text>
                            )}
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={COLORS.subtitle} />
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 40, gap: 12 },
    modeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.brand + '15', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
    modeText: { color: COLORS.brand, fontSize: 13, fontWeight: '600' },
    sectionLabel: { color: COLORS.subtitle, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },
    templateCard: {
        backgroundColor: COLORS.card,
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    templateIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.brand + '20', alignItems: 'center', justifyContent: 'center' },
    templateInfo: { flex: 1, gap: 4 },
    templateName: { color: '#fff', fontSize: 15, fontWeight: '700', lineHeight: 22 },
    templateDesc: { color: COLORS.subtitle, fontSize: 13 },
});
