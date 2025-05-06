/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/display-name */
// src/components/page/CosmeticSurgery.tsx

"use client";

import React, { useCallback } from "react";
import { useState, useEffect, useRef } from "react";
import { NormalizedLandmark } from "@mediapipe/tasks-vision";
import AnalysisLayout from "../components/AnalysisLayout";
import { useWebcam } from "../context/WebcamContext";
import { useLoading } from "../context/LoadingContext";
import { VIEWS } from "../constants/views";

export default function CosmeticSurgery() {
    const {
        stream,
        error: webcamError,
        detectionResults,
        setCurrentView,
    } = useWebcam();
    const { setIsLoading } = useLoading();
    const [error, setError] = useState<string | null>(null);
    const lastStableTime = useRef<number | null>(null);
    const lastUnstableTime = useRef<number | null>(null);
    const STABILITY_THRESHOLD = 15;
    const HISTORY_SIZE = 5;
    const STABILITY_DURATION = 1000;
    const MIN_STABLE_DURATION = 500;
    const [statusMessage, setStatusMessage] = useState<string>("Initializing camera...");
    const [isFrameStable, setIsFrameStable] = useState(false);
    const landmarkHistoryRef = useRef<{ x: number; y: number }[][]>([]);
    const [noFaceDetectedDuration, setNoFaceDetectedDuration] = useState<number>(0);
    const [progress, setProgress] = useState<number>(0);
    const [isVideoReady, setIsVideoReady] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const animationFrameId = useRef<number | null>(null);
    const lastDetectTime = useRef(0);
    const [result, setResult] = useState<string | null>(null);
    const [topPoint, setTopPoint] = useState<NormalizedLandmark | null>(null);
  
    useEffect(() => {
        setCurrentView(VIEWS.COSMETIC_SURGERY)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const checkFrameStability = useCallback((landmarks: { x: number; y: number }[]) => {
        const newHistory = [...landmarkHistoryRef.current, landmarks].slice(-HISTORY_SIZE);
        if (!detectionResults.face?.faceLandmarks) {
            setNoFaceDetectedDuration((prev) => prev + 1000);
            if (noFaceDetectedDuration >= 30000) {
                setStatusMessage("Face not detected for a long time. Please refresh the camera.");
            } else {
                setStatusMessage("Face not detected. Please adjust your position.");
            }
            setProgress(0);
            setIsFrameStable(false);
            landmarkHistoryRef.current = []; // reset
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
    
        for (let i = 1; i < newHistory.length; i++) {
            for (let j = 0; j < landmarks.length; j++) {
                const dx = (newHistory[i][j].x - newHistory[i - 1][j].x) * 640;
                const dy = (newHistory[i][j].y - newHistory[i - 1][j].y) * 480;
                const distance = Math.sqrt(dx * dx + dy * dy);
                totalDeviation += distance;
                deviationCount++;
            }
        }
    
        const averageDeviation = deviationCount > 0 ? totalDeviation / deviationCount : 0;
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
        detectionResults,
        noFaceDetectedDuration,
        setProgress,
        setStatusMessage,
    ]);

    // Kết nối video stream
    useEffect(() => {
        if (stream && videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => {
                videoRef.current!.play().catch((err) => {
                    console.error("[PersonalColor] Error playing video:", err);
                });
                setIsVideoReady(true);
                setIsLoading(false);
                setStatusMessage("Please keep your face steady for analysis");
                setProgress(20);
            };
        }
    }, [stream, setIsLoading]);

  useEffect(() => {
    if (!stream || !canvasRef.current || !videoRef.current || !isVideoReady) {
      console.log(
          "[PersonalColor] Waiting for FaceLandmarker or webcam...");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        setError("Failed to initialize canvas.");
        return;
    }

    const buildResult = (
      mouthWidth: number | null,
      noseWidth: number | null,
      foreheadWidth: number | null,
      jawWidth: number | null,
      eyebrowsToNoseDistance: number | null,
      noseToChinDistance: number | null
    ) => {
      if (
        !mouthWidth ||
        !noseWidth ||
        !foreheadWidth ||
        !jawWidth ||
        !eyebrowsToNoseDistance ||
        !noseToChinDistance
      ) {
        setResult(null);

        return;
      }
      let _result = "";
      _result += `<p> - Ratio between your mouth and nose is: ${(
        mouthWidth / noseWidth
      ).toFixed(3)}</p>`;
      _result += `<p> The suggestion ratio is 1.618</p>`;

      _result += `<p> - Ratio between your jaw and forehead is: ${(
        jawWidth / foreheadWidth
      ).toFixed(3)}</p>`;
      _result += `<p> The suggestion ratio is 0.8</p>`;

      _result += `<p> - Ratio between the distance from eyebrows to nose and the distance from nose to chin is: ${(
        noseToChinDistance / eyebrowsToNoseDistance
      ).toFixed(3)}</p>`;
      _result += `<p> The suggestion ratio is 1</p>`;
      setResult(_result);
    };

    const calculateDistance = (
      point1: NormalizedLandmark,
      point2: NormalizedLandmark
    ) => {
      const dx = point2.x - point1.x;
      const dy = point2.y - point1.y;
      return Math.sqrt(dx * dx + dy * dy);
    };
    const drawFaceShape = (landmarks: NormalizedLandmark[]) => {
      const midpoint = {
        x: (landmarks[105].x + landmarks[334].x) / 2,
        y: (landmarks[105].y + landmarks[334].y) / 2,
      };
      const symmetryPoint = {
        x: 2 * landmarks[10].x - midpoint.x,
        y: 2 * landmarks[10].y - midpoint.y,
      };
      setTopPoint(symmetryPoint as NormalizedLandmark);
      const topFace = symmetryPoint;
      const bottomFace = landmarks[152];
      const leftFace = landmarks[234];
      const rightFace = landmarks[454];

      // Draw top-left corner L
      ctx.strokeStyle = "aqua";
      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.moveTo(leftFace.x * canvas.width - 1, topFace.y * canvas.height);
      ctx.lineTo(leftFace.x * canvas.width + 30, topFace.y * canvas.height);
      ctx.moveTo(leftFace.x * canvas.width, topFace.y * canvas.height - 1);
      ctx.lineTo(leftFace.x * canvas.width, topFace.y * canvas.height + 30);

      // Draw top-right corner L
      ctx.moveTo(rightFace.x * canvas.width + 1, topFace.y * canvas.height);
      ctx.lineTo(rightFace.x * canvas.width - 30, topFace.y * canvas.height);
      ctx.moveTo(rightFace.x * canvas.width, topFace.y * canvas.height - 1);
      ctx.lineTo(rightFace.x * canvas.width, topFace.y * canvas.height + 30);

      // Draw bottom-left corner L
      ctx.moveTo(leftFace.x * canvas.width - 1, bottomFace.y * canvas.height);
      ctx.lineTo(leftFace.x * canvas.width + 30, bottomFace.y * canvas.height);
      ctx.moveTo(leftFace.x * canvas.width, bottomFace.y * canvas.height - 1);
      ctx.lineTo(leftFace.x * canvas.width, bottomFace.y * canvas.height - 30);

      // Draw bottom-right corner L
      ctx.moveTo(rightFace.x * canvas.width + 1, bottomFace.y * canvas.height);
      ctx.lineTo(rightFace.x * canvas.width - 30, bottomFace.y * canvas.height);
      ctx.moveTo(rightFace.x * canvas.width, bottomFace.y * canvas.height + 1);
      ctx.lineTo(rightFace.x * canvas.width, bottomFace.y * canvas.height - 30);
      ctx.stroke();
    };
    const drawText = (
      text: string,
      point1: NormalizedLandmark,
      point2: NormalizedLandmark,
      color: string = "black"
    ) => {
      ctx.fillStyle = color;
      ctx.fillText(
        text,
        point1.x * canvas.width +
          (point2.x * canvas.width - point1.x * canvas.width) / 2 -
          5,
        point1.y * canvas.height +
          (point2.y * canvas.height - point1.y * canvas.height) / 2 -
          2
      );
    };

    const drawRatioBetweenPoints = (
      point1: NormalizedLandmark,
      point2: NormalizedLandmark,
      point3: NormalizedLandmark,
      point4: NormalizedLandmark,
      color: string
    ) => {
      drawDashedLineBetweenPoints(point1, point2, color);

      drawDashedLineBetweenPoints(point3, point4, color);

      const point1ToPoint2Distance = calculateDistance(point1, point2);
      const point3ToPoint4Distance = calculateDistance(point3, point4);
      const ratio = point3ToPoint4Distance / point1ToPoint2Distance;
      drawText("1", point1, point2);
      drawText(ratio.toFixed(3), point3, point4);
      return { ratio, point1ToPoint2Distance, point3ToPoint4Distance };
    };

    const calculatePerpendicularDistance = (
      line1Start: NormalizedLandmark,
      line1End: NormalizedLandmark,
      line2Start: NormalizedLandmark,
      line2End: NormalizedLandmark,
      color: string = "black"
    ) => {
      drawDashedLineBetweenPoints(line1Start, line1End, color);
      drawDashedLineBetweenPoints(line2Start, line2End, color);
      const line1Midpoint = {
        x: (line1Start.x + line1End.x) / 2,
        y: (line1Start.y + line1End.y) / 2,
      };

      const line2Midpoint = {
        x: (line2Start.x + line2End.x) / 2,
        y: (line2Start.y + line2End.y) / 2,
      };

      const dx = line2Midpoint.x - line1Midpoint.x;
      const dy = line2Midpoint.y - line1Midpoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      drawDashedLineBetweenPoints(
        line1Midpoint as NormalizedLandmark,
        line2Midpoint as NormalizedLandmark,
        color
      );
      return { distance, line1Midpoint, line2Midpoint };
    };

    const calculateAngleBetweenLines = (
      line1Start: NormalizedLandmark,
      line1End: NormalizedLandmark,
      line2Start: NormalizedLandmark,
      line2End: NormalizedLandmark
    ) => {
      const vector1 = {
        x: line1End.x - line1Start.x,
        y: line1End.y - line1Start.y,
      };
      const vector2 = {
        x: line2End.x - line2Start.x,
        y: line2End.y - line2Start.y,
      };

      const dotProduct = vector1.x * vector2.x + vector1.y * vector2.y;
      const magnitude1 = Math.sqrt(
        vector1.x * vector1.x + vector1.y * vector1.y
      );
      const magnitude2 = Math.sqrt(
        vector2.x * vector2.x + vector2.y * vector2.y
      );

      const angleInRadians = Math.acos(dotProduct / (magnitude1 * magnitude2));
      const angleInDegrees = (angleInRadians * 180) / Math.PI;

      return angleInDegrees;
    };

    const drawDashedLineBetweenPoints = (
      point1: NormalizedLandmark,
      point2: NormalizedLandmark,
      color: string = "black"
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]); // Set dashed line pattern
      ctx.beginPath();
      ctx.moveTo(point1.x * canvas.width, point1.y * canvas.height);
      ctx.lineTo(point2.x * canvas.width, point2.y * canvas.height);
      ctx.stroke();
      ctx.setLineDash([]); // Reset to solid line
    };

    const drawingFaceGrid = (landmarks: NormalizedLandmark[]) => {
      drawFaceShape(landmarks);
      const {
        point1ToPoint2Distance: _noseWidth,
        point3ToPoint4Distance: _mouthWidth,
      } = drawRatioBetweenPoints(
        landmarks[48],
        landmarks[278],
        landmarks[61],
        landmarks[308],
        "red"
      ); // tỉ lệ chiều ngang giữa mũi và miệng (1.612)

      const {
        point1ToPoint2Distance: _foreHeadWidth,
        point3ToPoint4Distance: _jewWidth,
      } = drawRatioBetweenPoints(
        landmarks[54],
        landmarks[284],
        landmarks[136],
        landmarks[365],
        "blue"
      ); // Tỉ lệ chiều ngang giữa chán và hàm

      const {
        distance: d1,
        line1Midpoint: ma1,
        line2Midpoint: ma2,
      } = calculatePerpendicularDistance(
        landmarks[55],
        landmarks[285],
        landmarks[98],
        landmarks[327],
        "purple"
      ); // Chiều dài giữa lông mày và mũi
      drawText("1", ma1 as NormalizedLandmark, ma2 as NormalizedLandmark);

      const {
        distance: d2,
        line1Midpoint: mb1,
        line2Midpoint: mb2,
      } = calculatePerpendicularDistance(
        landmarks[98],
        landmarks[327],
        landmarks[148],
        landmarks[377],
        "red"
      ); // Chiều dài giữa mũi và cằm
      drawText(
        (d2 / d1).toFixed(3),
        mb1 as NormalizedLandmark,
        { ...mb2, y: mb2.y - 0.1 } as NormalizedLandmark
      );
      drawDashedLineBetweenPoints(landmarks[152], landmarks[58]);
      drawDashedLineBetweenPoints(landmarks[152], landmarks[288]);

      const angle = calculateAngleBetweenLines(
        landmarks[152],
        landmarks[58],
        landmarks[152],
        landmarks[288]
      );

      drawText(
        `${angle.toFixed(2)}°`,
        landmarks[152],
        { ...landmarks[152], y: landmarks[152].y + 0.05 } as NormalizedLandmark,
        "green"
      );
      buildResult(_mouthWidth, _noseWidth, _foreHeadWidth, _jewWidth, d1, d2);
    };

    const detect = async () => {
      try {
        const now = performance.now();
        if (now - lastDetectTime.current < 1000 / 60) {
            animationFrameId.current = requestAnimationFrame(detect);
            return;
        }
        lastDetectTime.current = now;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const videoRatio = video.videoWidth / video.videoHeight;
        const canvasRatio = canvas.width / canvas.height;
        let drawWidth = canvas.width;
        let drawHeight = canvas.height;
        let offsetX = 0;
        let offsetY = 0;

        if (videoRatio > canvasRatio) {
          drawHeight = canvas.width / videoRatio;
          offsetY = (canvas.height - drawHeight) / 2;
        } else {
          drawWidth = canvas.height * videoRatio;
          offsetX = (canvas.width - drawWidth) / 2;
        }
        ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
        if (detectionResults?.face?.faceLandmarks && detectionResults?.face?.faceLandmarks.length > 0) {
          const landmarks = detectionResults?.face?.faceLandmarks[0];
          checkFrameStability(landmarks);
          // analyzeFace(landmarks);
          if (isFrameStable) {
            drawingFaceGrid(landmarks);
          }
        }
      } catch (err) {
        console.error("[CosmeticSurgery] Error during face detection:", err);
      }

      animationFrameId.current = requestAnimationFrame(detect);
    };

    detect();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [stream, isVideoReady, detectionResults]);

  useEffect(() => {
      const interval = setInterval(() => {
          if (!detectionResults || !detectionResults.face?.faceLandmarks) {
              setNoFaceDetectedDuration((prev) => prev + 1000);
          }
      }, 1000);

      return () => clearInterval(interval);
  }, [detectionResults]);

  return (
    <AnalysisLayout
      title="Cosmetic Surgery"
      description="Analyze facial features for cosmetic surgery recommendations."
      videoRef={videoRef}
      canvasRef={canvasRef}
      result={result}
      error={error || webcamError}
      statusMessage={statusMessage}
      progress={progress}
      detectionResults={detectionResults}
    />
  );
}