import React, { useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    TextInput,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { KeyboardAwareScrollView, ScrollInputField } from '@/components/KeyboardAwareScrollView';
import { SAFETY_TEMPLATES, type SafetyTemplate } from '@/lib/safetyTemplates';
import { fetchSafetyTalkTemplatesFromSupabase } from '@/lib/supabaseSync';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
};

export default function SafetyTemplateScreen() {
    const { mode } = useLocalSearchParams<{ mode: 'start' | 'schedule' }>();
    const [templates, setTemplates] = useState<SafetyTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const remote = await fetchSafetyTalkTemplatesFromSupabase();
                if (mounted) setTemplates(remote);
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    const list = useMemo(() => (templates.length > 0 ? templates : SAFETY_TEMPLATES), [templates]);
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return list;
        return list.filter((t) => {
            const hay = `${t.name} ${t.description ?? ''}`.toLowerCase();
            return hay.includes(q);
        });
    }, [list, search]);

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
            <KeyboardAwareScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                <View style={styles.modeChip}>
                    <Ionicons name={mode === 'start' ? 'play-circle' : 'calendar'} size={14} color={COLORS.brand} />
                    <Text style={styles.modeText}>{mode === 'start' ? 'Starting talk now' : 'Scheduling for later'}</Text>
                </View>

                <Text style={styles.sectionLabel}>Available Templates</Text>

                {/* Search */}
                <View style={styles.searchWrap}>
                    <Ionicons name="search-outline" size={16} color={COLORS.subtitle} />
                    <ScrollInputField style={{ flex: 1 }}>
                        <TextInput
                            style={styles.searchInput}
                            value={search}
                            onChangeText={setSearch}
                            placeholder="Search templates..."
                            placeholderTextColor={COLORS.subtitle}
                            autoCapitalize="none"
                            autoCorrect={false}
                            clearButtonMode="never"
                        />
                    </ScrollInputField>
                    {search !== '' ? (
                        <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Ionicons name="close-circle" size={16} color={COLORS.subtitle} />
                        </TouchableOpacity>
                    ) : null}
                </View>

                {loading && templates.length === 0 ? (
                    <View style={styles.loadingRow}>
                        <ActivityIndicator color={COLORS.brand} />
                        <Text style={styles.loadingText}>Loading templates…</Text>
                    </View>
                ) : null}

                {filtered.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="search-outline" size={36} color={COLORS.subtitle} />
                        <Text style={styles.emptyTitle}>No matches</Text>
                        <Text style={styles.emptySubtitle}>Try a different search.</Text>
                    </View>
                ) : null}

                {filtered.map((template) => (
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
            </KeyboardAwareScrollView>
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
    searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    searchInput: { flex: 1, color: '#fff', fontSize: 16 },
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
    loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
    loadingText: { color: COLORS.subtitle, fontSize: 14 },
    emptyState: { alignItems: 'center', paddingVertical: 18, gap: 6 },
    emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
    emptySubtitle: { color: COLORS.subtitle, fontSize: 13 },
});
