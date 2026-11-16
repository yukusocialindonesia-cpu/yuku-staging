export interface CityRegionGroup {
  region: string;
  cities: string[];
}

export const INDONESIA_CITY_REGIONS: CityRegionGroup[] = [
  {
    region: 'Jabodetabek',
    cities: [
      'Jakarta',
      'Jakarta Pusat',
      'Jakarta Selatan',
      'Jakarta Barat',
      'Jakarta Timur',
      'Jakarta Utara',
      'Bogor',
      'Depok',
      'Tangerang',
      'Tangerang Selatan',
      'Bekasi',
    ],
  },
  {
    region: 'Jawa Barat & Banten',
    cities: [
      'Bandung',
      'Cimahi',
      'Cirebon',
      'Tasikmalaya',
      'Sukabumi',
      'Karawang',
      'Serang',
      'Cilegon',
    ],
  },
  {
    region: 'Jawa Tengah & DIY',
    cities: [
      'Yogyakarta',
      'Sleman',
      'Semarang',
      'Solo',
      'Surakarta',
      'Magelang',
      'Purwokerto',
      'Tegal',
      'Pekalongan',
    ],
  },
  {
    region: 'Jawa Timur',
    cities: [
      'Surabaya',
      'Sidoarjo',
      'Gresik',
      'Malang',
      'Batu',
      'Kediri',
      'Madiun',
      'Jember',
      'Banyuwangi',
    ],
  },
  {
    region: 'Bali & Nusa Tenggara',
    cities: [
      'Denpasar',
      'Badung',
      'Ubud',
      'Mataram',
      'Kupang',
    ],
  },
  {
    region: 'Sumatra',
    cities: [
      'Medan',
      'Binjai',
      'Banda Aceh',
      'Padang',
      'Pekanbaru',
      'Batam',
      'Jambi',
      'Palembang',
      'Pangkalpinang',
      'Bengkulu',
      'Bandar Lampung',
    ],
  },
  {
    region: 'Kalimantan',
    cities: [
      'Pontianak',
      'Palangkaraya',
      'Banjarmasin',
      'Balikpapan',
      'Samarinda',
      'Tarakan',
    ],
  },
  {
    region: 'Sulawesi',
    cities: [
      'Makassar',
      'Manado',
      'Palu',
      'Kendari',
      'Gorontalo',
    ],
  },
  {
    region: 'Maluku & Papua',
    cities: [
      'Ambon',
      'Ternate',
      'Sorong',
      'Jayapura',
    ],
  },
];

export const INDONESIA_CITIES: string[] = Array.from(
  new Set(INDONESIA_CITY_REGIONS.flatMap((group) => group.cities))
).sort((a, b) => a.localeCompare(b, 'id'));

export interface DynamicCityOption {
  name: string;
  region: string;
  talentCount: number;
}

export interface DynamicCityGroup {
  region: string;
  items: DynamicCityOption[];
}

const CITY_SEARCH_ALIASES: Record<string, string[]> = {
  solo: ['surakarta'],
  surakarta: ['solo'],
  denpasar: ['bali'],
  badung: ['bali', 'kuta', 'seminyak', 'canggu'],
  ubud: ['bali'],
  yogyakarta: ['jogja', 'jogjakarta', 'diy'],
  'jakarta selatan': ['jaksel'],
  'jakarta pusat': ['jakpus'],
  'jakarta barat': ['jakbar'],
  'jakarta timur': ['jaktim'],
  'jakarta utara': ['jakut'],
  'tangerang selatan': ['tangsel', 'bsd', 'bintaro'],
};

export function doesTalentCityMatchFilter(talentCityRaw: string | undefined | null, selectedCity: string): boolean {
  if (!selectedCity || selectedCity === 'Semua Kota') return true;
  const talentCity = (talentCityRaw || '').trim().toLowerCase();
  if (!talentCity) return false;

  const filterCity = selectedCity.trim().toLowerCase();
  if (talentCity === filterCity || talentCity.includes(filterCity)) {
    return true;
  }

  const aliases = CITY_SEARCH_ALIASES[filterCity] || [];
  return aliases.some((alias) => talentCity.includes(alias));
}

export function doesCityOptionMatchQuery(cityName: string, regionName: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (cityName.toLowerCase().includes(q) || regionName.toLowerCase().includes(q)) {
    return true;
  }
  const aliases = CITY_SEARCH_ALIASES[cityName.toLowerCase()] || [];
  return aliases.some((alias) => alias.includes(q));
}

export function buildGroupedCityOptions(
  talentCities: Array<string | undefined | null>
): DynamicCityGroup[] {
  const countsMap = new Map<string, number>();
  const customCities = new Map<string, string>();

  const knownLowerSet = new Set(INDONESIA_CITIES.map((c) => c.toLowerCase()));

  talentCities.forEach((raw) => {
    const cleaned = (raw || '').trim();
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    countsMap.set(key, (countsMap.get(key) || 0) + 1);
    if (!knownLowerSet.has(key) && !customCities.has(key)) {
      customCities.set(key, cleaned);
    }
  });

  const groups: DynamicCityGroup[] = INDONESIA_CITY_REGIONS.map((group) => ({
    region: group.region,
    items: group.cities.map((city) => ({
      name: city,
      region: group.region,
      talentCount: countsMap.get(city.toLowerCase()) || 0,
    })),
  }));

  if (customCities.size > 0) {
    groups.push({
      region: 'Kota / Wilayah Lainnya',
      items: Array.from(customCities.values())
        .sort((a, b) => a.localeCompare(b, 'id'))
        .map((city) => ({
          name: city,
          region: 'Kota / Wilayah Lainnya',
          talentCount: countsMap.get(city.toLowerCase()) || 0,
        })),
    });
  }

  return groups;
}

export function buildCityFilterOptions(talentCities: Array<string | undefined | null>): string[] {
  const citySet = new Set<string>(INDONESIA_CITIES);
  talentCities.forEach((city) => {
    if (city && city.trim()) {
      citySet.add(city.trim());
    }
  });
  return ['Semua Kota', ...Array.from(citySet).sort((a, b) => a.localeCompare(b, 'id'))];
}
