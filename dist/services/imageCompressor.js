"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compressImage = compressImage;
const sharp_1 = __importDefault(require("sharp"));
/**
 * Compresses an image Buffer to target size range (~100 - 200 KB).
 * Resizes high-resolution photos and dynamically adjusts JPEG quality.
 */
async function compressImage(inputBuffer, options = {}) {
    const maxBytes = (options.maxKB || 200) * 1024;
    const maxWidth = options.maxWidth || 1600;
    const maxHeight = options.maxHeight || 1600;
    try {
        const image = (0, sharp_1.default)(inputBuffer);
        const metadata = await image.metadata();
        // If input is not a valid image format, return as is
        if (!metadata.format) {
            return inputBuffer;
        }
        // Step 1: Base resize setup keeping aspect ratio
        let pipeline = (0, sharp_1.default)(inputBuffer).rotate(); // auto-rotate based on EXIF orientation
        if (metadata.width && metadata.height) {
            if (metadata.width > maxWidth || metadata.height > maxHeight) {
                pipeline = pipeline.resize(maxWidth, maxHeight, {
                    fit: 'inside',
                    withoutEnlargement: true
                });
            }
        }
        // Step 2: Try initial compression with high quality (80%)
        let quality = 80;
        let outputBuffer = await pipeline
            .jpeg({ quality, progressive: true, force: true })
            .toBuffer();
        // Step 3: If still over maxBytes (200 KB), iteratively reduce quality
        while (outputBuffer.length > maxBytes && quality > 30) {
            quality -= 10;
            outputBuffer = await (0, sharp_1.default)(inputBuffer)
                .rotate()
                .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality, progressive: true, force: true })
                .toBuffer();
        }
        // Step 4: If quality reduction alone wasn't enough (e.g. extremely dense image), reduce resolution
        if (outputBuffer.length > maxBytes) {
            const smallerWidth = Math.round(maxWidth * 0.75); // e.g. 1200 -> 900
            const smallerHeight = Math.round(maxHeight * 0.75);
            outputBuffer = await (0, sharp_1.default)(inputBuffer)
                .rotate()
                .resize(smallerWidth, smallerHeight, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 65, progressive: true, force: true })
                .toBuffer();
        }
        console.log(`[ImageCompressor] Original size: ${(inputBuffer.length / 1024).toFixed(1)} KB -> Compressed size: ${(outputBuffer.length / 1024).toFixed(1)} KB (Quality: ${quality}%)`);
        return outputBuffer;
    }
    catch (error) {
        console.error('[ImageCompressor] Error compressing image, returning original:', error);
        return inputBuffer;
    }
}
