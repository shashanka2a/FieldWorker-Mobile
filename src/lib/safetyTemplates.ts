export interface SafetyTemplate {
    id: string;
    name: string;
    description?: string;
    pdfUrl: string;
}

export const SAFETY_TEMPLATES: SafetyTemplate[] = [
    {
        id: 'aed',
        name: 'Automated External Defibrillator (AED) Safety Talk',
        description: 'AED use, inspection, and discussion points',
        pdfUrl: 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/note.pdf',
    },
    {
        id: 'slips-trips',
        name: 'Slips, Trips & Falls',
        description: 'Prevention and awareness',
        pdfUrl: 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/note.pdf',
    },
    {
        id: 'ppe',
        name: 'Personal Protective Equipment (PPE)',
        description: 'Proper use and inspection of PPE',
        pdfUrl: 'https://www.w3.org/WAI/WCAG21/Techniques/pdf/note.pdf',
    },
];

export function getTemplateById(id: string): SafetyTemplate | undefined {
    return SAFETY_TEMPLATES.find((t) => t.id === id);
}
