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
import { router, usePathname } from 'expo-router';
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
    success: '#30D158',
    amber: '#FF9F0A',
};

interface MenuItemProps {
    icon: string;
    label: string;
    subtitle?: string;
    route?: string;
    onPress: () => void;
    isDestructive?: boolean;
    showArrow?: boolean;
    iconColor?: string;
    iconBg?: string;
    active?: boolean;
}

function MenuItem({
    icon,
    label,
    subtitle,
    onPress,
    isDestructive,
    showArrow = true,
    iconColor,
    iconBg,
    active,
}: MenuItemProps) {
    const resolvedIconColor = active
        ? COLORS.blue
        : iconColor ?? (isDestructive ? COLORS.danger : COLORS.brand);

    const resolvedIconBg = active
        ? COLORS.blue + '25'
        : iconBg ?? (isDestructive ? COLORS.danger + '20' : COLORS.brand + '20');

    return (
        <TouchableOpacity
            style={[styles.menuItem, active && styles.menuItemActive]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={[styles.menuIcon, { backgroundColor: resolvedIconBg }]}>
                <Ionicons name={icon as any} size={20} color={resolvedIconColor} />
            </View>
            <View style={styles.menuContent}>
                <Text style={[
                    styles.menuLabel,
                    isDestructive && { color: COLORS.danger },
                    active && { color: COLORS.blue, fontWeight: '700' },
                ]}>
                    {label}
                </Text>
                {subtitle && <Text style={styles.menuSubtitle}>{subtitle}</Text>}
            </View>
            {showArrow && (
                <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={active ? COLORS.blue : COLORS.subtitle}
                />
            )}
        </TouchableOpacity>
    );
}

interface SectionProps {
    label: string;
    children: React.ReactNode;
}

function Section({ label, children }: SectionProps) {
    return (
        <View style={styles.section}>
            <Text style={styles.sectionLabel}>{label}</Text>
            <View style={styles.menuCard}>{children}</View>
        </View>
    );
}

export default function MoreScreen() {
    const { currentUser } = useAppContext();
    const pathname = usePathname();

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

    const is = (route: string) => pathname === route || pathname.startsWith(route + '/');

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.title}>More</Text>

                {/* Profile Card */}
                <View style={styles.profileCard}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {currentUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                        </Text>
                    </View>
                    <View style={styles.profileInfo}>
                        <Text style={styles.profileName}>{currentUser.name}</Text>
                        <Text style={styles.profileRole}>{currentUser.role}</Text>
                    </View>
                    <View style={styles.profileBadge}>
                        <View style={styles.profileBadgeDot} />
                        <Text style={styles.profileBadgeText}>Active</Text>
                    </View>
                </View>

                {/* Reports & History */}
                <Section label="Reports & History">
                    <MenuItem
                        icon="document-text-outline"
                        label="Signed Reports"
                        subtitle="View completed daily reports"
                        iconBg={COLORS.blue + '20'}
                        iconColor={COLORS.blue}
                        active={is('/reports')}
                        onPress={() => router.push('/reports')}
                    />
                    <View style={styles.divider} />
                    <MenuItem
                        icon="images-outline"
                        label="Gallery"
                        subtitle="All captured photos"
                        iconBg={COLORS.success + '20'}
                        iconColor={COLORS.success}
                        active={is('/gallery')}
                        onPress={() => router.push('/gallery')}
                    />
                </Section>

                {/* Work */}
                <Section label="Work">
                    <MenuItem
                        icon="business-outline"
                        label="Projects"
                        subtitle="Manage field projects"
                        iconBg={COLORS.amber + '20'}
                        iconColor={COLORS.amber}
                        active={is('/projects')}
                        onPress={() => router.push('/projects')}
                    />
                </Section>

                {/* App */}
                <Section label="App">
                    <MenuItem
                        icon="settings-outline"
                        label="Settings"
                        subtitle="App preferences"
                        iconBg={COLORS.subtitle + '20'}
                        iconColor={COLORS.subtitle}
                        active={is('/settings')}
                        onPress={() => router.push('/settings')}
                    />
                </Section>

                {/* Sign Out */}
                <View style={[styles.menuCard, { marginTop: 4 }]}>
                    <MenuItem
                        icon="log-out-outline"
                        label="Sign Out"
                        onPress={handleSignOut}
                        isDestructive
                        showArrow={false}
                    />
                </View>

                <Text style={styles.version}>FieldWorker v1.0.0</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scrollView: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 100 },

    title: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '700',
        marginTop: 8,
        marginBottom: 20,
    },

    // Profile card
    profileCard: {
        backgroundColor: COLORS.card,
        borderRadius: 20,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginBottom: 28,
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
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: COLORS.success + '20',
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    profileBadgeDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: COLORS.success,
    },
    profileBadgeText: { color: COLORS.success, fontSize: 12, fontWeight: '600' },

    // Sections
    section: { marginBottom: 16 },
    sectionLabel: {
        color: COLORS.subtitle,
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
        marginLeft: 4,
    },

    // Menu
    menuCard: {
        backgroundColor: COLORS.card,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 13,
        paddingHorizontal: 14,
        gap: 12,
    },
    menuItemActive: {
        backgroundColor: COLORS.blue + '12',
        borderLeftWidth: 3,
        borderLeftColor: COLORS.blue,
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
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: COLORS.border,
        marginLeft: 64,
    },

    version: {
        color: COLORS.subtitle,
        fontSize: 12,
        textAlign: 'center',
        marginTop: 20,
        marginBottom: 8,
    },
});
