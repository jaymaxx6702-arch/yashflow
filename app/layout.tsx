import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "./sw-register";
import AdminReportsButton from "./AdminReportsButton";
import AdminDashboardAccordion from "./AdminDashboardAccordion";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#1a2b4c",
  colorScheme: "light",
};

export const metadata: Metadata = {
  title: "YashFlow",
  description: "Yash Laser Work Management",
  applicationName: "YashFlow",

  // Explicit PWA manifest link
  manifest: "/manifest.webmanifest",

  icons: {
    icon: [
      {
        url: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: "/icon-192.png",
    shortcut: "/icon-192.png",
  },

  appleWebApp: {
    capable: true,
    title: "YashFlow",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="gu"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ServiceWorkerRegister />
        <AdminReportsButton />
        <AdminDashboardAccordion />
        {children}
      </body>
    </html>
  );
}
