/* eslint-disable react/display-name */
// src/context/AnalysisLayout.tsx

"use client";

import React from "react";
import { JSX, RefObject } from "react";

interface AnalysisLayoutProps {
    title: string;
    description: string;
    videoRef: RefObject<HTMLVideoElement | null>;
    canvasRef: RefObject<HTMLCanvasElement | null>;
    result: string | null;
    error: string | null;
    selectionButtons?: JSX.Element;
    colorPalette?: JSX.Element;
    actionButtons?: JSX.Element;
    statusMessage?: string; // Thêm prop cho thông báo trạng thái
    progress?: number; // Thêm prop cho thanh tiến trình
}

const AnalysisLayout = React.memo(
  ({
    title,
    description,
    videoRef,
    canvasRef,
    result,
    error,
    selectionButtons,
    colorPalette,
    actionButtons
  }: AnalysisLayoutProps) => {
    return (
        <div className="flex flex-col gap-8 h-full min-h-[calc(100vh-2rem)] p-4 md:p-8 overflow-hidden bg-gradient-to-r from-pink-100 to-purple-100">
            {error && (
                <div className="absolute right-0 bg-red-500 text-white p-4 rounded-lg shadow-md text-center max-w-2xl mx-auto">
                    {error}
                </div>
            )}
            <div className="flex flex-col md:flex-row gap-6 md:gap-8 flex-1 overflow-hidden">
                {/* Phần video live (2/3) */}
                <div className="md:w-2/3 px-6 md:px-10 rounded-xl flex flex-col items-center">
                    <div className="relative w-full overflow-hidden rounded-2xl shadow-lg border-2 border-gray-200 bg-white" style={{ paddingTop: "75%" /* 480/640 = 0.75 */ }}>
                        <video
                            ref={videoRef}
                            className="absolute inset-0 w-full h-full object-cover"
                            autoPlay
                            playsInline
                            muted
                        />
                        <canvas
                            ref={canvasRef}
                            width={640}
                            height={480}
                            className="absolute inset-0 w-full object-contain pointer-events-none"
                        />
                    </div>
                    {selectionButtons && (
                        <div className="flex gap-6 mt-3 flex-1 max-h-[100px]">
                            {selectionButtons}
                        </div>
                    )}
                </div>

                {/* Phần kết quả (1/3) */}
                <div className="md:w-1/3 bg-white p-4 md:p-6 rounded-xl shadow-md flex flex-col">
                    <div className="mb-4">
                        <h5 className="text-2xl md:text-3xl font-bold text-pink-600">
                            {title}
                        </h5>
                        <p className="text-sm md:text-base text-gray-500 mt-2">
                            {description}
                        </p>
                    </div>
                    <hr className="border-gray-200 mb-4" />
                    <h2 className="text-xl md:text-2xl font-semibold text-gray-800 mb-4">
                        Analysis Result
                    </h2>
                    {result ? (
                        <div className="text-lg md:text-xl text-gray-700 mb-4">
                            Your result is
                            <span className="font-bold text-pink-600">
                                <div
                                    dangerouslySetInnerHTML={{
                                        __html: `${result}`,
                                    }}
                                ></div>
                            </span>
                            .
                        </div>
                    ) : (
                        <div className="text-lg md:text-xl text-gray-500 animate-pulse mb-4">
                            Waiting for analysis...
                        </div>
                    )}
                    {colorPalette && (
                        <div className="flex-1">
                            <h3 className="text-lg md:text-xl font-semibold text-gray-800 mb-4">
                                Color Palette
                            </h3>
                            {colorPalette}
                        </div>
                    )}
                    {actionButtons && (
                        <div className="mt-4 flex flex-col gap-4">
                            {actionButtons}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
  }
);
export default AnalysisLayout;