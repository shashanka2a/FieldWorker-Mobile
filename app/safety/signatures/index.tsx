import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    blue: '#0A84FF',
};

export default function SafetySignaturesScreen() {
    const { templateId } = useLocalSearchParams<{ templateId?: string }>();

    return (
        <View style={styles.container}>
            <ScreenHeader title="Collect Signatures" subtitle="Choose method" />
            <View style={styles.content}>
                <Text style={styles.heading}>How would you like to collect signatures?</Text>
                <Text style={styles.subheading}>Choose the method that works best for your team today.</Text>

                <TouchableOpacity
                    style={styles.optionCard}
                    onPress={() => router.push(`/safety/signatures/digital?templateId=${templateId ?? ''}`)}
                    activeOpacity={0.8}
                >
                    <View style={styles.optionIcon}>
                        <Ionicons name="pencil" size={32} color={COLORS.brand} />
                    </View>
                    <View style={styles.optionContent}>
                        <Text style={styles.optionTitle}>Digital Signature</Text>
                        <Text style={styles.optionDesc}>Draw signatures directly on-screen for each attendee</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.subtitle} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.optionCard}
                    onPress={() => router.push(`/safety/signatures/photo?templateId=${templateId ?? ''}`)}
                    activeOpacity={0.8}
                >
                    <View style={[styles.optionIcon, { backgroundColor: COLORS.blue + '20' }]}>
                        <Ionicons name="camera" size={32} color={COLORS.blue} />
                    </View>
                    <View style={styles.optionContent}>
                        <Text style={styles.optionTitle}>Photo Signature</Text>
                        <Text style={styles.optionDesc}>Photograph a paper sign-in sheet for all attendees</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.subtitle} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    content: { flex: 1, padding: 24, gap: 16, justifyContent: 'center', paddingBottom: 80 },
    heading: { color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
    subheading: { color: COLORS.subtitle, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 8 },
    optionCard: {
        backgroundColor: COLORS.card,
        borderRadius: 20,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    optionIcon: {
        width: 64,
        height: 64,
        borderRadius: 18,
        backgroundColor: COLORS.brand + '20',
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionContent: { flex: 1, gap: 4 },
    optionTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
    optionDesc: { color: COLORS.subtitle, fontSize: 13, lineHeight: 18 },
});
