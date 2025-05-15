/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-explicit-any */
// src/pages/HairColor.tsx
"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext";
import { VIEWS } from "../constants/views";
import { useHandControl } from "../context/HandControlContext";
import HairSelection from "../components/HairSelection";
import AnalysisLayout from "../components/AnalysisLayout";

export default function HairColor() {
  const { stream, setCurrentView, detectionResults, error: webcamError, workerRef } = useWebcam();
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
  const STABILITY_THRESHOLD = 0.01;
  const HISTORY_SIZE = 5;
  const STABILITY_DURATION = 1000;
  const MIN_STABLE_DURATION = 500;
  const STOP_DETECT = true;
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("Initializing camera...");
  const [isFrameStable, setIsFrameStable] = useState(false);
  const [filterComplete, setFilterComplete] = useState(false);
  const landmarkHistoryRef = useRef<any>([]);
  const [noFaceDetectedDuration, setNoFaceDetectedDuration] = useState<number>(0);
  const lastDetectedRef = useRef<number>(null);
  const captureRef = useRef<any>(null);
  const [progress, setProgress] = useState<number>(0);
  const lastDrawTime = useRef(0);
  const biggerPer = useRef(0);
  const isFinger = useRef(false);
  const [countdownActive, setCountdownActive] = useState(false);
  const [countdownValue, setCountdownValue] = useState(3);
  const countdownStartTimeRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [hairColorList, _setHairColorList] = useState<any[]>([
    { key: "0", name: "Jet Black", rgb: [10, 10, 10] },
    { key: "1", name: "Soft Black", rgb: [40, 30, 30] },
    { key: "2", name: "Dark Red", rgb: [60, 40, 30] },
    { key: "3", name: "Soft Blue", rgb: [90, 60, 40] },
    { key: "4", name: "Dark Green", rgb: [120, 80, 60] },
  ]);
  const [filterHair, setSelectedHair] = useState<string>("0");
  const scrollByAmount = 480;
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const buttonRefreshRef = useRef<HTMLButtonElement | null>(null);

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
    if (buttonRefreshRef.current) {
      if (isHandDetectionEnabled && !isRegistered.current) {
        buttonRefreshRef.current!.classList.add("hoverable");
        registerElement(buttonRefreshRef.current!);
      } else if (!isHandDetectionEnabled && isRegistered.current) {
        buttonRefreshRef.current!.classList.remove("hoverable");
        unregisterElement(buttonRefreshRef.current!);
      }
    }
    isRegistered.current = isHandDetectionEnabled;
  
    return () => {
      if (isRegistered.current) {
        buttons.forEach((button) => {
          if (!button) return;
          button.classList.remove("hoverable");
          unregisterElement(button);
        });
        if (buttonRefreshRef.current) {
          buttonRefreshRef.current!.classList.remove("hoverable");
        }
        unregisterElement(buttonRefreshRef.current!);
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
    if  (lastDetectedRef.current) {
      handleResult(lastDetectedRef.current, color.key);
    }
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
    if (STOP_DETECT) {
      return true;
    }
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
      isFinger.current = true;
    } else {
      if (isFinger.current) {
        isFinger.current = false;
      }
    }
  }, [detectionResults]);

  const startCountdown = useCallback(() => {
    setCountdownActive(true);
    setCountdownValue(3);
    countdownStartTimeRef.current = Date.now();

    // Clear any existing timer
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }

    // Set up the countdown timer
    countdownTimerRef.current = setInterval(() => {
      const elapsedTime = Math.floor(
        (Date.now() - (countdownStartTimeRef.current || 0)) / 1000
      );
      const newValue = 3 - elapsedTime;

      if (newValue <= 0) {
        // Countdown finished, capture the image
        handleCapture()
        clearInterval(countdownTimerRef.current!);
      } else {
        setCountdownValue(newValue);
      }
    }, 200); // Update more frequently for smoother countdown
  }, []);

  useEffect(() => {
    setTimeout(() => {
      startCountdown();
    }, 1 * 1000);
  }, []);

  const drawInstructions = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) {
      return;
    }
    const width = canvas.width;
    const height = canvas.height;

    // Clear the canvas first
    ctx.clearRect(0, 0, width, height);

    // Draw face outline guide
    const faceSize = Math.min(width, height) * 0.4;

    // Create a path for the entire canvas
    ctx.beginPath();
    ctx.rect(0, 0, width, height);

    // Create a cutout for the ellipse (face area)
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.ellipse(
      width / 2,
      height / 2,
      faceSize / 1.5,
      faceSize / 1.2,
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fill("evenodd");

    // Draw the ellipse outline
    ctx.strokeStyle = "rgba(76, 175, 80, 1)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.setLineDash([10, 5]);
    ctx.ellipse(
      width / 2,
      height / 2,
      faceSize / 1.5,
      faceSize / 1.2,
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash

    // Text styling
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Main instruction
    ctx.font = "bold 24px Arial";
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fillText("Look straight at the camera", width / 2, height - 80);
    ctx.fillText("Don't blink or move", width / 2, height - 40);

    // Countdown display
    if (countdownActive) {
      ctx.font = "bold 72px Arial";
      ctx.fillStyle = "rgba(255, 64, 129, 0.5)";
      ctx.fillText(countdownValue.toString(), width / 2, height / 2 + 80);
    }
  }, [countdownActive, countdownValue]);

  // Add useEffect to redraw canvas when countdown changes
  useEffect(() => {
    drawInstructions();
  }, [drawInstructions, countdownActive, countdownValue]);
  
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

    handleResult(detectionResults);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [stream, isVideoReady, detectionResults]);

  const selectionButtons = useMemo(
      () => (
        <HairSelection
          handleScrollUp={handleScrollUp}
          buttonRefs={buttonRefs}
          scrollContainerRef={scrollContainerRef}
          hairColorList={hairColorList}
          filterHair={filterHair}
          onChangeSelectHair={onChangeSelectHair}
          handleScrollDown={handleScrollDown}
        />
      ),
      [filterHair]
  );

  const getImageSrc = (key: string) => {
    const store = {
      "0": "/hair2.png",
      "1": "/hair2.1.png",
      "2": "/hair2.2.png",
      "3": "/hair2.3.png",
      "4": "/hair2.4.png",
    } as any;
    return store[key];
  }

  const handleResult = (results: any, filterHair?: any) => {
    if  (!results?.face?.faceLandmarks) {
      return;
    }
    const faceLandmarks = results?.face?.faceLandmarks?.[0];
    if (!filterHair) {
      lastDetectedRef.current = results;
    } else {
      ctxRef.current.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
      const capImage = new Image();
      capImage.src = captureRef.current;
      capImage.onload = () => {
        ctxRef.current.drawImage(capImage, 0, 0, canvasRef.current!.width, canvasRef.current!.height);
        calculateImage(faceLandmarks, filterHair);
      }
      return;
    }
    calculateImage(faceLandmarks, filterHair);
  }

  const calculateImage = (faceLandmarks?: any, filterHair?: any) => {
    const point = faceLandmarks?.[8];
    const overlayImage = new Image();
    overlayImage.src = getImageSrc(filterHair || "0");
    console.log("overlayImage.src", overlayImage.src);
    overlayImage.onload = () => {
      const canvas = canvasRef.current;
      const ctx = ctxRef.current;
      if (!canvas || !ctx) {
        console.error("Canvas or context not initialized");
        return;
      }

      const leftCheek = faceLandmarks[234];
      const rightCheek = faceLandmarks[454];
      if (!leftCheek || !rightCheek) {
        console.error("Cheek landmarks not found");
        return;
      }

      // Calculate face width
      const faceWidth = Math.abs(leftCheek.x - rightCheek.x) * canvas.width;

      // Calculate scale
      const baseScale = faceWidth / 720;
      const additionalScale = 1.32;
      const finalScale = baseScale * additionalScale;
      const imageWidth = 720 * finalScale;
      const imageHeight = 852 * finalScale;

      // Calculate position
      const x = point.x * canvas.width;
      const y = point.y * canvas.height;
      const drawX = x - imageWidth / 2;
      const drawY = y - imageHeight / 2 - imageHeight * 0.15;

      // Calculate rotation angle based on cheek landmarks
      const deltaY = rightCheek.y - leftCheek.y;
      const deltaX = rightCheek.x - leftCheek.x;
      const angle = Math.atan2(deltaY, deltaX);

      // Save context state
      ctx.save();

      // Translate to the center of the image, rotate, and translate back
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.translate(-x, -y);

      // Draw the image
      ctx.drawImage(overlayImage, drawX, drawY, imageWidth, imageHeight);

      // Restore context state
      ctx.restore();

      setFilterComplete(true);
      setStatusMessage("Analysis completed!");
      setProgress(100);
    };
  }

  const resetCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownActive(false);
    setCountdownValue(3);
    countdownStartTimeRef.current = null;
  }, []);

  const handleCapture = async () => {
    setMakeupSuggestion('&nbsp;');
    if (ctxRef.current && canvasRef.current) {
      ctxRef.current.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
      ctxRef.current.drawImage(displayVideoRef.current, 0, 0, canvasRef.current!.width, canvasRef.current!.height);
      captureRef.current = canvasRef.current.toDataURL("image/png");
      const imageBitmap = await createImageBitmap(displayVideoRef.current!);
      const now = performance.now();
      workerRef.current!.postMessage(
        {
            type: "detectHair",
            data: {
                imageBitmap,
                timestamp: now,
                modelTypes: "face",
            },
        },
        [imageBitmap]
    );
    }
  }

  const actionButtons = useMemo(
      () => (
          <>
              <button
                  className={`bg-pink-500 text-white px-12 py-6 rounded-lg text-3xl hover:bg-pink-600 transition relative opacity-0 ${filterComplete ? "opacity-100" : ""}`}
                  ref={(el) => { buttonRefreshRef.current = el; }}
                  onClick={() => {
                    resetCountdown();
                    ctxRef.current.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
                    setTimeout(() => {
                      setFilterComplete(false);
                      startCountdown();
                    }, 10);
                  }}
              >
                  Refresh
              </button>
          </>
      ),
      [filterComplete]
  );

  return (
    <div>
      <div>{countdownActive}</div>
      <AnalysisLayout
          title="Hair Color"
          description="Detect and segment hair regions in video."
          videoRef={displayVideoRef}
          canvasRef={canvasRef}
          result={makeupSuggestion}
          error={error || webcamError}
          detectionResults={detectionResults}
          selectionButtons={selectionButtons}
          statusMessage={statusMessage}
          countdownActive={countdownActive}
          countdownValue={countdownValue}
          actionButtons={actionButtons}
          progress={progress}
      />
    </div>
  );
}
