'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Compass,
  Flag,
  Globe2,
  MapPin,
  ScanLine,
  Sparkles,
  BookOpen,
  PenLine,
  Download,
  Route,
  Eye,
  LocateFixed,
  Trophy,
  X,
  Camera,
  ChevronRight,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import TravelGlobe from './travel-globe';
import type { useTravel } from '@/lib/use-travel';
import type { useExpedition } from '@/lib/use-expedition';
import { getPlace, PANORAMAS } from '@/lib/travel';
import { getSpot, spotsFor, getJourney } from '@/lib/travel-play-data';
import {
  projectSphericalSpot,
  formatDistance,
  formatCoordinates,
} from '@/lib/travel-play-math';
import { assetPath } from '@/lib/paths';
type Travel = ReturnType<typeof useTravel>;
type Play = ReturnType<typeof useExpedition>;
function run(action: () => unknown) {
  try {
    const result = action();
    if (result instanceof Promise) void result.catch(() => {});
  } catch {}
}
function DiscoveryPins({ travel: c, play: e }: { travel: Travel; play: Play }) {
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  const list = spotsFor(c.active.id).filter(
    (s) =>
      e.memory.discoveries.some((d) => d.id === s.id) ||
      (e.hint === 2 && e.target?.id === s.id),
  );
  useEffect(() => {
    let aspect = 1;
    const element = c.canvas.current?.parentElement;
    if (!element) return;
    const update = (pose: typeof c.pose) => {
      for (const spot of list) {
        const node = nodes.current.get(spot.id);
        if (!node) continue;
        const point = projectSphericalSpot(spot, pose, aspect);
        node.style.display = point ? 'flex' : 'none';
        if (point) {
          node.style.left = point.x * 100 + '%';
          node.style.top = point.y * 100 + '%';
        }
      }
    };
    const observer = new ResizeObserver(([entry]) => {
      aspect = entry.contentRect.width / Math.max(1, entry.contentRect.height);
      const pose = c.getState().view;
      if (pose) update(pose);
    });
    observer.observe(element);
    const unsubscribe = c.subscribePose(update);
    return () => {
      observer.disconnect();
      unsubscribe();
    };
  }, [c.active.id, list.map((s) => s.id).join('|')]);
  return (
    <div className="discovery-pins">
      {list.map((spot) => (
        <button
          key={spot.id}
          ref={(node) => {
            if (node) nodes.current.set(spot.id, node);
            else nodes.current.delete(spot.id);
          }}
          onClick={() => run(() => e.startHunt(spot.id))}
          title={spot.title}
          aria-label={'查看发现：' + spot.title}
        >
          <Check size={13} />
          <span>{spot.title}</span>
        </button>
      ))}
    </div>
  );
}
function DirectionHint({ travel, play }: { travel: Travel; play: Play }) {
  if (!play.target) return null;
  const yaw = ((play.target.yaw - travel.pose.yaw + 540) % 360) - 180,
    pitch = play.target.pitch - travel.pose.pitch;
  let text = play.onTarget
    ? '目标已在中央，可以确认。'
    : Math.abs(yaw) > 15
      ? yaw > 0
        ? '往右环顾'
        : '往左环顾'
      : pitch > 0
        ? '抬头看看'
        : '把目光放低一点';
  return (
    <p className="hunt-direction">
      <LocateFixed size={15} />
      {text}
      <span>
        {play.gap < 25 ? '很近了' : play.gap < 60 ? '靠近了' : '继续找找'}
      </span>
    </p>
  );
}
export default function TravelPlay({
  travel: c,
  play: e,
}: {
  travel: Travel;
  play: Play;
}) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(false), [e.target?.id, e.mode]);
  const [tab, setTab] = useState('journeys'),
    [latitude, setLatitude] = useState(''),
    [longitude, setLongitude] = useState('');
  const busy = !!c.loading || !!c.error || e.busy;
  const foundHere = spotsFor(c.active.id).filter((s) =>
    e.memory.discoveries.some((d) => d.id === s.id),
  ).length;
  const step =
    e.memory.journey && e.currentJourney
      ? e.currentJourney.stops[e.memory.journey.index]
      : undefined;
  const inJourney = !!step && step.spotId === e.target?.id;
  const quizTotal =
    e.memory.quiz?.answers.reduce((sum, a) => sum + a.score, 0) ?? 0;
  const completedTrip = e.celebration?.startsWith('journey:')
    ? getJourney(e.celebration.slice(8))
    : undefined;
  const openGames = () => {
    e.setOpen(true);
  };
  useEffect(() => {
    setLatitude(e.guess ? String(Math.round(e.guess[0] * 10) / 10) : '');
    setLongitude(e.guess ? String(Math.round(e.guess[1] * 10) / 10) : '');
  }, [e.guess?.[0], e.guess?.[1]]);
  return (
    <>
      {e.mode === 'free' && !c.immersive && (
        <div className="play-launch">
          <button
            className="play-primary"
            onClick={() =>
              c.active.mode === 'panorama'
                ? run(() => e.startHunt())
                : openGames()
            }
          >
            <ScanLine size={18} />
            <span>
              {c.active.mode === 'panorama' ? '在这里寻景' : '开启一段小旅程'}
              <small>
                {c.active.mode === 'panorama'
                  ? foundHere + ' / 3 处细节'
                  : '四段旅程，随时出发'}
              </small>
            </span>
            <ChevronRight size={17} />
          </button>
          <button
            className="play-small"
            onClick={() => {
              setTab('quiz');
              e.setOpen(true);
            }}
          >
            <Globe2 size={17} />
            猜猜这是哪里
          </button>
          <button
            className="play-small note-launch"
            onClick={() => e.beginNote()}
            aria-label="写旅行手记"
          >
            <PenLine size={17} />
          </button>
        </div>
      )}
      {e.mode === 'hunt' && e.target && !c.isStreet && (
        <>
          <DiscoveryPins travel={c} play={e} />
          <div
            className={
              'hunt-reticle ' + (e.onTarget && !busy ? 'in-target' : '')
            }
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
            <i />
            {e.onTarget && !busy && <span />}
          </div>
          <div className="play-mode-banner">
            <ScanLine size={17} />
            <span>
              {inJourney ? e.currentJourney!.title : '发现 ' + c.active.name}
              <small>
                {inJourney
                  ? '第 ' + (e.memory.journey!.index + 1) + ' / 3 站'
                  : '把线索中的景物放到画面中央'}
              </small>
            </span>
            <button onClick={e.exitPlay}>
              <X size={17} />
              自由漫游
            </button>
          </div>
          <section
            className={
              'hunt-card ' +
              (e.targetRecord ? 'is-found ' : '') +
              (collapsed ? 'is-collapsed' : '')
            }
            aria-label="寻景任务"
          >
            <div className="hunt-card-top">
              <span>
                {e.targetRecord ? (
                  <>
                    <Check size={14} />
                    {e.targetRecord.assisted ? '跟随镜头看见' : '自己找到'}
                  </>
                ) : (
                  <>
                    <Compass size={14} />
                    寻景线索
                  </>
                )}
              </span>
              <small>
                {c.active.name} · {foundHere}/3
              </small>
              <button
                className="hunt-fold"
                aria-label={collapsed ? '展开线索' : '收起线索，多看一点风景'}
                aria-expanded={!collapsed}
                onClick={() => setCollapsed(!collapsed)}
              >
                <ChevronDown size={17} />
              </button>
            </div>
            {inJourney && <p className="journey-intro">{step!.intro}</p>}
            <h2>{e.targetRecord ? e.target.title : '留意这一处…'}</h2>
            <p>{e.targetRecord ? e.target.description : e.target.hint}</p>
            {!e.targetRecord && (
              <>
                <div className="hunt-instruction">
                  <ScanLine size={15} />
                  拖动环顾，让景物落在中央取景框。
                </div>
                {e.hint > 0 && <DirectionHint travel={c} play={e} />}
                <button
                  className="expedition-action"
                  disabled={busy || c.fallback}
                  onClick={() => run(e.confirmDiscovery)}
                >
                  <ScanLine size={17} />
                  就是这里
                </button>
                <div className="hunt-help">
                  <button
                    disabled={busy || c.fallback}
                    onClick={() => run(() => e.revealHint(1))}
                  >
                    给我方向
                  </button>
                  <button
                    disabled={busy || c.fallback}
                    onClick={() => run(() => e.revealHint(2))}
                  >
                    <Eye size={14} />
                    带我看
                  </button>
                </div>
              </>
            )}
            {e.targetRecord && (
              <>
                <div className="discovery-stamp">
                  <Check size={17} />
                  <span>这一眼，收好了。</span>
                </div>
                <div className="hunt-success-actions">
                  <button
                    className="expedition-action"
                    onClick={() =>
                      run(inJourney ? e.continueJourney : e.nextDiscovery)
                    }
                  >
                    {inJourney
                      ? e.memory.journey!.index === 2
                        ? '完成这段旅程'
                        : '前往下一站'
                      : '下一个发现'}
                    <ArrowRight size={17} />
                  </button>
                  <button
                    className="expedition-secondary"
                    onClick={() => e.beginNote()}
                  >
                    <PenLine size={16} />
                    记下来
                  </button>
                </div>
                {e.targetRecord.assisted && (
                  <button
                    className="hunt-retry-self"
                    onClick={() => run(e.retryDiscovery)}
                  >
                    再自己找一次
                  </button>
                )}
              </>
            )}
            {e.feedback && (
              <p className="hunt-feedback" role="status">
                {e.feedback}
              </p>
            )}
            {c.fallback && (
              <p className="hunt-feedback">
                当前设备使用平面全景，仍可看风景和写手记。寻景需要支持立体全景的浏览器。
              </p>
            )}
          </section>
        </>
      )}
      {e.mode === 'quiz' && (
        <>
          <div className="play-mode-banner quiz-banner">
            <Globe2 size={18} />
            <span>
              世界猜想
              <small>第 {e.roundIndex + 1} / 5 轮 · 凭风景认识地球</small>
            </span>
            <button onClick={e.exitPlay}>
              <X size={17} />
              暂停游戏
            </button>
          </div>
          <div className="quiz-hud">
            <div className="quiz-score">
              <span>本次得分</span>
              <strong>
                {quizTotal.toLocaleString()}
                <small> / 25,000</small>
              </strong>
            </div>
            {e.quizRevealed ? (
              <>
                <h2>
                  {c.active.name} · {c.active.country}
                </h2>
                <p>
                  你的猜测相距 {e.answer && formatDistance(e.answer.distance)}
                </p>
                <button
                  className="expedition-action"
                  onClick={() => e.setGuessMap(true)}
                >
                  查看这一轮
                  <ArrowRight size={17} />
                </button>
              </>
            ) : (
              <>
                <h2>这一眼风景，在哪里？</h2>
                <p>环顾四周，再把猜测放到地球上。</p>
                <button
                  className="expedition-action"
                  disabled={busy}
                  onClick={() => e.setGuessMap(true)}
                >
                  <MapPin size={17} />
                  在地球上猜位置
                </button>
              </>
            )}
            {e.feedback && (
              <p className="hunt-feedback" role="status">
                {e.feedback}
              </p>
            )}
          </div>
          <Dialog open={e.guessMap} onOpenChange={e.setGuessMap}>
            <DialogContent className="travel-dialog guess-dialog">
              <DialogTitle>
                {e.quizRevealed ? '这轮的答案' : '把猜测放在地球上'}
              </DialogTitle>
              <DialogDescription>
                {e.quizRevealed
                  ? c.active.name + ' · ' + c.active.country
                  : '拖动地球，点击地表落点。确认前可以随时调整。'}
              </DialogDescription>
              <TravelGlobe
                key={e.roundIndex}
                active={c.active}
                pickMode={{
                  coords: e.guess,
                  answer: e.answer
                    ? getPlace(e.answer.placeId)!.coords
                    : undefined,
                  onPick: e.quizRevealed ? undefined : e.selectGuess,
                }}
              />
              {!e.quizRevealed ? (
                <>
                  <details className="guess-coordinates">
                    <summary>也可以输入经纬度</summary>
                    <div>
                      <label>
                        纬度
                        <input
                          type="number"
                          min="-90"
                          max="90"
                          step="0.1"
                          value={latitude}
                          onChange={(event) => setLatitude(event.target.value)}
                          placeholder="-90 到 90"
                        />
                      </label>
                      <label>
                        经度
                        <input
                          type="number"
                          min="-180"
                          max="180"
                          step="0.1"
                          value={longitude}
                          onChange={(event) => setLongitude(event.target.value)}
                          placeholder="-180 到 180"
                        />
                      </label>
                      <button
                        disabled={
                          latitude.trim() === '' ||
                          longitude.trim() === '' ||
                          !Number.isFinite(Number(latitude)) ||
                          !Number.isFinite(Number(longitude)) ||
                          Math.abs(Number(latitude)) > 90 ||
                          Math.abs(Number(longitude)) > 180
                        }
                        onClick={() =>
                          run(() =>
                            e.selectGuess([
                              Number(latitude),
                              Number(longitude),
                            ]),
                          )
                        }
                      >
                        放置
                      </button>
                    </div>
                  </details>
                  <div className="guess-submit">
                    <span>
                      {e.guess ? formatCoordinates(e.guess) : '先选择一个位置'}
                    </span>
                    <button
                      className="expedition-action"
                      disabled={!e.guess || busy}
                      onClick={() => run(() => e.submitGuess())}
                    >
                      确认猜测
                      <Flag size={16} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="guess-result">
                    <div>
                      <small>距离真实地点</small>
                      <strong>{formatDistance(e.answer!.distance)}</strong>
                    </div>
                    <div>
                      <small>本轮得分</small>
                      <strong>
                        +{e.answer!.score.toLocaleString()}
                        <em>/ 5,000</em>
                      </strong>
                    </div>
                  </div>
                  <button
                    className="expedition-action"
                    onClick={() => run(e.nextRound)}
                  >
                    {e.roundIndex === 4 ? '查看总成绩' : '下一眼风景'}
                    <ArrowRight size={17} />
                  </button>
                </>
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
      <Dialog open={e.open} onOpenChange={e.setOpen}>
        <DialogContent className="travel-dialog activity-dialog">
          <DialogTitle>给这段旅行，一点好奇心。</DialogTitle>
          <DialogDescription>
            不用赶时间，也不用答对每一道题。随时可以回到自由漫游。
          </DialogDescription>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="journeys">
                <Route size={15} />
                小旅程
              </TabsTrigger>
              <TabsTrigger value="quiz">
                <Globe2 size={15} />
                猜地点
              </TabsTrigger>
              <TabsTrigger value="discoveries">
                <BookOpen size={15} />
                发现册
              </TabsTrigger>
            </TabsList>
            <TabsContent value="journeys">
              <div className="journey-grid">
                {e.journeys.map((j) => {
                  const done = e.memory.completedJourneys.includes(j.id),
                    progress = j.stops.filter((s) =>
                      e.memory.discoveries.some((d) => d.id === s.spotId),
                    ).length;
                  return (
                    <article key={j.id} className="journey-card">
                      <img
                        src={assetPath(getPlace(j.cover)!.preview!)}
                        alt={getPlace(j.cover)!.place}
                      />
                      <div>
                        <div className="journey-card-meta">
                          <span>3 站 · {j.duration}</span>
                          {done && (
                            <span>
                              <Check size={13} />
                              已完成
                            </span>
                          )}
                        </div>
                        <h3>{j.title}</h3>
                        <p>{j.line}</p>
                        <div className="journey-stop-names">
                          {j.stops.map((s, i) => (
                            <span key={s.placeId}>
                              {i > 0 && <ChevronRight size={12} />}{' '}
                              {getPlace(s.placeId)!.name}
                            </span>
                          ))}
                        </div>
                        <Progress
                          value={(progress / 3) * 100}
                          aria-label={j.title + ' 已发现 ' + progress + ' 站'}
                        />
                        <button
                          className="expedition-action"
                          onClick={() => run(() => e.startJourney(j.id))}
                        >
                          {e.memory.journey?.id === j.id
                            ? '继续上次'
                            : done
                              ? '重走这段旅程'
                              : '出发'}
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </TabsContent>
            <TabsContent value="quiz">
              <div className="quiz-intro">
                <Globe2 size={48} />
                <div>
                  <span className="play-eyebrow">5 张实景 · 5 次猜测</span>
                  <h3>你眼里的世界，有多大？</h3>
                  <p>
                    只看真实拍摄的风景，把猜测放到地球上。每轮按距离计分，最高
                    5,000 分。没有倒计时。
                  </p>
                  <div className="quiz-records">
                    <span>
                      最好成绩
                      <strong>
                        {e.memory.bestScore.toLocaleString()}{' '}
                        <small>/ 25,000</small>
                      </strong>
                    </span>
                    <span>
                      完成游戏
                      <strong>
                        {e.memory.games}
                        <small>次</small>
                      </strong>
                    </span>
                  </div>
                  <div className="quiz-start-actions">
                    {e.memory.quiz && e.memory.quiz.answers.length < 5 && (
                      <button
                        className="expedition-action"
                        onClick={() => run(() => e.startQuiz(true))}
                      >
                        继续第 {e.memory.quiz.answers.length + 1} 轮
                        <ArrowRight size={16} />
                      </button>
                    )}
                    <button
                      className={
                        e.memory.quiz && e.memory.quiz.answers.length < 5
                          ? 'expedition-secondary'
                          : 'expedition-action'
                      }
                      onClick={() => run(() => e.startQuiz(false))}
                    >
                      新的一局
                      <Globe2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="discoveries">
              <div className="discovery-overview">
                <div>
                  <strong>
                    {e.memory.discoveries.filter((d) => !d.assisted).length}
                  </strong>
                  <span>自己找到</span>
                </div>
                <div>
                  <strong>
                    {e.memory.discoveries.filter((d) => d.assisted).length}
                  </strong>
                  <span>跟随镜头看见</span>
                </div>
                <div>
                  <strong>36</strong>
                  <span>等你留意的细节</span>
                </div>
              </div>
              <div className="discovery-place-list">
                {PANORAMAS.map((p) => {
                  const spots = spotsFor(p.id),
                    count = spots.filter((s) =>
                      e.memory.discoveries.some((d) => d.id === s.id),
                    ).length;
                  return (
                    <button
                      key={p.id}
                      onClick={() =>
                        run(() =>
                          e.startHunt(
                            spots.find(
                              (s) =>
                                !e.memory.discoveries.some(
                                  (d) => d.id === s.id,
                                ),
                            )?.id ?? spots[0].id,
                          ),
                        )
                      }
                    >
                      <img src={assetPath(p.preview!)} alt="" />
                      <span>
                        <strong>{p.name}</strong>
                        <small>
                          {spots
                            .map((s) =>
                              e.memory.discoveries.some((d) => d.id === s.id)
                                ? s.title
                                : '待发现',
                            )
                            .join(' · ')}
                        </small>
                      </span>
                      <em>{count}/3</em>
                      <ChevronRight size={16} />
                    </button>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
          <button
            className="passport-open"
            onClick={() => {
              e.setOpen(false);
              e.setPassport(true);
            }}
          >
            <BookOpen size={16} />
            我的旅程与手记
            <ArrowRight size={16} />
          </button>
        </DialogContent>
      </Dialog>
      <Sheet open={e.passport} onOpenChange={e.setPassport}>
        <SheetContent className="passport-sheet">
          <SheetHeader>
            <SheetTitle>我的远方</SheetTitle>
            <SheetDescription>
              发现、旅程和手记，只保存在这台设备。
            </SheetDescription>
          </SheetHeader>
          <div className="passport-body">
            <div className="passport-stats">
              <div>
                <strong>{e.memory.discoveries.length}</strong>处发现
              </div>
              <div>
                <strong>{e.memory.completedJourneys.length}</strong>段旅程
              </div>
              <div>
                <strong>{e.memory.notes.length}</strong>篇手记
              </div>
            </div>
            {e.memory.journey && e.currentJourney && (
              <button
                className="resume-journey"
                onClick={() => run(() => e.startJourney(e.currentJourney!.id))}
              >
                <Route size={19} />
                <span>
                  继续 {e.currentJourney.title}
                  <small>第 {e.memory.journey.index + 1} / 3 站</small>
                </span>
                <ArrowRight size={17} />
              </button>
            )}
            <h3>旅程纪念章</h3>
            <div className="passport-stamps">
              {e.journeys.map((j) => (
                <button
                  key={j.id}
                  className={
                    e.memory.completedJourneys.includes(j.id) ? 'earned' : ''
                  }
                  onClick={() => run(() => e.startJourney(j.id))}
                >
                  <Compass size={25} />
                  <strong>{j.title}</strong>
                  <small>
                    {e.memory.completedJourneys.includes(j.id)
                      ? '旅程完成'
                      : '等待启程'}
                  </small>
                </button>
              ))}
            </div>
            <div className="passport-section-title">
              <h3>旅行手记</h3>
              <button onClick={() => e.beginNote()}>
                <PenLine size={15} />
                写一篇
              </button>
            </div>
            {e.memory.notes.length ? (
              <div className="travel-notes">
                {e.memory.notes.map((note) => (
                  <article key={note.id}>
                    <div>
                      <span>{getPlace(note.placeId)!.name}</span>
                      <time>
                        {new Date(note.at).toLocaleDateString('zh-CN')}
                      </time>
                    </div>
                    <p>{note.text}</p>
                    <footer>
                      <button onClick={() => run(() => e.revisitNote(note))}>
                        <Eye size={14} />
                        回到这一眼
                      </button>
                      <button onClick={() => e.beginNote(note)}>
                        <PenLine size={14} />
                        编辑
                      </button>
                    </footer>
                  </article>
                ))}
              </div>
            ) : (
              <div className="notes-empty">
                <PenLine size={26} />
                <p>一束光、一阵想念，都可以留在这里。</p>
                <button onClick={() => e.beginNote()}>写下此刻</button>
              </div>
            )}
            <button
              className="export-notes"
              onClick={e.exportJournal}
              disabled={!e.memory.notes.length && !e.memory.discoveries.length}
            >
              <Download size={16} />
              导出手记与发现册
            </button>
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={e.noteOpen} onOpenChange={e.setNoteOpen}>
        <DialogContent className="travel-dialog note-dialog">
          <DialogTitle>
            {e.editingNote ? '编辑手记' : '把这一刻写下来'}
          </DialogTitle>
          <DialogDescription>
            {getPlace(e.editingNote?.placeId ?? e.notePlaceId)!.name} ·
            保存文字和此刻视角，之后可以回到这一眼。
          </DialogDescription>
          <textarea
            value={e.noteDraft}
            onChange={(event) => e.setNoteDraft(event.target.value)}
            maxLength={2000}
            placeholder="此刻你看见了什么，又想起了什么？"
            aria-label="旅行手记"
          />
          <div className="note-footer">
            <span>{e.noteDraft.length} / 2000 · 保存在此设备</span>
            <button
              className="expedition-action"
              disabled={!e.noteDraft.trim()}
              onClick={() => run(() => e.saveNote())}
            >
              <Check size={16} />
              保存手记
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!completedTrip || e.celebration === 'quiz'}
        onOpenChange={(value) => {
          if (!value) {
            e.setCelebration(null);
            e.exitPlay();
          }
        }}
      >
        <DialogContent className="travel-dialog completion-dialog">
          <DialogTitle>
            {completedTrip ? '一段旅程，收进心里。' : '这一局，走过了世界。'}
          </DialogTitle>
          <DialogDescription>
            {completedTrip
              ? completedTrip.title
              : '五眼风景，你留下了五个猜测。'}
          </DialogDescription>
          <div className="completion-emblem">
            {completedTrip ? <Compass size={46} /> : <Trophy size={46} />}
          </div>
          {completedTrip ? (
            <>
              <div className="completion-route">
                {completedTrip.stops.map((s) => (
                  <span key={s.placeId}>
                    <Check size={14} />
                    {getPlace(s.placeId)!.name}
                  </span>
                ))}
              </div>
              <p>纪念章已收入「我的远方」。你可以留张明信片，或记下此刻。</p>
              <div className="completion-actions">
                <button className="expedition-action" onClick={c.postcard}>
                  <Camera size={16} />
                  留张明信片
                </button>
                <button
                  className="expedition-secondary"
                  onClick={() => {
                    e.setCelebration(null);
                    e.beginNote();
                  }}
                >
                  <PenLine size={16} />
                  写手记
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="final-quiz-score">
                {quizTotal.toLocaleString()}
                <small> / 25,000</small>
              </div>
              <div className="quiz-round-list">
                {e.memory.quiz?.answers.map((a, i) => (
                  <div key={a.placeId}>
                    <span>
                      {i + 1}. {getPlace(a.placeId)!.name}
                    </span>
                    <small>{formatDistance(a.distance)}</small>
                    <strong>{a.score.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
              <div className="completion-actions">
                <button
                  className="expedition-action"
                  onClick={() => run(() => e.startQuiz(false))}
                >
                  <RotateCcw size={16} />
                  再看五眼风景
                </button>
                <button className="expedition-secondary" onClick={e.exitPlay}>
                  自由漫游
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      {e.mode === 'free' && e.feedback && (
        <div className="expedition-toast" role="status">
          {e.feedback}
        </div>
      )}
    </>
  );
}
