import fs from 'fs';
import path from 'path';
import ImageKit from 'imagekit';
import { config } from '../config/env';
import { compressImage } from './imageCompressor';

export interface ImageKitUploadResult {
  fileId: string;
  url: string;
  name: string;
}

let imagekitInstance: ImageKit | null = null;

const getImageKit = (): ImageKit | null => {
  const { publicKey, privateKey, urlEndpoint } = config.imageKit;
  if (privateKey && privateKey.trim() !== '' && publicKey && publicKey.trim() !== '') {
    if (!imagekitInstance) {
      imagekitInstance = new ImageKit({
        publicKey,
        privateKey,
        urlEndpoint: urlEndpoint || 'https://ik.imagekit.io/kc2o5o9mt'
      });
    }
    return imagekitInstance;
  }
  return null;
};

/**
 * Uploads an image file to ImageKit securely from the backend.
 * Automatically compresses images to ~100-200 KB before saving or uploading.
 */
export const uploadToImageKit = async (
  fileBuffer: Buffer,
  fileName: string,
  folder: string = '/site_images'
): Promise<ImageKitUploadResult> => {
  // Compress image to 100-200 KB target range
  const compressedBuffer = await compressImage(fileBuffer, { maxKB: 200 });

  const ik = getImageKit();

  if (ik) {
    try {
      const response = await ik.upload({
        file: compressedBuffer,
        fileName: fileName || `site_photo_${Date.now()}.jpg`,
        folder: folder || '/site_images',
        useUniqueFileName: true
      });

      if (response && response.url) {
        return {
          fileId: response.fileId,
          url: response.url,
          name: response.name || fileName
        };
      }
    } catch (err: any) {
      console.error('ImageKit SDK upload error:', err?.message || err);
    }
  }

  // Local storage fallback if ImageKit keys not provided or API unavailable
  const siteDir = path.join(__dirname, '../../uploads/site-images');
  if (!fs.existsSync(siteDir)) {
    fs.mkdirSync(siteDir, { recursive: true });
  }

  const hasExt = /\.(jpg|jpeg|png|webp)$/i.test(fileName);
  const cleanName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeExt = hasExt ? path.extname(fileName) : '.jpg';
  const safeName = `${Date.now()}_${cleanName || 'site_photo'}${safeExt}`;
  const filePath = path.join(siteDir, safeName);
  fs.writeFileSync(filePath, compressedBuffer);

  const localUrl = `/uploads/site-images/${safeName}`;
  return {
    fileId: `local_${safeName}`,
    url: localUrl,
    name: `${cleanName || 'site_photo'}${safeExt}`
  };
};

/**
 * Deletes an image from ImageKit securely using fileId.
 */
export const deleteFromImageKit = async (fileId?: string): Promise<boolean> => {
  if (!fileId) return true;

  // If local file
  if (fileId.startsWith('local_')) {
    const filename = fileId.replace('local_', '');
    const filePath = path.join(__dirname, '../../uploads/site-images', filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        console.error('Error removing local file:', e);
      }
    }
    return true;
  }

  // ImageKit file deletion via SDK
  const ik = getImageKit();
  if (ik) {
    try {
      await ik.deleteFile(fileId);
      return true;
    } catch (err: any) {
      console.error('ImageKit SDK delete error:', err?.message || err);
      return false;
    }
  }

  return true;
};

/**
 * Deletes all images of a site from ImageKit cloud storage and local fallback storage.
 */
export const deleteSitePhotosFromImageKit = async (
  siteImages: Array<{ imageKitFileId?: string; imageUrl?: string }>
): Promise<void> => {
  for (const img of siteImages) {
    if (img.imageKitFileId) {
      await deleteFromImageKit(img.imageKitFileId).catch((e) =>
        console.error('Error deleting image from ImageKit:', e?.message || e)
      );
    } else if (img.imageUrl && img.imageUrl.startsWith('/uploads/')) {
      try {
        const localPath = path.join(__dirname, '../../', img.imageUrl);
        if (fs.existsSync(localPath)) {
          fs.unlinkSync(localPath);
        }
      } catch (e) {
        console.error('Error cleaning up local image file:', e);
      }
    }
  }
};
