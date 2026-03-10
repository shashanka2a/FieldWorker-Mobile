import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Switch,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenHeader } from '@/components/ScreenHeader';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    danger: '#FF453A',
    success: '#30D158',
};

interface SettingRow {
    id: string;
    icon: string;
    label: string;
    type: 'toggle' | 'info' | 'action' | 'danger';
    value?: boolean;
    subtitle?: string;
    iconBg?: string;
    iconColor?: string;
}

export default function SettingsScreen() {
    const [notifications, setNotifications] = useState(true);
    const [darkMode, setDarkMode] = useState(true);
    const [autoSave, setAutoSave] = useState(true);

    const handleClearData = () => {
        Alert.alert(
            'Clear All Data',
            'This will permanently delete all saved reports, notes, and data from this device. This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Clear Data',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await AsyncStorage.clear();
                            Alert.alert('Done', 'All app data has been cleared.');
                        } catch {
                            Alert.alert('Error', 'Failed to clear data.');
                        }
                    },
                },
            ]
        );
    };

    return (
        <View style={styles.container}>
            <ScreenHeader title="Settings" />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

                {/* Preferences */}
                <Text style={styles.sectionLabel}>Preferences</Text>
                <View style={styles.card}>
                    <View style={styles.settingRow}>
                        <View style={[styles.settingIcon, { backgroundColor: '#0A84FF20' }]}>
                            <Ionicons name="notifications-outline" size={18} color="#0A84FF" />
                        </View>
                        <View style={styles.settingContent}>
                            <Text style={styles.settingLabel}>Push Notifications</Text>
                            <Text style={styles.settingSubtitle}>Daily report reminders</Text>
                        </View>
                        <Switch
                            value={notifications}
                            onValueChange={setNotifications}
                            trackColor={{ false: COLORS.border, true: COLORS.brand }}
                            thumbColor="#fff"
                        />
                    </View>
                    <View style={styles.separator} />
                    <View style={styles.settingRow}>
                        <View style={[styles.settingIcon, { backgroundColor: '#98989D20' }]}>
                            <Ionicons name="moon-outline" size={18} color={COLORS.subtitle} />
                        </View>
                        <View style={styles.settingContent}>
                            <Text style={styles.settingLabel}>Dark Mode</Text>
                            <Text style={styles.settingSubtitle}>Always on (required)</Text>
                        </View>
                        <Switch
                            value={darkMode}
                            onValueChange={() => { }}
                            trackColor={{ false: COLORS.border, true: COLORS.brand }}
                            thumbColor="#fff"
                            disabled
                        />
                    </View>
                    <View style={styles.separator} />
                    <View style={styles.settingRow}>
                        <View style={[styles.settingIcon, { backgroundColor: COLORS.success + '20' }]}>
                            <Ionicons name="save-outline" size={18} color={COLORS.success} />
                        </View>
                        <View style={styles.settingContent}>
                            <Text style={styles.settingLabel}>Auto-Save Drafts</Text>
                            <Text style={styles.settingSubtitle}>Save form data while typing</Text>
                        </View>
                        <Switch
                            value={autoSave}
                            onValueChange={setAutoSave}
                            trackColor={{ false: COLORS.border, true: COLORS.brand }}
                            thumbColor="#fff"
                        />
                    </View>
                </View>

                {/* App Info */}
                <Text style={styles.sectionLabel}>App Info</Text>
                <View style={styles.card}>
                    {[
                        { icon: 'information-circle-outline', label: 'Version', value: '1.0.0', color: '#64D2FF' },
                        { icon: 'phone-portrait-outline', label: 'Platform', value: 'iOS / Android', color: COLORS.subtitle },
                        { icon: 'server-outline', label: 'Storage', value: 'Local (AsyncStorage)', color: '#FF9F0A' },
                    ].map((item, idx, arr) => (
                        <View key={item.label}>
                            <View style={styles.settingRow}>
                                <View style={[styles.settingIcon, { backgroundColor: item.color + '20' }]}>
                                    <Ionicons name={item.icon as any} size={18} color={item.color} />
                                </View>
                                <Text style={styles.settingLabel}>{item.label}</Text>
                                <Text style={styles.settingValue}>{item.value}</Text>
                            </View>
                            {idx < arr.length - 1 && <View style={styles.separator} />}
                        </View>
                    ))}
                </View>

                {/* Data Management */}
                <Text style={styles.sectionLabel}>Data Management</Text>
                <View style={styles.card}>
                    <TouchableOpacity style={styles.settingRow} onPress={handleClearData}>
                        <View style={[styles.settingIcon, { backgroundColor: COLORS.danger + '20' }]}>
                            <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                        </View>
                        <View style={styles.settingContent}>
                            <Text style={[styles.settingLabel, { color: COLORS.danger }]}>Clear All Data</Text>
                            <Text style={styles.settingSubtitle}>Remove all reports and entries</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={COLORS.subtitle} />
                    </TouchableOpacity>
                </View>

                {/* Footer */}
                <Text style={styles.footer}>FieldWorker Mobile v1.0.0{'\n'}Built with Expo SDK 54</Text>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 60, gap: 8 },
    sectionLabel: { color: COLORS.subtitle, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 12, marginBottom: 4, marginLeft: 4 },
    card: { backgroundColor: COLORS.card, borderRadius: 18, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    settingRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
    settingIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    settingContent: { flex: 1 },
    settingLabel: { color: '#fff', fontSize: 15, fontWeight: '500' },
    settingSubtitle: { color: COLORS.subtitle, fontSize: 12, marginTop: 2 },
    settingValue: { color: COLORS.subtitle, fontSize: 14, marginLeft: 'auto' },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: 62 },
    footer: { color: COLORS.subtitle, fontSize: 12, textAlign: 'center', marginTop: 24, lineHeight: 20 },
});
