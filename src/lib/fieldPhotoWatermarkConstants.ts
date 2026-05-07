/** Default company line on field photo watermarks (override with EXPO_PUBLIC_COMPANY_NAME). */
export const DEFAULT_FIELD_COMPANY_NAME = "Wick'd Environmental Technologies, LLC";

export function getFieldCompanyDisplayName(): string {
    return process.env.EXPO_PUBLIC_COMPANY_NAME?.trim() || DEFAULT_FIELD_COMPANY_NAME;
}
