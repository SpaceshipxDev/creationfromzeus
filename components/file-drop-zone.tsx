// src/components/file-drop-zone.tsx
"use client";

import type React from "react";
import { useCallback } from "react";
import { Upload, Folder, File as FileIconUI } from "lucide-react"; // Ensure lucide-react is installed
import { Button } from "@/components/ui/button"; // Ensure this path is correct
import { cn } from "@/lib/utils"; // Ensure this path is correct

interface FileDropZoneProps {
  onFilesUploaded: (files: File[]) => void;
  isDragOver: boolean;
  onDragOverChange: (isOver: boolean) => void;
}

// Make sure this line is exactly like this:
export function FileDropZone({ onFilesUploaded, isDragOver, onDragOverChange }: FileDropZoneProps) {
  const handleDragOverInternal = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDragOverChange(true);
    },
    [onDragOverChange],
  );

  const handleDragLeaveInternal = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDragOverChange(false);
    },
    [onDragOverChange],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDragOverChange(false);

      const items = Array.from(e.dataTransfer.items);
      const droppedFiles: File[] = [];

      const processEntry = async (entry: FileSystemEntry): Promise<void> => {
        if (entry.isFile) {
          const fileEntry = entry as FileSystemFileEntry;
          await new Promise<void>((resolve, reject) => {
            fileEntry.file(
              (file) => {
                droppedFiles.push(file);
                resolve();
              },
              (err) => {
                console.error("Error accessing file from dropped item:", err);
                reject(err); // It's good practice to reject on error
              },
            );
          });
        } else if (entry.isDirectory) {
          const dirEntry = entry as FileSystemDirectoryEntry;
          const reader = dirEntry.createReader();
          await new Promise<void>((resolve, reject) => {
            reader.readEntries(
              async (entries) => {
                try { // Add try-catch for recursive calls
                  for (const subEntry of entries) {
                    await processEntry(subEntry);
                  }
                  resolve();
                } catch (subError) {
                  reject(subError);
                }
              },
              (err) => {
                console.error("Error reading directory entries:", err);
                reject(err);
              },
            );
          });
        }
      };

      try {
        for (const item of items) {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            await processEntry(entry);
          }
        }
        if (droppedFiles.length > 0) {
          onFilesUploaded(droppedFiles);
        }
      } catch (error) {
        console.error("Error processing dropped items:", error);
        // Optionally, notify the user of the error
      }
    },
    [onFilesUploaded, onDragOverChange],
  );

  const handleFolderInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onFilesUploaded(Array.from(e.target.files));
      }
      e.target.value = "";
    },
    [onFilesUploaded],
  );

  const handleFilesInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onFilesUploaded(Array.from(e.target.files));
      }
      e.target.value = "";
    },
    [onFilesUploaded],
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOverInternal}
      onDragLeave={handleDragLeaveInternal}
      className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
        isDragOver ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20" : "border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600",
        "flex flex-col items-center justify-center min-h-[300px] md:min-h-[350px]",
      )}
    >
      <Upload className="w-12 h-12 md:w-16 md:h-16 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
      <h3 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
        Drop your folder or files here
      </h3>
      <p className="text-gray-600 dark:text-gray-400 mb-6 md:mb-8">
        Or select a folder/files to process. Supports Excel, STP, DWG, PowerPoint.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center">
        <Button asChild variant="outline" size="lg" className="px-6 py-3 text-base">
          <label htmlFor="folder-input-dropzone" className="cursor-pointer flex items-center">
            <Folder className="w-5 h-5 mr-2" />
            Select Folder
          </label>
        </Button>
        <input
          type="file"
          onChange={handleFolderInput}
          className="hidden"
          id="folder-input-dropzone"
          // @ts-ignore - for webkitdirectory
          webkitdirectory="true"
          // directory="true" // Standard but less browser support for selection dialog
        />

        <Button asChild variant="outline" size="lg" className="px-6 py-3 text-base">
          <label htmlFor="files-input-dropzone" className="cursor-pointer flex items-center">
            <FileIconUI className="w-5 h-5 mr-2" />
            Select Files
          </label>
        </Button>
        <input
          type="file"
          multiple
          onChange={handleFilesInput}
          className="hidden"
          id="files-input-dropzone"
          accept=".xlsx,.xls,.stp,.step,.dwg,.pptx,.ppt"
        />
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 md:mt-6">
        For best results, drop a single project folder.
      </p>
    </div>
  );
}