import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '운동기록봇 대시보드',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    apple: '/icon-192.png',
  },
  appleWebApp: { capable: true, title: '운동출석', statusBarStyle: 'black-translucent' },
  description: '친구끼리 운동 인증 현황',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#d8a65f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
