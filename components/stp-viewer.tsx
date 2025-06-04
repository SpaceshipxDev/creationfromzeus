// src/components/stp-viewer.tsx
"use client";

import { useState, useEffect } from "react";
import JSZip from "jszip";
// import Image from "next/image"; // Using <img> for blob URLs simplifies things
import { Loader2, AlertTriangle, Eye, Download, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StpViewerProps {
  file: File;
  fileName: string; // Typically relativePath for context
}

interface RenderedImage {
  name: string;
  url: string;
}

export function StpViewer({ file, fileName }: StpViewerProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<RenderedImage[]>([]);
  const [zipBlobUrl, setZipBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrlsToRevoke: string[] = [];
    let currentZipBlobUrlForCleanup: string | null = null;

    const fetchAndProcessStp = async () => {
      setIsLoading(true);
      setError(null);
      setImageUrls([]);
      if (zipBlobUrl) URL.revokeObjectURL(zipBlobUrl); // Clean up previous zip blob URL
      setZipBlobUrl(null);

      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch("/api/render-stp", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          let errorMessage = `Error ${response.status}`;
          try {
            const errorJson = await response.json();
            if (errorJson.details) errorMessage = `${errorJson.error} Details: ${errorJson.details}`;
            else if (errorJson.error) errorMessage = errorJson.error;
            else errorMessage = await response.text() || `Request failed with status ${response.status}`;
          } catch (e) {
            errorMessage = await response.text() || `Request failed with status ${response.status}`;
          }
          throw new Error(errorMessage);
        }

        const zipBlob = await response.blob();
        currentZipBlobUrlForCleanup = URL.createObjectURL(zipBlob);
        setZipBlobUrl(currentZipBlobUrlForCleanup);

        const zip = await JSZip.loadAsync(zipBlob);
        const newImageUrls: RenderedImage[] = [];

        const imageFilePromises = Object.keys(zip.files)
          .filter(filename => !zip.files[filename].dir && /\.(png|jpe?g|gif)$/i.test(filename))
          .map(async (filename) => {
            const fileData = await zip.files[filename].async("blob");
            const url = URL.createObjectURL(fileData);
            objectUrlsToRevoke.push(url); // Keep track for cleanup
            return { name: filename, url };
          });

        const resolvedImages = await Promise.all(imageFilePromises);
        resolvedImages.sort((a, b) => a.name.localeCompare(b.name)); // Sort images by name
        setImageUrls(resolvedImages);

        if (resolvedImages.length === 0) {
          setError("No preview images were found in the output from the renderer.");
        }

      } catch (err: any) {
        console.error(`Failed to process STP file ${fileName}:`, err);
        setError(err.message || "An unknown error occurred during STP processing.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAndProcessStp();

    return () => {
      // Cleanup object URLs on component unmount or before re-fetch
      objectUrlsToRevoke.forEach(URL.revokeObjectURL);
      if (currentZipBlobUrlForCleanup) {
        URL.revokeObjectURL(currentZipBlobUrlForCleanup);
      }
    };
  }, [file, fileName]); // Re-run effect if file or fileName changes

  return (
    <div className="border border-gray-300 dark:border-gray-700 rounded-lg p-4 shadow-sm bg-gray-100 dark:bg-gray-800/60">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-3 gap-2">
        <h5 className="font-semibold text-md text-gray-800 dark:text-gray-200 truncate flex items-center" title={fileName}>
          <Layers className="w-5 h-5 inline-block mr-2 text-blue-500 flex-shrink-0" />
          <span className="truncate">{fileName}</span>
        </h5>
        {zipBlobUrl && !isLoading && !error && imageUrls.length > 0 && (
          <Button variant="outline" size="sm" asChild className="flex-shrink-0">
            <a href={zipBlobUrl} download={`${file.name}_previews.zip`}>
              <Download className="w-4 h-4 mr-2" /> Download Previews ZIP
            </a>
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-48 text-gray-600 dark:text-gray-400">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 dark:text-blue-400" />
          <p className="ml-4 text-lg">Generating STP Previews...</p>
        </div>
      )}

      {error && !isLoading && (
        <div className="flex flex-col items-center justify-center h-48 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/40 p-4 rounded-md">
          <AlertTriangle className="w-10 h-10 mb-3" />
          <p className="font-bold text-lg">Preview Generation Failed</p>
          <p className="text-sm text-center max-w-md">{error}</p>
        </div>
      )}

      {!isLoading && !error && imageUrls.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800/30 p-4 rounded-md">
          <Eye className="w-10 h-10 mb-3" />
          <p className="text-lg">No Previews Available</p>
          <p className="text-sm">The renderer did not produce any images for this file.</p>
        </div>
      )}

      {!isLoading && !error && imageUrls.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {imageUrls.map((img) => (
            <div key={img.url} className="relative aspect-[4/3] border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden group bg-gray-200 dark:bg-gray-700 shadow">
              <img
                src={img.url}
                alt={`Preview of ${img.name}`}
                className="object-contain w-full h-full"
                loading="lazy"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-2 pt-4 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <p className="truncate" title={img.name}>{img.name}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}