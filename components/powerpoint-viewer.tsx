// components/powerpoint-viewer.tsx
"use client"

import { useState, useEffect } from "react"
import { ChevronLeft, ChevronRight, Presentation } from "lucide-react"
import { Button } from "@/components/ui/button" // Assuming you have this Button component

interface PowerPointViewerProps {
  file: File
}

export function PowerPointViewer({ file }: PowerPointViewerProps) {
  // slides will now store image URLs
  const [slides, setSlides] = useState<string[]>([])
  const [currentSlide, setCurrentSlide] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadPowerPointImages = async () => {
      try {
        setLoading(true)
        setError(null)

        // Create FormData to send the file
        const formData = new FormData()
        formData.append("file", file)

        const response = await fetch("/api/convert-pptx", {
          method: "POST",
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "Failed to convert PowerPoint file.")
        }

        const data = await response.json()
        if (!data.slideImageUrls || data.slideImageUrls.length === 0) {
          throw new Error("No slide images received from server.")
        }

        setSlides(data.slideImageUrls)
        setLoading(false)
        setCurrentSlide(0) // Reset to first slide on new file
      } catch (error) {
        console.error("Error loading PowerPoint images:", error)
        setError(error instanceof Error ? error.message : "Failed to load PowerPoint file images")
        setLoading(false)
      }
    }

    // Only load if file is present
    if (file) {
      loadPowerPointImages()
    }

    // Cleanup when component unmounts or file changes
    return () => {
      // You could theoretically send a cleanup signal to the server here
      // if you had a more sophisticated cleanup mechanism that awaited client finish.
      // For now, the server-side setTimeout handles it.
    }
  }, [file]) // Rerun effect when file changes

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-400">Converting PowerPoint slides...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <Presentation className="w-12 h-12 mx-auto mb-4 text-red-400" />
        <p className="text-red-600 dark:text-red-400">Error: {error}</p>
        <p className="text-sm text-gray-500 mt-2">Please try uploading a different PowerPoint file or check server configuration.</p>
      </div>
    )
  }

  if (slides.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Presentation className="w-12 h-12 mx-auto mb-4 text-gray-400" />
        <p>No slides found or converted for this PowerPoint file.</p>
      </div>
    )
  }

  const currentSlideUrl = slides[currentSlide]

  return (
    <div className="space-y-6">
      {/* Slide Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
          disabled={currentSlide === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Previous
        </Button>

        <span className="text-sm text-gray-600 dark:text-gray-400">
          Slide {currentSlide + 1} of {slides.length}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
          disabled={currentSlide === slides.length - 1}
        >
          Next
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {/* Slide Content (Image) */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-2 min-h-[500px] shadow-sm flex items-center justify-center">
        {currentSlideUrl ? (
          // Using a div with background-image or an img tag depending on styling needs
          // For simplicity and direct control, <img> is good here.
          <img
            src={currentSlideUrl}
            alt={`Slide ${currentSlide + 1}`}
            className="max-w-full max-h-[calc(70vh-80px)] object-contain rounded-md" // Adjust max-height as needed
            onError={(e) => {
              e.currentTarget.src = "/placeholder-error.png"; // Fallback image
              e.currentTarget.alt = "Image failed to load";
              setError("Failed to load slide image. It might have been cleaned up or there's a server issue.");
            }}
          />
        ) : (
          <div className="text-center text-gray-500">No image available for this slide.</div>
        )}
      </div>

      {/* Slide Thumbnails */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thumb-gray-400 scrollbar-track-gray-200 scrollbar-thin">
        {slides.map((slideUrl, index) => (
          <button
            key={index}
            onClick={() => setCurrentSlide(index)}
            className={`flex-shrink-0 w-24 h-16 border-2 rounded transition-all overflow-hidden p-1 ${
              currentSlide === index
                ? "border-blue-600 bg-blue-50 dark:bg-blue-950"
                : "border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500"
            }`}
          >
            <img
              src={slideUrl}
              alt={`Thumbnail ${index + 1}`}
              className="w-full h-full object-contain rounded"
            />
            <div className="absolute bottom-1 right-1 text-[10px] text-gray-600 dark:text-gray-400 bg-white/70 dark:bg-gray-900/70 px-1 rounded">
              {index + 1}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}