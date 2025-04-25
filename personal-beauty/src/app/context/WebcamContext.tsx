/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/context/WebcamContext.tsx (Multi-Worker Version)

"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { ViewType, VIEWS } from "../constants/views";

interface HandData {
  isHandDetected: boolean;
  cursorPosition: { x: number; y: number };
  isFist: boolean;
  isOpenHand: boolean;
}

interface WebcamContextType {
  stream: MediaStream | null;
  videoRef: any;
  error: string | null;
  restartStream: () => Promise<void>;
  handData: HandData;
  setIsHandDetectionEnabled: (enabled: boolean) => void;
  isIndexFingerRaised: boolean;
  isHandDetectionEnabled: boolean;
  detectionResults: { [key: string]: any };
  currentView: string;
  setCurrentView: (view: any) => void;
}

const WebcamContext = createContext<WebcamContextType | undefined>(undefined);

export const useWebcam = () => {
  const context = useContext(WebcamContext);
  if (!context) {
    throw new Error("useWebcam must be used within a WebcamProvider");
  }
  return context;
};

export const WebcamProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<string>(VIEWS.HOME);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Multi-worker refs
  const handWorkerRef = useRef<Worker | null>(null);
  const faceWorkerRef = useRef<Worker | null>(null);
  
  const animationFrameId = useRef<number | null>(null);
  const lastDetectTime = useRef(0);
  const lastPositionBeforeFist = useRef<{ x: number; y: number } | null>(null);
  const smoothPosition = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // Smooth position filter
  const ALPHA = 0.4;
  
  // FPS control
  const DETECTION_INTERVAL = 80; // ~12 FPS
  
  const [handData, setHandData] = useState<HandData>({
    isHandDetected: false,
    cursorPosition: { x: 0, y: 0 },
    isFist: false,
    isOpenHand: false,
  });
  const [isHandDetectionEnabled, setIsHandDetectionEnabled] = useState(true);
  const [isIndexFingerRaised, setIsIndexFingerRaised] = useState(false);
  const [detectionResults, setDetectionResults] = useState<{ [key: string]: any }>({});
  
  // Tracking which models should be active for each view
  const modelRequirements: { [key: string]: string[] } = {
    [VIEWS.PERSONAL_COLOR]: ["hand", "face"],
    [VIEWS.PERSONAL_BODY_TYPE]: ["hand", "face"],
    [VIEWS.HOME]: ["hand"],
    [VIEWS.HAIR_COLOR]: ["hand"],
    [VIEWS.PERSONAL_MAKEUP]: ["hand", "face"],
    [VIEWS.COSMETIC_SURGERY]: ["hand", "face"],
  };
  
  // Worker initialization states
  const [isHandWorkerInitialized, setIsHandWorkerInitialized] = useState(false);
  const [isFaceWorkerInitialized, setIsFaceWorkerInitialized] = useState(false);

  // Hand landmark detection functions
  const detectIndexFinger = useCallback((landmarks: any[]) => {
    const THRESHOLD = 0.05;
    return landmarks[8].y < landmarks[5].y - THRESHOLD;
  }, []);

  const detectGesture = useCallback((landmarks: any[]) => {
    const THRESHOLD = 0.1;

    // Simplified fist detection
    const isFist = 
      Math.abs(landmarks[8].y - landmarks[0].y) < 0.1 && 
      Math.abs(landmarks[12].y - landmarks[0].y) < 0.1;

    // Open hand detection
    const isOpenHand =
      landmarks[8].y < landmarks[5].y - THRESHOLD &&
      landmarks[12].y < landmarks[9].y - THRESHOLD &&
      landmarks[16].y < landmarks[13].y - THRESHOLD &&
      landmarks[20].y < landmarks[17].y - THRESHOLD;

    // Index finger detection
    const isIndexRaised = landmarks[8].y < landmarks[5].y - THRESHOLD;

    return { isFist, isOpenHand, isIndexRaised };
  }, []);

  const detectFull = useCallback(
    (landmarks: any[]) => {
      const { isFist, isOpenHand, isIndexRaised } = detectGesture(landmarks);
      const indexFingerTip = landmarks[8];
      
      // Use actual video dimensions
      const videoWidth = 640;
      const videoHeight = 480;
      const scaleX = window.innerWidth / videoWidth;
      const scaleY = window.innerHeight / videoHeight;
      const adjustedX = indexFingerTip.x * videoWidth * scaleX;
      const adjustedY = indexFingerTip.y * videoHeight * scaleY;
      
      // Constrain to window bounds
      const clampedX = Math.max(0, Math.min(adjustedX, window.innerWidth - 1));
      const clampedY = Math.max(0, Math.min(adjustedY, window.innerHeight - 1));

      let currentPosition: { x: number; y: number };
      
      if (isFist) {
        if (!lastPositionBeforeFist.current) {
          lastPositionBeforeFist.current = smoothPosition.current;
        }
        currentPosition = lastPositionBeforeFist.current;
      } else {
        // Initialize smooth position on first detection
        if (smoothPosition.current.x === 0 && smoothPosition.current.y === 0) {
          smoothPosition.current = { x: clampedX, y: clampedY };
        }

        // Dynamic alpha based on movement speed
        const distance = Math.sqrt(
          Math.pow(clampedX - smoothPosition.current.x, 2) + 
          Math.pow(clampedY - smoothPosition.current.y, 2)
        );
        
        // Faster movement = less smoothing
        const dynamicAlpha = distance > 100 ? 0.7 : ALPHA;

        // Apply exponential moving average with dynamic alpha
        smoothPosition.current.x = dynamicAlpha * clampedX + (1 - dynamicAlpha) * smoothPosition.current.x;
        smoothPosition.current.y = dynamicAlpha * clampedY + (1 - dynamicAlpha) * smoothPosition.current.y;

        currentPosition = {
          x: Math.round(smoothPosition.current.x),
          y: Math.round(smoothPosition.current.y),
        };
        lastPositionBeforeFist.current = null;
      }

      return {
        isHandDetected: true,
        cursorPosition: currentPosition,
        isFist,
        isOpenHand,
        isIndexRaised,
      };
    },
    [detectGesture]
  );

  const startStream = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15 }
        },
      });
      setStream(mediaStream);
    } catch (err) {
      console.error("[WebcamProvider] Error accessing webcam:", err);
      setError("Failed to access webcam. Please check your camera permissions.");
    }
  };

  const restartStream = async () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    setStream(null);
    await startStream();
  };

  // Initial stream setup
  useEffect(() => {
    startStream();
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Connect stream to video element
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        console.error("[WebcamProvider] Error playing video:", err);
      });
    }
  }, [stream]);

  // Initialize Hand worker
  useEffect(() => {
    // Create a dedicated worker for hand detection
    handWorkerRef.current = new Worker(new URL("./HandWorker.ts", import.meta.url));

    handWorkerRef.current.onmessage = (e: MessageEvent) => {
      const { type, success, error, results } = e.data;

      if (type === "initialized") {
        if (success) {
          console.log("[WebcamProvider] Hand model initialized successfully");
          setIsHandWorkerInitialized(true);
        } else {
          setError(`Failed to initialize hand model: ${error}`);
          console.error("[WebcamProvider] Hand model initialization failed:", error);
        }
      }

      if (type === "detectionResult") {
        if (error) {
          console.error("[WebcamProvider] Hand detection error:", error);
          return;
        }
        
        // Process hand landmarks if available
        if (results && results.landmarks && results.landmarks.length > 0) {
          const landmarks = results.landmarks[0];
          const isIndexRaised = detectIndexFinger(landmarks);
          
          if (isHandDetectionEnabled) {
            const fullDetection = detectFull(landmarks);
            
            // Update hand detection results
            setIsIndexFingerRaised(fullDetection.isIndexRaised);
            setHandData({
              isHandDetected: fullDetection.isHandDetected,
              cursorPosition: fullDetection.cursorPosition,
              isFist: fullDetection.isFist,
              isOpenHand: fullDetection.isOpenHand,
            });
            
            // Update overall detection results
            setDetectionResults(prev => ({
              ...prev,
              hand: results
            }));
          } else {
            const { isFist, isOpenHand, isIndexRaised: updatedIndexRaised } = detectGesture(landmarks);
            
            // Re-enable full detection if hand is detected
            setIsIndexFingerRaised(updatedIndexRaised);
            setIsHandDetectionEnabled(true);
            
            setHandData(prev => ({
              ...prev,
              isHandDetected: true,
              isFist,
              isOpenHand,
            }));
            
            // Update overall detection results
            setDetectionResults(prev => ({
              ...prev,
              hand: results
            }));
          }
        } else {
          // No hand detected
          setIsIndexFingerRaised(false);
          setHandData({
            isHandDetected: false,
            cursorPosition: smoothPosition.current, // Keep last position
            isFist: false,
            isOpenHand: false,
          });
          
          // Update overall detection results
          setDetectionResults(prev => ({
            ...prev,
            hand: results
          }));
        }
      }
    };

    handWorkerRef.current.onerror = (error) => {
      console.error("[WebcamProvider] Hand worker error:", error);
    };

    // Initialize hand model
    handWorkerRef.current.postMessage({ type: "initialize" });

    return () => {
      if (handWorkerRef.current) {
        handWorkerRef.current.terminate();
      }
    };
  }, [isHandDetectionEnabled, detectFull, detectGesture, detectIndexFinger]);

  // Initialize Face worker
  useEffect(() => {
    // Create a dedicated worker for face detection
    faceWorkerRef.current = new Worker(new URL("./FaceWorker.ts", import.meta.url));

    faceWorkerRef.current.onmessage = (e: MessageEvent) => {
      const { type, success, error, results } = e.data;

      if (type === "initialized") {
        if (success) {
          console.log("[WebcamProvider] Face model initialized successfully");
          setIsFaceWorkerInitialized(true);
        } else {
          setError(`Failed to initialize face model: ${error}`);
          console.error("[WebcamProvider] Face model initialization failed:", error);
        }
      }

      if (type === "detectionResult") {
        if (error) {
          console.error("[WebcamProvider] Face detection error:", error);
          return;
        }
        
        // Update overall detection results with face data
        setDetectionResults(prev => ({
          ...prev,
          face: results
        }));
      }
    };

    faceWorkerRef.current.onerror = (error) => {
      console.error("[WebcamProvider] Face worker error:", error);
    };

    // Initialize face model
    faceWorkerRef.current.postMessage({ type: "initialize" });

    return () => {
      if (faceWorkerRef.current) {
        faceWorkerRef.current.terminate();
      }
    };
  }, []);

  // Detection loop for hand worker
  useEffect(() => {
    if (!stream || !videoRef.current || !handWorkerRef.current || !isHandWorkerInitialized) {
      return;
    }

    const video = videoRef.current;
    const detectHand = async () => {
      const now = performance.now();
      
      // Limit detection rate
      if (now - lastDetectTime.current < DETECTION_INTERVAL) {
        animationFrameId.current = requestAnimationFrame(detectHand);
        return;
      }
      lastDetectTime.current = now;
    
      if (video.readyState < 2) {
        animationFrameId.current = requestAnimationFrame(detectHand);
        return;
      }
    
      try {
        // Only send frames if hand detection needed for current view
        const currentRequirements = modelRequirements[currentView] || ["hand"];
        if (currentRequirements.includes("hand")) {
          const imageBitmap = await createImageBitmap(video);
          handWorkerRef.current!.postMessage(
            {
              type: "detect",
              data: {
                imageBitmap,
                timestamp: now
              },
            },
            [imageBitmap]
          );
        }
      } catch (err) {
        console.error("[WebcamProvider] Error creating bitmap for hand detection:", err);
      }
    
      animationFrameId.current = requestAnimationFrame(detectHand);
    };    

    detectHand();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [stream, currentView, isHandWorkerInitialized, DETECTION_INTERVAL, modelRequirements]);

  // Detection loop for face worker with lower frequency
  useEffect(() => {
    if (!stream || !videoRef.current || !faceWorkerRef.current || !isFaceWorkerInitialized) {
      return;
    }

    const video = videoRef.current;
    let faceDetectionFrameId: number | null = null;
    let lastFaceDetectTime = 0;
    
    // Face detection runs at lower frame rate (5 FPS)
    const FACE_DETECTION_INTERVAL = 200;
    
    const detectFace = async () => {
      const now = performance.now();
      
      // Limit detection rate
      if (now - lastFaceDetectTime < FACE_DETECTION_INTERVAL) {
        faceDetectionFrameId = requestAnimationFrame(detectFace);
        return;
      }
      lastFaceDetectTime = now;
    
      if (video.readyState < 2) {
        faceDetectionFrameId = requestAnimationFrame(detectFace);
        return;
      }
    
      try {
        // Only send frames if face detection needed for current view
        const currentRequirements = modelRequirements[currentView] || ["hand"];
        if (currentRequirements.includes("face")) {
          const imageBitmap = await createImageBitmap(video);
          faceWorkerRef.current!.postMessage(
            {
              type: "detect",
              data: {
                imageBitmap,
                timestamp: now
              },
            },
            [imageBitmap]
          );
        }
      } catch (err) {
        console.error("[WebcamProvider] Error creating bitmap for face detection:", err);
      }
    
      faceDetectionFrameId = requestAnimationFrame(detectFace);
    };    

    detectFace();

    return () => {
      if (faceDetectionFrameId) {
        cancelAnimationFrame(faceDetectionFrameId);
      }
    };
  }, [stream, currentView, isFaceWorkerInitialized, modelRequirements]);

  return (
    <WebcamContext.Provider
      value={{
        stream,
        videoRef,
        error,
        restartStream,
        handData,
        setIsHandDetectionEnabled,
        isIndexFingerRaised,
        isHandDetectionEnabled,
        currentView,
        detectionResults,
        setCurrentView
      }}
    >
      {children}
      <video ref={videoRef} className="hidden" />
    </WebcamContext.Provider>
  );
};
