/**
 * Talent and Activity Types for YUKU
 */

export type ActivityCategoryId = string;

export interface ActivityCategory {
  id: ActivityCategoryId;
  title: string;
  description: string;
  iconName: string;
  examples: string[];
  isOnlineAvailable: boolean;
}

export type GenderType = 'Pria' | 'Wanita' | 'Semua';

export interface TalentProfile {
  id: string;
  name: string;
  age?: number;
  city?: string;
  gender?: 'Pria' | 'Wanita';
  headline?: string;
  bio?: string;
  rating?: number;
  reviewCount?: number;
  completedHours?: number;
  avatarUrl?: string;
  activities: ActivityCategoryId[];
  hourlyRate?: number;
  onlineChatRate?: number;
  languages?: string[];
  interests?: string[];
  serviceMode?: 'Offline & Online' | 'Offline Only' | 'Online Only' | string;
  isDemo?: boolean;
}

export interface Testimonial {
  id: string;
  author: string;
  city: string;
  activity: string;
  quote: string;
  date: string;
  rating: number;
  isDemo?: boolean;
}
