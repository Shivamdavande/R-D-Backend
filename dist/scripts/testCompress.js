"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const imageCompressor_1 = require("../services/imageCompressor");
const sharp_1 = __importDefault(require("sharp"));
async function testCompression() {
    console.log('--- Testing Image Compression to 100-200 KB ---');
    // Create a 4000x3000 heavy test image with raw pixel data (~5 MB)
    const width = 4000;
    const height = 3000;
    const rawPixelData = Buffer.alloc(width * height * 3);
    for (let i = 0; i < rawPixelData.length; i++) {
        rawPixelData[i] = (i * 13) % 256;
    }
    const largeImageBuffer = await (0, sharp_1.default)(rawPixelData, {
        raw: { width, height, channels: 3 }
    })
        .jpeg({ quality: 95 })
        .toBuffer();
    console.log(`Original large photo size: ${(largeImageBuffer.length / 1024).toFixed(1)} KB`);
    // Compress using our service
    const compressedBuffer = await (0, imageCompressor_1.compressImage)(largeImageBuffer, { maxKB: 200 });
    const compressedKB = (compressedBuffer.length / 1024).toFixed(1);
    console.log(`Compressed result image size: ${compressedKB} KB`);
    if (compressedBuffer.length <= 200 * 1024) {
        console.log('✅ TEST PASSED: Heavy image successfully compressed to under 200 KB!');
    }
    else {
        console.error('❌ TEST FAILED: Compressed image exceeded 200 KB!');
    }
}
testCompression().catch(console.error);
