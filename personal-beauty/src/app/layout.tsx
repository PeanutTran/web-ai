// src/app/layout.tsx
import type { Metadata } from "next";
import { WebcamProvider } from "./context/WebcamContext";
import { LoadingProvider } from "./context/LoadingContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personal Beauty",
  description: "Diagnosis based on individual appearance characteristics",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <LoadingProvider>
          <WebcamProvider>
            {children}
          </WebcamProvider>
        </LoadingProvider>
      </body>
    </html>
  );
}