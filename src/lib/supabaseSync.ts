import { supabase } from './supabase';
import { uploadPhotosArray, uploadImageToCloudinary } from './cloudinary';
import type {
    NoteEntry,
    ChemicalEntry,
    MetricsEntry,
    SurveyEntry,
    EquipmentEntry,
    EquipmentChecklistEntry,
    ObservationEntry,
    IncidentEntry,
    SignedReportEntry,
    AttachmentEntry
} from './dailyReportStorage';
import type { SafetyTalk } from './safetyStorage';

/**
 * Gets the Supabase project UUID based on the project name.
 * If it doesn't exist, it creates it.
 */
export async function getProjectId(projectName: string): Promise<string | null> {
    if (!projectName) return null;
    
    const { data, error } = await supabase
        .from('projects')
        .select('id')
        .eq('name', projectName)
        .single();

    if (data?.id) return data.id;

    // Create if not found
    const { data: newData, error: insertError } = await supabase
        .from('projects')
        .insert([{ name: projectName }])
        .select('id')
        .single();

    if (newData?.id) return newData.id;
    return null;
}

export async function syncNoteToSupabase(dateKey: string, entry: NoteEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    await supabase.from('notes').insert([{
        project_id: projectId,
        category: entry.category,
        notes_text: entry.notes,
        photos: await uploadPhotosArray(entry.photos),
        logged_at: entry.timestamp,
        report_date: dateKey
    }]);
}

export async function syncChemicalsToSupabase(dateKey: string, entry: ChemicalEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    const { data: logData, error: logError } = await supabase
        .from('chemicals_logs')
        .insert([{
            project_id: projectId,
            application_type: entry.applicationType,
            notes: entry.notes || '',
            photos: await uploadPhotosArray(entry.photos),
            logged_at: entry.timestamp,
            report_date: dateKey
        }])
        .select('id')
        .single();

    if (logData?.id && entry.chemicals && entry.chemicals.length > 0) {
        const apps = entry.chemicals.map(c => ({
            chemical_log_id: logData.id,
            name: c.name,
            quantity: Number(c.quantity) || 0,
            unit: c.unit
        }));
        await supabase.from('chemical_applications').insert(apps);
    }
}

export async function syncMetricsToSupabase(dateKey: string, entry: MetricsEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    await supabase.from('metrics').insert([{
        project_id: projectId,
        water_usage: Number(entry.waterUsage) || null,
        acres_completed: Number(entry.acresCompleted) || null,
        green_space_completed: Number(entry.greenSpaceCompleted) || null,
        number_of_operators: Number(entry.numberOfOperators) || null,
        notes: entry.notes || '',
        photos: await uploadPhotosArray(entry.photos),
        logged_at: entry.timestamp,
        report_date: dateKey
    }]);
}

export async function syncSurveyToSupabase(dateKey: string, entry: SurveyEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    const { data: surveyData } = await supabase
        .from('surveys')
        .insert([{
            project_id: projectId,
            logged_at: entry.timestamp,
            report_date: dateKey
        }])
        .select('id')
        .single();

    if (surveyData?.id && entry.questions && entry.questions.length > 0) {
        const qArr = entry.questions.map(q => ({
            survey_id: surveyData.id,
            question: q.question,
            answer: q.answer,
            description: q.description || ''
        }));
        await supabase.from('survey_questions').insert(qArr);
    }
}

export async function syncEquipmentToSupabase(dateKey: string, entry: EquipmentEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    await supabase.from('equipment_logs').insert([{
        project_id: projectId,
        value: entry.value || '',
        unit: entry.unit || '',
        notes: entry.notes || '',
        photos: await uploadPhotosArray(entry.photos),
        logged_at: entry.timestamp,
        report_date: dateKey
    }]);
}

export async function syncEquipmentChecklistToSupabase(dateKey: string, entry: EquipmentChecklistEntry) {
    // Requires the checklist to have project info nested within formData or extended structure 
    // Usually dailyReportStorage passes the entry but the project might be extracted from formData
    const projectName = entry.formData?.siteName || 'Unknown Site';
    const projectId = await getProjectId(projectName);
    if (!projectId) return;

    await supabase.from('equipment_checklists').insert([{
        project_id: projectId,
        form_data: entry.formData || {},
        signature_url: entry.signature ? await uploadImageToCloudinary(entry.signature) : null,
        photos: await uploadPhotosArray(entry.photos),
        logged_at: entry.timestamp,
        report_date: dateKey
    }]);
}

export async function syncObservationToSupabase(dateKey: string, entry: ObservationEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    // Insert or update observation 
    const { data: obsData } = await supabase
        .from('observations')
        .upsert([{
            id: entry.id, // Keep the same UUID string generated by the app!
            project_id: projectId,
            category: entry.category,
            type: entry.type,
            status: entry.status,
            priority: entry.priority,
            description: entry.description || '',
            location: entry.location || '',
            due_date: entry.dueDate ? entry.dueDate : null,
            resolution_photos: await uploadPhotosArray(entry.resolutionPhotos),
            attachments: await uploadPhotosArray(entry.attachments),
            team_notifications: entry.teamNotifications || [],
            logged_at: entry.timestamp,
            report_date: dateKey
        }], { onConflict: 'id' })
        .select('id')
        .single();

    if (obsData?.id && entry.assignees && entry.assignees.length > 0) {
        // Clear old assignees first on upsert
        await supabase.from('observation_assignees').delete().eq('observation_id', obsData.id);
        
        const assignees = entry.assignees.map(a => ({
            observation_id: obsData.id,
            name: a.name,
            company: a.company || ''
        }));
        await supabase.from('observation_assignees').insert(assignees);
    }
}

export async function syncIncidentToSupabase(dateKey: string, entry: IncidentEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    await supabase
        .from('incidents')
        .upsert([{
            id: entry.id, // Using existing local UUID
            project_id: projectId,
            title: entry.title,
            status: entry.status,
            recordable: entry.recordable || false,
            incident_date: entry.incidentDate || null,
            incident_time: entry.incidentTime || '00:00:00',
            location: entry.location,
            injury_illness_type: entry.injuryIllnessType || '',
            injured_employee_info: entry.injuredEmployeeInfo || [],
            incident_investigation: entry.incidentInvestigation || [],
            incident_outcome: entry.incidentOutcome || [],
            description: entry.description || '',
            photos: await uploadPhotosArray(entry.photos),
            logged_at: entry.timestamp,
            report_date: dateKey
        }], { onConflict: 'id' });
}

export async function syncSafetyTalkToSupabase(talk: SafetyTalk) {
    // For SafetyTalks we may need to make sure the template exists 
    // However, the schema allows template_id = null if we just save template_name.
    // SafetyTalk doesn't have a project on its root based on local storage, 
    // let's assign it to a default project or handle appropriately.
    const projectId = await getProjectId('General Site'); 
    if (!projectId) return;

    await supabase.from('safety_talks').upsert([{
        id: talk.id,
        project_id: projectId,
        template_name: talk.templateName,
        scheduled_date: talk.date,
        status: talk.status,
        created_at: talk.createdAt
    }], { onConflict: 'id' });
}

export async function syncSignedReportToSupabase(entry: SignedReportEntry) {
    const projectId = await getProjectId(entry.projectName);
    if (!projectId) return;

    await supabase.from('daily_signed_reports').upsert([{
        project_id: projectId,
        report_date: entry.reportDate,
        prepared_by: entry.preparedBy,
        signature_url: entry.signatureDataUrl ? await uploadImageToCloudinary(entry.signatureDataUrl) : null,
        signed_at: entry.signedAt || null,
        report_url: entry.reportUrl || null,
        unsigned_report_url: entry.unsignedReportUrl || null,
        is_signed: entry.isSigned
    }], { onConflict: 'project_id,report_date' });
}

export async function syncAttachmentToSupabase(dateKey: string, entry: AttachmentEntry) {
    const projectId = await getProjectId(entry.project.name);
    if (!projectId) return;

    await supabase.from('attachments').insert([{
        project_id: projectId,
        notes: entry.notes || '',
        file_names: entry.fileNames || [],
        cloudinary_urls: entry.previews || [],
        logged_at: entry.timestamp,
        report_date: dateKey
    }]);
}
