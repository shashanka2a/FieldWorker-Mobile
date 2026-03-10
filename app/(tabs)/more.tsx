import React from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '@/context/AppContext';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    white: '#FFFFFF',
    blue: '#0A84FF',
    danger: '#FF453A',
};

interface MenuItemProps {
    icon: string;
    label: string;
    subtitle?: string;
    onPress: () => void;
    isDestructive?: boolean;
    showArrow?: boolean;
    iconColor?: string;
    iconBg?: string;
}

function MenuItem({ icon, label, subtitle, onPress, isDestructive, showArrow = true, iconColor, iconBg }: MenuItemProps) {
    return (
        <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
            <View style={[styles.menuIcon, { backgroundColor: iconBg ?? (isDestructive ? COLORS.danger + '20' : COLORS.brand + '20') }]}>
                <Ionicons
                    name={icon as any}
                    size={20}
                    color={iconColor ?? (isDestructive ? COLORS.danger : COLORS.brand)}
                />
            </View>
            <View style={styles.menuContent}>
                <Text style={[styles.menuLabel, isDestructive && { color: COLORS.danger }]}>{label}</Text>
                {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
            </View>
            {showArrow && (
                <Ionicons name="chevron-forward" size={16} color={COLORS.subtitle} />
            )}
        </TouchableOpacity>
    );
}

export default function MoreScreen() {
    const { currentUser } = useAppContext();

    const handleSignOut = () => {
        Alert.alert(
            'Sign Out',
            'Are you sure you want to sign out?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign Out', style: 'destructive', onPress: () => console.log('Sign out') },
            ]
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <Text style={styles.title}>More</Text>

                {/* Profile Card */}
                <View style={styles.profileCard}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {currentUser.name.split(' ').map((n) => n[0]).join('')}
                        </Text>
                    </View>
                    <View style={styles.profileInfo}>
                        <Text style={styles.profileName}>{currentUser.name}</Text>
                        <Text style={styles.profileRole}>{currentUser.role}</Text>
                    </View>
                    <View style={styles.profileBadge}>
                        <Text style={styles.profileBadgeText}>Active</Text>
                    </View>
                </View>

                {/* Reports Section */}
                <Text style={styles.sectionLabel}>Reports & History</Text>
                <View style={styles.menuCard}>
                    <MenuItem
                        icon="document-text-outline"
                        label="Signed Reports"
                        subtitle="View completed daily reports"
                        iconBg="#0A84FF20"
                        iconColor={COLORS.blue}
                        onPress={() => router.push('/reports')}
                    />
                    <View style={styles.divider} />
                    <MenuItem
                        icon="images-outline"
                        label="Gallery"
                        subtitle="All captured photos"
                        iconBg="#30D15820"
                        iconColor="#30D158"
                        onPress={() => router.push('/gallery')}
                    />
                </View>

                {/* Projects Section */}
                <Text style={styles.sectionLabel}>Work</Text>
                <View style={styles.menuCard}>
                    <MenuItem
                        icon="business-outline"
                        label="Projects"
                        subtitle="Manage field projects"
                        iconBg="#FF9F0A20"
                        iconColor="#FF9F0A"
                        onPress={() => router.push('/projects')}
                    />
                </View>

                {/* App Section */}
                <Text style={styles.sectionLabel}>App</Text>
                <View style={styles.menuCard}>
                    <MenuItem
                        icon="settings-outline"
                        label="Settings"
                        subtitle="App preferences"
                        iconBg="#98989D20"
                        iconColor={COLORS.subtitle}
                        onPress={() => router.push('/settings')}
                    />
                </View>

                {/* Sign Out */}
                <View style={[styles.menuCard, { marginTop: 8 }]}>
                    <MenuItem
                        icon="log-out-outline"
                        label="Sign Out"
                        onPress={handleSignOut}
                        isDestructive
                        showArrow={false}
                    />
                </View>

                {/* App Version */}
                <Text style={styles.version}>FieldWorker v1.0.0</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 100 },

    title: { color: '#fff', fontSize: 28, fontWeight: '700', marginTop: 8, marginBottom: 20 },

    profileCard: {
        backgroundColor: COLORS.card,
        borderRadius: 20,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginBottom: 24,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    avatar: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: COLORS.brand,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
    profileInfo: { flex: 1 },
    profileName: { color: '#fff', fontSize: 16, fontWeight: '700' },
    profileRole: { color: COLORS.subtitle, fontSize: 13, marginTop: 2 },
    profileBadge: {
        backgroundColor: '#30D15820',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    profileBadgeText: { color: '#30D158', fontSize: 12, fontWeight: '600' },

    sectionLabel: {
        color: COLORS.subtitle,
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 8,
        marginLeft: 4,
    },

    menuCard: {
        backgroundColor: COLORS.card,
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 16,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        gap: 12,
    },
    menuIcon: {
        width: 38,
        height: 38,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    menuContent: { flex: 1 },
    menuLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },
    menuSubtitle: { color: COLORS.subtitle, fontSize: 12, marginTop: 2 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: 64 },

    version: { color: COLORS.subtitle, fontSize: 12, textAlign: 'center', marginTop: 8 },
});
