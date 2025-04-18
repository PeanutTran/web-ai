// src/app/page.tsx
"use client";

import { useEffect } from "react";
import HandControlledApp from "./components/HandControlledApp";
import PersonalColor from "./pages/PersonalColor";
import PersonalBodyType from "./pages/PersonalBodyType";
import PersonalMakeup from "./pages/PersonalMakeup";
import HairColor from "./pages/HairColor";
import CosmeticSurgery from "./pages/CosmeticSurgery";
import { VIEWS, ViewType } from "./constants/views";
import { useLoading } from "./context/LoadingContext";

export default function Home() {
  const { setIsLoading } = useLoading();
  const handleMenuSelect = (view: ViewType) => {
    console.log(`[Home] Menu selected: ${view}`);
    if (view === VIEWS.HOME) {
      setIsLoading(false);
    }
  };

  return (
    <HandControlledApp onMenuSelect={handleMenuSelect}>
      {(currentView: ViewType) => (
        <>
          {currentView === VIEWS.HOME && (
            <div className="flex flex-col gap-8 h-[calc(100vh-2rem)] overflow-hidden">
              {/* Tiêu đề */}
              <div className="flex justify-between items-center p-5">
                <div>
                  <h1 className="text-4xl font-bold text-pink-600">Welcome to Personal Beauty</h1>
                  <p className="text-2xl text-gray-700">Use hand gestures to navigate the app.</p>
                </div>
              </div>

              {/* Hướng dẫn cử chỉ tay */}
              <div className="flex-1 flex justify-center items-center">
                <div className="flex gap-8">
                  {/* Card 1: Chỉ tay */}
                  <div className="w-[300px] h-[200px] bg-white p-6 rounded-xl shadow-md border-4 border-pink-600 flex flex-col items-center justify-center">
                    <div className="text-4xl mb-4">👆</div>
                    <h3 className="text-2xl font-semibold text-gray-800 mb-2">Pointing</h3>
                    <p className="text-xl text-gray-600 text-center">Move your hand to control the cursor.</p>
                  </div>

                  {/* Card 2: Nắm tay */}
                  <div className="w-[300px] h-[200px] bg-white p-6 rounded-xl shadow-md border-4 border-pink-600 flex flex-col items-center justify-center">
                    <div className="text-4xl mb-4">✊</div>
                    <h3 className="text-2xl font-semibold text-gray-800 mb-2">Fist</h3>
                    <p className="text-xl text-gray-600 text-center">Make a fist to select an option.</p>
                  </div>

                  {/* Card 3: Mở bàn tay */}
                  <div className="w-[300px] h-[200px] bg-white p-6 rounded-xl shadow-md border-4 border-pink-600 flex flex-col items-center justify-center">
                    <div className="text-4xl mb-4">🖐️</div>
                    <h3 className="text-2xl font-semibold text-gray-800 mb-2">Open Hand</h3>
                    <p className="text-xl text-gray-600 text-center">Open your hand to return to Home.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {currentView === VIEWS.PERSONAL_COLOR && <PersonalColor />}
          {currentView === VIEWS.PERSONAL_BODY_TYPE && <PersonalBodyType />}
          {currentView === VIEWS.PERSONAL_MAKEUP && <PersonalMakeup />}
          {currentView === VIEWS.HAIR_COLOR && <HairColor />}
          {currentView === VIEWS.COSMETIC_SURGERY && <CosmeticSurgery />}
        </>
      )}
    </HandControlledApp>
  );
}