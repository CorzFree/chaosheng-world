'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Compass,
  Globe2,
  Search,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Heart,
  MapPin,
  Maximize2,
  Minimize2,
  RotateCw,
  Plus,
  Minus,
  Camera,
  Info,
  BookOpen,
  Shuffle,
  X,
  Map,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import TravelGlobe from '@/components/travel-globe';
import {
  PLACES,
  REGIONS,
  filterPlaces,
  getPlace,
  mapsSearch,
} from '@/lib/travel';
import { useTravel } from '@/lib/use-travel';
import { assetPath } from '@/lib/paths';
import { registerTravelTools } from '@/lib/travel-tools';
import TravelPlay from '@/components/travel-play';
import { useExpedition } from '@/lib/use-expedition';
import { registerExpeditionTools } from '@/lib/expedition-tools';
export default function TravelPage() {
  const c = useTravel(),
    p = c.active;
  const expedition = useExpedition(c);
  const expeditionRef = useRef(expedition);
  expeditionRef.current = expedition;
  useEffect(
    () =>
      registerTravelTools({
        ...c,
        travelTo: async (...args) => {
          expeditionRef.current.exitPlay();
          await c.travelTo(...args);
        },
      }),
    [],
  );
  useEffect(() => registerExpeditionTools(() => expeditionRef.current), []);
  const [query, setQuery] = useState(''),
    [region, setRegion] = useState('all'),
    [category, setCategory] = useState('all');
  const filtered = filterPlaces(query, region, category).filter(
    (place) => category !== 'saved' || c.memory.saved.includes(place.id),
  );
  return (
    <main
      className={
        'travel-app play-mode-' +
        expedition.mode +
        ' ' +
        (c.immersive ? 'immersive' : '')
      }
    >
      <div
        className={'travel-stage ' + (c.isStreet ? 'is-street' : '')}
        style={{
          backgroundImage: p.preview
            ? 'url("' + assetPath(p.preview) + '")'
            : undefined,
        }}
      >
        <canvas
          ref={c.canvas}
          className={c.isStreet || c.fallback ? 'hidden-viewer' : ''}
          tabIndex={0}
          aria-label={
            expedition.mode === 'hunt'
              ? '真实全景寻景。方向键环顾，Enter确认中央目标。'
              : '真实360度全景。拖动环顾，滚轮缩放，方向键改变视角。'
          }
        />
        {c.fallback && !c.isStreet && (
          <div className="travel-flat">
            <img src={assetPath(p.image!)} alt={p.place + '的真实完整全景'} />
            <span>平面全景 · 可横向滚动</span>
          </div>
        )}
        {c.isStreet && (
          <iframe
            key={p.id + '-' + c.frameKey}
            src={p.embed}
            title={p.name + ' · Google 街景'}
            allowFullScreen
            allow="fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={c.frameLoaded}
          />
        )}
        {!c.isStreet && <div className="travel-shade" />}
      </div>
      <header className="travel-header">
        <a href={assetPath('/')} className="travel-brand">
          <Compass size={28} />
          <span>
            远方<small>实景旅行</small>
          </span>
        </a>
        <nav aria-label="旅行导航">
          <button
            className="explore-menu-button"
            onClick={() => expedition.setOpen(true)}
          >
            <Sparkles size={17} />
            <span>探索玩法</span>
          </button>
          <button
            className="passport-nav"
            onClick={() => expedition.setPassport(true)}
          >
            <BookOpen size={17} />
            <span>我的远方</span>
          </button>
          <button
            className="destination-button"
            disabled={expedition.mode === 'quiz'}
            onClick={() => c.setAtlas(true)}
          >
            <Globe2 size={17} />
            选择目的地
            <ChevronDown size={14} />
          </button>
          <button
            className="legacy-journal-button"
            onClick={() => c.setJournal(true)}
          >
            <BookOpen size={17} />
            <span>旅行足迹</span>
          </button>
          <button onClick={() => c.setHelp(true)} aria-label="旅行指南">
            <Info size={18} />
          </button>
        </nav>
      </header>
      {c.immersive && (
        <button className="leave-immersive" onClick={c.toggleImmersive}>
          <Minimize2 size={18} />
          退出沉浸
        </button>
      )}
      <TravelPlay travel={c} play={expedition} />
      <section className="travel-place" aria-label="当前目的地">
        <div className="travel-eyebrow">
          <MapPin size={13} />
          {p.country}
          <span>·</span>
          {REGIONS[p.region]}
        </div>
        <h1>{p.name}</h1>
        <p className="travel-place-name">
          {c.isStreet ? '起点 · ' + p.place : p.place}
        </p>
        <p className="travel-line">{p.line}</p>
        <div className="travel-place-actions">
          <button onClick={c.toggleSaved} aria-pressed={c.saved}>
            <Heart size={16} fill={c.saved ? 'currentColor' : 'none'} />
            {c.saved ? '已收藏' : '想再来一次'}
          </button>
          <button onClick={c.postcard} disabled={c.isStreet || !!c.loading}>
            <Camera size={16} />
            留张明信片
          </button>
        </div>
      </section>
      <div className="travel-view-controls">
        {!c.isStreet && (
          <>
            <button
              onClick={c.toggleAuto}
              aria-pressed={c.auto}
              disabled={c.fallback}
            >
              <RotateCw size={16} />
              {c.auto ? '停止环顾' : '慢慢环顾'}
            </button>
            <span className="control-divider" />
            <button
              aria-label="缩小"
              onClick={() => c.zoom(7)}
              disabled={c.fallback}
            >
              <Minus size={17} />
            </button>
            <span className="travel-zoom">
              {Math.round((76 / c.pose.fov) * 100)}%
            </span>
            <button
              aria-label="放大"
              onClick={() => c.zoom(-7)}
              disabled={c.fallback}
            >
              <Plus size={17} />
            </button>
            <span className="control-divider" />
          </>
        )}
        <button aria-label="沉浸观看" onClick={c.toggleImmersive}>
          <Maximize2 size={17} />
        </button>
      </div>
      {c.loading && getPlace(c.loading)?.mode === 'panorama' && (
        <div className="travel-loading" role="status">
          <Loader2 size={18} className="travel-spinner" />
          正在前往 {getPlace(c.loading)?.name}…
        </div>
      )}
      {c.error && (
        <div className="travel-notice" role="alert">
          <p>{c.error}</p>
          <button onClick={c.retry}>重试</button>
          <button onClick={() => c.setAtlas(true)}>换个地方</button>
        </div>
      )}
      {c.frameSlow && (
        <div className="travel-notice">
          <p>Google 街景仍在加载，也可以在原站继续。</p>
          <a href={p.source} target="_blank" rel="noreferrer">
            打开 Google 地图 <ArrowUpRight size={14} />
          </a>
          <button onClick={c.retryFrame}>重试</button>
        </div>
      )}
      <div className="travel-attribution">
        <span>
          {c.isStreet
            ? p.navigable
              ? '可沿道路漫游'
              : 'Google 实拍全景'
            : '360°实拍全景 · 静态摄影'}
        </span>
        {!c.isStreet && (
          <a
            className="panorama-author"
            href={p.source}
            target="_blank"
            rel="noreferrer"
          >
            {p.photographer} · {p.license}
          </a>
        )}
        <button onClick={() => c.setCredits(true)}>
          影像来源 <Info size={12} />
        </button>
        {c.isStreet && (
          <a href={p.source} target="_blank" rel="noreferrer">
            在 Google 地图打开 <ArrowUpRight size={12} />
          </a>
        )}
      </div>
      <footer className="travel-footer">
        <div className="travel-footer-heading">
          <span>下一站，随心一点。</span>
          <div>
            <button onClick={c.surprise}>
              <Shuffle size={14} />
              随便去一个地方
            </button>
            <button aria-label="上一处目的地" onClick={() => c.nextPlace(-1)}>
              <ArrowLeft size={17} />
            </button>
            <button aria-label="下一处目的地" onClick={() => c.nextPlace(1)}>
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
        <div className="travel-filmstrip">
          {PLACES.map((place) => (
            <button
              key={place.id}
              className={'travel-film ' + (p.id === place.id ? 'active' : '')}
              onClick={() => void c.travelTo(place)}
              aria-current={p.id === place.id ? 'location' : undefined}
            >
              {place.preview ? (
                <img
                  src={assetPath(place.preview)}
                  alt={place.place}
                  loading="lazy"
                />
              ) : (
                <Globe2 size={28} />
              )}
              <span>
                <strong>{place.name}</strong>
                <small>
                  {place.country} · {place.mode === 'street' ? '街景' : '全景'}
                </small>
              </span>
              {c.memory.saved.includes(place.id) && (
                <Heart size={12} className="film-heart" fill="currentColor" />
              )}
            </button>
          ))}
        </div>
      </footer>
      {c.message && (
        <div className="travel-message" role="status" aria-live="polite">
          {c.message}
          <button aria-label="收起提示" onClick={() => c.setMessage('')}>
            <X size={12} />
          </button>
        </div>
      )}
      <Dialog open={c.atlas} onOpenChange={c.setAtlas}>
        <DialogContent className="travel-dialog atlas-dialog">
          <DialogTitle>今天，想去哪里？</DialogTitle>
          <DialogDescription>
            选一个地方，慢慢看。这里有 {PLACES.length}{' '}
            处真实影像，遍布六个大洲。
          </DialogDescription>
          <div className="travel-search">
            <Search size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
              placeholder="搜索城市、国家，或山海…"
              aria-label="搜索目的地"
            />
          </div>
          <div className="travel-filters">
            <button
              className={category === 'all' ? 'active' : ''}
              onClick={() => setCategory('all')}
            >
              全部
            </button>
            {['城市', '水边', '山野', '安静', '人文', 'street', 'saved'].map(
              (kind) => (
                <button
                  key={kind}
                  className={category === kind ? 'active' : ''}
                  onClick={() => setCategory(kind)}
                >
                  {kind === 'street'
                    ? '沿街漫游'
                    : kind === 'saved'
                      ? '我的收藏'
                      : kind}
                </button>
              ),
            )}
          </div>
          <div className="travel-region-filter">
            <label htmlFor="travel-region">大洲</label>
            <NativeSelect
              id="travel-region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <NativeSelectOption value="all">全世界</NativeSelectOption>
              {Object.entries(REGIONS).map(([key, value]) => (
                <NativeSelectOption key={key} value={key}>
                  {value}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <Tabs defaultValue="list" className="atlas-tabs">
            <TabsList>
              <TabsTrigger value="list">目的地</TabsTrigger>
              <TabsTrigger value="earth">转动地球</TabsTrigger>
            </TabsList>
            <TabsContent value="earth">
              <TravelGlobe
                active={p}
                onChoose={(place) => void c.travelTo(place)}
              />
            </TabsContent>
            <TabsContent value="list">
              <div className="travel-destination-grid">
                {filtered.map((place) => (
                  <button key={place.id} onClick={() => void c.travelTo(place)}>
                    {place.preview ? (
                      <img
                        src={assetPath(place.preview)}
                        alt={place.place}
                        loading="lazy"
                      />
                    ) : (
                      <div className="travel-no-photo">
                        <Globe2 size={44} />
                      </div>
                    )}
                    <div>
                      <span>
                        {place.country}
                        <small>
                          {place.mode === 'street'
                            ? place.navigable
                              ? '街景漫游'
                              : '实拍全景'
                            : '360°全景'}
                        </small>
                      </span>
                      <strong>{place.name}</strong>
                      <p>{place.place}</p>
                    </div>
                  </button>
                ))}
              </div>
            </TabsContent>
          </Tabs>
          {!filtered.length && (
            <div className="travel-empty">
              <Compass size={30} />
              <p>这里还没有这个目的地，可以去 Google 地图继续找。</p>
            </div>
          )}
          <a
            className="travel-search-elsewhere"
            href={mapsSearch(query || '世界旅游景点')}
            target="_blank"
            rel="noreferrer"
          >
            <Map size={16} />
            寻找更多地方{query ? '：' + query : ''}
            <ArrowUpRight size={15} />
          </a>
        </DialogContent>
      </Dialog>
      <Dialog open={c.journal} onOpenChange={c.setJournal}>
        <DialogContent className="travel-dialog journal-dialog">
          <DialogTitle>留在心里的地方</DialogTitle>
          <DialogDescription>
            这是你的线上旅行记录，只保存在这台设备。
          </DialogDescription>
          <div className="travel-journal-stats">
            <span>
              <strong>{c.memory.visits.length}</strong>处打开过的风景
            </span>
            <span>
              <strong>{c.memory.saved.length}</strong>处想再来的地方
            </span>
          </div>
          <div className="travel-journal-list">
            {c.memory.visits.length ? (
              c.memory.visits.map((visit) => {
                const place = getPlace(visit.id)!;
                return (
                  <button key={visit.id} onClick={() => void c.travelTo(place)}>
                    {place.preview && (
                      <img src={assetPath(place.preview)} alt="" />
                    )}
                    <span>
                      <strong>{place.name}</strong>
                      <small>
                        {place.country} ·{' '}
                        {new Date(visit.at).toLocaleDateString('zh-CN')}
                      </small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                );
              })
            ) : (
              <p className="travel-empty">第一站已经在等你。</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={c.credits} onOpenChange={c.setCredits}>
        <DialogContent className="travel-dialog credit-dialog">
          <DialogTitle>真实影像，从哪里来</DialogTitle>
          <DialogDescription>
            地点、拍摄者和拍摄时间均来自原始来源。画面不是实时直播。
          </DialogDescription>
          <div className="travel-credit">
            <a
              href={assetPath('/travel/credits.html')}
              target="_blank"
              rel="noreferrer"
            >
              全部影像署名与许可 <ArrowUpRight size={14} />
            </a>
            <h3>
              {p.name} · {p.place}
            </h3>
            <p>影像作者／提供者：{p.photographer}</p>
            <p>
              {c.isStreet ? '起始街景拍摄时间' : '拍摄时间'}：
              {p.taken ?? '来源未注明'}
            </p>
            <p>
              {c.isStreet ? '起点坐标' : '拍摄位置'}：{p.coords[0].toFixed(5)},{' '}
              {p.coords[1].toFixed(5)}
            </p>
            <a href={p.source} target="_blank" rel="noreferrer">
              查看原始来源 <ArrowUpRight size={14} />
            </a>
            <a href={p.licenseUrl} target="_blank" rel="noreferrer">
              {p.license} <ArrowUpRight size={14} />
            </a>
            {p.modification && (
              <p className="travel-credit-note">
                站内摄影仅作尺寸优化与 WebP 转换；图片内容未改写。CC BY-SA
                图片衍生版本保留相同许可。
              </p>
            )}
            {p.posterCredit && (
              <>
                <h4>目的地卡片摄影</h4>
                <p>
                  {p.posterCredit.author} · {p.posterCredit.license}
                </p>
                <a
                  href={p.posterCredit.sourcePage}
                  target="_blank"
                  rel="noreferrer"
                >
                  卡片照片来源
                </a>
                <a
                  href={p.posterCredit.licenseUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  卡片照片许可
                </a>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={c.help} onOpenChange={c.setHelp}>
        <DialogContent className="travel-dialog help-dialog">
          <DialogTitle>把一扇窗，开向远方。</DialogTitle>
          <DialogDescription>
            你可以待在一个地方，也可以下一秒去到另一个大洲。
          </DialogDescription>
          <div className="travel-help">
            <p>
              <strong>360°实拍全景</strong>
              可以拖动环顾、滚轮缩放；它是在真实拍摄点记录的完整球面照片。方向键也能调整视角。
            </p>
            <p>
              <strong>街景漫游</strong>由 Google Maps
              提供，可使用画面中的道路箭头继续移动。影像覆盖与可达路径由原平台决定。
            </p>
            <p>
              <strong>沉浸、收藏、留念</strong>
              隐藏界面慢慢看，收藏想再来的地方，也可以把站内摄影的一角收进明信片。
            </p>
            <p>
              <strong>寻景与世界猜想</strong>
              根据线索寻找画面中的细节，走完三站旅程；也能在五轮猜地点游戏中，把看到的风景放到地球上。进度和手记只保存在此设备。
            </p>
            <p>
              过去的沙盘已保留：<a href={assetPath('/metropolis/')}>海岛都市</a>{' '}
              · <a href={assetPath('/isles/')}>原野群岛</a>。
            </p>
          </div>
          <Button onClick={() => c.setHelp(false)}>
            去看看风景 <ArrowUpRight size={16} />
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
