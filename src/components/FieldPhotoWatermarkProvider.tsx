import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image, View, Text, StyleSheet, Image as RNImage } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { Asset } from 'expo-asset';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import { useAppContext } from '@/context/AppContext';
import { getFieldCompanyDisplayName } from '@/lib/fieldPhotoWatermarkConstants';

const LOGO_SRC = require('../../assets/image.png');
/** Stable aspect ratio so the logo reserves space at the bottom before decode. */
const LOGO_META = RNImage.resolveAssetSource(LOGO_SRC);
const LOGO_ASPECT = LOGO_META?.width && LOGO_META?.height ? LOGO_META.width / LOGO_META.height : 2.6;

/** Bundled `require()` images + view-shot often snapshot at the wrong Y; use a file URI like the camera image. */
let cachedLogoUri: string | null = null;
async function resolveBundledLogoUri(): Promise<string> {
    if (cachedLogoUri) return cachedLogoUri;
    const asset = Asset.fromModule(LOGO_SRC);
    await asset.downloadAsync();
    cachedLogoUri = asset.localUri ?? asset.uri;
    return cachedLogoUri;
}

const MAX_EDGE = 2400;

type WatermarkJob = {
    uri: string;
    logoUri: string;
    w: number;
    h: number;
    projectLabel: string;
    companyLabel: string;
    gpsLine: string;
    takenLine: string;
    addressLine: string;
    resolve: (outUri: string) => void;
};

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        RNImage.getSize(uri, (width, height) => resolve({ width, height }), reject);
    });
}

async function downscaleIfNeeded(uri: string): Promise<string> {
    const { width, height } = await getImageSize(uri);
    if (width <= MAX_EDGE && height <= MAX_EDGE) return uri;
    const scale = Math.min(MAX_EDGE / width, MAX_EDGE / height);
    const nw = Math.round(width * scale);
    const nh = Math.round(height * scale);
    const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: nw, height: nh } }],
        { compress: 0.88, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
}

async function buildGpsLine(): Promise<string> {
    try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return 'GPS: unavailable';
        const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        });
        const lat = pos.coords.latitude.toFixed(5);
        const lon = pos.coords.longitude.toFixed(5);
        return `GPS: ${lat}, ${lon}`;
    } catch {
        return 'GPS: unavailable';
    }
}

type FieldPhotoWatermarkContextValue = {
    /** Camera captures — composites logo + project / company / GPS / time / address. Returns original URI if watermark fails. */
    applyCameraWatermark: (localUri: string) => Promise<string>;
};

const FieldPhotoWatermarkContext = createContext<FieldPhotoWatermarkContextValue | null>(null);

export function useFieldPhotoWatermark(): FieldPhotoWatermarkContextValue {
    const ctx = useContext(FieldPhotoWatermarkContext);
    if (!ctx) throw new Error('useFieldPhotoWatermark must be used within FieldPhotoWatermarkProvider');
    return ctx;
}

export function FieldPhotoWatermarkProvider({ children }: { children: React.ReactNode }) {
    const { selectedProject } = useAppContext();
    const shotRef = useRef<View>(null);
    const pendingRef = useRef<WatermarkJob[]>([]);
    const busyRef = useRef(false);

    const [job, setJob] = useState<WatermarkJob | null>(null);
    const [baseLoaded, setBaseLoaded] = useState(false);
    const [logoLoaded, setLogoLoaded] = useState(false);

    const finishJob = useCallback((completed: WatermarkJob, watermarkedUri: string | null) => {
        completed.resolve(watermarkedUri ?? completed.uri);
        setBaseLoaded(false);
        setLogoLoaded(false);
        const next = pendingRef.current.shift();
        if (next) {
            setJob(next);
        } else {
            busyRef.current = false;
            setJob(null);
        }
    }, []);

    const scheduleJob = useCallback(
        (incoming: WatermarkJob) => {
            if (!busyRef.current) {
                busyRef.current = true;
                setBaseLoaded(false);
                setLogoLoaded(false);
                setJob(incoming);
                return;
            }
            pendingRef.current.push(incoming);
        },
        []
    );

    const applyCameraWatermark = useCallback(
        async (localUri: string): Promise<string> => {
            try {
                const uri = await downscaleIfNeeded(localUri);
                const { width: w, height: h } = await getImageSize(uri);
                const gpsLine = await buildGpsLine();
                const companyLabel = `Company: ${getFieldCompanyDisplayName()}`;
                const projectLabel = `Project: ${selectedProject.name?.trim() || '—'}`;
                const addressParts = [selectedProject.address, selectedProject.zipcode].filter(
                    (s): s is string => typeof s === 'string' && s.trim() !== ''
                );
                const addressLine = addressParts.length > 0 ? addressParts.join(', ') : '';
                const takenLine = `Taken: ${new Date().toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                })}`;

                const logoUri = await resolveBundledLogoUri();

                return await new Promise<string>((resolve) => {
                    scheduleJob({
                        uri,
                        logoUri,
                        w,
                        h,
                        projectLabel,
                        companyLabel,
                        gpsLine,
                        takenLine,
                        addressLine,
                        resolve,
                    });
                });
            } catch {
                return localUri;
            }
        },
        [scheduleJob, selectedProject.address, selectedProject.name, selectedProject.zipcode]
    );

    const readyToCapture = !!(job && baseLoaded && logoLoaded);

    useEffect(() => {
        if (!readyToCapture || !job || !shotRef.current) return;
        const active = job;
        let cancelled = false;
        const id = requestAnimationFrame(() => {
            requestAnimationFrame(async () => {
                if (cancelled) return;
                try {
                    const out = await captureRef(shotRef, {
                        format: 'jpg',
                        quality: 0.88,
                        result: 'tmpfile',
                    });
                    if (!cancelled) finishJob(active, typeof out === 'string' ? out : String(out));
                } catch {
                    if (!cancelled) finishJob(active, null);
                }
            });
        });
        return () => {
            cancelled = true;
            cancelAnimationFrame(id);
        };
    }, [readyToCapture, job, finishJob]);

    const fontSize = job ? Math.max(11, Math.round(job.w * 0.028)) : 12;
    const logoW = job ? Math.min(job.w * 0.38, 220) : 120;
    const logoH = Math.max(28, Math.round(logoW / LOGO_ASPECT));

    const value = useMemo(
        () => ({
            applyCameraWatermark,
        }),
        [applyCameraWatermark]
    );

    return (
        <FieldPhotoWatermarkContext.Provider value={value}>
            {children}
            {job ? (
                <View
                    style={[styles.offscreenWrap, { width: job.w, height: job.h }]}
                    pointerEvents="none"
                    collapsable={false}
                >
                    <View
                        ref={shotRef}
                        collapsable={false}
                        style={{ width: job.w, height: job.h, backgroundColor: '#000' }}
                    >
                        <Image
                            source={{ uri: job.uri }}
                            style={[StyleSheet.absoluteFill, { width: job.w, height: job.h }]}
                            resizeMode="cover"
                            onLoad={() => setBaseLoaded(true)}
                        />
                        {/* Logo uses file URI (not require) so view-shot composites it with the bottom panel. */}
                        <View
                            collapsable={false}
                            style={[
                                styles.watermarkPanel,
                                {
                                    padding: fontSize * 0.75,
                                    marginBottom: fontSize * 0.65,
                                    marginLeft: fontSize * 0.65,
                                },
                            ]}
                        >
                            <Image
                                source={{ uri: job.logoUri }}
                                style={{ width: logoW, height: logoH, marginBottom: fontSize * 0.45 }}
                                resizeMode="contain"
                                onLoad={() => setLogoLoaded(true)}
                                onError={() => setLogoLoaded(true)}
                            />
                            <Text style={[styles.line, { fontSize }]} numberOfLines={2}>
                                {job.projectLabel}
                            </Text>
                            <Text style={[styles.line, { fontSize }]} numberOfLines={2}>
                                {job.companyLabel}
                            </Text>
                            <Text style={[styles.line, { fontSize }]} numberOfLines={1}>
                                {job.gpsLine}
                            </Text>
                            {job.addressLine ? (
                                <Text style={[styles.lineMuted, { fontSize: fontSize - 1 }]} numberOfLines={3}>
                                    {job.addressLine}
                                </Text>
                            ) : null}
                            <Text style={[styles.line, { fontSize }]} numberOfLines={2}>
                                {job.takenLine}
                            </Text>
                        </View>
                    </View>
                </View>
            ) : null}
        </FieldPhotoWatermarkContext.Provider>
    );
}

const styles = StyleSheet.create({
    /** Keep on-screen coords sane for view-shot (large negative left breaks overlay compositing on iOS). */
    offscreenWrap: {
        position: 'absolute',
        left: 0,
        top: 12000,
        overflow: 'hidden',
    },
    watermarkPanel: {
        position: 'absolute',
        left: 0,
        bottom: 0,
        maxWidth: '96%',
        backgroundColor: 'rgba(0,0,0,0.52)',
        borderRadius: 10,
        overflow: 'hidden',
        flexDirection: 'column',
        alignItems: 'flex-start',
    },
    line: {
        color: '#fff',
        fontWeight: '600',
        textShadowColor: 'rgba(0,0,0,0.35)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    lineMuted: {
        color: '#F2F2F7',
        marginTop: 2,
        fontWeight: '500',
        textShadowColor: 'rgba(0,0,0,0.35)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
});
