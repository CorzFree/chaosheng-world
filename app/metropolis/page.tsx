'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Building2,
  Hand,
  Home,
  BriefcaseBusiness,
  Warehouse,
  Trees,
  Route,
  Layers,
  TrainFront,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  CloudRain,
  CloudFog,
  Pause,
  Play,
  RotateCw,
  ScanEye,
  Minus,
  Plus,
  Undo2,
  Redo2,
  Download,
  Upload,
  Camera,
  BookOpen,
  ArrowUpRight,
  ChevronRight,
  MapPin,
  Zap,
  Droplets,
  Globe2,
  Construction,
  Compass,
  Footprints,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { useWorld, formatTime } from '@/lib/use-world';
import {
  isCity,
  ZONES,
  housingCapacity,
  jobCapacity,
  type CityTool,
} from '@/lib/city';
import { assetPath } from '@/lib/paths';
import { registerCityTools } from '@/lib/city-tools';
const tools = [
  { id: 'inspect', name: '观察', Icon: Hand },
  { id: 'residential', name: '住宅', Icon: Home },
  { id: 'commercial', name: '商务', Icon: BriefcaseBusiness },
  { id: 'mixed', name: '混合', Icon: Building2 },
  { id: 'industrial', name: '工业', Icon: Warehouse },
  { id: 'park', name: '公园', Icon: Trees },
  { id: 'road', name: '修路', Icon: Route },
] as const;
const integer = (n: number | undefined) =>
  n === undefined ? '—' : Math.round(n).toLocaleString('zh-CN');
const percent = (n: number | undefined) =>
  n === undefined ? '—' : Math.round(n * 100) + '%';
export default function CityPage() {
  const c = useWorld(),
    s = c.snapshot,
    m = s?.city,
    w = c.world.current;
  const [guide, setGuide] = useState(false),
    [archive, setArchive] = useState(false),
    [reset, setReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(
    () => c.setModal(guide || archive || reset),
    [guide, archive, reset],
  );
  useEffect(() => registerCityTools(c), []);
  const parcel =
      isCity(w) && c.selectedCityId !== null
        ? w.city.parcels[c.selectedCityId]
        : null,
    h = s?.hour ?? 9.1;
  const load = m ? m.powerDemand / Math.max(1, m.powerSupply) : 0,
    waterLoad = m ? m.waterDemand / Math.max(1, m.waterSupply) : 0;
  return (
    <main className="city-app">
      <header className="city-header">
        <div className="city-brand">
          <span>
            <Building2 size={27} />
          </span>
          <div>
            <h1>荒岛上的纽约</h1>
            <p>NEW YORK / ON AN ISLAND</p>
          </div>
        </div>
        <div className="city-context">
          <span className="city-live-dot" />
          新曼哈顿 <i /> 海岛城市实验
        </div>
        <div className="city-header-actions">
          <Button
            variant="ghost"
            onClick={c.toggleSound}
            aria-label={c.sound ? '关闭环境声' : '开启环境声'}
          >
            {c.sound ? <Volume2 /> : <VolumeX />}
          </Button>
          <Button
            variant="ghost"
            onClick={() => setGuide(true)}
            aria-label="城市指南"
          >
            <BookOpen />
          </Button>
          <Button
            variant="outline"
            className="city-save"
            onClick={() => setArchive(true)}
          >
            <Download />
            保存世界
          </Button>
        </div>
      </header>
      <div className="city-workspace">
        <section className="city-stage" aria-label="可交互的海岛大都会">
          <canvas
            ref={c.canvas}
            tabIndex={0}
            style={{ cursor: c.cityTool === 'inspect' ? 'grab' : 'crosshair' }}
            aria-label="都市画布，拖动平移，右键旋转，滚轮缩放，点击楼宇查看详情"
            onPointerDown={c.pointerDown}
            onPointerMove={c.pointerMove}
            onPointerUp={c.pointerUp}
            onPointerCancel={c.pointerCancel}
            onPointerLeave={() => (c.view.current.pointer = null)}
            onContextMenu={(e) => e.preventDefault()}
          />
          {!c.ready && (
            <div className="city-loading">
              <Building2 size={30} />
              <span>城市正在醒来</span>
            </div>
          )}
          <div className="city-map-title">
            <p>THE ISLAND METROPOLIS</p>
            <h2>一座城市，正在运转。</h2>
          </div>
          <div className="city-clock">
            {h >= 19 || h < 6 ? <Moon size={17} /> : <Sun size={17} />}
            <strong>{formatTime(h)}</strong>
            <span>建城第 {Math.floor((m?.ageDays ?? 3650) / 365) + 1} 年</span>
          </div>
          <nav className="city-tools" aria-label="城市规划工具">
            {tools.map(({ id, name, Icon }, index) => (
              <button
                key={id}
                className={c.cityTool === id ? 'active' : ''}
                aria-pressed={c.cityTool === id}
                disabled={c.street && id !== 'inspect'}
                onClick={() => c.chooseCity(id as CityTool)}
                title={name + ' · ' + (index + 1)}
              >
                <Icon size={20} />
                <span>{name}</span>
              </button>
            ))}
          </nav>
          <div className="city-layers">
            <Layers size={16} />
            <RadioGroup
              value={c.cityOverlay}
              disabled={!c.is3D}
              onValueChange={(v) =>
                c.changeCityOverlay(v as typeof c.cityOverlay)
              }
              aria-label="城市图层"
              className="city-layer-options"
            >
              {[
                { id: 'natural', label: '实景' },
                { id: 'zones', label: '分区' },
                { id: 'traffic', label: '交通' },
                { id: 'transit', label: '地铁' },
              ].map(({ id, label }) => (
                <label
                  key={id}
                  className={c.cityOverlay === id ? 'active' : ''}
                >
                  <RadioGroupItem
                    value={id}
                    className="city-invisible-radio"
                    aria-label={label}
                  />
                  {label}
                </label>
              ))}
            </RadioGroup>
          </div>
          <div className="city-camera">
            <Button
              variant="ghost"
              size="icon"
              aria-label="缩小"
              onClick={() => c.changeZoom(c.zoom - 0.2)}
            >
              <Minus />
            </Button>
            <button onClick={c.resetView} title="全景复位">
              {Math.round(c.zoom * 100)}%
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="放大"
              onClick={() => c.changeZoom(c.zoom + 0.2)}
            >
              <Plus />
            </Button>
            <i />
            <Button
              variant="ghost"
              size="icon"
              onClick={c.turnCamera}
              disabled={!c.is3D}
              aria-label="旋转视角"
            >
              <RotateCw />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={c.tiltCamera}
              disabled={!c.is3D}
              aria-label="改变俯仰"
            >
              <ScanEye />
            </Button>
          </div>
          {c.is3D && (
            <div className="city-street">
              <Button variant="ghost" onClick={c.toggleStreet}>
                <Footprints size={16} />
                {c.street ? '返回鸟瞰' : '街道视角'}
              </Button>
              {c.street && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => c.walkStreet(1)}
                    aria-label="沿街前进"
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => c.walkStreet(-1)}
                    aria-label="沿街后退"
                  >
                    <ArrowDown />
                  </Button>
                </>
              )}
            </div>
          )}
          <div className="city-undo">
            <Button
              variant="ghost"
              size="icon"
              disabled={!c.canUndo}
              onClick={c.undo}
              aria-label="撤回"
            >
              <Undo2 />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={!c.canRedo}
              onClick={c.redo}
              aria-label="重做"
            >
              <Redo2 />
            </Button>
          </div>
          <div className="city-map-footer">
            <span>
              <Compass size={15} />
              北大西洋 · 虚构海岛
            </span>
            <p>
              {c.street
                ? '拖动环顾 · W / S 沿街移动'
                : c.cityTool === 'inspect'
                  ? '拖动平移 · 右键旋转 · 点击楼宇'
                  : c.cityTool === 'road'
                    ? '沿道路或桥梁点击，接通路网'
                    : '点击地块调整分区，建设需要道路与水电'}
            </p>
            <span>{c.is3D ? '立体城市' : '平面兼容视图'}</span>
          </div>
        </section>
        <aside className="city-panel">
          <div className="city-panel-heading">
            <span>CITY OBSERVATORY</span>
            <span className="city-live-dot" />
          </div>
          <div className="city-population">
            <p>常住人口</p>
            <strong>{integer(m?.population)}</strong>
            <span>
              <Building2 size={14} />
              {integer(m?.buildings)} 栋建筑 <i /> {integer(m?.construction)}{' '}
              处在建
            </span>
          </div>
          <div className="city-stat-grid">
            <div>
              <span>住房容量</span>
              <strong>{integer(m?.housing)}</strong>
            </div>
            <div>
              <span>已就业</span>
              <strong>{integer(m?.employed)}</strong>
            </div>
            <div>
              <span>可提供岗位</span>
              <strong>{integer(m?.jobs)}</strong>
            </div>
            <div>
              <span>就业率</span>
              <strong>{percent(m?.employment)}</strong>
            </div>
          </div>
          <div className="city-section-title">
            <h3>城市生命线</h3>
            <span>沿路网供应</span>
          </div>
          <div className="city-service">
            <div>
              <span>
                <Zap size={15} />
                电力
              </span>
              <strong>
                {m && m.powerRate < 0.995
                  ? '部分区域缺电'
                  : percent(load) + ' 负荷'}
              </strong>
            </div>
            <div className="city-meter">
              <i style={{ width: Math.min(100, load * 100) + '%' }} />
            </div>
            <p>
              {m
                ? (m.powerDemand / 1000).toFixed(1) +
                  ' / ' +
                  (m.powerSupply / 1000).toFixed(1) +
                  ' MW'
                : '—'}
            </p>
          </div>
          <div className="city-service">
            <div>
              <span>
                <Droplets size={15} />
                供水
              </span>
              <strong>
                {m && m.waterRate < 0.995
                  ? '部分区域缺水'
                  : percent(waterLoad) + ' 负荷'}
              </strong>
            </div>
            <div className="city-meter water">
              <i style={{ width: Math.min(100, waterLoad * 100) + '%' }} />
            </div>
            <p>
              {integer(m?.waterDemand)} / {integer(m?.waterSupply)} m³ / 日
            </p>
          </div>
          <div className="city-mobility">
            <div>
              <span>平均通勤</span>
              <strong>
                {m ? m.commuteMinutes.toFixed(1) : '—'}
                <small> 分钟</small>
              </strong>
            </div>
            <div>
              <span>地铁分担</span>
              <strong>{percent(m?.metroShare)}</strong>
            </div>
            <button onClick={c.toggleMetro} aria-pressed={m?.metro ?? false}>
              <TrainFront size={17} />
              {m?.metro ? '暂停地铁' : m?.metroBuilt ? '恢复地铁' : '开通地铁'}
              <ChevronRight size={15} />
            </button>
            <button
              onClick={c.toggleBridge}
              aria-pressed={m?.bridgeOpen ?? false}
            >
              <Route size={17} />
              {m?.bridgeOpen ? '封闭东桥' : '接通东桥'}
              <ChevronRight size={15} />
            </button>
          </div>
          {parcel ? (
            <section className="city-parcel">
              <div>
                <span>
                  <MapPin size={14} />
                  地块 {String(parcel.id).padStart(3, '0')}
                </span>
                <button
                  onClick={() => c.selectCity(null)}
                  aria-label="关闭地块详情"
                >
                  ×
                </button>
              </div>
              <h3>{ZONES[parcel.zone].name}</h3>
              <p>
                {parcel.floors} 层已建 · {parcel.plannedFloors} 层规划
              </p>
              <dl>
                <dt>实际居民</dt>
                <dd>{integer(parcel.residents)}</dd>
                <dt>住房容量</dt>
                <dd>{integer(housingCapacity(parcel))}</dd>
                <dt>岗位容量</dt>
                <dd>{integer(jobCapacity(parcel))}</dd>
              </dl>
              <span className="city-parcel-note">
                选择左侧工具，再点击地块改建。
              </span>
            </section>
          ) : (
            <div className="city-concept">
              <img
                src={assetPath('/island-metropolis.webp')}
                alt="高密度海岛城市的概念航拍：摩天楼、中央公园、桥梁与港口"
                width={1536}
                height={1024}
              />
              <span>海岛都会 · 概念影像</span>
            </div>
          )}
          <RadioGroup
            className="city-weather"
            aria-label="城市天气"
            value={s?.weather ?? 'clear'}
            onValueChange={(v) =>
              c.changeWeather(v as 'clear' | 'rain' | 'mist')
            }
          >
            {[
              { id: 'clear', label: '晴日', Icon: Sun },
              { id: 'rain', label: '降雨', Icon: CloudRain },
              { id: 'mist', label: '海雾', Icon: CloudFog },
            ].map(({ id, label, Icon }) => (
              <label key={id} className={s?.weather === id ? 'active' : ''}>
                <RadioGroupItem
                  value={id}
                  className="city-invisible-radio"
                  aria-label={label}
                />
                <Icon size={15} />
                {label}
              </label>
            ))}
          </RadioGroup>
          <div className="city-section-title">
            <h3>城市纪事</h3>
            <span>最新变化</span>
          </div>
          <div className="city-log">
            {(s?.logs ?? []).slice(0, 3).map((entry) => (
              <p key={entry.id}>
                <time>{formatTime(entry.hour)}</time>
                {entry.text}
              </p>
            ))}
          </div>
          <p className="city-feedback" role="status" aria-live="polite">
            {c.message}
          </p>
        </aside>
      </div>
      <footer className="city-footer">
        <div className="city-simulation">
          <Button
            variant="ghost"
            size="icon"
            aria-label={c.paused ? '继续模拟' : '暂停模拟'}
            onClick={c.togglePause}
          >
            {c.paused ? <Play /> : <Pause />}
          </Button>
          <span>{c.paused ? '时间已暂停' : '城市运行中'}</span>
          <RadioGroup
            aria-label="模拟速度"
            className="city-speed"
            value={String(c.speed)}
            onValueChange={(v) => c.changeSpeed(Number(v))}
          >
            {[1, 3, 8].map((n) => (
              <label key={n} className={c.speed === n ? 'active' : ''}>
                <RadioGroupItem
                  value={String(n)}
                  className="city-invisible-radio"
                  aria-label={n + '倍速'}
                />
                {n}×
              </label>
            ))}
          </RadioGroup>
        </div>
        <div className="city-time">
          <Sun size={14} />
          <Slider
            aria-label="城市时间"
            min={0}
            max={23.99}
            step={0.1}
            value={[h]}
            onValueChange={(v) => c.seekTime(Array.isArray(v) ? v[0] : v)}
            onValueCommitted={c.save}
          />
          <Moon size={14} />
        </div>
        <div className="city-growth">
          <Button variant="outline" onClick={c.advanceQuarter}>
            <Construction size={16} />
            推进 90 天
          </Button>
          <Button variant="ghost" onClick={() => setReset(true)}>
            <Globe2 size={16} />
            开拓荒岛
          </Button>
        </div>
      </footer>
      <Dialog open={guide} onOpenChange={setGuide}>
        <DialogContent className="city-dialog">
          <DialogTitle>荒岛上的纽约</DialogTitle>
          <DialogDescription>
            这座城市的规模来自实际街区、建筑和交通连接。你可以观察，也可以规划它的下一步。
          </DialogDescription>
          <div className="city-guide">
            <p>
              <strong>让世界有尺度。</strong>
              主岛有住宅街区、两处高层核心、中央公园和货运港；桥梁将工业岛接入都市，外侧仍保留山地与森林。
            </p>
            <p>
              <strong>楼层决定容量。</strong>
              住宅提供住房，商业与混合街区提供岗位。新地块需要接通道路及水电，推进
              90 天会完成部分楼层并安排可承载的入住。
            </p>
            <p>
              <strong>交通有出发地与目的地。</strong>
              通勤由住宅到工作地匹配，车辆沿对应道路行驶。高架地铁分担通勤，暂停后需求会回到地面道路。
            </p>
            <p>
              <strong>先观察，再改变。</strong>
              点击楼宇查看详情；分区工具作用于现有地块。有人居住的楼宇会受到住房容量保护。右键或
              Alt 拖动可旋转，触屏用右下视角按钮。进入街道视角后，可拖动环顾，用
              W / S 或前进后退按钮沿路移动。
            </p>
          </div>
          <Button onClick={() => setGuide(false)}>
            回到城市 <ArrowUpRight size={16} />
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={archive} onOpenChange={setArchive}>
        <DialogContent className="city-dialog">
          <DialogTitle>保存这个世界</DialogTitle>
          <DialogDescription>
            {c.saved}。都市与旧群岛使用独立存档。
          </DialogDescription>
          <div className="city-file-actions">
            <Button variant="outline" onClick={c.exportWorld}>
              <Download />
              导出完整世界
            </Button>
            <Button variant="outline" onClick={() => file.current?.click()}>
              <Upload />
              导入世界
            </Button>
            <Button variant="outline" onClick={c.postcard}>
              <Camera />
              保存此刻画面
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                c.save();
                window.location.assign(assetPath('/isles/'));
              }}
            >
              取回旧群岛存档
            </Button>
          </div>
          <input
            className="sr-only"
            ref={file}
            type="file"
            accept=".json,application/json"
            aria-label="选择世界存档"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                void c.importWorld(f);
                setArchive(false);
              }
              e.target.value = '';
            }}
          />
        </DialogContent>
      </Dialog>
      <AlertDialog open={reset} onOpenChange={setReset}>
        <AlertDialogContent className="city-dialog">
          <AlertDialogTitle>从荒岛开始，还是进入新都会？</AlertDialogTitle>
          <AlertDialogDescription>
            这会替换当前都市存档。可以先导出世界；当前会话也可以撤回。
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>留下</AlertDialogCancel>
            <Button variant="outline" onClick={c.exportWorld}>
              先导出
            </Button>
            <AlertDialogAction
              onClick={() => {
                c.newCity(true);
                setReset(false);
              }}
            >
              从荒岛开拓
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                c.newCity(false);
                setReset(false);
              }}
            >
              生成都会
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
