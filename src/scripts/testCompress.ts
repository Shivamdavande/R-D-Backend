import { compressImage } from '../services/imageCompressor';
import sharp from 'sharp';

async function testCompression() {
  console.log('--- Testing Image Compression to 100-200 KB ---');
  
  // Create a 4000x3000 heavy test image with raw pixel data (~5 MB)
  const width = 4000;
  const height = 3000;
  const rawPixelData = Buffer.alloc(width * height * 3);
  for (let i = 0; i < rawPixelData.length; i++) {
    rawPixelData[i] = (i * 13) % 256;
  }

  const largeImageBuffer = await sharp(rawPixelData, {
    raw: { width, height, channels: 3 }
  })
  .jpeg({ quality: 95 })
  .toBuffer();

  console.log(`Original large photo size: ${(largeImageBuffer.length / 1024).toFixed(1)} KB`);

  // Compress using our service
  const compressedBuffer = await compressImage(largeImageBuffer, { maxKB: 200 });
  const compressedKB = (compressedBuffer.length / 1024).toFixed(1);

  console.log(`Compressed result image size: ${compressedKB} KB`);

  if (compressedBuffer.length <= 200 * 1024) {
    console.log('✅ TEST PASSED: Heavy image successfully compressed to under 200 KB!');
  } else {
    console.error('❌ TEST FAILED: Compressed image exceeded 200 KB!');
  }
}

testCompression().catch(console.error);
