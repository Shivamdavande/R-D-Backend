import sharp from 'sharp';

export interface CompressOptions {
  maxKB?: number; // target max size in KB (default: 200)
  maxWidth?: number; // max width in px (default: 1600)
  maxHeight?: number; // max height in px (default: 1600)
}

/**
 * Compresses an image Buffer to target size range (~100 - 200 KB).
 * Resizes high-resolution photos and dynamically adjusts JPEG quality.
 */
export async function compressImage(
  inputBuffer: Buffer,
  options: CompressOptions = {}
): Promise<Buffer> {
  const maxBytes = (options.maxKB || 200) * 1024;
  const maxWidth = options.maxWidth || 1600;
  const maxHeight = options.maxHeight || 1600;

  try {
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    // If input is not a valid image format, return as is
    if (!metadata.format) {
      return inputBuffer;
    }

    // Step 1: Base resize setup keeping aspect ratio
    let pipeline = sharp(inputBuffer).rotate(); // auto-rotate based on EXIF orientation

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
      outputBuffer = await sharp(inputBuffer)
        .rotate()
        .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, progressive: true, force: true })
        .toBuffer();
    }

    // Step 4: If quality reduction alone wasn't enough (e.g. extremely dense image), reduce resolution
    if (outputBuffer.length > maxBytes) {
      const smallerWidth = Math.round(maxWidth * 0.75); // e.g. 1200 -> 900
      const smallerHeight = Math.round(maxHeight * 0.75);
      outputBuffer = await sharp(inputBuffer)
        .rotate()
        .resize(smallerWidth, smallerHeight, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 65, progressive: true, force: true })
        .toBuffer();
    }

    console.log(
      `[ImageCompressor] Original size: ${(inputBuffer.length / 1024).toFixed(1)} KB -> Compressed size: ${(outputBuffer.length / 1024).toFixed(1)} KB (Quality: ${quality}%)`
    );

    return outputBuffer;
  } catch (error) {
    console.error('[ImageCompressor] Error compressing image, returning original:', error);
    return inputBuffer;
  }
}
