import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import "katex/dist/katex.min.css";

export const metadata: Metadata = {
  title: "备考台 · 2027 考研刷题台",
  description: "政治、英语二、数学二、408 的动态刷题与 AI 批改",
};

export const viewport: Viewport = {
  themeColor: "#f6f3ec",
  colorScheme: "light dark",
};

const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('yantu-theme');
    var d = t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (d) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
