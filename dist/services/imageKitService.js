"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSitePhotosFromImageKit = exports.deleteFromImageKit = exports.uploadToImageKit = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const imagekit_1 = __importDefault(require("imagekit"));
const env_1 = require("../config/env");
const imageCompressor_1 = require("./imageCompressor");
let imagekitInstance = null;
const getImageKit = () => {
    const { publicKey, privateKey, urlEndpoint } = env_1.config.imageKit;
    if (privateKey && privateKey.trim() !== '' && publicKey && publicKey.trim() !== '') {
        if (!imagekitInstance) {
            imagekitInstance = new imagekit_1.default({
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
const uploadToImageKit = async (fileBuffer, fileName, folder = '/site_images') => {
    // Compress image to 100-200 KB target range
    const compressedBuffer = await (0, imageCompressor_1.compressImage)(fileBuffer, { maxKB: 200 });
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
        }
        catch (err) {
            console.error('ImageKit SDK upload error:', err?.message || err);
        }
    }
    // Local storage fallback if ImageKit keys not provided or API unavailable
    const siteDir = path_1.default.join(__dirname, '../../uploads/site-images');
    if (!fs_1.default.existsSync(siteDir)) {
        fs_1.default.mkdirSync(siteDir, { recursive: true });
    }
    const hasExt = /\.(jpg|jpeg|png|webp)$/i.test(fileName);
    const cleanName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeExt = hasExt ? path_1.default.extname(fileName) : '.jpg';
    const safeName = `${Date.now()}_${cleanName || 'site_photo'}${safeExt}`;
    const filePath = path_1.default.join(siteDir, safeName);
    fs_1.default.writeFileSync(filePath, compressedBuffer);
    const localUrl = `/uploads/site-images/${safeName}`;
    return {
        fileId: `local_${safeName}`,
        url: localUrl,
        name: `${cleanName || 'site_photo'}${safeExt}`
    };
};
exports.uploadToImageKit = uploadToImageKit;
/**
 * Deletes an image from ImageKit securely using fileId.
 */
const deleteFromImageKit = async (fileId) => {
    if (!fileId)
        return true;
    // If local file
    if (fileId.startsWith('local_')) {
        const filename = fileId.replace('local_', '');
        const filePath = path_1.default.join(__dirname, '../../uploads/site-images', filename);
        if (fs_1.default.existsSync(filePath)) {
            try {
                fs_1.default.unlinkSync(filePath);
            }
            catch (e) {
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
        }
        catch (err) {
            console.error('ImageKit SDK delete error:', err?.message || err);
            return false;
        }
    }
    return true;
};
exports.deleteFromImageKit = deleteFromImageKit;
/**
 * Deletes all images of a site from ImageKit cloud storage and local fallback storage.
 */
const deleteSitePhotosFromImageKit = async (siteImages) => {
    for (const img of siteImages) {
        if (img.imageKitFileId) {
            await (0, exports.deleteFromImageKit)(img.imageKitFileId).catch((e) => console.error('Error deleting image from ImageKit:', e?.message || e));
        }
        else if (img.imageUrl && img.imageUrl.startsWith('/uploads/')) {
            try {
                const localPath = path_1.default.join(__dirname, '../../', img.imageUrl);
                if (fs_1.default.existsSync(localPath)) {
                    fs_1.default.unlinkSync(localPath);
                }
            }
            catch (e) {
                console.error('Error cleaning up local image file:', e);
            }
        }
    }
};
exports.deleteSitePhotosFromImageKit = deleteSitePhotosFromImageKit;
