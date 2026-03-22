import AsyncStorage from '@react-native-async-storage/async-storage';
import { syncSafetyTalkToSupabase } from './supabaseSync';

export type SafetyTalkStatus = 'upcoming' | 'missed' | 'conducted';

export interface SafetyTalk {
    id: string;
    templateId: string;
    templateName: string;
    /** ISO date-only string: YYYY-MM-DD */
    date: string;
    status: SafetyTalkStatus;
    createdAt: string;
}

const STORAGE_KEY = 'safety_talks';

async function readTalks(): Promise<SafetyTalk[]> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function writeTalks(talks: SafetyTalk[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(talks));
}

export async function getSafetyTalks(): Promise<SafetyTalk[]> {
    return readTalks();
}

export async function getTalkById(id: string): Promise<SafetyTalk | undefined> {
    const talks = await readTalks();
    return talks.find((t) => t.id === id);
}

export async function addScheduledSafetyTalk(
    dateKey: string,
    templateId: string,
    templateName: string
): Promise<void> {
    const talks = await readTalks();
    const talk: SafetyTalk = {
        id: Date.now().toString(),
        templateId,
        templateName,
        date: dateKey,
        status: 'upcoming',
        createdAt: new Date().toISOString(),
    };
    talks.push(talk);
    await writeTalks(talks);
    syncSafetyTalkToSupabase(talk).catch(console.error);
}

export async function updateScheduledSafetyTalk(
    id: string,
    dateKey: string,
    templateId: string,
    templateName: string
): Promise<void> {
    const talks = await readTalks();
    const idx = talks.findIndex((t) => t.id === id);
    if (idx === -1) return;
    talks[idx] = { ...talks[idx], date: dateKey, templateId, templateName };
    await writeTalks(talks);
    syncSafetyTalkToSupabase(talks[idx]).catch(console.error);
}

export async function deleteScheduledSafetyTalk(id: string): Promise<void> {
    const talks = await readTalks();
    await writeTalks(talks.filter((t) => t.id !== id));
}

export async function markSafetyTalkConducted(id: string): Promise<void> {
    const talks = await readTalks();
    const idx = talks.findIndex((t) => t.id === id);
    if (idx === -1) return;
    talks[idx] = { ...talks[idx], status: 'conducted' };
    await writeTalks(talks);
    syncSafetyTalkToSupabase(talks[idx]).catch(console.error);
}
