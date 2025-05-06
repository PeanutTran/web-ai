/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/pages/PersonalColor.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext";
import { VIEWS } from "../constants/views";
import { useHandControl } from "../context/HandControlContext";
import HairSelection from "../components/HairSelection";
import AnalysisLayout from "../components/AnalysisLayout";

export default function HairColor() {
  const { stream, setCurrentView, detectionResults, error: webcamError } = useWebcam();
  const { setIsLoading } = useLoading();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const displayVideoRef = useRef<HTMLVideoElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const [makeupSuggestion, setMakeupSuggestion] = useState<any | null>(null);
  const prevAvgColorRef = useRef<{ r: number; g: number; b: number } | null>(
    null
  );
  const selectedHairColor = useRef<number[] | null>(null);
  const ctxRef = useRef<any>(null);
  const isVideoReady = useRef(false);
  const scrollContainerRef: any = useRef(null);
  const lastStableTime = useRef<number | null>(null);
  const lastUnstableTime = useRef<number | null>(null);
  const STABILITY_THRESHOLD = 0.2;
  const HISTORY_SIZE = 5;
  const STABILITY_DURATION = 1000;
  const MIN_STABLE_DURATION = 500;
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("Initializing camera...");
  const [isFrameStable, setIsFrameStable] = useState(false);
  const landmarkHistoryRef = useRef<any>([]);
  const [noFaceDetectedDuration, setNoFaceDetectedDuration] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const lastDrawTime = useRef(0);
  const biggerPer = useRef(0);
  const isFinger = useRef(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hairColorList, _setHairColorList] = useState<any[]>([
    { key: "0", name: "Jet Black", rgb: [10, 10, 10] },
    { key: "1", name: "Soft Black", rgb: [40, 30, 30] },
    { key: "2", name: "Dark Brown", rgb: [60, 40, 30] },
    { key: "3", name: "Chestnut Brown", rgb: [90, 60, 40] },
    { key: "4", name: "Chocolate Brown", rgb: [120, 80, 60] },
    { key: "5", name: "Toffee Brown", rgb: [150, 100, 80] },
    { key: "6", name: "Caramel Brown", rgb: [170, 120, 80] },
    { key: "7", name: "Light Brown", rgb: [200, 140, 90] },
    { key: "8", name: "Golden Bronze", rgb: [220, 160, 60] },
    { key: "9", name: "Golden Yellow", rgb: [255, 197, 0] },
    { key: "10", name: "Copper Orange", rgb: [255, 130, 60] },
    { key: "11", name: "Auburn", rgb: [170, 60, 60] },
    { key: "12", name: "Burgundy", rgb: [120, 30, 50] },
    { key: "13", name: "Mahogany", rgb: [160, 40, 90] },
    { key: "14", name: "Scarlet Red", rgb: [220, 40, 60] },
    { key: "15", name: "Magenta", rgb: [180, 60, 120] },
    { key: "16", name: "Ash Gray", rgb: [180, 180, 180] },
    { key: "17", name: "Platinum Blonde", rgb: [245, 245, 245] },
    { key: "18", name: "Olive Green", rgb: [100, 120, 90] },
    { key: "19", name: "Cool Gray", rgb: [130, 130, 130] },
  ]);
  const [filterHair, setSelectedHair] = useState<any>(null);
  const scrollByAmount = 480;
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const { registerElement, unregisterElement, isHandDetectionEnabled } = useHandControl();
  const isRegistered = useRef(false);

  useEffect(() => {
    const buttons = buttonRefs.current;
    if (!Array.isArray(buttons) || buttons.length === 0) return;
  
    buttons.forEach((button) => {
      if (!button) return;
  
      if (isHandDetectionEnabled && !isRegistered.current) {
        button.classList.add("hoverable");
        registerElement(button);
      } else if (!isHandDetectionEnabled && isRegistered.current) {
        button.classList.remove("hoverable");
        unregisterElement(button);
      }
    });
  
    isRegistered.current = isHandDetectionEnabled;
  
    return () => {
      if (isRegistered.current) {
        buttons.forEach((button) => {
          if (!button) return;
          button.classList.remove("hoverable");
          unregisterElement(button);
        });
        isRegistered.current = false;
      }
    };
  }, [registerElement, unregisterElement, isHandDetectionEnabled]);

  const handleScrollUp = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current!.scrollBy({ top: -scrollByAmount, behavior: 'smooth' });
    }
  };

  const handleScrollDown = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ top: scrollByAmount, behavior: 'smooth' });
    }
  };


  function getNearestHairColorName(r: number, g: number, b: number) {
    let minDistance = Infinity;
    let bestMatch = "Unknown";

    for (const color of hairColorList) {
      const [cr, cg, cb] = color.rgb;
      const distance = Math.sqrt(
        Math.pow(r - cr, 2) + Math.pow(g - cg, 2) + Math.pow(b - cb, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = color.name;
      }
    }

    return bestMatch;
  }

  useEffect(() => {
    setCurrentView(VIEWS.HAIR_COLOR);
  }, []);

  useEffect(() => {
    if (stream && displayVideoRef.current && !isVideoReady.current) {
        displayVideoRef.current.srcObject = stream;
        displayVideoRef.current.onloadedmetadata = () => {
            displayVideoRef.current!.play().then(() => {
                isVideoReady.current = true;
                setIsLoading(false);
                setStatusMessage("Please keep your face steady for analysis");
                setProgress(20);
            }).catch((err) => {
                console.error("[PersonalColor] Error playing video:", err);
            });
        };
    }
  }, [stream, setIsLoading]);

  const onChangeSelectHair = useCallback((color: any) => {
    selectedHairColor.current = color.rgb;
    setSelectedHair(color.key);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function blurMask(maskData: any, width: any, height: any) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d') as any;
  
    const imageData = tempCtx.createImageData(width, height);
    const data = imageData.data;
    for (let i = 0; i < maskData.length; i++) {
      const value = maskData[i] * 255;
      data[i * 4] = value; // R
      data[i * 4 + 1] = value; // G
      data[i * 4 + 2] = value; // B
      data[i * 4 + 3] = 255; // Alpha
    }
    tempCtx.putImageData(imageData, 0, 0);

    tempCtx.filter = 'blur(2px)'; 
    tempCtx.drawImage(tempCanvas, 0, 0);

    const blurredImageData = tempCtx.getImageData(0, 0, width, height);
    const blurredData = new Float32Array(maskData.length);
    for (let i = 0; i < maskData.length; i++) {
      blurredData[i] = blurredImageData.data[i * 4] / 255;
    }

    return blurredData;
  }

  const detectHair = () => {
    try {
      const now = performance.now();
      if (now - lastDrawTime.current < 1000 / 60) { // Giới hạn 60 FPS
          animationFrameId.current = requestAnimationFrame(detectHair);
          return;
      }
      lastDrawTime.current = now;
      if (!canvasRef.current || !displayVideoRef.current) {
        return;
      }
      const maskData = detectionResults?.hair?.data;
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!ctx) {
          setError("Failed to initialize canvas.");
          return;
      }
      if (detectionResults?.hair) {
        if (detectionResults.hair.timestamp < biggerPer.current) {
          return;
        }
        if (isFinger.current) {
          return;
        }
        if (maskData && maskData.length > 0) {
          const landmarks = maskData;
          checkFrameStability(landmarks);
          if (isFrameStable) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const imageData = ctxRef.current.getImageData(0, 0, detectionResults.hair.width, detectionResults.hair.height);
            biggerPer.current = detectionResults.hair.timestamp;
            const data = imageData.data;
            const hairPixelIndices = [];
            for (let i = 0; i < maskData.length; i++) {
              if (maskData[i] === 1) {
                hairPixelIndices.push(i); // Lưu chỉ số pixel thuộc tóc
              }
            }
            if (selectedHairColor.current) {
              for (const i of hairPixelIndices) {
                const pixelIndex = i * 4;
                const blendAlpha = 0.5; // Controls RGB blending ratio
                const overlayOpacity = 0.5; // Controls overall opacity (adjust as needed)
            
                // Blend RGB values
                data[pixelIndex] =
                  data[pixelIndex] * (1 - blendAlpha) +
                  selectedHairColor.current[0] * blendAlpha; // Red
                data[pixelIndex + 1] =
                  data[pixelIndex + 1] * (1 - blendAlpha) +
                  selectedHairColor.current[1] * blendAlpha; // Green
                data[pixelIndex + 2] =
                  data[pixelIndex + 2] * (1 - blendAlpha) +
                  selectedHairColor.current[2] * blendAlpha; // Blue
            
                // Set alpha to achieve semi-transparency
                data[pixelIndex + 3] = Math.round(255 * overlayOpacity); // e.g., 50% opacity = 127.5
              }
            }
    
            ctxRef.current.putImageData(imageData, 0, 0);
            if (hairPixelIndices.length === 0) {
              setMakeupSuggestion("Hair color cannot be detected.");
              return;
            }
    
            // Tính toán màu trung bình của tóc
            let rTotal = 0,
              gTotal = 0,
              bTotal = 0;
            for (const i of hairPixelIndices) {
              const pixelIndex = i * 4; // Chỉ số trong mảng `data` (RGBA)
              rTotal += data[pixelIndex]; // Tổng giá trị màu đỏ
              gTotal += data[pixelIndex + 1]; // Tổng giá trị màu xanh lá
              bTotal += data[pixelIndex + 2]; // Tổng giá trị màu xanh dương
            }
    
            // Tính giá trị trung bình cho từng kênh màu
            const pixelCount = hairPixelIndices.length;
            const avgR = Math.round(rTotal / pixelCount);
            const avgG = Math.round(gTotal / pixelCount);
            const avgB = Math.round(bTotal / pixelCount);
    
            // Làm mượt kết quả qua nhiều khung hình
            const smoothingFactor = 0.8; // Hệ số làm mượt (0.0 - 1.0)
            const prevAvgColor = prevAvgColorRef.current || { r: 0, g: 0, b: 0 };
            const smoothedR = Math.round(
              smoothingFactor * prevAvgColor.r + (1 - smoothingFactor) * avgR
            );
            const smoothedG = Math.round(
              smoothingFactor * prevAvgColor.g + (1 - smoothingFactor) * avgG
            );
            const smoothedB = Math.round(
              smoothingFactor * prevAvgColor.b + (1 - smoothingFactor) * avgB
            );
            prevAvgColorRef.current = { r: smoothedR, g: smoothedG, b: smoothedB };
    
            // Hiển thị kết quả màu tóc
            const hairColorName = getNearestHairColorName(
              smoothedR,
              smoothedG,
              smoothedB
            );
    
            setMakeupSuggestion(`Your hair color is: ${hairColorName}.`);
          }
        }
      }
    } catch (err) {
      console.error("[HairColor] Lỗi trong quá trình phân đoạn:", err);
    }

    requestAnimationFrame(detectHair);
  };

  const checkFrameStability = useCallback((landmarks: number[] | Uint8Array) => {
    const newHistory = [...landmarkHistoryRef.current, landmarks].slice(-HISTORY_SIZE);
    if (isFinger.current) {
      setIsFrameStable(false);
      return;
    }
    setNoFaceDetectedDuration(0);
  
    if (newHistory.length < HISTORY_SIZE) {
      setStatusMessage("Collecting face data...");
      setProgress(20);
      landmarkHistoryRef.current = newHistory;
      return;
    }
  
    let totalDeviation = 0;
    let deviationCount = 0;
  
    // Tính độ lệch giữa các khung hình liên tiếp
    for (let i = 1; i < newHistory.length; i++) {
      const currentFrame = newHistory[i];
      const previousFrame = newHistory[i - 1];
  
      // Đảm bảo cùng độ dài
      if (currentFrame.length !== previousFrame.length) {
        console.warn('Mismatched frame lengths');
        return;
      }

      for (let j = 0; j < currentFrame.length; j++) {
        const diff = Math.abs(currentFrame[j] - previousFrame[j]);
        totalDeviation += diff;
        deviationCount++;
      }
    }

    const averageDeviation = deviationCount > 0 ? (totalDeviation / (255 * deviationCount)) * 100 : 0;
    const now = performance.now();
    const isStable = averageDeviation < STABILITY_THRESHOLD;
  
    if (isStable && !lastStableTime.current) {
      lastStableTime.current = now;
      setStatusMessage("Analyzing face...");
      setProgress(60);
    } else if (isStable && lastStableTime.current && now - lastStableTime.current >= STABILITY_DURATION) {
      setIsFrameStable(true);
      setStatusMessage("Analysis completed!");
      setProgress(100);
      lastUnstableTime.current = null;
    } else if (!isStable) {
      if (lastStableTime.current && now - lastStableTime.current < MIN_STABLE_DURATION) {
        landmarkHistoryRef.current = newHistory;
        return;
      }
      if (!lastUnstableTime.current) {
        lastUnstableTime.current = now;
      }
      lastStableTime.current = null;
      setIsFrameStable(false);
      setStatusMessage("Please keep your face steady for analysis");
      setProgress(20);
    }
  
    landmarkHistoryRef.current = newHistory;
  }, [
    HISTORY_SIZE,
    STABILITY_THRESHOLD,
    STABILITY_DURATION,
    MIN_STABLE_DURATION,
    noFaceDetectedDuration,
    setProgress,
    setStatusMessage,
  ]);

  useEffect(() => {
    if (detectionResults?.hand?.isIndexRaised) {
      ctxRef.current?.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
      setStatusMessage("Hand detected (index finger raised). Please lower your hand to continue analysis.");
      setProgress(0);
      isFinger.current = true;
    } else {
      if (isFinger.current) {
        isFinger.current = false;
      }
    }
    // const interval = setInterval(() => {
    //   if (!detectionResults || !detectionResults.hair?.data) {
    //     setNoFaceDetectedDuration((prev) => prev + 1000);
    //   }
    // }, 1000);

    // return () => clearInterval(interval);
  }, [detectionResults]);

  useEffect(() => {
    if (!stream || !canvasRef.current || !displayVideoRef.current || !isVideoReady) {
      console.log(
          "[PersonalColor] Waiting for FaceLandmarker or webcam...");
      return;
    }
    if (!ctxRef.current) {
      ctxRef.current = canvasRef.current?.getContext("2d");
    }

    detectHair();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [stream, isVideoReady, detectionResults]);

  const selectionButtons = () => {
    return (
      <HairSelection
        handleScrollUp={handleScrollUp}
        buttonRefs={buttonRefs}
        scrollContainerRef={scrollContainerRef}
        hairColorList={hairColorList}
        filterHair={filterHair}
        onChangeSelectHair={onChangeSelectHair}
        handleScrollDown={handleScrollDown}
    />
    )
  }

  return (
    <AnalysisLayout
        title="Hair Color"
        description="Detect and segment hair regions in video."
        videoRef={displayVideoRef}
        canvasRef={canvasRef}
        result={makeupSuggestion}
        error={error || webcamError}
        detectionResults={detectionResults}
        selectionButtons={selectionButtons()}
        statusMessage={statusMessage}
        progress={progress}
    />
  );
}
