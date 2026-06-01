/**
 * Fetch and patch the daily report dashboard HTML so it matches the in-app WebView preview.
 * Used for PDF export (expo-print); inject <base href> so relative asset URLs resolve like WebView baseUrl.
 */

export type PatchDashboardReportParams = {
    preparedBy: string;
    /** When true and signatureDataUrl is set, signature is wired into the dashboard markup. */
    isSignedWithSignature: boolean;
    signatureDataUrl?: string;
};

export function patchDashboardReportHtml(rawHtml: string, p: PatchDashboardReportParams): string {
    let patched = rawHtml;
    const pb = (p.preparedBy ?? '').trim();
    if (pb) {
        patched = patched.replace(/Field Worker/gi, pb);
        patched = patched.replace(/Field team/gi, pb);
        // Utility Vision demo HTML uses this label; it is not covered by the strings above.
        patched = patched.replace(/Test Employee/gi, pb);
    }

    if (p.isSignedWithSignature && p.signatureDataUrl) {
        const sigUrl = p.signatureDataUrl;
        const hadImg = /AUTHORIZED SIGNATURE[\s\S]*?<img[^>]+src=/i.test(patched);
        if (hadImg) {
            patched = patched.replace(
                /(AUTHORIZED SIGNATURE[\s\S]*?<img[^>]+src=["'])([^"']*)(["'])/i,
                (_, a: string, _b: string, c: string) => `${a}${sigUrl}${c}`
            );
        } else {
            patched = patched.replace(
                /(AUTHORIZED SIGNATURE[\s\S]*?>)/i,
                `$1<img src="${sigUrl}" style="height:54px;max-width:200px;border-bottom:1px solid #ccc;margin-top:10px;" />`
            );
        }
    }

    return patched;
}

/** Origin with trailing slash, suitable for <base href>. */
export function dashboardBaseHrefFromUri(dashboardUri: string): string | null {
    try {
        const u = new URL(dashboardUri);
        return `${u.protocol}//${u.host}/`;
    } catch {
        return null;
    }
}

export function injectBaseHrefForPrint(html: string, baseHref: string): string {
    const href = baseHref.endsWith('/') ? baseHref : `${baseHref}/`;
    const baseTag = `<base href="${href}" />`;
    if (/<base\s/i.test(html)) {
        return html.replace(/<base[^>]*>/i, baseTag);
    }
    if (/<head[^>]*>/i.test(html)) {
        return html.replace(/<head[^>]*>/i, (m) => `${m}${baseTag}`);
    }
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>${baseTag}</head><body>${html}</body></html>`;
}

export async function fetchDashboardReportHtmlForExport(
    dashboardUri: string,
    patch: PatchDashboardReportParams
): Promise<{ htmlForPrint: string } | null> {
    const res = await fetch(dashboardUri, { method: 'GET' });
    if (!res.ok) return null;
    const raw = await res.text();
    const baseHref = dashboardBaseHrefFromUri(dashboardUri);
    if (!baseHref) return null;
    const patched = patchDashboardReportHtml(raw, patch);
    const htmlForPrint = injectBaseHrefForPrint(patched, baseHref);
    return { htmlForPrint };
}
