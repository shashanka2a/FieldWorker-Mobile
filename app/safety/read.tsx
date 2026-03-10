import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { getTemplateById } from '@/lib/safetyTemplates';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
};

export default function SafetyReadScreen() {
    const { templateId, mode } = useLocalSearchParams<{ templateId: string; mode?: string }>();
    const template = getTemplateById(templateId);

    if (!template) {
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
                title={template.name}
                subtitle="Safety Talk"
                rightElement={
                    mode === 'start' ? (
                        <TouchableOpacity
                            style={styles.sigBtn}
                            onPress={() => router.push(`/safety/signatures/?templateId=${templateId}` as any)}
                        >
                            <Text style={styles.sigBtnText}>Sign</Text>
                            <Ionicons name="pencil" size={14} color="#fff" />
                        </TouchableOpacity>
                    ) : null
                }
            />
            <WebView
                source={{ uri: template.pdfUrl }}
                style={styles.webView}
                startInLoadingState
                renderLoading={() => (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator color={COLORS.brand} size="large" />
                        <Text style={styles.loadingText}>Loading document...</Text>
                    </View>
                )}
            />
            {mode === 'start' && (
                <View style={styles.footer}>
                    <TouchableOpacity
                        style={styles.footerBtn}
                        onPress={() => router.push(`/safety/signatures/?templateId=${templateId}` as any)}
                    >
                        <Ionicons name="pencil" size={18} color="#fff" />
                        <Text style={styles.footerBtnText}>Collect Signatures</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    webView: { flex: 1, backgroundColor: COLORS.surface },
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
