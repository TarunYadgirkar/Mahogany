import type { ReactNode } from 'react';

export const metadata = {
  title: 'Mahogany — conversations that branch and remember',
  description:
    'A voice agent that forks side questions with a compiled brief, merges one durable insight back, and starts every future conversation warm.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: '#17110f',
          color: '#efe3d8',
          font: '15px/1.65 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        {children}
      </body>
    </html>
  );
}
