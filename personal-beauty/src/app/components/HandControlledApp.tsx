// src/context/HandControlledApp.tsx

"use client";

import { JSX, useState } from "react";
import Sidebar from "./Sidebar";
import { useWebcam } from "../context/WebcamContext";
import { ViewType, VIEWS } from "../constants/views";
import LoadingOverlay from "../components/LoadingOverlay";
import { useLoading } from "../context/LoadingContext";
import { HandControlProvider } from "../context/HandControlContext";

interface HandControlledAppProps {
  children: (currentView: ViewType) => JSX.Element;
  onMenuSelect: (view: ViewType) => void;
}

export default function HandControlledApp({ children, onMenuSelect }: HandControlledAppProps) {
  const { error: webcamError, handData, setCurrentView: setCurrentContextView } = useWebcam();
  const { isLoading, setIsLoading } = useLoading();
  const [currentView, setCurrentView] = useState<ViewType>(VIEWS.HOME);

  const handleMenuSelect = (view: ViewType) => {
    setIsLoading(true);
    onMenuSelect(view);
    console.log(`[HandControlledApp] Menu selected: ${view}`);
    setCurrentView(view);
  };

  const handleOpenHand = () => {
    if (currentView !== VIEWS.HOME) {
      onMenuSelect(VIEWS.HOME);
      setCurrentView(VIEWS.HOME);
      setCurrentContextView(VIEWS.HOME);
    }
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-r from-pink-100 to-purple-100 overflow-hidden">
      {webcamError && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white p-4 rounded-lg shadow-lg">
          {webcamError}
        </div>
      )}
      <HandControlProvider handData={handData} onOpenHand={handleOpenHand} isLoading={isLoading}>
        <Sidebar currentView={currentView} onMenuSelect={handleMenuSelect} />
        <main className="flex-1 p-0 overflow-hidden">{children(currentView)}</main>
      </HandControlProvider>
      <LoadingOverlay isLoading={isLoading} />
    </div>
  );
}