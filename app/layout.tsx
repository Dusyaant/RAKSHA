import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

// 1. Import your providers here
import SocketProvider from '../components/ui/SocketProvider'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'RAKSHA — Autonomous Safety Intelligence',
  description: 'A real-time digital twin and explainable safety intelligence command center.',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#05090e',
  userScalable: false,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-background">
      <body className="antialiased">
        
        {/* 2. Wrap children in the SocketProvider */}
        <SocketProvider>
          {children}
        </SocketProvider>

        {/* 3. Add the Toaster (styled for your dark theme) */}
        <Toaster 
          position="bottom-right" 
          toastOptions={{
            style: {
              background: '#1e293b', // Dark slate background to match your theme
              color: '#f8fafc',
            },
          }} 
        />
        
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}