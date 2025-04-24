/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/context/FaceWorker.ts

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Model configuration for face detection
const FACE_MODEL_CONFIG = {
  baseOptions: {
    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
    delegate: "GPU",
  },
  outputFaceBlendshapes: false, // Disable if not needed
  runningMode: "VIDEO",
  numFaces: 1,
  minFaceDetectionConfidence: 0.3
};

// Global variables
let faceLandmarker: FaceLandmarker | null = null;
let filesetResolver: any = null;
let isDetecting = false;
const frameQueue: any[] = [];
const MAX_QUEUE_SIZE = 1;

// Process detection from queue
const processQueue = async () => {
  if (frameQueue.length > 0 && !isDetecting && faceLandmarker) {
    isDetecting = true;
    
    // Get the most recent frame
    const { imageBitmap, timestamp } = frameQueue.pop()!;
    
    // Clear queue to always work with latest frame
    while (frameQueue.length > 0) {
      const oldFrame = frameQueue.shift();
      if (oldFrame?.imageBitmap) {
        oldFrame.imageBitmap.close();
      }
    }
    
    try {
      // Perform detection
      const results = await faceLandmarker.detectForVideo(imageBitmap, timestamp);
      
      // Send results back to main thread
      self.postMessage({ 
        type: "detectionResult", 
        results
      });
    } catch (err) {
      self.postMessage({ 
        type: "detectionResult", 
        error: (err as Error).message 
      });
    } finally {
      // Clean up bitmap
      imageBitmap.close();
      isDetecting = false;
      
      // Process next frame if available
      if (frameQueue.length > 0) {
        setTimeout(processQueue, 0);
      }
    }
  }
};

// Initialize the model
const initialize = async () => {
  try {
    // Initialize FilesetResolver once
    if (!filesetResolver) {
      filesetResolver = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm"
      );
    }
    
    // Create face landmarker
    faceLandmarker = await FaceLandmarker.createFromOptions(
      filesetResolver,
      FACE_MODEL_CONFIG
    );
    
    self.postMessage({ type: "initialized", success: true });
  } catch (err) {
    self.postMessage({ 
      type: "initialized", 
      success: false, 
      error: (err as Error).message 
    });
  }
};

// Handle messages from main thread
self.onmessage = async (e: MessageEvent) => {
  const { type, data } = e.data;

  // Handle initialization
  if (type === "initialize") {
    await initialize();
    return;
  }

  // Handle detection request
  if (type === "detect") {
    if (!faceLandmarker) {
      self.postMessage({ 
        type: "detectionResult", 
        error: "Face model not initialized" 
      });
      return;
    }

    const { imageBitmap, timestamp } = data;
    
    // Manage queue size
    if (frameQueue.length >= MAX_QUEUE_SIZE) {
      const oldestFrame = frameQueue.shift();
      if (oldestFrame?.imageBitmap) {
        oldestFrame.imageBitmap.close();
      }
    }
    
    // Add new frame to queue
    frameQueue.push({ imageBitmap, timestamp });
    
    // Process queue if not already processing
    if (!isDetecting) {
      processQueue();
    }
  }

  // Handle cleanup
  if (type === "cleanup") {
    if (faceLandmarker) {
      faceLandmarker.close();
      faceLandmarker = null;
    }
    
    // Clear frame queue
    while (frameQueue.length > 0) {
      const frame = frameQueue.shift();
      if (frame?.imageBitmap) {
        frame.imageBitmap.close();
      }
    }
    
    self.postMessage({ type: "cleaned", success: true });
  }
};
