'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Waves,
  Hand,
  Mountain,
  TreePine,
  House,
  Sailboat,
  Flame,
  Droplets,
  Pause,
  Play,
  Volume2,
  VolumeX,
  BookOpen,
  ArrowUpRight,
  Sun,
  CloudRain,
  CloudFog,
  Moon,
  Sunrise,
  Sunset,
  Minus,
  Plus,
  Compass,
  Undo2,
  Redo2,
  Shuffle,
  Download,
  Upload,
  Camera,
  X,
  Sparkles,
  Map,
  ChevronDown,
  Check,
  RotateCw,
  ScanEye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
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
import { DISCOVERIES, type Weather } from '@/lib/world';
import { registerWorldTools } from '@/lib/webmcp';
import { assetPath } from '@/lib/paths';
const TOOLS = [
  {
    id: 'look',
    name: '观海',
    Icon: Hand,
    hint: '拖动海图 · 滚轮缩放 · 右键转动视角',
  },
  {
    id: 'land',
    name: '造岛',
    Icon: Mountain,
    hint: '在海面按住片刻，让岛屿浮现',
  },
  {
    id: 'tree',
    name: '种树',
    Icon: TreePine,
    hint: '点一下陆地，种下新绿 · 拖动可种一片林',
  },
  { id: 'home', name: '筑屋', Icon: House, hint: '在空地上，为旅人留一扇窗' },
  {
    id: 'boat',
    name: '放舟',
    Icon: Sailboat,
    hint: '点一下开阔海面，让小船出发',
  },
  {
    id: 'lantern',
    name: '点灯',
    Icon: Flame,
    hint: '点一盏小灯，留给晚来的星星',
  },
  {
    id: 'water',
    name: '引水',
    Icon: Droplets,
    hint: '按住拖动，让海水重新流过',
  },
] as const;
const WEATHERS = [
  { id: 'clear', label: '晴日', Icon: Sun },
  { id: 'rain', label: '听雨', Icon: CloudRain },
  { id: 'mist', label: '薄雾', Icon: CloudFog },
] as const;
export default function Home() {
  const c = useWorld(),
    s = c.snapshot;
  const [guide, setGuide] = useState(false),
    [archive, setArchive] = useState(false),
    [reset, setReset] = useState(false),
    [allLogs, setAllLogs] = useState(false),
    [discoveries, setDiscoveries] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(
    () => c.setModal(guide || archive || reset || allLogs || discoveries),
    [guide, archive, reset, allLogs, discoveries],
  );
  useEffect(() => registerWorldTools(c), []);
  const h = s?.hour ?? 8.5,
    TimeIcon =
      h < 5 || h >= 20 ? Moon : h < 8 ? Sunrise : h >= 17 ? Sunset : Sun;
  return (
    <main className="app-shell">
      <header className="masthead">
        <a className="brand" href={assetPath('/')} aria-label="潮生首页">
          <span className="brand-mark">
            <Waves />
          </span>
          <h1>
            潮生<span>A LITTLE LIVING WORLD</span>
          </h1>
        </a>
        <div className="header-note">
          <span className="live-dot" />
          一片海，也是一点留白
        </div>
        <div className="header-actions">
          <Button
            variant="ghost"
            className="utility"
            onClick={c.toggleSound}
            aria-pressed={c.sound}
            aria-label={c.sound ? '关闭海声' : '打开海声'}
          >
            {c.sound ? <Volume2 /> : <VolumeX />}
            <span>{c.sound ? '海声已开' : '听海'}</span>
          </Button>
          <Button
            variant="ghost"
            className="utility"
            onClick={() => setGuide(true)}
            aria-label="岛民指南"
          >
            <BookOpen />
            <span>岛民指南</span>
          </Button>
          <Button
            variant="outline"
            className="utility save-button"
            onClick={() => setArchive(true)}
            aria-label="收好海图"
          >
            <Download />
            <span>收好海图</span>
          </Button>
        </div>
      </header>
      <div className="workspace">
        <section className="world-stage" aria-label="交互群岛">
          <div className="map-heading">
            <p>A LIVING ARCHIPELAGO</p>
            <h2>
              {h >= 18 || h < 6
                ? '今夜，给星星留一盏灯。'
                : '万物有自己的节奏。'}
            </h2>
          </div>
          <div className="day-badge">
            <TimeIcon size={17} />
            <span>第 {s?.day ?? 1} 天</span>
            <i />
            <span>{formatTime(h)}</span>
          </div>
          <canvas
            ref={c.canvas}
            style={{ cursor: c.tool === 'look' ? 'grab' : 'crosshair' }}
            tabIndex={0}
            aria-label="潮生群岛画布。数字一到七选工具，方向键移动光标，回车使用工具，空格暂停。可拖动和双指缩放。"
            onPointerDown={c.pointerDown}
            onPointerMove={c.pointerMove}
            onPointerUp={c.pointerUp}
            onPointerCancel={c.pointerCancel}
            onPointerLeave={() => {
              c.view.current.pointer = null;
            }}
            onContextMenu={(e) => e.preventDefault()}
          />
          {!c.ready && <div className="canvas-loading">海风将至……</div>}
          <nav className="tool-dock" aria-label="创造工具">
            {TOOLS.map(({ id, name, Icon }, i) => (
              <button
                key={id}
                className={'tool-button ' + (c.tool === id ? 'selected' : '')}
                aria-pressed={c.tool === id}
                onClick={() => c.choose(id)}
                title={name + ' · ' + (i + 1)}
              >
                <Icon size={21} />
                <span>{name}</span>
              </button>
            ))}
          </nav>
          {['land', 'water'].includes(c.tool) && (
            <div className="brush-panel">
              <div>
                <span>笔触大小</span>
                <span>
                  {c.radius < 40
                    ? '轻一点'
                    : c.radius > 70
                      ? '铺开来'
                      : '刚刚好'}
                </span>
              </div>
              <Slider
                aria-label="笔触大小"
                min={20}
                max={95}
                step={5}
                value={[c.radius]}
                onValueChange={(v) => c.setBrush(Array.isArray(v) ? v[0] : v)}
              />
            </div>
          )}
          {c.is3D && (
            <div className="camera-controls">
              <Button
                variant="ghost"
                size="icon"
                onClick={c.turnCamera}
                aria-label="转动视角"
                title="转动视角"
              >
                <RotateCw />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={c.tiltCamera}
                aria-label="改变俯仰"
                title="改变俯仰"
              >
                <ScanEye />
              </Button>
            </div>
          )}
          <div className="map-compass">
            <Compass size={39} />
            <span>N</span>
          </div>
          <div className="zoom-control">
            <Button
              variant="ghost"
              size="icon"
              aria-label="缩小"
              onClick={() => c.changeZoom(c.zoom - 0.2)}
            >
              <Minus />
            </Button>
            <button onClick={c.resetView} aria-label="复位视角">
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
          </div>
          <div className="map-history">
            <Button
              variant="ghost"
              size="icon"
              disabled={!c.canUndo}
              onClick={c.undo}
              aria-label="撤回上一步"
              title="撤回 · Ctrl Z"
            >
              <Undo2 />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={!c.canRedo}
              onClick={c.redo}
              aria-label="重做"
              title="重做 · Ctrl Shift Z"
            >
              <Redo2 />
            </Button>
          </div>
          <div className="map-bottom">
            <span>
              <span className="live-dot" />{' '}
              {c.paused ? '时间停在这里' : '世界正在呼吸'}
            </span>
            <p>{TOOLS.find((t) => t.id === c.tool)?.hint}</p>
            <span className="map-scale">0 ━━━ 100 步</span>
          </div>
        </section>
        <aside className="journal" aria-label="群岛手记">
          <div className="journal-top">
            <div>
              <p className="eyebrow">
                FIELD NOTES / {String(s?.day ?? 1).padStart(3, '0')}
              </p>
              <h2>
                群岛手记<span>✳</span>
              </h2>
            </div>
            <span className="small-label">此刻，在这里</span>
          </div>
          <div className="journal-image">
            <img
              src={assetPath('/archipelago.webp')}
              alt="蓝色暮光中的群岛，灯塔和小屋亮起暖灯"
              width={1536}
              height={1024}
            />
            <span>风从海上来</span>
          </div>
          <div className="world-stats">
            <div>
              <strong>{String(s?.islands ?? '—').padStart(2, '0')}</strong>
              <span>座岛屿</span>
            </div>
            <div>
              <strong>{s?.trees ?? '—'}</strong>
              <span>棵树木</span>
            </div>
            <div>
              <strong>{String(s?.homes ?? '—').padStart(2, '0')}</strong>
              <span>户人家</span>
            </div>
          </div>
          <div className="section-label">
            <span>海上的天气</span>
            <span>
              {s?.tide ?? '潮水往复'} · {s?.boats ?? 0} 叶舟
            </span>
          </div>
          <RadioGroup
            aria-label="海上的天气"
            value={s?.weather ?? 'clear'}
            onValueChange={(v) => c.changeWeather(v as Weather)}
            className="weather-control"
          >
            {WEATHERS.map(({ id, label, Icon }) => (
              <label
                key={id}
                className={
                  (s?.weather ?? 'clear') === id
                    ? 'weather-option active'
                    : 'weather-option'
                }
              >
                <RadioGroupItem
                  value={id}
                  className="weather-radio"
                  aria-label={label}
                />
                <Icon size={17} />
                <span>{label}</span>
              </label>
            ))}
          </RadioGroup>
          <div className="dayline">
            <div>
              <Sunrise size={14} />
              <span>拨动天色</span>
              <Moon size={14} />
            </div>
            <Slider
              aria-label="一天中的时间"
              min={0}
              max={23.99}
              step={0.1}
              value={[h]}
              onValueChange={(v) => c.seekTime(Array.isArray(v) ? v[0] : v)}
              onValueCommitted={c.save}
            />
          </div>
          {c.selection && (
            <section className="observed">
              <div>
                <h3>{c.selection.title}</h3>
                <button
                  aria-label="收起观察"
                  onClick={() => c.setSelection(null)}
                >
                  <X size={15} />
                </button>
              </div>
              <p>{c.selection.detail}</p>
            </section>
          )}
          <div className="section-label log-heading">
            <span>正在发生</span>
            <button onClick={() => setAllLogs(true)}>
              翻阅手记 <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="recent-logs">
            {(s?.logs ?? []).slice(0, 3).map((entry) => (
              <div
                key={entry.id}
                className={
                  'log-entry ' +
                  (entry.kind === 'discovery' ? 'discovery-log' : '')
                }
              >
                <time>
                  第 {entry.day} 天 · {formatTime(entry.hour)}
                </time>
                <p>{entry.text}</p>
              </div>
            ))}
          </div>
          <div className="quiet-note" role="status" aria-live="polite">
            {c.message}
          </div>
          <div className="journal-footer">
            <button onClick={() => setDiscoveries(true)}>
              <Sparkles size={14} />
              {s?.discoveries.length
                ? '拾得 ' + s.discoveries.length + ' 个小发现'
                : '海里藏着一些小发现'}
              <ArrowUpRight size={14} />
            </button>
          </div>
        </aside>
      </div>
      <footer className="app-footer">
        <div className="save-status">
          <span className="footer-dot" />
          {c.saved}
        </div>
        <div className="time-controls">
          <Button
            variant="ghost"
            size="icon"
            onClick={c.togglePause}
            aria-label={c.paused ? '继续时间' : '暂停时间'}
          >
            {c.paused ? <Play /> : <Pause />}
          </Button>
          <RadioGroup
            aria-label="时间流速"
            value={String(c.speed)}
            onValueChange={(v) => c.changeSpeed(Number(v))}
            className="speed-control"
          >
            {[1, 3, 8].map((n) => (
              <label
                key={n}
                className={
                  c.speed === n ? 'speed-option active' : 'speed-option'
                }
              >
                <RadioGroupItem
                  value={String(n)}
                  className="weather-radio"
                  aria-label={n + '倍速'}
                />
                {n}×
              </label>
            ))}
          </RadioGroup>
        </div>
        <button className="new-world" onClick={() => setReset(true)}>
          <Shuffle size={14} />
          换一片海
        </button>
      </footer>
      <Dialog open={guide} onOpenChange={setGuide}>
        <DialogContent className="world-dialog">
          <DialogTitle className="dialog-title">给自己一片海。</DialogTitle>
          <DialogDescription className="dialog-intro">
            这里没有分数，也没有需要赶上的进度。你可以创造，也可以只是陪它待一会儿。
          </DialogDescription>
          <div className="guide-grid">
            {TOOLS.slice(1).map(({ id, name, Icon, hint }) => (
              <div key={id}>
                <Icon size={22} />
                <div>
                  <h3>{name}</h3>
                  <p>{hint.replace(' · 拖动可种一片林', '')}。</p>
                </div>
              </div>
            ))}
          </div>
          <div className="guide-note">
            <p>
              一个昼夜约 6 分 40
              秒。树在雨中长得更快。岛民会去海岸、树荫或邻居家，雨天沿路回屋；小船在码头间往返，靠岸后收帆。拨动天色，可以随时看看夜晚。
            </p>
            <p>
              拖动海图、滚轮或双指缩放。选择工具后按住 Shift 可以临时拖图。数字
              1–7 换工具，画布聚焦时用方向键移动光标、回车落笔、空格暂停。Ctrl /
              ⌘ Z 撤回。
            </p>
          </div>
          <div className="label-switch">
            <label htmlFor="map-labels">显示岛屿名字</label>
            <Switch
              id="map-labels"
              checked={c.labels}
              onCheckedChange={c.setMapLabels}
            />
          </div>
          <Button className="dialog-primary" onClick={() => setGuide(false)}>
            去海边待一会儿 <ArrowUpRight size={16} />
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={archive} onOpenChange={setArchive}>
        <DialogContent className="world-dialog archive-dialog">
          <DialogTitle className="dialog-title">收好这一片海</DialogTitle>
          <DialogDescription className="dialog-intro">
            世界会自动留在这台设备的浏览器中。导出海图，可以备份或带到另一台设备继续。
          </DialogDescription>
          <div className="archive-options">
            <button onClick={c.exportWorld}>
              <Download />
              <span>
                <strong>带走海图</strong>
                <small>完整世界存档 · JSON</small>
              </span>
              <ArrowUpRight />
            </button>
            <button onClick={() => importInput.current?.click()}>
              <Upload />
              <span>
                <strong>带回一片海</strong>
                <small>打开以前导出的海图</small>
              </span>
              <ArrowUpRight />
            </button>
            <button onClick={c.postcard}>
              <Camera />
              <span>
                <strong>寄给自己一张明信片</strong>
                <small>留下此刻的海面 · PNG</small>
              </span>
              <ArrowUpRight />
            </button>
          </div>
          <input
            ref={importInput}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="选择潮生海图文件"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                void c.importWorld(f);
                setArchive(false);
              }
              e.target.value = '';
            }}
          />
          <p className="archive-footnote">
            海图编号 {s?.seed} · 第 {s?.day} 天<br />
            关闭网页时，群岛也会休息。
          </p>
        </DialogContent>
      </Dialog>
      <Dialog open={allLogs} onOpenChange={setAllLogs}>
        <DialogContent className="world-dialog">
          <DialogTitle className="dialog-title">潮水留下的手记</DialogTitle>
          <DialogDescription className="dialog-intro">
            记住最近八十件小事。
          </DialogDescription>
          <div className="full-logs">
            {(s?.logs ?? []).map((entry) => (
              <div
                key={entry.id}
                className={
                  'log-entry ' +
                  (entry.kind === 'discovery' ? 'discovery-log' : '')
                }
              >
                <time>
                  第 {entry.day} 天 · {formatTime(entry.hour)}
                </time>
                <p>{entry.text}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={discoveries} onOpenChange={setDiscoveries}>
        <DialogContent className="world-dialog">
          <DialogTitle className="dialog-title">偶然拾得</DialogTitle>
          <DialogDescription className="dialog-intro">
            陪一个世界待久了，总会看见一些小小的事。
          </DialogDescription>
          {s?.discoveries.length ? (
            <div className="discovery-grid">
              {s.discoveries.map((id) => (
                <div key={id}>
                  <span className="discovery-seal">
                    <Sparkles />
                  </span>
                  <h3>{DISCOVERIES[id]?.title}</h3>
                  <p>{DISCOVERIES[id]?.description}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-discoveries">
              <Waves size={36} />
              <p>
                先种一棵树，或造一座小岛。
                <br />
                有些发现，要等到雨来或天黑。
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={reset} onOpenChange={setReset}>
        <AlertDialogContent className="reset-dialog">
          <AlertDialogTitle>去看看另一片海？</AlertDialogTitle>
          <AlertDialogDescription>
            将生成一片新的群岛，并替换这台设备上的自动存档。你也可以先收好现在的海图；新世界仍可撤回。
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>再待一会儿</AlertDialogCancel>
            <Button variant="outline" onClick={c.exportWorld}>
              先带走海图
            </Button>
            <AlertDialogAction
              onClick={() => {
                c.newWorld();
                setReset(false);
              }}
            >
              出发
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
