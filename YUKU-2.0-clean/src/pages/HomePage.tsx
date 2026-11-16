import React, { useState, useEffect } from 'react';
import { HeroSection } from '../components/home/HeroSection';
import { PromoCarousel } from '../components/home/PromoCarousel';
import { ActivityCategories } from '../components/home/ActivityCategories';
import { FeaturedTalentSection } from '../components/home/FeaturedTalentSection';
import { HowItWorksSection } from '../components/home/HowItWorksSection';
import { SafetySection } from '../components/home/SafetySection';
import { TalentCtaSection } from '../components/home/TalentCtaSection';
import { HomeFaqSection } from '../components/home/HomeFaqSection';
import { AppRoute } from '../types/navigation';
import { ActivityCategoryId } from '../types/talent';
import { PromotionRow } from '../types/database';
import { fetchPromotionsFromSupabase } from '../utils/supabaseMarketplace';

interface HomePageProps {
  onNavigate: (path: AppRoute, params?: Record<string, string>) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const [promotions, setPromotions] = useState<PromotionRow[]>([]);
  const [isLoadingPromotions, setIsLoadingPromotions] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadPromotions() {
      try {
        setIsLoadingPromotions(true);
        const data = await fetchPromotionsFromSupabase();
        if (isMounted) {
          setPromotions(data);
        }
      } catch {
        if (isMounted) {
          setPromotions([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingPromotions(false);
        }
      }
    }

    loadPromotions();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSearch = (activity: string, city: string) => {
    onNavigate('/talent', { activity, city });
  };

  const handleSelectCategory = (categoryId: ActivityCategoryId) => {
    onNavigate('/talent', { activity: categoryId });
  };

  const handleSelectTalent = (talentId: string) => {
    onNavigate(`/talent/:id`, { id: talentId });
  };

  return (
    <div className="flex flex-col">
      {/* 2. Hero Section with Tagline ("Real Friends. Real Moments.") & 3. Tombol Jelajahi Talent */}
      {/* 4. Pencarian berdasarkan aktivitas dan lokasi */}
      <HeroSection
        onExploreClick={() => onNavigate('/talent')}
        onSearch={handleSearch}
        onRegisterCustomerClick={() => onNavigate('/register')}
        onSlideLinkClick={(path) => onNavigate(path as AppRoute)}
      />

      {/* 5. Kategori Aktivitas */}
      <ActivityCategories onSelectCategory={handleSelectCategory} />

      {/* 6. Talent Pilihan dari profil publik Supabase */}
      <FeaturedTalentSection
        onSelectTalent={handleSelectTalent}
        onViewAllClick={() => onNavigate('/talent')}
      />

      {/* Ruang Promosi Poster Berjalan */}
      <PromoCarousel
        promotions={promotions}
        isLoading={isLoadingPromotions}
        onNavigate={onNavigate}
      />

      {/* 7. Cara Kerja YUKU + Keamanan */}
      <HowItWorksSection onLearnMoreClick={() => onNavigate('/cara-kerja')} />

      {/* 9. Keamanan dan Verifikasi */}
      <SafetySection />

      {/* 10. Ajakan Customer & Tautan Talent */}
      <TalentCtaSection
        onExploreClick={() => onNavigate('/talent')}
        onRegisterCustomerClick={() => onNavigate('/register')}
        onRegisterClick={() => onNavigate('/daftar-talent')}
      />

      {/* 11. FAQ */}
      <HomeFaqSection onViewAllFaqClick={() => onNavigate('/faq')} />
    </div>
  );
};
