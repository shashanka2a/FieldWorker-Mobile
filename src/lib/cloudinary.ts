import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

/** Read at call time — Expo inlines EXPO_PUBLIC_* at bundle time; restart Metro after .env changes. */
function getCloudinaryConfig(): { cloudName: string; uploadPreset: string } {
    return {
        cloudName: (process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '').trim(),
        uploadPreset: (process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '').trim(),
    };
}

export function isRemoteMediaUrl(url: string): boolean {
    const u = url.trim();
    return u.startsWith('https://') || u.startsWith('http://');
}

/** Any on-device URI (iOS may use ph://, assets-library://, or paths without file://). */
export function isLocalMediaUri(uri: string): boolean {
    const u = uri.trim();
    if (!u) return false;
    return !isRemoteMediaUrl(u);
}

function cloudNameFromCloudinaryUrl(url: string): string | null {
    const m = url.trim().match(/res\.cloudinary\.com\/([^/]+)\//i);
    return m?.[1] ?? null;
}

/** True when a stored HTTPS URL is on a different Cloudinary cloud than the current env. */
export function isStaleCloudinaryUrl(url: string): boolean {
    if (!isRemoteMediaUrl(url)) return false;
    const hostCloud = cloudNameFromCloudinaryUrl(url);
    if (!hostCloud) return false;
    const { cloudName } = getCloudinaryConfig();
    return !!cloudName && hostCloud !== cloudName;
}

/** Normalize to a JPEG file:// URI Cloudinary / FileSystem can read. */
async function prepareLocalImageForUpload(uri: string): Promise<string> {
    if (uri.startsWith('data:image')) return uri;

    try {
        const result = await ImageManipulator.manipulateAsync(uri, [], {
            compress: 0.85,
            format: ImageManipulator.SaveFormat.JPEG,
        });
        return result.uri;
    } catch (e) {
        console.warn('[Cloudinary] ImageManipulator failed, using original uri:', e);
        return uri.startsWith('file://') ? uri : `file://${uri.replace(/^\/+/, '')}`;
    }
}

async function uploadBase64ToCloudinary(dataUri: string): Promise<string | null> {
    const { cloudName, uploadPreset } = getCloudinaryConfig();
    if (!cloudName || !uploadPreset) return null;

    const formData = new FormData();
    formData.append('file', dataUri);
    formData.append('upload_preset', uploadPreset);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
    });
    const data = await response.json();
    if (typeof data?.secure_url === 'string' && isRemoteMediaUrl(data.secure_url)) {
        return data.secure_url;
    }
    console.warn('[Cloudinary] base64 upload failed:', data?.error?.message ?? response.status);
    return null;
}

async function uploadFileUriToCloudinary(fileUri: string): Promise<string | null> {
    const { cloudName, uploadPreset } = getCloudinaryConfig();
    if (!cloudName || !uploadPreset) return null;

    const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

    try {
        const result = await FileSystem.uploadAsync(uploadUrl, fileUri, {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'file',
            parameters: { upload_preset: uploadPreset },
        });

        if (result.status < 200 || result.status >= 300) {
            console.warn('[Cloudinary] uploadAsync HTTP', result.status, result.body?.slice(0, 200));
            return null;
        }

        const data = JSON.parse(result.body) as { secure_url?: string; error?: { message?: string } };
        if (typeof data?.secure_url === 'string' && isRemoteMediaUrl(data.secure_url)) {
            return data.secure_url;
        }
        console.warn('[Cloudinary] uploadAsync response:', data?.error?.message ?? 'no secure_url');
        return null;
    } catch (e) {
        console.warn('[Cloudinary] uploadAsync error:', e);
        return null;
    }
}

/** Download a remote image and upload it to the configured Cloudinary cloud. */
async function reuploadRemoteCloudinaryUrl(remoteUrl: string): Promise<string | null> {
    const { cloudName } = getCloudinaryConfig();
    try {
        const dest = `${FileSystem.cacheDirectory}cloudinary-migrate-${Date.now()}.jpg`;
        const download = await FileSystem.downloadAsync(remoteUrl.trim(), dest);
        if (download.status < 200 || download.status >= 300) {
            console.warn('[Cloudinary] migrate download failed:', download.status);
            return null;
        }
        const uploaded = await uploadFileUriToCloudinary(download.uri);
        await FileSystem.deleteAsync(download.uri, { idempotent: true }).catch(() => {});
        if (__DEV__ && uploaded && cloudName) {
            console.log(`[Cloudinary] migrated asset to cloud "${cloudName}"`);
        }
        return uploaded;
    } catch (e) {
        console.warn('[Cloudinary] migrate re-upload failed:', e);
        return null;
    }
}

export async function uploadImageToCloudinary(fileUriOrBase64: string): Promise<string | null> {
    const { cloudName, uploadPreset } = getCloudinaryConfig();
    if (!cloudName || !uploadPreset) {
        console.warn('[Cloudinary] Missing EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME or EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET');
        return null;
    }

    if (__DEV__) {
        console.log(`[Cloudinary] uploading to cloud "${cloudName}"`);
    }

    try {
        if (fileUriOrBase64.startsWith('data:image')) {
            return await uploadBase64ToCloudinary(fileUriOrBase64);
        }

        if (isStaleCloudinaryUrl(fileUriOrBase64)) {
            return await reuploadRemoteCloudinaryUrl(fileUriOrBase64);
        }

        if (isRemoteMediaUrl(fileUriOrBase64)) {
            return fileUriOrBase64.trim();
        }

        const prepared = await prepareLocalImageForUpload(fileUriOrBase64);
        return await uploadFileUriToCloudinary(prepared);
    } catch (error) {
        console.error('[Cloudinary] upload failed:', error);
        return null;
    }
}

export async function uploadPhotosArray(photos: string[] | undefined): Promise<string[]> {
    if (!photos || photos.length === 0) return [];

    const uploadedUrls: string[] = [];
    for (const p of photos) {
        if (!p?.trim()) continue;
        if (isRemoteMediaUrl(p) && !isStaleCloudinaryUrl(p)) {
            uploadedUrls.push(p.trim());
            continue;
        }
        const url = await uploadImageToCloudinary(p);
        if (url && isRemoteMediaUrl(url)) {
            uploadedUrls.push(url);
        }
    }
    return uploadedUrls;
}

/**
 * Upload attachment previews; throws if any on-device image could not reach Cloudinary.
 */
export async function uploadAttachmentPreviews(photos: string[]): Promise<string[]> {
    const { cloudName, uploadPreset } = getCloudinaryConfig();
    const needsUpload = photos.filter((p) => isLocalMediaUri(p) || isStaleCloudinaryUrl(p));
    const urls = await uploadPhotosArray(photos);

    if (needsUpload.length > 0 && urls.length === 0) {
        if (!cloudName || !uploadPreset) {
            throw new Error(
                'Photo upload is not configured. Set EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET.'
            );
        }
        throw new Error('Photos could not upload. Check your internet connection and try again.');
    }
    if (urls.length < needsUpload.length) {
        throw new Error(
            `${needsUpload.length - urls.length} of ${needsUpload.length} photo(s) failed to upload. Try again.`
        );
    }
    return urls;
}
