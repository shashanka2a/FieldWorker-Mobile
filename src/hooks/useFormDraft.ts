import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEBOUNCE_MS = 500;

export async function clearFormDraft(storageKey: string): Promise<void> {
    try {
        await AsyncStorage.removeItem(storageKey);
    } catch {
        // ignore
    }
}

/**
 * Loads a JSON draft when `active` becomes true, then debounces saves of `snapshotJson`.
 * Use refs for hydrate / isNonEmpty so they do not need to be memo-stable.
 */
export function useFormDraft(options: {
    storageKey: string;
    /** Wait until server / baseline data is ready (e.g. edit screen finished loading). */
    active: boolean;
    snapshotJson: string;
    hydrate: (parsed: unknown) => void;
    isNonEmpty: () => boolean;
}): void {
    const { storageKey, active, snapshotJson } = options;
    const hydrateRef = useRef(options.hydrate);
    const isNonEmptyRef = useRef(options.isNonEmpty);
    hydrateRef.current = options.hydrate;
    isNonEmptyRef.current = options.isNonEmpty;

    const [hydrationComplete, setHydrationComplete] = useState(false);

    useEffect(() => {
        if (!active) {
            setHydrationComplete(false);
            return;
        }
        let cancelled = false;
        setHydrationComplete(false);
        (async () => {
            try {
                const raw = await AsyncStorage.getItem(storageKey);
                if (cancelled) return;
                if (raw) {
                    try {
                        hydrateRef.current(JSON.parse(raw));
                    } catch {
                        // ignore corrupt draft
                    }
                }
            } finally {
                if (!cancelled) setHydrationComplete(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [storageKey, active]);

    useEffect(() => {
        if (!active || !hydrationComplete) return;
        const t = setTimeout(async () => {
            try {
                if (isNonEmptyRef.current()) {
                    await AsyncStorage.setItem(storageKey, snapshotJson);
                } else {
                    await AsyncStorage.removeItem(storageKey);
                }
            } catch (e) {
                console.warn('[formDraft]', e);
            }
        }, DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [active, hydrationComplete, storageKey, snapshotJson]);
}
