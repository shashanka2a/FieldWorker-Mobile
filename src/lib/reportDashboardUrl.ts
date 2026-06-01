/**
 * Daily report HTML from the Utility Vision dashboard (or any compatible host).
 * Pattern: {base}/reports/daily?date=YYYY-MM-DD&project={project_name}
 */
const DEFAULT_BASE = 'https://utility-vision-dashboard.vercel.app';

export function getReportDashboardBaseUrl(): string {
    const raw =
        typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_REPORT_DASHBOARD_BASE_URL
            ? String(process.env.EXPO_PUBLIC_REPORT_DASHBOARD_BASE_URL).trim()
            : '';
    return (raw || DEFAULT_BASE).replace(/\/+$/, '');
}

export function buildDailyReportDashboardUrl(
    dateKey: string,
    projectName: string,
    preparedBy?: string
): string {
    const base = getReportDashboardBaseUrl();
    const params = new URLSearchParams();
    params.set('date', dateKey);
    params.set('project', projectName);
    const pb = (preparedBy ?? '').trim();
    if (pb) {
        // Support both common naming conventions on the dashboard side.
        params.set('preparedBy', pb);
        params.set('prepared_by', pb);
    }
    return `${base}/reports/daily?${params.toString()}`;
}

export function buildSurveyTemplateApiUrl(projectName: string): string {
    const base = getReportDashboardBaseUrl();
    const params = new URLSearchParams();
    params.set('project', projectName);
    return `${base}/api/survey/templates?${params.toString()}`;
}
