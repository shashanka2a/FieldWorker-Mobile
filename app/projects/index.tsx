import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    success: '#30D158',
};

const PROJECT_ICONS: string[] = ['sunny', 'water', 'flash'];

export default function ProjectsScreen() {
    const { projects, selectedProject, setSelectedProject, loadingProjects, refreshProjects } = useAppContext();

    if (loadingProjects) {
        return (
            <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
                <ScreenHeader title="Projects" subtitle="Select active project" />
                <ActivityIndicator size="large" color={COLORS.brand} style={{ marginTop: 60 }} />
                <Text style={{ color: COLORS.subtitle, marginTop: 12, fontSize: 14 }}>Loading projects...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScreenHeader title="Projects" subtitle="Select active project" />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                <Text style={styles.sectionLabel}>Active Projects</Text>
                {projects.length === 0 ? (
                    <View style={[styles.infoCard, { marginTop: 20, alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }]}>
                        <Ionicons name="folder-open-outline" size={32} color={COLORS.subtitle} />
                        <Text style={{ color: COLORS.subtitle, fontSize: 14, textAlign: 'center' }}>{'No projects found in the database.\nAsk your supervisor to add projects.'}</Text>
                    </View>
                ) : projects.map((project, idx) => {
                    const isActive = project.id === selectedProject.id;
                    return (
                        <TouchableOpacity
                            key={project.id ?? project.name}
                            style={[styles.projectCard, isActive && styles.projectCardActive]}
                            onPress={() => setSelectedProject(project)}
                            activeOpacity={0.8}
                        >
                            <View style={[styles.projectIcon, isActive && { backgroundColor: COLORS.brand }]}>
                                <Ionicons name={PROJECT_ICONS[idx % PROJECT_ICONS.length] as any} size={22} color={isActive ? '#fff' : COLORS.brand} />
                            </View>
                            <View style={styles.projectInfo}>
                                <Text style={[styles.projectName, isActive && styles.projectNameActive]}>
                                    {project.name}
                                </Text>
                                <Text style={styles.projectStatus}>
                                    {isActive ? 'Currently Active' : 'Tap to select'}
                                </Text>
                            </View>
                            {isActive ? (
                                <Ionicons name="checkmark-circle" size={22} color={COLORS.brand} />
                            ) : (
                                <Ionicons name="ellipse-outline" size={22} color={COLORS.subtitle} />
                            )}
                        </TouchableOpacity>
                    );
                })}

                <View style={styles.infoCard}>
                    <Ionicons name="information-circle-outline" size={18} color={COLORS.subtitle} />
                    <Text style={styles.infoText}>
                        The selected project is used for all new daily log entries. Contact your supervisor to add or modify projects.
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 40, gap: 12 },
    sectionLabel: { color: COLORS.subtitle, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
    projectCard: {
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        borderWidth: 1.5,
        borderColor: COLORS.border,
    },
    projectCardActive: { borderColor: COLORS.brand, backgroundColor: COLORS.brand + '10' },
    projectIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.brand + '20', alignItems: 'center', justifyContent: 'center' },
    projectInfo: { flex: 1, gap: 3 },
    projectName: { color: '#fff', fontSize: 16, fontWeight: '700' },
    projectNameActive: { color: COLORS.brand },
    projectStatus: { color: COLORS.subtitle, fontSize: 12 },
    infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: COLORS.card, borderRadius: 14, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, marginTop: 8 },
    infoText: { flex: 1, color: COLORS.subtitle, fontSize: 13, lineHeight: 20 },
});
