/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { MainLayout } from './layouts/MainLayout';
import { HomePage } from './pages/HomePage';
import { BrowseTalentPage } from './pages/BrowseTalentPage';
import { TalentDetailPage } from './pages/TalentDetailPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { BecomeTalentPage } from './pages/BecomeTalentPage';
import { AboutPage } from './pages/AboutPage';
import { FaqPage } from './pages/FaqPage';
import { HelpCenterPage } from './pages/HelpCenterPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { TermsPage } from './pages/TermsPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { BookingHistoryPage } from './pages/BookingHistoryPage';
import { TalentDashboardPage } from './pages/TalentDashboardPage';
import { AdminPage } from './pages/AdminPage';
import { VerifyKtpPage } from './pages/VerifyKtpPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { AppRoute } from './types/navigation';
import { supabase } from './lib/supabase';

export default function App() {
  const [currentPath, setCurrentPath] = useState<AppRoute>('/');
  const [activeTalentId, setActiveTalentId] = useState<string>('');
  const [initialActivityFilter, setInitialActivityFilter] = useState<string>('all');
  const [initialCityFilter, setInitialCityFilter] = useState<string>('Semua Kota');
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(false);

  // Parse path and params from current location
  const parseCurrentLocation = useCallback(() => {
    const pathname = window.location.pathname;
    const searchParams = new URLSearchParams(window.location.search);

    const act = searchParams.get('activity') || 'all';
    const city = searchParams.get('city') || 'Semua Kota';
    setInitialActivityFilter(act);
    setInitialCityFilter(city);

    if (pathname === '/' || pathname === '') {
      setCurrentPath('/');
    } else if (pathname === '/talent') {
      setCurrentPath('/talent');
    } else if (pathname.startsWith('/talent/')) {
      const id = pathname.replace('/talent/', '');
      setActiveTalentId(id || '');
      setCurrentPath('/talent/:id');
    } else if (pathname === '/cara-kerja') {
      setCurrentPath('/cara-kerja');
    } else if (pathname === '/daftar-talent') {
      setCurrentPath('/daftar-talent');
    } else if (pathname === '/dashboard-talent') {
      setCurrentPath('/dashboard-talent');
    } else if (pathname === '/riwayat-booking') {
      setCurrentPath('/riwayat-booking');
    } else if (pathname === '/admin') {
      setCurrentPath('/admin');
    } else if (pathname === '/tentang') {
      setCurrentPath('/tentang');
    } else if (pathname === '/faq') {
      setCurrentPath('/faq');
    } else if (pathname === '/bantuan') {
      setCurrentPath('/bantuan');
    } else if (pathname === '/login') {
      setCurrentPath('/login');
    } else if (pathname === '/register') {
      setCurrentPath('/register');
    } else if (pathname === '/ganti-sandi') {
      setCurrentPath('/ganti-sandi');
    } else if (pathname === '/lupa-sandi') {
      setCurrentPath('/lupa-sandi');
    } else if (pathname === '/reset-sandi') {
      setCurrentPath('/reset-sandi');
    } else if (pathname === '/verifikasi-ktp') {
      setCurrentPath('/verifikasi-ktp');
    } else if (pathname === '/syarat-ketentuan') {
      setCurrentPath('/syarat-ketentuan');
    } else if (pathname === '/kebijakan-privasi') {
      setCurrentPath('/kebijakan-privasi');
    } else {
      setCurrentPath('/');
    }
  }, []);

  useEffect(() => {
    parseCurrentLocation();

    const handlePopState = () => {
      parseCurrentLocation();
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      } else if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false);
      }
    });

    window.addEventListener('popstate', handlePopState);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('popstate', handlePopState);
    };
  }, [parseCurrentLocation]);

  // Navigate handler with browser history synchronization
  const handleNavigate = (path: AppRoute, params?: Record<string, string>) => {
    let targetUrl = path as string;

    if (path === '/talent/:id') {
      const id = params?.id || activeTalentId;
      setActiveTalentId(id);
      targetUrl = `/talent/${id}`;
    } else if (path === '/talent') {
      if (params?.activity) setInitialActivityFilter(params.activity);
      if (params?.city) setInitialCityFilter(params.city);

      const qs = new URLSearchParams();
      if (params?.activity && params.activity !== 'all') qs.set('activity', params.activity);
      if (params?.city && params.city !== 'Semua Kota') qs.set('city', params.city);
      const queryString = qs.toString();
      targetUrl = queryString ? `/talent?${queryString}` : '/talent';
    }

    try {
      window.history.pushState(null, '', targetUrl);
    } catch {
      // Fallback if environment restricts history state
    }

    setCurrentPath(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Render appropriate page view
  const renderCurrentPage = () => {
    switch (currentPath) {
      case '/':
        return <HomePage onNavigate={handleNavigate} />;
      case '/talent':
        return (
          <BrowseTalentPage
            initialActivity={initialActivityFilter}
            initialCity={initialCityFilter}
            onNavigate={handleNavigate}
          />
        );
      case '/talent/:id':
        return (
          <TalentDetailPage
            talentId={activeTalentId}
            onNavigate={handleNavigate}
          />
        );
      case '/cara-kerja':
        return <HowItWorksPage onNavigate={handleNavigate} />;
      case '/daftar-talent':
        return <BecomeTalentPage onNavigate={handleNavigate} />;
      case '/dashboard-talent':
        return <TalentDashboardPage onNavigate={handleNavigate} />;
      case '/riwayat-booking':
        return <BookingHistoryPage onNavigate={handleNavigate} />;
      case '/admin':
        return <AdminPage onNavigate={handleNavigate} />;
      case '/tentang':
        return <AboutPage onNavigate={handleNavigate} />;
      case '/faq':
        return <FaqPage onNavigate={handleNavigate} />;
      case '/bantuan':
        return <HelpCenterPage onNavigate={handleNavigate} />;
      case '/login':
        return <LoginPage onNavigate={handleNavigate} />;
      case '/register':
        return <RegisterPage onNavigate={handleNavigate} />;
      case '/ganti-sandi':
        return <ChangePasswordPage onNavigate={handleNavigate} />;
      case '/lupa-sandi':
        return <ForgotPasswordPage onNavigate={handleNavigate} />;
      case '/reset-sandi':
        return (
          <ResetPasswordPage
            onNavigate={handleNavigate}
            initialRecoveryActive={isPasswordRecovery}
          />
        );
      case '/verifikasi-ktp':
        return <VerifyKtpPage onNavigate={handleNavigate} />;
      case '/syarat-ketentuan':
        return <TermsPage />;
      case '/kebijakan-privasi':
        return <PrivacyPolicyPage />;
      default:
        return <HomePage onNavigate={handleNavigate} />;
    }
  };

  return (
    <MainLayout currentPath={currentPath} onNavigate={handleNavigate}>
      {renderCurrentPage()}
    </MainLayout>
  );
}
