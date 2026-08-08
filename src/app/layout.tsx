import type { Metadata } from "next";
import "./globals.css";

import { AtlasAuthProvider } from "@/components/atlas/atlas-auth-provider";
import { MobileOnly } from "@/components/atlas/mobile-only";
import { ToastProvider } from "@/components/ui/ToastProvider";

export const metadata: Metadata = {
  title: "Atlas | Personal AI Assistant",
  description:
    "Atlas is a trusted Personal AI Assistant that understands intent, coordinates digital services, and safely completes real-world tasks.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AtlasAuthProvider>
          <ToastProvider>
            <MobileOnly>
              {children}
            </MobileOnly>
          </ToastProvider>
        </AtlasAuthProvider>
      </body>
    </html>
  );
}
