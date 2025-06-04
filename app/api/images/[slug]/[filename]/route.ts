// app/api/images/[slug]/[filename]/route.ts
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const CONVERTED_IMAGES_DIR = path.join(os.tmpdir(), 'nextjs-pptx-images');

export async function GET(
  request: Request,
  { params }: { params: { slug: string; filename: string } }
) {
  const { slug, filename } = await params;

  if (!slug || !filename) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // Construct the absolute path to the requested file
  const filePath = path.join(CONVERTED_IMAGES_DIR, slug, filename);

  // Basic validation: ensure it's a PNG and within the expected directory
  if (!filename.endsWith('.png') || !filePath.startsWith(path.join(CONVERTED_IMAGES_DIR, slug))) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const fileBuffer = await fs.readFile(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600' // Cache images for an hour
      }
    });
  } catch (error) {
    console.error(`Error serving image ${filePath}:`, error);
    return new NextResponse('Image Not Found', { status: 404 });
  }
}