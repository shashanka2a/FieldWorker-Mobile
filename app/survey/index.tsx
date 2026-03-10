import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';
import { getDateKey, saveSurvey, getSurveyForDate, SurveyQuestionEntry } from '@/lib/dailyReportStorage';

const COLORS = {
    brand: '#FF6633',
    surface: '#1C1C1E',
    card: '#2C2C2E',
    border: '#3A3A3C',
    subtitle: '#98989D',
    success: '#30D158',
    danger: '#FF453A',
};

type Answer = 'N/A' | 'No' | 'Yes' | '';

const SURVEY_QUESTIONS = [
    'Were there any equipment malfunctions on-site today?',
    'Were there any accidents or near-misses?',
    'Were there any weather delays today?',
    'Were there any safety concerns or hazards observed?',
    'Were all PPE requirements properly followed?',
    'Was any emergency equipment inspected or used?',
    'Were there any trespassing or security incidents?',
    'Were there any environmental concerns (spill, contamination)?',
    'Is any additional follow-up required for tomorrow?',
];

const ANSWER_OPTIONS: Answer[] = ['N/A', 'No', 'Yes'];

const ANSWER_STYLES: Record<string, { bg: string; textColor: string }> = {
    'N/A': { bg: COLORS.subtitle + '30', textColor: COLORS.subtitle },
    'No': { bg: COLORS.success + '30', textColor: COLORS.success },
    'Yes': { bg: COLORS.danger + '30', textColor: COLORS.danger },
};

export default function SurveyScreen() {
    const { selectedDate, selectedProject } = useAppContext();
    const [questions, setQuestions] = useState<SurveyQuestionEntry[]>(
        SURVEY_QUESTIONS.map((q, i) => ({ id: i + 1, question: q, answer: '', description: '' }))
    );
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const dateLabel = selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    useFocusEffect(
        React.useCallback(() => {
            let active = true;
            (async () => {
                const dateKey = getDateKey(selectedDate);
                const data = await getSurveyForDate(dateKey);
                // Pre-fill with the first/most recent survey entry if it exists
                if (data.length > 0 && active) {
                    const latest = data[data.length - 1]; // if multiple, use latest
                    if (latest.questions && latest.questions.length > 0) {
                        setQuestions(latest.questions);
                    }
                }
            })();
            return () => { active = false; };
        }, [selectedDate])
    );

    const setAnswer = (idx: number, answer: Answer) => {
        setQuestions((prev) => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], answer };
            return updated;
        });
    };

    const setDescription = (idx: number, description: string) => {
        setQuestions((prev) => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], description };
            return updated;
        });
    };

    const handleSubmit = async () => {
        const unanswered = questions.filter((q) => q.answer === '');
        if (unanswered.length > 0) {
            Alert.alert('Incomplete', `${unanswered.length} question${unanswered.length > 1 ? 's' : ''} still need answers.`);
            return;
        }
        setSubmitting(true);
        try {
            const dateKey = getDateKey(selectedDate);
            await saveSurvey(dateKey, {
                id: Date.now().toString(),
                project: selectedProject,
                timestamp: new Date().toISOString(),
                questions,
            });
            setSuccess(true);
            setTimeout(() => router.back(), 1200);
        } catch {
            Alert.alert('Error', 'Failed to save survey. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const answeredCount = questions.filter((q) => q.answer !== '').length;

    return (
        <View style={styles.container}>
            <ScreenHeader
                title="Site Survey"
                subtitle={`${answeredCount}/${questions.length} answered`}
            />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

                {/* Progress bar */}
                <View style={styles.progressWrap}>
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${(answeredCount / questions.length) * 100}%` as any }]} />
                    </View>
                    <Text style={styles.progressText}>{dateLabel} — {selectedProject.name}</Text>
                </View>

                {questions.map((q, idx) => {
                    const hasYes = q.answer === 'Yes';
                    return (
                        <View key={q.id} style={styles.questionCard}>
                            <Text style={styles.questionNum}>Question {idx + 1} of {questions.length}</Text>
                            <Text style={styles.questionText}>{q.question}</Text>

                            <View style={styles.answerRow}>
                                {ANSWER_OPTIONS.map((opt) => {
                                    const isSelected = q.answer === opt;
                                    const style = ANSWER_STYLES[opt];
                                    return (
                                        <TouchableOpacity
                                            key={opt}
                                            style={[
                                                styles.answerBtn,
                                                isSelected && { backgroundColor: style.bg, borderColor: style.textColor },
                                            ]}
                                            onPress={() => setAnswer(idx, opt)}
                                        >
                                            {isSelected && <Ionicons name="checkmark" size={14} color={style.textColor} />}
                                            <Text style={[styles.answerText, isSelected && { color: style.textColor }]}>{opt}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {/* Show description input for Yes answers */}
                            {hasYes && (
                                <TextInput
                                    style={styles.descInput}
                                    value={q.description}
                                    onChangeText={(v) => setDescription(idx, v)}
                                    placeholder="Describe the incident or concern..."
                                    placeholderTextColor={COLORS.subtitle}
                                    multiline
                                    numberOfLines={3}
                                    textAlignVertical="top"
                                />
                            )}
                        </View>
                    );
                })}

                <TouchableOpacity
                    style={[styles.submitBtn, (submitting || success) && { opacity: 0.7 }]}
                    onPress={handleSubmit}
                    disabled={submitting || success}
                >
                    {submitting ? <ActivityIndicator color="#fff" /> :
                        success ? <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.submitText}>Saved!</Text></> :
                            <Text style={styles.submitText}>Submit Survey</Text>}
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 48, gap: 14 },
    progressWrap: { gap: 6 },
    progressBar: { height: 4, backgroundColor: COLORS.border, borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: COLORS.brand, borderRadius: 2 },
    progressText: { color: COLORS.subtitle, fontSize: 12 },
    questionCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    questionNum: { color: COLORS.subtitle, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    questionText: { color: '#fff', fontSize: 15, lineHeight: 22 },
    answerRow: { flexDirection: 'row', gap: 8 },
    answerBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: COLORS.surface,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.border,
    },
    answerText: { color: COLORS.subtitle, fontSize: 14, fontWeight: '600' },
    descInput: {
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        padding: 12,
        color: '#fff',
        fontSize: 14,
        minHeight: 80,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: COLORS.danger + '60',
        textAlignVertical: 'top',
    },
    submitBtn: { backgroundColor: COLORS.brand, borderRadius: 16, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8, shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
