// src/app/api/render-stp/route.ts
import { NextRequest, NextResponse } from "next/server";

// IMPORTANT: Set this environment variable in your .env.local or deployment environment
// This URL should point to your Python backend's endpoint that expects the file.
// Example from your successful cURL: http://localhost:5050/render
const PYTHON_RENDERER_URL = process.env.PYTHON_RENDERER_URL;

export async function POST(request: NextRequest) {
  if (!PYTHON_RENDERER_URL) {
    console.error("PYTHON_RENDERER_URL environment variable is not set.");
    return NextResponse.json(
      { error: "Server configuration error: Renderer URL not set." },
      { status: 500 }
    );
  }

  try {
    // 1. Get the file from the incoming request (from your frontend/browser)
    const formDataFromFrontend = await request.formData();
    const file = formDataFromFrontend.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided in the request." }, { status: 400 });
    }

    // 2. Prepare a new FormData to send to the Python backend
    const backendFormData = new FormData();
    // The Python backend expects the file under the field name "file",
    // as seen in your successful cURL command: curl -F "file=@..."
    // It's important to pass the original filename as the third argument to append.
    backendFormData.append("file", file, file.name);

    // 3. Make the "cURL-like" request to the Python backend
    // This is the part that makes one request and has the file uploaded to Python.
    const pythonResponse = await fetch(PYTHON_RENDERER_URL, {
      method: "POST",
      body: backendFormData,
      // NOTE: When using `fetch` with a `FormData` object as the body,
      // `Content-Type: multipart/form-data` with the correct boundary
      // is set automatically by `fetch`. You should NOT set it manually.
    });

    // 4. Handle the response from the Python backend
    if (!pythonResponse.ok) {
      // The Python backend indicated an error.
      let errorBodyText = "Unknown error from the Python rendering service.";
      try {
          // Try to parse as JSON, then text, to get more detailed error from Python
          const errorData = await pythonResponse.json().catch(() => null);
          if (errorData && errorData.error) {
              errorBodyText = errorData.error;
          } else if (errorData && errorData.description) { // Flask might use 'description'
              errorBodyText = errorData.description;
          } else {
              // If not JSON or no specific error field, use the raw text
              errorBodyText = await pythonResponse.text();
          }
      } catch (e) {
          // Fallback if .text() also fails or if response wasn't text/json
          errorBodyText = await pythonResponse.text().catch(() => `Python service responded with status ${pythonResponse.status}`);
      }
      console.error(`Python backend error (${pythonResponse.status}):`, errorBodyText);
      return NextResponse.json(
        { error: "Python renderer failed to process the file.", details: errorBodyText },
        { status: pythonResponse.status } // Forward Python's status code
      );
    }

    // 5. If Python backend processed successfully (e.g., returned a ZIP file)
    //    Stream the response body (the ZIP file) back to the original client.
    const blob = await pythonResponse.blob();

    // Forward relevant headers from the Python response (like Content-Type, Content-Disposition)
    const headers = new Headers();
    headers.set("Content-Type", pythonResponse.headers.get("Content-Type") || "application/zip"); // Default to application/zip if not provided
    // Try to construct a useful filename for the download
    const originalFileNameNoExt = file.name.split('.').slice(0, -1).join('.');
    const defaultDisposition = `attachment; filename="${originalFileNameNoExt}_previews.zip"`;
    headers.set("Content-Disposition", pythonResponse.headers.get("Content-Disposition") || defaultDisposition);


    return new NextResponse(blob, {
      status: 200, // Or pythonResponse.status if you want to be exact
      headers: headers,
    });

  } catch (error: any) {
    console.error("Error in /api/render-stp proxy:", error);
    // Check for specific fetch-related errors, like the Python server being down
    if (error.cause && (error.cause as any).code === 'ECONNREFUSED') {
        return NextResponse.json(
            { error: "Could not connect to the STP rendering service. Please ensure it's running and accessible.", details: `Connection refused at ${PYTHON_RENDERER_URL}`},
            { status: 503 } // Service Unavailable
        );
    }
    // Generic internal server error for other issues
    return NextResponse.json(
      { error: "Internal server error while proxying to STP renderer.", details: error.message },
      { status: 500 }
    );
  }
}