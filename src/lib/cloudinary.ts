const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || '';
const uploadPreset = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || '';

export async function uploadImageToCloudinary(fileUriOrBase64: string): Promise<string | null> {
    if (!cloudName || !uploadPreset) {
        console.warn('Cloudinary cloud name or upload preset is missing. Please check your .env');
        return fileUriOrBase64;
    }

    try {
        const formData = new FormData();

        if (fileUriOrBase64.startsWith('data:image')) {
            // Base64 string (e.g. signature canvas output)
            formData.append('file', fileUriOrBase64);
        } else {
            // Standard Expo file:// URI
            const filename = fileUriOrBase64.split('/').pop() || `upload_${Date.now()}.jpg`;
            const type = fileUriOrBase64.endsWith('.pdf') ? 'application/pdf' : 
                         fileUriOrBase64.endsWith('.png') ? 'image/png' : 'image/jpeg';

            formData.append('file', {
                uri: fileUriOrBase64,
                type,
                name: filename,
            } as any);
        }

        // Unsigned upload — only needs the preset name, no signature required
        formData.append('upload_preset', uploadPreset);

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
            {
                method: 'POST',
                body: formData,
                headers: { Accept: 'application/json' },
            }
        );

        const data = await response.json();
        if (data.secure_url) {
            console.log('Cloudinary upload success:', data.secure_url);
            return data.secure_url;
        } else {
            console.error('Cloudinary API Error:', data);
            return fileUriOrBase64; // fall back to local URI so data is never lost
        }
    } catch (error) {
        console.error('Cloudinary network error:', error);
        return fileUriOrBase64;
    }
}

export async function uploadPhotosArray(photos: string[] | undefined): Promise<string[]> {
    if (!photos || photos.length === 0) return [];

    const uploadedUrls: string[] = [];
    for (const p of photos) {
        if (p.startsWith('file://') || p.startsWith('data:image')) {
            const url = await uploadImageToCloudinary(p);
            if (url) uploadedUrls.push(url);
        } else {
            // Already an https URL — keep as-is
            uploadedUrls.push(p);
        }
    }
    return uploadedUrls;
}
