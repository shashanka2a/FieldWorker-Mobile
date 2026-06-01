/**
 * Site survey questions mix two phrasings:
 * - Problem checks ("Were there any…?"): Yes = issue → warn styling, ask for details on Yes.
 * - Compliance checks ("Were all PPE… followed?"): Yes = good → success styling, ask for details on No.
 */

export function isPositiveComplianceSurveyQuestion(question: string): boolean {
    const q = question.trim().toLowerCase();
    if (!q) return false;
    if (q.includes('ppe') && (q.includes('follow') || q.includes('requirement') || q.includes('compliance')))
        return true;
    if (/\ball\b[\s\S]{0,40}\brequirements?\b[\s\S]{0,24}\b(properly )?followed\b/.test(q)) return true;
    if (/\ball\b[\s\S]{0,40}\brequirements?\b[\s\S]{0,20}\bmet\b/.test(q)) return true;
    if (/\bdid you verify\b/.test(q)) return true;
    if (/\bwere all\b/.test(q) && /\buploaded\b/.test(q) && /\bcorrectly\b/.test(q)) return true;
    return false;
}

/** When true, show the free-text follow-up for this answer. */
export function surveyQuestionWantsDetailsForAnswer(question: string, answer: string): boolean {
    if (!answer || answer === 'N/A') return false;
    if (isPositiveComplianceSurveyQuestion(question)) return answer === 'No';
    return answer === 'Yes';
}

export type SurveyAnswerTone = 'good' | 'bad' | 'neutral';

export function surveyAnswerTone(question: string, answer: string): SurveyAnswerTone {
    if (answer !== 'Yes' && answer !== 'No') return 'neutral';
    if (isPositiveComplianceSurveyQuestion(question)) return answer === 'Yes' ? 'good' : 'bad';
    return answer === 'Yes' ? 'bad' : 'good';
}
