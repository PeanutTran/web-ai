/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/display-name */
// src/components/page/PersonalColor.tsx

"use client";

import React from "react";
import { useState, useEffect, useRef, useMemo } from "react";
import AnalysisLayout from "../components/AnalysisLayout";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext";
import { useHandControl } from "../context/HandControlContext";
import { VIEWS } from "../constants/views";

// Ánh xạ vùng và các landmarks tương ứng
const AREA_LANDMARKS: { [key: string]: number[] } = {
  hair: [10, 151, 152, 148, 149], // Vùng tóc
  lips: [0, 13, 14, 17, 18], // Vùng môi
  face: [1, 10, 152, 234, 454], // Toàn bộ khuôn mặt
  pupil: [33, 133, 362, 263], // Vùng mắt (đồng tử)
  eyebrow: [70, 63, 300, 293], // Vùng lông mày
};

// Component con để quản lý từng nút
const SelectionButton = React.memo(
  ({ area, selectedArea, setSelectedArea }: { area: string; selectedArea: string | null; setSelectedArea: (area: string) => void }) => {
    const { registerElement, unregisterElement, isHandDetectionEnabled } = useHandControl();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const isRegistered = useRef(false);

    useEffect(() => {
      const button = buttonRef.current;
      if (!button) return;

      if (isHandDetectionEnabled && !isRegistered.current) {
        //console.log("[SelectionButton] Registering button:", button.dataset.area);
        button.classList.add("hoverable");
        registerElement(button);
        isRegistered.current = true;
      } else if (!isHandDetectionEnabled && isRegistered.current) {
        //console.log("[SelectionButton] Unregistering button:", button.dataset.area);
        button.classList.remove("hoverable");
        unregisterElement(button);
        isRegistered.current = false;
      }

      return () => {
        if (isRegistered.current && button) {
          //console.log("[SelectionButton] Cleanup - Unregistering button:", button.dataset.area);
          button.classList.remove("hoverable");
          unregisterElement(button);
          isRegistered.current = false;
        }
      };
    }, [registerElement, unregisterElement, isHandDetectionEnabled]);

    return (
      <button
        ref={buttonRef}
        className={`area-button text-2xl min-h-[123px] font-semibold px-8 py-4 rounded-xl transition-all duration-300 transform shadow-lg ${selectedArea === area
          ? "bg-pink-600 text-white scale-105 border-4 border-pink-300"
          : "bg-gray-200 text-gray-800 hover:bg-gray-300 hover:scale-105"
          }`}
        data-area={area}
        onClick={() => setSelectedArea(area)}
      >
        {area.charAt(0).toUpperCase() + area.slice(1)}
      </button>
    );
  }
);


export default function PersonalBodyType() {
  const {
    stream,
    error: webcamError,
    restartStream,
    detectionResults,
    setCurrentView,
  } = useWebcam();
  const { setIsLoading } = useLoading();
  const [colorTone, setColorTone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const displayVideoRef = useRef<HTMLVideoElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const lastDetectTime = useRef(0);

  // Danh sách khu vực và bảng màu đề xuất
  const areas = ["hair", "lips", "face", "pupil", "eyebrow"];
  const colorPalette = {
    warm: [
      { color: "#FFD700", label: "Best" },
      { color: "#FF4500", label: "Best" },
      { color: "#8B0000", label: "Worst" },
    ],
    cool: [
      { color: "#00CED1", label: "Best" },
      { color: "#FF69B4", label: "Best" },
      { color: "#FFA500", label: "Worst" },
    ],
    neutral: [
      { color: "#C0C0C0", label: "Best" },
      { color: "#F5F5DC", label: "Best" },
      { color: "#FF0000", label: "Worst" },
    ],
  };

  useEffect(() => {
    setCurrentView(VIEWS.PERSONAL_COLOR)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectionButtons = useMemo(
    () => (
      <div className="md:w-2/12 p-1 rounded-xl flex flex-col max-h-[calc(100vh-128px)] overflow-hidden">
        <div className="flex flex-col flex-wrap gap-3 w-full h-full">
          <div className="flex flex-col gap-6">
            {areas.map((area) => (
              <SelectionButton key={area} area={area} selectedArea={selectedArea} setSelectedArea={setSelectedArea} />
            ))}
          </div>
        </div>
      </div>
    ),
    [selectedArea, setSelectedArea]
  );

  const palette = colorTone ? colorPalette[colorTone.toLowerCase() as keyof typeof colorPalette] : [];
  const colorPaletteElement = useMemo(
    () => (
      <div className="flex flex-col gap-3">
        {palette.map((item, index) => (
          <div key={index} className="flex items-center gap-3">
            <button
              className="color-button w-10 h-10 rounded-full border-2 border-gray-300"
              style={{ backgroundColor: item.color }}
              data-color={item.color}
              onClick={() => setSelectedColor(item.color)}
            />
            <span className="text-base font-medium text-gray-700">{item.label}</span>
          </div>
        ))}
      </div>
    ),
    [palette, setSelectedColor]
  );

  const actionButtons = useMemo(
    () => (
      <>
        <button
          className="bg-pink-500 text-white px-12 py-6 rounded-lg text-3xl hover:bg-pink-600 transition"
          onClick={() => {
            const canvas = canvasRef.current;
            if (canvas) {
              const dataUrl = canvas.toDataURL("image/png");
              const link = document.createElement("a");
              link.href = dataUrl;
              link.download = "personal-color-result.png";
              link.click();
            }
          }}
        >
          Capture
        </button>
      </>
    ),
    []
  );

  // Kết nối video stream
  useEffect(() => {
    if (stream && displayVideoRef.current) {
      displayVideoRef.current.srcObject = stream;
      displayVideoRef.current.onloadedmetadata = () => {
        displayVideoRef.current!.play().catch((err) => {
          console.error("[PersonalColor] Error playing video:", err);
        });
        setIsVideoReady(true);
        setIsLoading(false);
      };
    }
  }, [stream, setIsLoading]);

  // Hàm phân tích tông màu từ ImageData (giữ nguyên đoạn code gốc)
  const analyzeColorTone = (imageData: ImageData): string => {
    const data = imageData.data;
    let r = 0,
      g = 0,
      b = 0;

    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }

    const pixelCount = data.length / 4;
    r = r / pixelCount;
    g = g / pixelCount;
    b = b / pixelCount;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;

    const d = max - min;

    if (max === min) {
      h = 0;
    } else {
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }

    if (h < 0.1 || h > 0.9) return "Warm";
    if (h > 0.3 && h < 0.6) return "Cool";
    return "Neutral";
  };

  // Xử lý vẽ video, phân tích tông màu, và vẽ landmarks
  useEffect(() => {
    if (!stream || !canvasRef.current || !displayVideoRef.current || !isVideoReady) {
      console.log(
        "[PersonalColor] Waiting for FaceLandmarker or webcam...");
      return;
    }

    const video = displayVideoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Failed to initialize canvas.");
      return;
    }

    // Hàm vẽ landmarks
    const drawLandmarks = (landmarks: { x: number; y: number }[], indices: number[]) => {
      ctx.fillStyle = "red";
      ctx.strokeStyle = "red";
      ctx.lineWidth = 2;

      indices.forEach((index) => {
        if (landmarks[index]) {
          const x = landmarks[index].x * drawWidth + offsetX;
          const y = landmarks[index].y * drawHeight + offsetY;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, 2 * Math.PI);
          ctx.fill();
          ctx.stroke();
        }
      });
    };

    let drawWidth: number, drawHeight: number, offsetX: number, offsetY: number;

    const draw = async () => {
      try {
        const now = performance.now();
        const minInterval = detectionResults.face?.faceLandmarks?.length > 0 ? 33 : 100;
        if (now - lastDetectTime.current < minInterval) {
          animationFrameId.current = requestAnimationFrame(draw);
          return;
        }
        lastDetectTime.current = now;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasAspect = canvas.width / canvas.height;

        if (videoAspect > canvasAspect) {
          drawWidth = canvas.width;
          drawHeight = canvas.width / videoAspect;
          offsetX = 0;
          offsetY = (canvas.height - drawHeight) / 2;
        } else {
          drawHeight = canvas.height;
          drawWidth = canvas.height * videoAspect;
          offsetY = 0;
          offsetX = (canvas.width - drawWidth) / 2;
        }

        // Vẽ video
        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

        if (detectionResults && detectionResults.face?.faceLandmarks && detectionResults.face?.faceLandmarks.length > 0) {
          const landmarks = detectionResults.face?.faceLandmarks[0];

          // Phân tích tông màu từ vùng mặt
          const faceLandmarks = AREA_LANDMARKS["face"];

          if (landmarks && faceLandmarks) {
            // Tính vùng bao quanh các landmarks của mặt
            const xs = faceLandmarks.map((index) => landmarks[index]?.x * drawWidth + offsetX).filter((x) => x !== undefined);
            const ys = faceLandmarks.map((index) => landmarks[index]?.y * drawHeight + offsetY).filter((y) => y !== undefined);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);

            // Trích xuất ImageData từ vùng mặt
            const width = maxX - minX;
            const height = maxY - minY;
            if (width > 0 && height > 0) {
              const imageData = ctx.getImageData(minX, minY, width, height);
              const tone = analyzeColorTone(imageData);
              console.log("[PersonalColor] Detected color tone:", tone);
              setColorTone(tone);
            }
          }

          // Vẽ landmarks dựa trên vùng được chọn
          if (selectedArea && AREA_LANDMARKS[selectedArea]) {
            drawLandmarks(landmarks, AREA_LANDMARKS[selectedArea]);
          }
        } else {
          setColorTone(null);
        }
      } catch (err) {
        console.error("[PersonalColor] Error during face detection:", err);
      }

      animationFrameId.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [stream, isVideoReady, detectionResults]);

  return (
    <AnalysisLayout
      title="Personal Body Type"
      description="Analyze your body type using live video."
      videoRef={displayVideoRef}
      canvasRef={canvasRef}
      result={colorTone}
      error={error || webcamError}
      selectionButtons={selectionButtons}
      colorPalette={colorPaletteElement}
      actionButtons={actionButtons}
    />
  );
}