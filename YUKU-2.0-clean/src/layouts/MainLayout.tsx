import React from 'react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { MobileBottomNav } from './MobileBottomNav';
import { SafetyPledgeBanner } from '../components/common/SafetyPledgeBanner';
import { AppRoute } from '../types/navigation';

interface MainLayoutProps {
  currentPath: string;
  onNavigate: (path: AppRoute) => void;
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  currentPath,
  onNavigate,
  children,
}) => {
  // Halaman profil talent sudah punya tombol "Ajukan Booking" tetap di bawah layar, jadi menu bawah disembunyikan di sana.
  const showBottomNav = currentPath !== '/talent/:id';

  return (
    <div className={`min-h-screen flex flex-col bg-[#FAF8FC] text-slate-800 ${showBottomNav ? 'pb-16 md:pb-0' : ''}`}>
      {/* Main navigation header */}
      <Navbar currentPath={currentPath} onNavigate={onNavigate} />

      {/* Main content body */}
      <main className="flex-1">{children}</main>

      {/* Reassuring safety pledge before footer */}
      <SafetyPledgeBanner />

      {/* Site footer */}
      <Footer onNavigate={onNavigate} />

      {showBottomNav && <MobileBottomNav currentPath={currentPath} onNavigate={onNavigate} />}
    </div>
  );
};
