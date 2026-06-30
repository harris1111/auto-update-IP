import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "0ERR Firewall Allowlist Portal",
  description: "Secure, dynamic, and just-in-time IP allowlist gateway for development server resources.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `(function(){var t=localStorage.getItem('theme');if(t==='dark')t='nord-dark';else if(t==='light')t='nord-light';if(t!=='nord-dark'&&t!=='nord-light'&&t!=='dark'&&t!=='light'){t=window.matchMedia('(prefers-color-scheme:light)').matches?'nord-light':'nord-dark'}document.documentElement.setAttribute('data-theme',t)})()`
        }} />
      </head>
      <body className="min-h-full font-sans">
        <ThemeProvider>
          <div className="app-layout">
            <Sidebar />
            <main className="main-content">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
