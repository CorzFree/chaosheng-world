import observations from './data/travel-spots.json' with { type: 'json' };
export type DiscoverySpot = {
  id: string;
  placeId: string;
  title: string;
  hint: string;
  description: string;
  yaw: number;
  pitch: number;
  radius: number;
};
export const SPOTS: DiscoverySpot[] = observations.flatMap((place) =>
  place.spots.map((spot) => ({
    id: place.placeId + ':' + spot.id,
    placeId: place.placeId,
    title: spot.title,
    hint: spot.hint,
    description: spot.description,
    yaw: (spot.u - 0.5) * 360,
    pitch: (0.5 - spot.v) * 180,
    radius: 10,
  })),
);
export const spotsFor = (id: string) =>
  SPOTS.filter((spot) => spot.placeId === id);
export const getSpot = (id: string) => SPOTS.find((spot) => spot.id === id);
export type Journey = {
  id: string;
  title: string;
  line: string;
  duration: string;
  cover: string;
  stops: { placeId: string; spotId: string; intro: string }[];
};
export const JOURNEYS: Journey[] = [
  {
    id: 'water-light',
    title: '把心放到水边',
    line: '从落日的海，到平静的湖，再到沙滩上的彩色小屋。',
    duration: '约 8–12 分钟',
    cover: 'venice_sunset',
    stops: [
      {
        placeId: 'venice_sunset',
        spotId: 'venice_sunset:sun',
        intro: '第一站，先在海边等一束金色的光。',
      },
      {
        placeId: 'shudu_lake',
        spotId: 'shudu_lake:hill-reflection',
        intro: '把视线放低一点，看山如何落进湖水。',
      },
      {
        placeId: 'fish_hoek_beach',
        spotId: 'fish_hoek_beach:color-huts',
        intro: '最后去海滩，找一排像彩色铅笔的小屋。',
      },
    ],
  },
  {
    id: 'green-escape',
    title: '走进绿色深处',
    line: '穿过草地、枝叶与岩壁，把目光留给细小的生命。',
    duration: '约 10–15 分钟',
    cover: 'ninomaru_teien',
    stops: [
      {
        placeId: 'alps_field',
        spotId: 'alps_field:field-path',
        intro: '先找一条穿过山间草地的小路。',
      },
      {
        placeId: 'ninomaru_teien',
        spotId: 'ninomaru_teien:bamboo-fence',
        intro: '在庭园里，看看竹竿怎样被一根绳系在一起。',
      },
      {
        placeId: 'moulton_falls_train_tunnel_east',
        spotId: 'moulton_falls_train_tunnel_east:fern-fan',
        intro: '来到林地，抬头找一簇舒展的蕨叶。',
      },
    ],
  },
  {
    id: 'city-details',
    title: '城市的小秘密',
    line: '高楼、灯光和桥栏，留意天际线之外的城市细节。',
    duration: '约 8–12 分钟',
    cover: 'shanghai_bund',
    stops: [
      {
        placeId: 'shanghai_bund',
        spotId: 'shanghai_bund:purple-tower',
        intro: '夜色里，先找到串着圆球的紫色高塔。',
      },
      {
        placeId: 'portland_landing_pad',
        spotId: 'portland_landing_pad:tower-crane',
        intro: '换一座城市，把目光投向天上的钢架长臂。',
      },
      {
        placeId: 'westminster_bridge',
        spotId: 'westminster_bridge:clover-railing',
        intro: '走到桥边，低头看看栏杆里藏着的花形。',
      },
    ],
  },
  {
    id: 'stone-stories',
    title: '石头与远山',
    line: '从城门与砖拱，走到开阔的山顶。',
    duration: '约 8–12 分钟',
    cover: 'mutianyu',
    stops: [
      {
        placeId: 'zhengyang_gate',
        spotId: 'zhengyang_gate:gate-arch',
        intro: '一座城门，也是一扇通往别处的门。',
      },
      {
        placeId: 'mutianyu',
        spotId: 'mutianyu:nested-arches',
        intro: '透过门洞，再看一道门洞，试着找到尽头的光。',
      },
      {
        placeId: 'table_mountain_1',
        spotId: 'table_mountain_1:pointed-peak',
        intro: '最后站在山顶，看远处那座尖峰与海湾。',
      },
    ],
  },
];
export const getJourney = (id: string) =>
  JOURNEYS.find((journey) => journey.id === id);
