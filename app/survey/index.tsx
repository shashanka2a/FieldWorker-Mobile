import React, { useMemo, useState } from 'react';
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
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenHeader } from '@/components/ScreenHeader';
import { useAppContext } from '@/context/AppContext';
import {
    createUuid,
    getDateKey,
    getSubmittedAtIso,
    saveSurvey,
    getSurveyForDate,
    SurveyQuestionEntry,
    SurveyEntry,
} from '@/lib/dailyReportStorage';
import { mergeLocalRemotePreferSupabase, matchProjectPredicate } from '@/lib/mergeLocalRemote';
import { fetchSurveyFromSupabase } from '@/lib/supabaseSync';
import { buildSurveyTemplateApiUrl } from '@/lib/reportDashboardUrl';
import {
    isPositiveComplianceSurveyQuestion,
    surveyQuestionWantsDetailsForAnswer,
} from '@/lib/surveyQuestionSemantics';
import { useFormDraft, clearFormDraft } from '@/hooks/useFormDraft';
import { KeyboardAwareScrollView, KeyboardField, ScrollInputField } from '@/components/KeyboardAwareScrollView';

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
    'Did you verify all employees clocked in and out to the correct project?',
    'Were all receipts uploaded to DEXT correctly?',
    'Was any emergency equipment inspected or used?',
    'Were there any trespassing or security incidents?',
    'Were there any environmental concerns (spill, contamination)?',
    'Is any additional follow-up required for tomorrow?',
];

const DEFAULT_ANSWER_OPTIONS: Answer[] = ['N/A', 'No', 'Yes'];

function answerChipColors(question: string, opt: string): { bg: string; textColor: string } {
    if (opt === 'N/A' || opt === '') {
        return { bg: COLORS.subtitle + '30', textColor: COLORS.subtitle };
    }
    if (opt !== 'Yes' && opt !== 'No') {
        return { bg: COLORS.subtitle + '30', textColor: COLORS.subtitle };
    }
    const compliance = isPositiveComplianceSurveyQuestion(question);
    if (opt === 'Yes') {
        return compliance
            ? { bg: COLORS.success + '30', textColor: COLORS.success }
            : { bg: COLORS.danger + '30', textColor: COLORS.danger };
    }
    return compliance
        ? { bg: COLORS.danger + '30', textColor: COLORS.danger }
        : { bg: COLORS.success + '30', textColor: COLORS.success };
}

export default function SurveyScreen() {
    const { selectedDate, selectedProject } = useAppContext();
    const dateKey = useMemo(() => getDateKey(selectedDate), [selectedDate]);
    const projectKey = (selectedProject?.id || selectedProject?.name || 'project').replace(/\s+/g, '_');
    const [answerOptions, setAnswerOptions] = useState<Answer[]>(DEFAULT_ANSWER_OPTIONS);
    const [questions, setQuestions] = useState<SurveyQuestionEntry[]>(
        SURVEY_QUESTIONS.map((q, i) => ({ id: String(i + 1), question: q, answer: '', description: '' }))
    );
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [entryId, setEntryId] = useState<string | null>(null);
    const [mode, setMode] = useState<'overview' | 'edit'>('edit');
    const [surveyLoadReady, setSurveyLoadReady] = useState(false);
    const surveyDraftKey = useMemo(
        () => `fw_draft_survey_${dateKey}_${projectKey}_${entryId ?? 'new'}`,
        [dateKey, projectKey, entryId]
    );

    const dateLabel = selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    useFocusEffect(
        React.useCallback(() => {
            let active = true;
            setSurveyLoadReady(false);
            (async () => {
                try {
                    // Load per-project template (dashboard API), fallback to hardcoded list.
                    try {
                        const projectName = selectedProject?.name ?? '';
                        if (projectName && projectName !== 'No Project Selected') {
                            const res = await fetch(buildSurveyTemplateApiUrl(projectName));
                            if (res.ok) {
                                const json = (await res.json()) as any;
                                const rawQuestions = Array.isArray(json?.questions) ? json.questions : [];
                                const rawAnswers = Array.isArray(json?.answerChoices) ? json.answerChoices : null;

                                const templateQuestions: SurveyQuestionEntry[] = rawQuestions
                                    .map((q: any, idx: number) => ({
                                        id: String(q?.id ?? idx + 1),
                                        question: String(q?.question ?? '').trim(),
                                        answer: '',
                                        description: '',
                                    }))
                                    .filter((q: SurveyQuestionEntry) => q.question.length > 0);

                                const templateAnswerOptions: Answer[] =
                                    rawAnswers && rawAnswers.length > 0
                                        ? (rawAnswers
                                              .map((a: any) => String(a ?? '').trim())
                                              .filter(Boolean) as Answer[])
                                        : DEFAULT_ANSWER_OPTIONS;

                                if (active) {
                                    if (templateQuestions.length > 0) setQuestions(templateQuestions);
                                    setAnswerOptions(templateAnswerOptions);
                                }
                            }
                        }
                    } catch {
                        // ignore (offline / bad response)
                    }

                    const localData = await getSurveyForDate(dateKey);
                    const remoteData = await fetchSurveyFromSupabase(
                        dateKey,
                        selectedDate,
                        selectedProject?.id ?? '',
                        selectedProject?.name ?? ''
                    );
                    const data = mergeLocalRemotePreferSupabase(
                        localData,
                        remoteData,
                        matchProjectPredicate<SurveyEntry>(selectedProject?.name)
                    );
                    const sortedSurvey = [...data].sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
                    // Pre-fill with the first/most recent survey entry if it exists
                    if (sortedSurvey.length > 0 && active) {
                        const latest = sortedSurvey[sortedSurvey.length - 1];
                        setEntryId(latest.id);
                        setMode('overview');
                        if (latest.questions && latest.questions.length > 0) {
                            setQuestions(latest.questions);
                        }
                    } else if (active) {
                        setEntryId(null);
                        setMode('edit');
                    }
                } finally {
                    if (active) setSurveyLoadReady(true);
                }
            })();
            return () => { active = false; };
        }, [dateKey, selectedDate, selectedProject?.id, selectedProject?.name])
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

    const surveyDraftSnapshot = useMemo(
        () => JSON.stringify({ questions, answerOptions }),
        [questions, answerOptions]
    );

    useFormDraft({
        storageKey: surveyDraftKey,
        active: surveyLoadReady && mode === 'edit',
        snapshotJson: surveyDraftSnapshot,
        hydrate: (parsed) => {
            if (!parsed || typeof parsed !== 'object') return;
            const p = parsed as { questions?: SurveyQuestionEntry[]; answerOptions?: string[] };
            if (Array.isArray(p.answerOptions) && p.answerOptions.length > 0) {
                setAnswerOptions(p.answerOptions as Answer[]);
            }
            if (!Array.isArray(p.questions) || p.questions.length === 0) return;
            setQuestions((cur) => {
                const byId = new Map(p.questions!.map((q) => [String(q.id), q]));
                return cur.map((q) => {
                    const dq = byId.get(String(q.id));
                    if (!dq) return q;
                    return {
                        ...q,
                        answer: (dq.answer ?? q.answer) as Answer,
                        description: dq.description ?? q.description ?? '',
                    };
                });
            });
        },
        isNonEmpty: () =>
            questions.some((q) => !!q.answer || (q.description?.trim() ?? '').length > 0),
    });

    const handleSubmit = async () => {
        const unanswered = questions.filter((q) => q.answer === '');
        if (unanswered.length > 0) {
            Alert.alert('Incomplete', `${unanswered.length} question${unanswered.length > 1 ? 's' : ''} still need answers.`);
            return;
        }
        setSubmitting(true);
        try {
            const id = entryId ?? createUuid();
            await saveSurvey(dateKey, {
                id,
                project: selectedProject,
                timestamp: getSubmittedAtIso(),
                questions,
            });
            await clearFormDraft(surveyDraftKey);
            setEntryId(id); // prevents duplicates on repeated saves
            setSuccess(true);
            setMode('overview');
            setTimeout(() => setSuccess(false), 1200);
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
                rightElement={
                    mode === 'overview' ? (
                        <TouchableOpacity style={styles.headerEditBtn} onPress={() => setMode('edit')} activeOpacity={0.85}>
                            <Ionicons name="create-outline" size={18} color="#fff" />
                            <Text style={styles.headerEditText}>Edit</Text>
                        </TouchableOpacity>
                    ) : null
                }
            />
            <KeyboardAwareScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                {/* Progress bar */}
                <View style={styles.progressWrap}>
                    <View style={styles.progressBar}>
                        <View style={[styles.progressFill, { width: `${(answeredCount / questions.length) * 100}%` as any }]} />
                    </View>
                    <Text style={styles.progressText}>{dateLabel} — {selectedProject.name}</Text>
                </View>

                {questions.map((q, idx) => {
                    const wantsDetails = surveyQuestionWantsDetailsForAnswer(q.question, q.answer);
                    const detailPlaceholder = isPositiveComplianceSurveyQuestion(q.question)
                        ? 'Describe what was missing or not followed…'
                        : 'Describe the incident or concern…';
                    return (
                        <KeyboardField key={q.id} style={styles.questionCard}>
                            <Text style={styles.questionNum}>Question {idx + 1} of {questions.length}</Text>
                            <Text style={styles.questionText}>{q.question}</Text>

                            <View style={styles.answerRow}>
                                {answerOptions.map((opt) => {
                                    const isSelected = q.answer === opt;
                                    const style = answerChipColors(q.question, opt);
                                    return (
                                        <TouchableOpacity
                                            key={opt}
                                            style={[
                                                styles.answerBtn,
                                                isSelected && style ? { backgroundColor: style.bg, borderColor: style.textColor } : null,
                                            ]}
                                            onPress={() => { if (mode === 'edit') setAnswer(idx, opt); }}
                                            activeOpacity={mode === 'edit' ? 0.7 : 1}
                                        >
                                            {isSelected && style && <Ionicons name="checkmark" size={14} color={style.textColor} />}
                                            <Text style={[styles.answerText, isSelected && style ? { color: style.textColor } : null]}>{opt}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {/* Problem questions: detail on "Yes". Compliance (e.g. PPE): detail on "No". */}
                            {wantsDetails && (
                                <ScrollInputField>
                                    <TextInput
                                        style={styles.descInput}
                                        value={q.description}
                                        onChangeText={(v) => { if (mode === 'edit') setDescription(idx, v); }}
                                        placeholder={detailPlaceholder}
                                        placeholderTextColor={COLORS.subtitle}
                                        multiline
                                        numberOfLines={3}
                                        textAlignVertical="top"
                                        editable={mode === 'edit'}
                                    />
                                </ScrollInputField>
                            )}

                            {mode === 'overview' && !wantsDetails && q.description?.trim() ? (
                                <View style={styles.readOnlyDescWrap}>
                                    <Text style={styles.readOnlyDescLabel}>Details</Text>
                                    <Text style={styles.readOnlyDescText}>{q.description}</Text>
                                </View>
                            ) : null}
                        </KeyboardField>
                    );
                })}

                {mode === 'edit' && (
                    <TouchableOpacity
                        style={[styles.submitBtn, (submitting || success) && { opacity: 0.7 }]}
                        onPress={handleSubmit}
                        disabled={submitting || success}
                    >
                        {submitting ? <ActivityIndicator color="#fff" /> :
                            success ? <><Ionicons name="checkmark-circle" size={20} color="#fff" /><Text style={styles.submitText}>Saved!</Text></> :
                                <Text style={styles.submitText}>Save Survey</Text>}
                    </TouchableOpacity>
                )}
            </KeyboardAwareScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.surface },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 48, gap: 14 },
    headerEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.brand, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
    headerEditText: { color: '#fff', fontWeight: '800', fontSize: 13 },
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
    readOnlyDescWrap: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
    readOnlyDescLabel: { color: COLORS.subtitle, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    readOnlyDescText: { color: '#fff', fontSize: 13, lineHeight: 18 },
    submitBtn: { backgroundColor: COLORS.brand, borderRadius: 16, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8, shadowColor: COLORS.brand, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 },
    submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
