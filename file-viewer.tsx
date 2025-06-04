// src/file-viewer.tsx (or your component's actual path)
"use client";

import { useState } from "react";
import { FileDropZone } from "@/components/file-drop-zone";
import { ExcelViewer } from "@/components/excel-viewer";
import { PowerPointViewer } from "@/components/powerpoint-viewer"; // Assuming this component exists
import { StpViewer } from "@/components/stp-viewer"; // << NEW IMPORT
import { X, FileText, Layers, Type, Presentation as PresentationIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface UploadedItem {
  id: string;
  file: File;
  relativePath: string;
  type: 'excel' | 'stp' | 'dwg' | 'powerpoint' | 'other';
}

const getUploadedItemType = (filename: string): UploadedItem['type'] => {
  const lowerFilename = filename.toLowerCase();
  if (lowerFilename.endsWith(".xlsx") || lowerFilename.endsWith(".xls")) return "excel";
  if (lowerFilename.endsWith(".pptx") || lowerFilename.endsWith(".ppt")) return "powerpoint";
  if (lowerFilename.endsWith(".stp") || lowerFilename.endsWith(".step")) return "stp"; // Correctly identify STP/STEP
  if (lowerFilename.endsWith(".dwg")) return "dwg";
  return "other";
};

const getUploadDisplayName = (items: UploadedItem[] | null): string => {
  if (!items || items.length === 0) return "No files";
  const allHavePaths = items.every(item => item.relativePath && item.relativePath.includes('/'));
  const someHavePaths = items.some(item => item.relativePath && item.relativePath.includes('/'));

  if (allHavePaths) {
    const firstPathParts = items[0].relativePath.split('/');
    if (firstPathParts.length > 0 && firstPathParts[0] !== items[0].file.name) {
      const rootFolder = firstPathParts[0];
      const allShareRoot = items.every(item => item.relativePath.startsWith(rootFolder + '/'));
      if (allShareRoot) return rootFolder;
      return "Multiple Top-Level Folders";
    } else {
       if (items.length === 1) return items[0].file.name;
       return `${items.length} files (root)`;
    }
  } else if (someHavePaths) {
    return "Mixed Folder & Root Files";
  } else {
    if (items.length === 1) return items[0].file.name;
    return `${items.length} files`;
  }
};


export default function FileViewer() {
  const [uploadedItems, setUploadedItems] = useState<UploadedItem[] | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFilesSelected = (files: File[]) => {
    if (files.length === 0) {
      setUploadedItems(null);
      return;
    }
    const processedItems: UploadedItem[] = files.map((file, index) => ({
      id: `${file.name}-${file.lastModified}-${index}-${Math.random().toString(36).substring(2, 15)}`,
      file,
      relativePath: (file as any).webkitRelativePath || file.name,
      type: getUploadedItemType(file.name),
    }));
    setUploadedItems(processedItems);
  };

  const handleClearFiles = () => {
    setUploadedItems(null);
    setIsDragOver(false);
  };

  const getFileIcon = (type: UploadedItem['type']) => {
    switch (type) {
      case 'excel': return <FileText className="w-5 h-5 text-green-600" />;
      case 'stp': return <Layers className="w-5 h-5 text-blue-500" />; // Specific STP icon
      case 'dwg': return <Layers className="w-5 h-5 text-purple-500" />; // DWG icon (example color)
      case 'powerpoint': return <PresentationIcon className="w-5 h-5 text-orange-600" />;
      default: return <Type className="w-5 h-5 text-gray-500" />;
    }
  };

  // Derived file categories
  const primaryExcelFile = uploadedItems?.find(item => item.type === 'excel')?.file || null;
  const allExcelFilesCount = uploadedItems?.filter(item => item.type === 'excel').length || 0;
  const primaryPowerPointFile = uploadedItems?.find(item => item.type === 'powerpoint')?.file || null;
  const stpFileItems = uploadedItems?.filter(item => item.type === 'stp') || [];
  
  const filesForGenericList = uploadedItems?.filter(item => {
    if (item.type === 'excel') return item.file !== primaryExcelFile; // List non-primary Excels
    if (item.type === 'powerpoint') return item.file !== primaryPowerPointFile; // List non-primary PPTs
    if (item.type === 'stp') return false; // STP files are handled by StpViewer
    // For DWG and 'other', they will be included here unless a specific viewer is added for DWG
    return item.type === 'dwg' || item.type === 'other';
  }) || [];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-100">Engineering File Processor</h1>
          <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Upload a folder or individual files. The system processes Excel, PowerPoint, STP, and DWG files.
          </p>
        </div>

        {!uploadedItems ? (
          <FileDropZone
            onFilesUploaded={handleFilesSelected}
            isDragOver={isDragOver}
            onDragOverChange={setIsDragOver}
          />
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {getUploadDisplayName(uploadedItems)}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {uploadedItems.length} file(s) identified.
                </p>
              </div>
              <Button variant="destructive" size="sm" onClick={handleClearFiles} className="mt-3 sm:mt-0">
                Clear All <X className="w-4 h-4 ml-2" />
              </Button>
            </div>

            {/* Excel Viewer Section */}
            {primaryExcelFile && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 md:p-6 shadow-sm">
                <h4 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">
                  Specification Sheet: <span className="font-normal text-green-700 dark:text-green-400">{primaryExcelFile.name}</span>
                </h4>
                <ExcelViewer file={primaryExcelFile} stpFiles={stpFileItems.map(i => i.file)} />
              </div>
            )}
            {!primaryExcelFile && allExcelFilesCount > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-800/30 border border-yellow-300 dark:border-yellow-600 rounded-lg p-4 text-yellow-700 dark:text-yellow-300">
                Multiple Excel files found. The first detected Excel file is used for processing. Others are listed below.
              </div>
            )}
            {!primaryExcelFile && allExcelFilesCount === 0 && uploadedItems.length > 0 && ( // Show only if files are uploaded but no excel
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg p-6 text-center text-red-700 dark:text-red-300">
                <FileText className="w-12 h-12 mx-auto mb-2 text-red-400" />
                No Excel specification sheet (.xlsx, .xls) found in the upload. This is required for processing.
              </div>
            )}

            {/* PowerPoint Viewer Section */}
            {primaryPowerPointFile && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 md:p-6 shadow-sm">
                <h4 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">
                  Presentation Preview: <span className="font-normal text-orange-600 dark:text-orange-400">{primaryPowerPointFile.name}</span>
                </h4>
                <PowerPointViewer file={primaryPowerPointFile} />
              </div>
            )}

            {/* STP Viewer Section */}
            {stpFileItems.length > 0 && (
              <div className="space-y-4"> {/* No extra outer box, StpViewer provides its own */}
                {/* Optional: Add a heading for the STP section if multiple STP viewers are grouped */}
                {/* <h3 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-4">STP/STEP File Previews</h3> */}
                {stpFileItems.map(item => (
                  <StpViewer key={item.id} file={item.file} fileName={item.relativePath} />
                ))}
              </div>
            )}

            {/* Other Files List Section */}
            {filesForGenericList.length > 0 && (
              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 md:p-6 shadow-sm">
                <h4 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">Other Identified Files:</h4>
                <ul className="space-y-2 max-h-96 overflow-y-auto">
                  {filesForGenericList.map(item => (
                    <li key={item.id} className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-md">
                      <div className="flex items-center gap-3 min-w-0">
                        {getFileIcon(item.type)}
                        <span className="text-sm text-gray-700 dark:text-gray-300 truncate" title={item.relativePath}>
                          {item.relativePath}
                        </span>
                      </div>
                      <span className="text-xs font-mono px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded flex-shrink-0">
                        {item.type.toUpperCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}