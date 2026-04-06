import * as Print from 'expo-print';
import { uploadImageToCloudinary } from './cloudinary';
import { ReportData, EquipmentChecklistEntry } from './dailyReportStorage';

export async function generateReportPdf(report: ReportData, isSigned: boolean = false): Promise<string | null> {
    const dateLabel = report.date.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
    <style>
        body { font-family: 'Helvetica', sans-serif; padding: 20px; color: #333; }
        .header { background-color: #FF6633; padding: 20px; text-align: center; color: white; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 24px; }
        .header p { margin: 5px 0 0; font-size: 14px; opacity: 0.9; }
        .meta { padding: 15px; background: #f9f9f9; border-bottom: 2px solid #eee; display: flex; justify-content: space-between; font-size: 13px; }
        .section { margin-top: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px; }
        .section-title { font-size: 12px; font-weight: bold; text-transform: uppercase; color: #666; background: #f4f4f4; padding: 8px 12px; margin: 0 -20px 10px; }
        .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
        .row-label { color: #666; }
        .row-value { font-weight: 500; }
        .note-entry { padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
        .note-cat { color: #FF6633; font-size: 11px; font-weight: bold; text-transform: uppercase; }
        .note-text { margin-top: 4px; font-size: 14px; line-height: 1.5; }
        .note-time { color: #999; font-size: 11px; margin-top: 4px; }
        .signature-section { margin-top: 40px; padding: 20px; background: #fcfcfc; border: 1px solid #eee; border-radius: 8px; }
        .signature-title { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 10px; }
        .signature-info { display: flex; align-items: center; gap: 15px; }
        .signature-img { height: 60px; max-width: 200px; border-bottom: 1px solid #ccc; }
        .signature-details { font-size: 14px; }
        .signature-name { font-weight: bold; }
        .signature-date { color: #999; font-size: 12px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; color: white; margin-left: 8px; }
        .badge-negative { background-color: #FF453A; }
        .badge-positive { background-color: #30D158; }
        .badge-critical { background-color: #FF453A; }
        .badge-high { background-color: #FF6633; }
        .survey-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #f9f9f9; }
        .survey-q { font-size: 13px; color: #333; flex: 1; margin-right: 15px; }
        .survey-a { font-weight: bold; font-size: 13px; color: #FF6633; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Daily Field Report</h1>
        <p>FieldWorker Management System</p>
    </div>
    
    <div class="meta">
        <div><strong>Date:</strong> ${dateLabel}</div>
        <div><strong>Project:</strong> ${report.projectName}</div>
    </div>

    ${report.notes.length > 0 ? `
    <div class="section">
        <div class="section-title">General Notes</div>
        ${report.notes.map(note => `
            <div class="note-entry">
                <div class="note-cat">${note.category}</div>
                <div class="note-text">${note.notes}</div>
                ${note.photos && note.photos.length > 0 ? `
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                    ${note.photos.map(p => `<img src="${p}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;" />`).join('')}
                </div>
                ` : ''}
                <div class="note-time">${new Date(note.timestamp).toLocaleTimeString()}</div>
            </div>
        `).join('')}
    </div>
    ` : ''}

    ${report.metrics.length > 0 ? `
    <div class="section">
        <div class="section-title">Daily Metrics</div>
        ${report.metrics.map(m => `
            <div class="row"><span class="row-label">Water Usage</span><span class="row-value">${m.waterUsage || '—'} GAL</span></div>
            <div class="row"><span class="row-label">Acres Completed</span><span class="row-value">${m.acresCompleted || '—'} acres</span></div>
            <div class="row"><span class="row-label">Operators</span><span class="row-value">${m.numberOfOperators || '—'}</span></div>
            ${m.notes ? `<div class="row"><span class="row-label">Notes</span><span class="row-value">${m.notes}</span></div>` : ''}
            ${m.photos && m.photos.length > 0 ? `
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; padding: 0 10px;">
                ${m.photos.map(p => `<img src="${p}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;" />`).join('')}
            </div>
            ` : ''}
        `).join('')}
    </div>
    ` : ''}

    ${report.chemicals.length > 0 ? `
    <div class="section">
        <div class="section-title">Chemicals Left on Truck</div>
        ${report.chemicals.map(entry => `
            <div style="font-size: 11px; background: #eee; padding: 2px 10px; margin: 10px 0 5px;">Method: ${entry.applicationType}</div>
            ${entry.chemicals.map(chem => `
                <div class="row"><span class="row-label">${chem.name}</span><span class="row-value">${chem.quantity} ${chem.unit}</span></div>
            `).join('')}
            ${entry.photos && entry.photos.length > 0 ? `
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; padding: 0 10px;">
                ${entry.photos.map(p => `<img src="${p}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;" />`).join('')}
            </div>
            ` : ''}
        `).join('')}
    </div>
    ` : ''}

    ${report.equipment.filter(e => (e as any).type === 'checklist').length > 0 ? `
    <div class="section">
        <div class="section-title">Equipment Checklist</div>
        ${report.equipment.filter(e => (e as any).type === 'checklist').map(e => {
            const cl = e as EquipmentChecklistEntry;
            return `
                <div class="row"><span class="row-label">Machine #</span><span class="row-value">${cl.formData.machineNumber || '—'}</span></div>
                <div class="row"><span class="row-label">Operator</span><span class="row-value">${cl.formData.operatorName || '—'}</span></div>
                <div class="row"><span class="row-label">ASV Hours</span><span class="row-value">${cl.formData.asvHours || '—'}</span></div>
                <div class="row"><span class="row-label">Oil/Coolant</span><span class="row-value">${cl.formData.motorOil || 'OK'} / ${cl.formData.coolant || 'OK'}</span></div>
                ${cl.formData.repairsNotes ? `<div class="row"><span class="row-label">Issues</span><span class="row-value">${cl.formData.repairsNotes}</span></div>` : ''}
                ${cl.photos && cl.photos.length > 0 ? `
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; padding: 0 10px;">
                    ${cl.photos.map(p => `<img src="${p}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;" />`).join('')}
                </div>
                ` : ''}
            `;
        }).join('')}
    </div>
    ` : ''}

    ${report.observations.length > 0 ? `
    <div class="section">
        <div class="section-title">Observations</div>
        ${report.observations.map(obs => `
            <div class="note-entry">
                <div class="note-cat" style="color: ${obs.category === 'Negative' ? '#FF453A' : '#30D158'}">
                    ${obs.category} <span class="badge ${obs.priority === 'Critical' ? 'badge-critical' : 'badge-high'}">${obs.priority}</span>
                </div>
                <div class="note-text"><strong>${obs.type}</strong></div>
                ${obs.description ? `<div class="note-text" style="color: #666; font-size: 12px;">${obs.description}</div>` : ''}
                ${(obs.attachments?.length || obs.resolutionPhotos?.length) ? `
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; padding: 0 10px;">
                    ${(obs.attachments || []).map(p => `<img src="${p}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;" />`).join('')}
                    ${(obs.resolutionPhotos || []).map(p => `<img src="${p}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;" />`).join('')}
                </div>
                ` : ''}
                <div class="note-time">Status: ${obs.status}</div>
            </div>
        `).join('')}
    </div>
    ` : ''}

    ${report.incidents.length > 0 ? `
    <div class="section">
        <div class="section-title">Incidents</div>
        ${report.incidents.map(inc => `
            <div class="note-entry">
                <div class="note-text"><strong>${inc.title || 'Untitled Incident'}</strong></div>
                <div style="font-size: 11px; color: #666;">Date: ${inc.incidentDate} ${inc.incidentTime}</div>
                ${inc.description ? `<div class="note-text" style="color: #666; font-size: 12px;">${inc.description}</div>` : ''}
                ${inc.photos && inc.photos.length > 0 ? `
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; padding: 0 10px;">
                    ${inc.photos.map(p => `<img src="${p}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px; border: 1px solid #eee;" />`).join('')}
                </div>
                ` : ''}
                <div class="note-time">Status: ${inc.status} ${inc.recordable ? ' &bull; RECORDABLE' : ''}</div>
            </div>
        `).join('')}
    </div>
    ` : ''}

    ${report.survey.length > 0 ? `
    <div class="section">
        <div class="section-title">Site Survey Highlights</div>
        ${report.survey[report.survey.length - 1].questions.filter(q => q.answer === 'Yes' || q.answer === 'No').map(q => `
            <div class="survey-row">
                <div class="survey-q">${q.question}</div>
                <div class="survey-a" style="color: ${q.answer === 'Yes' ? '#FF453A' : '#30D158'}">${q.answer}</div>
            </div>
        `).join('')}
    </div>
    ` : ''}

    ${report.attachments.length > 0 ? `
    <div class="section">
        <div class="section-title">General Attachments</div>
        ${report.attachments.map(att => `
            <div class="note-entry">
                ${att.notes ? `<div class="note-text">${att.notes}</div>` : ''}
                <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
                    ${att.previews?.map(p => `<img src="${p}" style="width: 120px; height: 120px; object-fit: cover; border-radius: 6px; border: 1px solid #eee;" />`).join('')}
                </div>
                <div class="note-time">${new Date(att.timestamp).toLocaleString()}</div>
            </div>
        `).join('')}
    </div>
    ` : ''}

    ${isSigned && report.signed ? `
    <div class="signature-section">
        <div class="signature-title">Authorized Signature</div>
        <div class="signature-info">
            ${report.signed.signatureDataUrl ? `<img src="${report.signed.signatureDataUrl}" class="signature-img" />` : ''}
            <div class="signature-details">
                <div class="signature-name">${report.signed.preparedBy}</div>
                <div class="signature-date">Electronically Signed on ${new Date(report.signed.signedAt || '').toLocaleString()}</div>
            </div>
        </div>
    </div>
    ` : `
    <div class="signature-section">
        <div class="signature-title">Signature Status</div>
        <div style="color: #999; font-style: italic;">Document Not Yet Signed</div>
    </div>
    `}

    <div style="margin-top: 30px; text-align: center; color: #999; font-size: 10px;">
        Generated by FieldWorker Mobile App &bull; Secure Document
    </div>
</body>
</html>
    `;

    try {
        const { uri } = await Print.printToFileAsync({ html });
        console.log('PDF generated at:', uri);
        
        // Upload to Cloudinary
        const cloudinaryUrl = await uploadImageToCloudinary(uri);
        return cloudinaryUrl;
    } catch (error) {
        console.error('Error generating/uploading PDF:', error);
        return null;
    }
}
