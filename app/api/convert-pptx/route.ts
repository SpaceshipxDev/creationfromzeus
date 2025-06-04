// app/api/convert-pptx/route.ts
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import os from 'os';

// Promisify the exec function
const execPromise = util.promisify(exec);

// Configure paths from environment variables
const SOFFICE_PATH = process.env.SOFFICE_PATH;
const PDFTOPPM_PATH = process.env.PDFTOPPM_PATH;

const UPLOAD_DIR = path.join(os.tmpdir(), 'nextjs-pptx-uploads'); // Temporary directory for uploads
const CONVERTED_IMAGES_DIR = path.join(os.tmpdir(), 'nextjs-pptx-images'); // Temporary directory for converted images

// Ensure paths are configured
if (!SOFFICE_PATH || !PDFTOPPM_PATH) {
  console.error("SOFFICE_PATH or PDFTOPPM_PATH environment variables are not set.");
  // Consider throwing an error or handling this more gracefully in a real app
}

/**
 * Converts a PPTX file to a series of PNG images.
 * Returns an array of relative paths to the generated PNGs.
 */
async function convertPptxToPng(pptxFilePath: string, outputDirectory: string, dpi = 300): Promise<string[]> {
  console.log(`[PPTX Conversion] Starting for: ${pptxFilePath}`);
  console.log(`[PPTX Conversion] Output directory: ${outputDirectory}`);

  await fs.mkdir(outputDirectory, { recursive: true });

  const pptxFileNameWithoutExt = path.basename(pptxFilePath, '.pptx');
  const pdfFileName = `${pptxFileNameWithoutExt}.pdf`;
  const pdfOutputPath = path.join(outputDirectory, pdfFileName);
  const pngOutputPrefix = path.join(outputDirectory, pptxFileNameWithoutExt);

  try {
    // 1. Convert PPTX to PDF using LibreOffice
    console.log(`[PPTX Conversion] Converting PPTX to PDF...`);
    const libreOfficeCmd = `"${SOFFICE_PATH}" --headless --convert-to pdf "${pptxFilePath}" --outdir "${outputDirectory}"`;
    const { stdout: loStdout, stderr: loStderr } = await execPromise(libreOfficeCmd);
    if (loStdout) console.log('LibreOffice stdout:', loStdout);
    if (loStderr) console.error('LibreOffice stderr:', loStderr);
    await new Promise(resolve => setTimeout(resolve, 500)); // Give LO a moment

    // Verify PDF creation
    try {
      await fs.access(pdfOutputPath);
    } catch (error) {
      throw new Error(`Failed to create PDF. Check LibreOffice setup. Command: ${libreOfficeCmd}`);
    }
    console.log(`[PPTX Conversion] PDF created: ${pdfOutputPath}`);

    // 2. Convert PDF to PNG images using pdftoppm
    console.log(`[PPTX Conversion] Converting PDF to PNG images (DPI: ${dpi})...`);
    const pdftoppmCmd = `"${PDFTOPPM_PATH}" -png -rx ${dpi} -ry ${dpi} "${pdfOutputPath}" "${pngOutputPrefix}"`;
    const { stdout: ppmStdout, stderr: ppmStderr } = await execPromise(pdftoppmCmd);
    if (ppmStdout) console.log('pdftoppm stdout:', ppmStdout);
    if (ppmStderr) console.error('pdftoppm stderr:', ppmStderr);
    console.log(`[PPTX Conversion] PNG images generated.`);

  } catch (error: any) {
    console.error(`[PPTX Conversion] Error during conversion: ${error.message}`);
    throw new Error(`Conversion failed: ${error.message}`);
  } finally {
    // Clean up intermediate PDF file
    console.log(`[PPTX Conversion] Cleaning up intermediate PDF: ${pdfOutputPath}`);
    try {
      await fs.unlink(pdfOutputPath);
    } catch (error: any) {
      console.warn(`[PPTX Conversion] Could not delete intermediate PDF: ${pdfOutputPath}. Error: ${error.message}`);
    }
  }

  // Get list of generated PNGs
  const generatedFiles = await fs.readdir(outputDirectory);
  const pngFiles = generatedFiles
    .filter(file => file.startsWith(pptxFileNameWithoutExt) && file.endsWith('.png'))
    .map(file => path.basename(file)) // Return just filenames for easier URL construction
    .sort((a, b) => { // Sort naturally (slide-1.png, slide-10.png, slide-2.png -> slide-1, slide-2, slide-10)
      const numA = parseInt(a.match(/(\d+)\.png$/)?.[1] || '0');
      const numB = parseInt(b.match(/(\d+)\.png$/)?.[1] || '0');
      return numA - numB;
    });

  console.log(`[PPTX Conversion] Conversion successful! Generated PNGs: ${pngFiles.join(', ')}`);
  return pngFiles;
}

export async function POST(request: Request) {
  if (!SOFFICE_PATH || !PDFTOPPM_PATH) {
    return NextResponse.json({ error: "Server not configured for PPTX conversion. Check SOFFICE_PATH and PDFTOPPM_PATH environment variables." }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
  }

  if (!file.name.endsWith('.pptx')) {
    return NextResponse.json({ error: 'Only .pptx files are supported for this endpoint.' }, { status: 400 });
  }

  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const tempUploadPath = path.join(UPLOAD_DIR, uniqueId, file.name);
  const outputImagesPath = path.join(CONVERTED_IMAGES_DIR, uniqueId);

  try {
    // Ensure parent directory for temp upload exists
    await fs.mkdir(path.dirname(tempUploadPath), { recursive: true });
    // Save the uploaded file temporarily
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(tempUploadPath, buffer);
    console.log(`[API] File saved temporarily at: ${tempUploadPath}`);

    const pngFilenames = await convertPptxToPng(tempUploadPath, outputImagesPath);

    // Construct public URLs for the images
    const imageUrls = pngFilenames.map(filename => `/api/images/${uniqueId}/${filename}`);

    return NextResponse.json({
      success: true,
      slideImageUrls: imageUrls,
      cleanupId: uniqueId // For potential future specific cleanup requests
    });

  } catch (error: any) {
    console.error(`[API] Error processing file: ${error.message}`);
    return NextResponse.json({ error: error.message || 'Failed to process PowerPoint file.' }, { status: 500 });
  } finally {
    // --- Cleanup Strategy ---
    // For a demo, a simple timed cleanup is okay. In production, consider:
    // 1. A dedicated background worker/cron job to clean up old temp directories.
    // 2. Returning the "cleanupId" and letting the client signal when it's done viewing.
    // 3. Storing images in persistent cloud storage (S3, etc.) and returning those URLs.

    // Cleanup the uploaded PPTX file immediately after conversion
    try {
        await fs.unlink(tempUploadPath);
        console.log(`[API] Cleaned up uploaded PPTX: ${tempUploadPath}`);
    } catch (err: any) {
        console.warn(`[API] Failed to clean up uploaded PPTX: ${tempUploadPath}. Error: ${err.message}`);
    }

    // Schedule cleanup of the converted image directory after a delay (e.g., 5 minutes)
    // This gives the client time to load images.
    setTimeout(async () => {
      try {
        await fs.rm(outputImagesPath, { recursive: true, force: true });
        console.log(`[API] Cleaned up converted image directory: ${outputImagesPath}`);
      } catch (err: any) {
        console.warn(`[API] Failed to clean up converted image directory: ${outputImagesPath}. Error: ${err.message}`);
      }
    }, 5 * 60 * 1000); // 5 minutes
  }
}

// Ensure base temporary directories exist on server start
// This should ideally run once, not on every request, but good for demo.
async function setupTempDirs() {
    try {
        await fs.mkdir(UPLOAD_DIR, { recursive: true });
        await fs.mkdir(CONVERTED_IMAGES_DIR, { recursive: true });
        console.log(`Ensured base temporary directories exist: ${UPLOAD_DIR}, ${CONVERTED_IMAGES_DIR}`);
    } catch (error) {
        console.error("Failed to ensure temporary directories:", error);
    }
}
setupTempDirs();

// Optionally, you might want to clear old temp files on server startup
// This is a simple version, a more robust solution would be a separate cron job.
async function clearOldTempFiles() {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    for (const dir of [UPLOAD_DIR, CONVERTED_IMAGES_DIR]) {
        try {
            const items = await fs.readdir(dir, { withFileTypes: true });
            for (const item of items) {
                const itemPath = path.join(dir, item.name);
                if (item.isDirectory()) {
                    const stats = await fs.stat(itemPath);
                    if (stats.mtime.getTime() < cutoffTime) {
                        console.log(`Clearing old temporary directory: ${itemPath}`);
                        await fs.rm(itemPath, { recursive: true, force: true });
                    }
                }
            }
        } catch (error) {
            console.warn(`Failed to clear old temp files in ${dir}:`, error);
        }
    }
}
clearOldTempFiles(); // Run cleanup on server start