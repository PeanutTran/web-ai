/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/context/HandWorker.ts

import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// Model configuration for hand detection
const HAND_MODEL_CONFIG = {
  baseOptions: {
    modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
    delegate: "GPU",
  },
  runningMode: "VIDEO",
  numHands: 1,
  minHandDetectionConfidence: 0.3,
  minHandPresenceConfidence: 0.3,
};

// Global variables
let handLandmarker: HandLandmarker | null = null;
let filesetResolver: any = null;
let isDetecting = false;
const frameQueue: any[] = [];
const MAX_QUEUE_SIZE = 1;

// Process detection from queue
const processQueue = async () => {
  if (frameQueue.length > 0 && !isDetecting && handLandmarker) {
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
      const results = await handLandmarker.detectForVideo(imageBitmap, timestamp);
      
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
    
    // Create hand landmarker
    handLandmarker = await HandLandmarker.createFromOptions(
      filesetResolver,
      HAND_MODEL_CONFIG
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
    if (!handLandmarker) {
      self.postMessage({ 
        type: "detectionResult", 
        error: "Hand model not initialized" 
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
    if (handLandmarker) {
      handLandmarker.close();
      handLandmarker = null;
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
