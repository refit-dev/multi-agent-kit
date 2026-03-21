import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AgentKit — AI SaaS Boilerplate",
  description: "Ship your AI product this weekend. Auth + payments + streaming + memory + RLHF — all pre-wired.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark`}>
        <body className="min-h-screen bg-black text-white antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
