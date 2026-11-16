import React from 'react';
import { HOW_IT_WORKS_STEPS } from '../../utils/contentData';
import { ArrowRight, Search, CalendarClock, Smile, BadgeCheck, Lock, Headphones, Heart } from 'lucide-react';

const STEP_ICONS = [Search, CalendarClock, Smile, BadgeCheck];

const TRUST_ITEMS = [
  { label: 'Profil Terverifikasi', Icon: BadgeCheck },
  { label: 'Data Aman', Icon: Lock },
  { label: 'Dukungan Admin', Icon: Headphones },
  { label: 'Komunitas Positif', Icon: Heart },
];

interface HowItWorksSectionProps {
  onLearnMoreClick: () => void;
}

export const HowItWorksSection: React.FC<HowItWorksSectionProps> = ({ onLearnMoreClick }) => {
  return (
    <section className="py-10 md:py-14 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
          {/* Cara Kerja */}
          <div className="lg:col-span-8">
            <span className="text-[11px] font-bold text-purple-700 tracking-wider uppercase block">
              Alur Mudah & Transparan
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#1E0938] tracking-tight mb-5">
              Cara Kerja YUKU
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {HOW_IT_WORKS_STEPS.map((item, index) => {
                const Icon = STEP_ICONS[index % STEP_ICONS.length];
                return (
                  <div
                    key={item.step}
                    className="flex flex-col items-center text-center bg-purple-50/70 border border-purple-100 rounded-2xl p-3 sm:p-4"
                  >
                    <div className="relative mb-2.5">
                      <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-700 to-fuchsia-600 text-white flex items-center justify-center shadow-md shadow-purple-300/50">
                        <Icon className="w-6 h-6" />
                      </span>
                      <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-amber-400 text-amber-950 text-[11px] font-black flex items-center justify-center">
                        {index + 1}
                      </span>
                    </div>
                    <h3 className="text-[13px] font-bold text-[#1E0938] mb-1 leading-tight">{item.title}</h3>
                    <p className="text-[11px] text-slate-600 leading-snug line-clamp-3">{item.description}</p>
                  </div>
                );
              })}
            </div>

            <button
              onClick={onLearnMoreClick}
              className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-purple-700 hover:text-purple-900 transition-colors cursor-pointer"
            >
              <span>Pelajari Pedoman Etika & Panduan Lengkap</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Keamanan & Kepercayaan */}
          <div className="lg:col-span-4 lg:border-l lg:border-purple-100 lg:pl-10">
            <span className="text-[11px] font-bold text-purple-700 tracking-wider uppercase block">
              Privasi & Keamanan
            </span>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#1E0938] tracking-tight mb-1">
              Keamanan & Kepercayaan
            </h2>
            <p className="text-sm text-slate-500 mb-5">Privasi dan keamananmu adalah prioritas kami.</p>
            <div className="grid grid-cols-4 lg:grid-cols-2 gap-3">
              {TRUST_ITEMS.map(({ label, Icon }) => (
                <div key={label} className="flex flex-col lg:flex-row items-center lg:gap-3 text-center lg:text-left">
                  <span className="w-12 h-12 shrink-0 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center">
                    <Icon className="w-6 h-6" />
                  </span>
                  <span className="mt-1.5 lg:mt-0 text-[11px] lg:text-sm font-semibold text-slate-700 leading-tight">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
