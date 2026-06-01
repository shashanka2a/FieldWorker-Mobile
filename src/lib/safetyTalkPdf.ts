import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { PDFDocument } from 'pdf-lib';
import { uploadImageToCloudinary } from '@/lib/cloudinary';

type AttendeeForPdf = {
    name: string;
    company?: string;
    signature?: string; // data:image/... or https/file uri
};

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function ensureLocalPdf(uri: string, filename: string): Promise<string> {
    if (uri.startsWith('file://')) return uri;
    if (!uri.startsWith('http')) return uri;
    const dest = `${FileSystem.cacheDirectory}${filename}`;
    const res = await FileSystem.downloadAsync(uri, dest);
    return res.uri;
}

async function readPdfAsBase64(fileUri: string): Promise<string> {
    return FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
}

export async function generateCombinedSafetyTalkPdf(params: {
    templateName: string;
    templatePdfUrl: string;
    completedAtIso: string;
    attendees: AttendeeForPdf[];
}): Promise<{ localUri: string; uploadedUrl: string | null }> {
    const { templateName, templatePdfUrl, completedAtIso, attendees } = params;

    const completedAt = completedAtIso ? new Date(completedAtIso) : new Date();
    const dateLabel = completedAt.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });

    const rows = attendees
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => {
            const name = escapeHtml(a.name);
            const company = escapeHtml(a.company ?? '');
            const signed = !!a.signature;
            const sigImg = signed
                ? `<img src="${a.signature}" style="height:42px;max-width:220px;object-fit:contain;" />`
                : `<span style="color:#9CA3AF;font-style:italic;">Pending</span>`;
            return `
<tr>
  <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;">
    <div style="font-weight:700;color:#111827;">${name}</div>
    <div style="font-size:12px;color:#6B7280;margin-top:2px;">${company || '—'}</div>
  </td>
  <td style="padding:10px 12px;border-bottom:1px solid #E5E7EB;">${sigImg}</td>
</tr>`;
        })
        .join('');

    const coverHtml = `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #111827; padding: 24px; }
    .header { background: #FF6633; color: #fff; padding: 18px 18px 14px; border-radius: 12px; }
    .title { margin: 0; font-size: 18px; font-weight: 800; }
    .meta { margin-top: 8px; font-size: 12px; opacity: 0.9; line-height: 18px; }
    .card { margin-top: 16px; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; }
    .cardHead { background: #F9FAFB; padding: 10px 12px; font-size: 12px; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase; color: #374151; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: #6B7280; background:#FFFFFF; padding: 10px 12px; border-bottom: 1px solid #E5E7EB; }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">${escapeHtml(templateName || 'Safety Talk')}</h1>
    <div class="meta">
      <div><strong>Date:</strong> ${escapeHtml(dateLabel)}</div>
      <div><strong>Attendees:</strong> ${attendees.length}</div>
    </div>
  </div>

  <div class="card">
    <div class="cardHead">Attendee Signatures</div>
    <table>
      <thead>
        <tr>
          <th style="width:52%;">Employee</th>
          <th style="width:48%;">Signature</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td style="padding:12px;color:#6B7280;" colspan="2">No attendees</td></tr>`}
      </tbody>
    </table>
  </div>
</body>
</html>`;

    const coverPdf = await Print.printToFileAsync({ html: coverHtml });
    const coverPdfUri = coverPdf.uri;

    const templateLocalUri = await ensureLocalPdf(templatePdfUrl, `fw_safety_template_${Date.now()}.pdf`);

    const [coverB64, templateB64] = await Promise.all([
        readPdfAsBase64(coverPdfUri),
        readPdfAsBase64(templateLocalUri),
    ]);

    const merged = await PDFDocument.create();
    const coverDoc = await PDFDocument.load(coverB64);
    const templateDoc = await PDFDocument.load(templateB64);

    const coverPages = await merged.copyPages(coverDoc, coverDoc.getPageIndices());
    coverPages.forEach((p) => merged.addPage(p));

    const templatePages = await merged.copyPages(templateDoc, templateDoc.getPageIndices());
    templatePages.forEach((p) => merged.addPage(p));

    const mergedB64 = await merged.saveAsBase64({ dataUri: false });
    const outUri = `${FileSystem.cacheDirectory}fw_safety_talk_${Date.now()}.pdf`;
    await FileSystem.writeAsStringAsync(outUri, mergedB64, { encoding: FileSystem.EncodingType.Base64 });

    const uploadedUrl = await uploadImageToCloudinary(outUri);
    return { localUri: outUri, uploadedUrl };
}

