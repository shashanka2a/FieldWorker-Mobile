import CryptoJS from 'crypto-js';

const cloudName = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || '';
const apiKey = process.env.EXPO_PUBLIC_CLOUDINARY_API_KEY || '';
const apiSecret = process.env.EXPO_PUBLIC_CLOUDINARY_API_SECRET || '';

export async function uploadImageToCloudinary(fileUriOrBase64: string): Promise<string | null> {
    if (!cloudName || cloudName === 'PLEASE_ENTER_YOUR_CLOUD_NAME_HERE') {
        console.warn('Cloudinary cloud name is missing. Please add it to your .env');
        // Return original if cannot upload so it still gets saved locally.
        return fileUriOrBase64; 
    }

    try {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        
        // To sign Cloudinary upload securely via REST API: sha1("timestamp=" + <timestamp> + <api_secret>)
        const strToSign = `timestamp=${timestamp}${apiSecret}`;
        const signature = CryptoJS.SHA1(strToSign).toString(CryptoJS.enc.Hex);

        const formData = new FormData();
        
        if (fileUriOrBase64.startsWith('data:image')) {
             // For Base64 strings (like Signature Canvas output)
             formData.append('file', fileUriOrBase64);
        } else {
            // For typical Expo URI string (expo-image-picker file:// or application://)
            const filename = fileUriOrBase64.split('/').pop() || `upload_${timestamp}.jpg`;
            const type = fileUriOrBase64.endsWith('.png') ? 'image/png' : 'image/jpeg';
            
            formData.append('file', {
                uri: fileUriOrBase64,
                type,
                name: filename,
            } as any);
        }

        formData.append('api_key', apiKey);
        formData.append('timestamp', timestamp);
        formData.append('signature', signature);

        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
            method: 'POST',
            body: formData,
            headers: {
                'Accept': 'application/json',
            }
        });

        const data = await response.json();
        if (data.secure_url) {
            console.log('Successfully uploaded image to Cloudinary!');
            return data.secure_url;
        } else {
            console.error('Cloudinary API Error:', data);
            return fileUriOrBase64;
        }
    } catch (error) {
        console.error('Cloudinary Network error:', error);
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
            // If it's already an http(s) URL, push it natively
            uploadedUrls.push(p);
        }
    }
    return uploadedUrls;
}
