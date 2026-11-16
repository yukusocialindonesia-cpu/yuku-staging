import React from 'react';
import { useBranding } from '../../utils/branding';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
  variant?: 'full' | 'icon';
  inverted?: boolean;
  className?: string;
  onClick?: () => void;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showTagline = true,
  variant = 'full',
  inverted = false,
  className = '',
  onClick,
}) => {
  const { logoUrl, iconUrl } = useBranding();
  const heightClasses = {
    sm: 'h-8',
    md: 'h-11',
    lg: 'h-14',
    xl: 'h-20',
  };

  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-16 h-16',
  };

  if (variant === 'icon') {
    return (
      <div
        onClick={onClick}
        className={`inline-flex items-center shrink-0 select-none ${
          onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
        } ${className}`}
      >
        <img
          src={iconUrl}
          alt="YUKU"
          className={`${iconSizes[size]} object-contain`}
          loading="eager"
        />
      </div>
    );
  }

  // On dark surfaces (e.g. Footer & dark banners), display the authentic logo inside
  // a crisp, refined white surface badge to preserve 100% of the authentic brand colors
  if (inverted) {
    return (
      <div
        onClick={onClick}
        className={`inline-flex items-center select-none ${
          onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
        } ${className}`}
      >
        <div className="bg-white rounded-xl px-3 py-1.5 shadow-sm inline-flex items-center border border-white/20">
          <img
            src={logoUrl}
            alt="YUKU — Real Friends. Real Moments."
            className={`${heightClasses[size]} w-auto object-contain block`}
            loading="eager"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center select-none ${
        onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
      } ${className}`}
    >
      <img
        src={logoUrl}
        alt="YUKU — Real Friends. Real Moments."
        className={`${heightClasses[size]} w-auto object-contain block`}
        loading="eager"
      />
    </div>
  );
};
