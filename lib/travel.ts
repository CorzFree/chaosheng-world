import panoramaData from '../public/travel/catalog.json' with { type: 'json' };
import posterCredits from '../public/travel/poster-credits.json' with { type: 'json' };
export type Region =
  | 'Europe'
  | 'Asia'
  | 'Africa'
  | 'North America'
  | 'South America'
  | 'Oceania';
export type TravelPlace = {
  id: string;
  name: string;
  place: string;
  country: string;
  region: Region;
  kind: string;
  line: string;
  coords: [number, number];
  mode: 'panorama' | 'street';
  image?: string;
  preview?: string;
  photographer: string;
  source: string;
  license: string;
  licenseUrl: string;
  provider: string;
  taken: string | null;
  initialYaw?: number;
  initialPitch?: number;
  width?: number;
  height?: number;
  embed?: string;
  navigable?: boolean;
  modification?: string;
  posterCredit?: {
    author: string;
    sourcePage: string;
    license: string;
    licenseUrl: string;
    captureDate: string;
  };
};
export const REGIONS: Record<Region, string> = {
  Europe: '欧洲',
  Asia: '亚洲',
  Africa: '非洲',
  'North America': '北美洲',
  'South America': '南美洲',
  Oceania: '大洋洲',
};
export const PANORAMAS: TravelPlace[] = panoramaData.map(
  (p): TravelPlace => ({
    ...p,
    coords: [p.coords[0], p.coords[1]],
    region: p.region as Region,
    mode: 'panorama',
  }),
);
const embed = (
  id: string,
  name: string,
  place: string,
  country: string,
  region: Region,
  coords: [number, number],
  src: string,
  photographer: string,
  taken: string,
  navigable: boolean,
  line: string,
): TravelPlace => ({
  id,
  name,
  place,
  country,
  region,
  coords,
  mode: 'street',
  kind: navigable ? '漫游' : '城市',
  line,
  embed: src,
  photographer,
  taken,
  navigable,
  source: mapsLink(coords),
  license: 'Google Maps 条款',
  licenseUrl: 'https://developers.google.com/maps/terms',
  provider: 'Google Maps',
  preview: id === 'reykjavik' ? undefined : '/travel/' + id + '-poster.jpg',
  posterCredit: posterCredits.find((p) => p.id === id),
});
export function mapsLink(coords: [number, number]) {
  const url = new URL('https://www.google.com/maps/@');
  url.searchParams.set('api', '1');
  url.searchParams.set('map_action', 'pano');
  url.searchParams.set('viewpoint', coords.join(','));
  return url.href;
}
export function mapsSearch(query: string) {
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', query.trim());
  return url.href;
}
export const STREET_PLACES: TravelPlace[] = [
  embed(
    'new-york',
    '纽约',
    '时代广场 · 7th Avenue',
    '美国',
    'North America',
    [40.7582747623313, -73.98534722679142],
    'https://www.google.com/maps/embed?pb=!4v1788690609728!6m8!1m7!1sV_St_rPoVRdflyz8noyj8g!2m2!1d40.7582747623313!2d-73.98534722679142!3f255.0667559230769!4f0!5f0.7820865974627469',
    'Google 街景',
    '2024-08',
    true,
    '沿着第七大道，走进真正的纽约。',
  ),
  embed(
    'paris',
    '巴黎',
    '耶拿桥 · 埃菲尔铁塔',
    '法国',
    'Europe',
    [48.85954350219251, 2.292687395555604],
    'https://www.google.com/maps/embed?pb=!4v1788690839643!6m8!1m7!1sxkgbUNjm1F9SKm6uMzelPw!2m2!1d48.85954350219251!2d2.292687395555604!3f130.74496531399222!4f22.424864108969814!5f0.7820865974627469',
    'Google 街景',
    '2025-06',
    true,
    '抬头，铁塔就在这里。',
  ),
  embed(
    'tokyo',
    '东京',
    '涩谷十字路口',
    '日本',
    'Asia',
    [35.65958588632845, 139.700203614965],
    'https://www.google.com/maps/embed?pb=!4v1788689844030!6m8!1m7!1sikvuzi7_XcD9q_tpA7xoPA!2m2!1d35.65958588632845!2d139.700203614965!3f175.21039063700715!4f0!5f0.7820865974627469',
    'Google 街景',
    '2024-12',
    true,
    '等一盏绿灯，看看路口的另一边。',
  ),
  embed(
    'sydney',
    '悉尼',
    '歌剧院与海港',
    '澳大利亚',
    'Oceania',
    [-33.85793577105063, 151.2141524323556],
    'https://www.google.com/maps/embed?pb=!4v1788691073487!6m8!1m7!1sMSuze8SrnGCVlYsJQUUvfA!2m2!1d-33.85793577105063!2d151.2141524323556!3f356.4004154517191!4f0!5f0.7820865974627469',
    'Google 街景',
    '2024-09',
    true,
    '在海港边，看歌剧院的白色屋顶。',
  ),
  embed(
    'rio',
    '里约热内卢',
    '科帕卡巴纳海滨',
    '巴西',
    'South America',
    [-22.97084770853821, -43.18308490149738],
    'https://www.google.com/maps/embed?pb=!4v1788690071056!6m8!1m7!1sIlr9XGGcDxtuc3lseKr2cA!2m2!1d-22.97084770853821!2d-43.18308490149738!3f55.68362330358019!4f10!5f0.7820865974627469',
    'Google 街景',
    '2016-03',
    true,
    '沿着波浪形的步道，向海边走。',
  ),
  embed(
    'reykjavik',
    '雷克雅未克',
    'Austurstræti 街',
    '冰岛',
    'Europe',
    [64.14779331102315, -21.93966739299692],
    'https://www.google.com/maps/embed?pb=!4v1788690323322!6m8!1m7!1sTMpJVfLn9wB5lwNfXh8gkQ!2m2!1d64.14779331102315!2d-21.93966739299692!3f168.65089661663868!4f0!5f0.7820865974627469',
    'Google 街景',
    '2024-07',
    true,
    '慢慢走过北方城市的小街。',
  ),
];
export const PLACES: TravelPlace[] = [
  PANORAMAS[0],
  ...STREET_PLACES,
  ...PANORAMAS.slice(1),
];
export function getPlace(id: string) {
  return PLACES.find((p) => p.id === id);
}
export function filterPlaces(
  query: string,
  region: string = 'all',
  mode: string = 'all',
) {
  const text = query.trim().toLocaleLowerCase();
  return PLACES.filter(
    (p) =>
      (region === 'all' || p.region === region) &&
      (mode === 'all' ||
        mode === 'saved' ||
        (mode === '城市' && p.mode === 'street') ||
        p.kind === mode ||
        (mode === 'street'
          ? p.mode === 'street' && p.navigable
          : p.mode === mode)) &&
      (!text ||
        [p.name, p.place, p.country, p.kind, REGIONS[p.region]]
          .join(' ')
          .toLocaleLowerCase()
          .includes(text)),
  );
}
export function verifyPlace(place: TravelPlace) {
  if (
    !place.id ||
    !Number.isFinite(place.coords[0]) ||
    !Number.isFinite(place.coords[1]) ||
    Math.abs(place.coords[0]) > 90 ||
    Math.abs(place.coords[1]) > 180
  )
    return false;
  if (place.mode === 'panorama')
    return !!place.image && place.width === place.height! * 2;
  if (!place.embed) return false;
  const url = new URL(place.embed);
  return (
    url.protocol === 'https:' &&
    url.hostname === 'www.google.com' &&
    url.pathname === '/maps/embed' &&
    url.searchParams.has('pb')
  );
}
