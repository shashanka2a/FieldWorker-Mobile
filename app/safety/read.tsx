import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { getTemplateById, type SafetyTemplate } from '@/lib/safetyTemplates';
import { fetchSafetyTalkTemplateByIdFromSupabase } from '@/lib/supabaseSync';
import { getTalkById } from '@/lib/safetyStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
};

export default function SafetyReadScreen() {
    const insets = useSafeAreaInsets();
    const { templateId, mode, talkId } = useLocalSearchParams<{ templateId?: string; mode?: string; talkId?: string }>();
    const completedTalkId = (talkId ?? '').trim();
    const isCompletedTalkView = completedTalkId.length > 0;
    const [resolvedTemplateId, setResolvedTemplateId] = useState<string>(templateId ?? '');
    const [titleOverride, setTitleOverride] = useState<string>('');
    const [pdfOverrideUrl, setPdfOverrideUrl] = useState<string>('');
    const fallback = useMemo(() => getTemplateById(resolvedTemplateId), [resolvedTemplateId]);
    const [template, setTemplate] = useState<SafetyTemplate | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        setLoading(true);
        (async () => {
            try {
                // If launched from a completed talk, prefer its stored combined PDF.
                const tid = completedTalkId;
                if (tid) {
                    const t = await getTalkById(tid);
                    if (t) {
                        if (mounted) {
                            setResolvedTemplateId(t.templateId);
                            setTitleOverride(t.templateName);
                        }
                        const raw = await AsyncStorage.getItem(`safety_talk_completed_${tid}`);
                        if (raw) {
                            try {
                                const parsed = JSON.parse(raw);
                                const combined = typeof parsed?.combinedPdfUrl === 'string' ? parsed.combinedPdfUrl.trim() : '';
                                if (mounted && combined) setPdfOverrideUrl(combined);
                            } catch { }
                        }
                    }
                }

                const remote = await fetchSafetyTalkTemplateByIdFromSupabase(resolvedTemplateId);
                if (mounted) setTemplate(remote);
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, [resolvedTemplateId, completedTalkId]);

    const resolved = template ?? fallback;

    if (!resolved && !loading) {
        return (
            <View style={styles.container}>
                <ScreenHeader title="Safety Talk" />
                <View style={styles.notFound}>
                    <Ionicons name="alert-circle-outline" size={48} color={COLORS.subtitle} />
                    <Text style={styles.notFoundText}>Template not found</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScreenHeader
                title={titleOverride || resolved?.name || 'Safety Talk'}
                subtitle="Safety Talk"
                rightElement={
                    mode === 'start' ? (
                        <TouchableOpacity
                            style={styles.sigBtn}
                            onPress={() => router.push(`/safety/signatures/?templateId=${resolvedTemplateId}` as any)}
                        >
                            <Text style={styles.sigBtnText}>Sign</Text>
                            <Ionicons name="pencil" size={14} color="#fff" />
                        </TouchableOpacity>
                    ) : null
                }
            />
            {(pdfOverrideUrl || resolved?.pdfUrl) ? (
                <WebView
                    source={{ uri: (pdfOverrideUrl || resolved!.pdfUrl) }}
                    style={styles.webView}
                    startInLoadingState
                    renderLoading={() => (
                        <View style={styles.loadingOverlay}>
                            <ActivityIndicator color={COLORS.brand} size="large" />
                            <Text style={styles.loadingText}>Loading document...</Text>
                        </View>
                    )}
                />
            ) : (
                <View style={styles.notFound}>
                    <ActivityIndicator color={COLORS.brand} size="large" />
                    <Text style={styles.notFoundText}>Loading safety talk…</Text>
                </View>
            )}
            {mode === 'start' && (
                <View style={[styles.footer, { paddingBottom: Math.max(16, insets.bottom) }]}>
                    <TouchableOpacity
                        style={styles.footerBtn}
                        onPress={() => router.push(`/safety/signatures/?templateId=${resolvedTemplateId}` as any)}
                    >
                        <Ionicons name="pencil" size={18} color="#fff" />
                        <Text style={styles.footerBtnText}>Collect Signatures</Text>
                    </TouchableOpacity>
                </View>
            )}
            {isCompletedTalkView && (
                <View style={[styles.completedFooter, { paddingBottom: Math.max(16, insets.bottom) }]}>
                    <TouchableOpacity
                        style={styles.homeBtn}
                        onPress={() => router.replace('/(tabs)' as any)}
                        accessibilityRole="button"
                        accessibilityLabel="Return to home"
                    >
                        <Ionicons name="home" size={20} color="#fff" />
                        <Text style={styles.homeBtnText}>Return to home</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    webView: { flex: 1, backgroundColor: COLORS.surface },
    completedFooter: {
        backgroundColor: COLORS.card,
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: COLORS.border,
    },
    homeBtn: {
        backgroundColor: COLORS.brand,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    homeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    notFound: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
    notFoundText: { color: COLORS.subtitle, fontSize: 16 },
    loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.surface, gap: 12 },
    loadingText: { color: COLORS.subtitle, fontSize: 14 },
    sigBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.brand, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
    sigBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    footer: { backgroundColor: COLORS.card, padding: 16, paddingBottom: 32, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
    footerBtn: { backgroundColor: COLORS.brand, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
    footerBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
