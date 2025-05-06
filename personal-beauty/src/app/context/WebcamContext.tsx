/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/context/WebcamContext.tsx

"use client";

import React, { RefObject, createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
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
  cursorRef: RefObject<HTMLDivElement>;
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
  const workerRef = useRef<Worker | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const lightweightFrameId = useRef<number | null>(null);
  const lastDetectTime = useRef(0);
  const lastPositionBeforeFist = useRef<{ x: number; y: number } | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const [handData, setHandData] = useState<HandData>({
    isHandDetected: false,
    cursorPosition: { x: 0, y: 0 },
    isFist: false,
    isOpenHand: false,
  });
  const [isHandDetectionEnabled, setIsHandDetectionEnabled] = useState(true); // Đặt mặc định là false
  const [isIndexFingerRaised, setIsIndexFingerRaised] = useState(false);
  const [detectionResults, setDetectionResults] = useState<{ [key: string]: any }>({});
  const indexRaiseStartTime = useRef<number | null>(null);

  const modelRequirements: { [key: string]: string[] } = {
    [VIEWS.PERSONAL_COLOR]: ["hand", "face"],
    [VIEWS.PERSONAL_BODY_TYPE]: ["pose"],
    [VIEWS.HOME]: ["hand"],
    [VIEWS.HAIR_COLOR]: ["hand", "hair"],
    [VIEWS.PERSONAL_MAKEUP]: ["hand", "face"],
    [VIEWS.COSMETIC_SURGERY]: ["hand", "face"],
  };

  // Hàm kiểm tra cử chỉ tay (dùng cho luồng full detection)
  const detectGesture = useCallback((landmarks: any[]) => {
    const THRESHOLD = 0.1;
    const FIST_DISTANCE_THRESHOLD = 0.15;

    const distanceIndex = Math.hypot(landmarks[8].x - landmarks[5].x, landmarks[8].y - landmarks[5].y);
    const isIndexFolded = landmarks[8].y > landmarks[5].y;
    const isFist = distanceIndex < FIST_DISTANCE_THRESHOLD && isIndexFolded;

    const isOpenHand =
      landmarks[8].y < landmarks[5].y - THRESHOLD &&
      landmarks[12].y < landmarks[9].y - THRESHOLD &&
      landmarks[16].y < landmarks[13].y - THRESHOLD &&
      landmarks[20].y < landmarks[17].y - THRESHOLD;

    return { isFist, isOpenHand };
  }, []);

  // Hàm phát hiện cử chỉ tay và vị trí con trỏ (dùng cho luồng full detection)
  const detectFull = useCallback((landmarks: any[], isIndexRaised: boolean) => {
    if (!landmarks || landmarks.length < 9) {
      // Không đủ điểm landmark -> Không có tay
      return {
        isHandDetected: false,
        cursorPosition: { x: 0, y: 0 },
        isFist: false,
        isOpenHand: false,
        isIndexRaised: false,
      };
    }

    const { isFist, isOpenHand } = detectGesture(landmarks);
    const indexFingerTip = landmarks[8];
    const videoWidth = 320;
    const videoHeight = 240;
    const scaleX = window.innerWidth / videoWidth;
    const scaleY = window.innerHeight / videoHeight;
    const adjustedX = (1 - indexFingerTip.x) * videoWidth * scaleX;
    const adjustedY = indexFingerTip.y * videoHeight * scaleY;
    const clampedX = Math.max(0, Math.min(adjustedX, window.innerWidth - 1));
    const clampedY = Math.max(0, Math.min(adjustedY, window.innerHeight - 1));

    if (isFist && lastPositionBeforeFist.current) {
      // Nếu đang nắm tay: giữ nguyên vị trí trước khi fist
      return {
        isHandDetected: true,
        cursorPosition: lastPositionBeforeFist.current,
        isFist,
        isOpenHand,
        isIndexRaised,
      };
    } else {
      // Khi không fist: cập nhật vị trí mới
      const currentPosition = { x: clampedX, y: clampedY };
      lastPositionBeforeFist.current = currentPosition;
      return {
        isHandDetected: true,
        cursorPosition: currentPosition,
        isFist,
        isOpenHand,
        isIndexRaised,
      };
    }
  }, [detectGesture]);

  const startStream = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 }
        },
      });
      setStream(mediaStream);

      mediaStream.getVideoTracks().forEach((track) => {
        track.addEventListener("ended", async () => {
          console.warn("[WebcamProvider] Video track ended. Restarting...");
          await restartStream();
        });
        track.addEventListener("mute", async () => {
          console.warn("[WebcamProvider] Video track muted. Restarting...");
          await restartStream();
        });
        track.addEventListener("inactive", async () => {
          console.warn("[WebcamProvider] Video track inactive. Restarting...");
          await restartStream();
        });
      });

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

  useEffect(() => {
    startStream();
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        console.error("[WebcamProvider] Error playing video:", err);
      });
    }
  }, [stream]);

  useEffect(() => {
    workerRef.current = new Worker(new URL("../worker/VisionWorker.ts", import.meta.url));
    workerRef.current.onmessage = (e: MessageEvent) => {
      const { type, results } = e.data;
      //console.log("[WebcamContext] Worker message:", { type, results });
      if (type === "detectionResult") {
        if (results?.hand?.landmarks?.length > 0) {
          const landmarks = results.hand.landmarks[0];
          const isIndexRaised = results.hand.isIndexRaised || false;
          const now = performance.now();
          if (isIndexRaised) {
            if (!indexRaiseStartTime.current) indexRaiseStartTime.current = now;
            if (now - indexRaiseStartTime.current >= 300) {
              setIsIndexFingerRaised(true);
            }
          } else {
            indexRaiseStartTime.current = null;
            setIsIndexFingerRaised(false);
          }


          const detected = detectFull(landmarks, isIndexRaised);
          setHandData(detected);
          setDetectionResults(results);
        } else {
          setHandData({
            isHandDetected: false,
            cursorPosition: lastPositionBeforeFist.current || { x: 0, y: 0 },
            isFist: false,
            isOpenHand: false,
          });
          setDetectionResults(results);
          //console.log("[WebcamContext] No hand detected, resetting handData");
        }
      } else if (type === "detectionError") {
        console.error("[WebcamContext] Detection error:", results.error);
      }
    };
    return () => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: "cleanup" });
        workerRef.current.terminate();
      }
    };
  }, [detectFull, isHandDetectionEnabled]);

  useEffect(() => {
    if (!workerRef.current) return;

    const requiredModels = modelRequirements[currentView] || ["hand"];
    const allModels = ["hand", "face", "pose", "hair"];
    const unusedModels = allModels.filter(m => !requiredModels.includes(m));

    unusedModels.forEach(modelType => {
      workerRef.current!.postMessage({ type: "cleanup", data: { modelType } });
    });

    requiredModels.forEach(modelType => {
      workerRef.current!.postMessage({ type: "initialize", data: { modelType } });
    });

  }, [currentView]);

  // Luồng phát hiện chính
  useEffect(() => {
    if (!stream || !videoRef.current || !workerRef.current) return;

    const video = videoRef.current;
    const detect = async () => {
      const now = performance.now();

      // Điều chỉnh FPS: nhanh hơn khi có hand detection
      let minInterval = 100;
      if (isHandDetectionEnabled) {
        if (isIndexFingerRaised)
          minInterval = 33;
        else minInterval = 66;
      } else {
        minInterval = 125;
      }

      if (now - lastDetectTime.current < minInterval) {
        animationFrameId.current = requestAnimationFrame(detect);
        return;
      }

      lastDetectTime.current = now;

      if (video.readyState < 4 || video.paused) {
        console.warn("[WebcamProvider] Video not ready or paused, skipping frame.");
        animationFrameId.current = requestAnimationFrame(detect);
        return;
      }

      try {
        const imageBitmap = await createImageBitmap(video);
        if (imageBitmap.width === 0 || imageBitmap.height === 0) {
          console.warn("[WebcamProvider] Empty ImageBitmap, skipping frame.");
          animationFrameId.current = requestAnimationFrame(detect);
          return;
        }
        const modelTypes = modelRequirements[currentView] || ["hand"];

        workerRef.current!.postMessage({
          type: "detect",
          data: {
            imageBitmap,
            timestamp: now,
            modelTypes
          },
        }, [imageBitmap]);
      } catch (err) {
        console.error("Error creating bitmap:", err);
      }

      animationFrameId.current = requestAnimationFrame(detect);
    };

    detect();

    return () => {
      if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    };
  }, [stream, currentView, isHandDetectionEnabled, isIndexFingerRaised]);

  // Luồng phát hiện nhẹ (lightweight detection) để kích hoạt lại khi isHandDetectionEnabled = false
  // useEffect(() => {
  //   if (!stream || !videoRef.current || !workerRef.current || isHandDetectionEnabled) {
  //     console.log("[WebcamProvider] Lightweight detection loop skipped:", {
  //       hasStream: !!stream,
  //       hasVideoRef: !!videoRef.current,
  //       hasWorker: !!workerRef.current,
  //       isHandDetectionEnabled,
  //     });
  //     return;
  //   }

  //   const video = videoRef.current;
  //   const canvas = document.createElement("canvas");
  //   canvas.width = 320;
  //   canvas.height = 240;
  //   const ctx = canvas.getContext("2d");

  //   const lightweightDetect = () => {
  //     const now = performance.now();
  //     if (now - lastLightweightDetectTime.current < 500) { // 2 FPS
  //       lightweightFrameId.current = requestAnimationFrame(lightweightDetect);
  //       return;
  //     }
  //     lastLightweightDetectTime.current = now;

  //     if (!ctx || video.readyState < 4) {
  //       console.log("[WebcamProvider] Video not ready for lightweight detection:", {
  //         ctxExists: !!ctx,
  //         videoReadyState: video.readyState,
  //       });
  //       lightweightFrameId.current = requestAnimationFrame(lightweightDetect);
  //       return;
  //     }

  //     console.log("[WebcamProvider] Sending frame to worker (lightweight detection)...");
  //     ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  //     const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  //     const modelTypes = ["hand"];
  //     workerRef.current!.postMessage(
  //       {
  //         type: "detect",
  //         data: {
  //           imageData,
  //           timestamp: now,
  //           modelTypes,
  //         },
  //       },
  //       [imageData.data.buffer]
  //     );

  //     lightweightFrameId.current = requestAnimationFrame(lightweightDetect);
  //   };

  //   lightweightDetect();

  //   return () => {
  //     if (lightweightFrameId.current) {
  //       cancelAnimationFrame(lightweightFrameId.current);
  //     }
  //   };
  // }, [stream, isHandDetectionEnabled]);

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
        isHandDetectionEnabled, // Truyền ra để đồng bộ
        currentView,
        detectionResults,
        setCurrentView,
        cursorRef: cursorRef as any,
      }}
    >
      {children}
      <video ref={videoRef} className="hidden" />
    </WebcamContext.Provider>
  );
};