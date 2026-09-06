'use client';
import { useEffect, useRef, useState } from 'react';
import type { useTravel } from './use-travel';
import { PANORAMAS, getPlace } from './travel';
import {
  SPOTS,
  getSpot,
  spotsFor,
  JOURNEYS,
  getJourney,
} from './travel-play-data';
import {
  angularDistance,
  inDiscoveryReticle,
  shuffledRoundIds,
  validCoordinates,
  type Coordinates,
} from './travel-play-math';
import {
  emptyExpedition,
  parseExpedition,
  recordDiscovery,
  saveTravelNote,
  addGuess,
  type ExpeditionMemory,
  type TravelNote,
} from './travel-play-state';
type Mode = 'free' | 'hunt' | 'quiz';
const KEY = 'chaosheng.play.v1';
export function useExpedition(travel: ReturnType<typeof useTravel>) {
  const c = useRef(travel);
  c.current = travel;
  const memoryRef = useRef<ExpeditionMemory>(emptyExpedition());
  const [memory, setMemory] = useState<ExpeditionMemory>(emptyExpedition());
  const [mode, setMode] = useState<Mode>('free'),
    modeRef = useRef<Mode>('free');
  const [open, setOpen] = useState(false),
    [passport, setPassport] = useState(false),
    [noteOpen, setNoteOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null),
    targetRef = useRef<string | null>(null);
  const [hint, setHint] = useState(0),
    [feedback, setFeedback] = useState(''),
    [celebration, setCelebration] = useState<string | null>(null);
  const [replaying, setReplaying] = useState(false);
  const assistedRef = useRef(false),
    [noteDraft, setNoteDraft] = useState(''),
    [editingNote, setEditingNote] = useState<TravelNote | null>(null);
  const [guess, setGuess] = useState<Coordinates | null>(null),
    guessRef = useRef<Coordinates | null>(null);
  const [guessMap, setGuessMap] = useState(false),
    [quizRevealed, setQuizRevealed] = useState(false),
    revealedRef = useRef(false);
  const [roundIndex, setRoundIndex] = useState(0),
    roundRef = useRef(0);
  const operation = useRef(0),
    noteContext = useRef<{
      placeId: string;
      yaw: number;
      pitch: number;
      fov: number;
    } | null>(null);
  const busyRef = useRef(false),
    [busy, setBusy] = useState(false);
  function write(next: ExpeditionMemory) {
    memoryRef.current = next;
    setMemory(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      setFeedback('浏览器暂时无法保存进度，本次探索仍可继续。');
    }
  }
  function changeMode(value: Mode) {
    modeRef.current = value;
    setMode(value);
  }
  function target(id: string | null) {
    setReplaying(false);
    targetRef.current = id;
    setTargetId(id);
    assistedRef.current = false;
    setHint(0);
    setFeedback('');
    setCelebration(null);
  }
  useEffect(() => {
    try {
      const saved = parseExpedition(localStorage.getItem(KEY));
      memoryRef.current = saved;
      setMemory(saved);
    } catch {}
  }, []);
  useEffect(() => {
    if (modeRef.current === 'quiz') {
      const expected = memoryRef.current.quiz?.ids[roundRef.current];
      if (expected && travel.active.id !== expected && !travel.loading)
        exitPlay();
      return;
    }
    if (modeRef.current !== 'hunt') return;
    const current = getSpot(targetRef.current ?? '');
    if (current?.placeId === travel.active.id) return;
    const choices = spotsFor(travel.active.id);
    if (choices.length)
      target(
        (
          choices.find(
            (s) => !memoryRef.current.discoveries.some((d) => d.id === s.id),
          ) ?? choices[0]
        ).id,
      );
    else changeMode('free');
  }, [travel.active.id]);
  function exitPlay() {
    operation.current++;
    busyRef.current = false;
    setBusy(false);
    changeMode('free');
    setGuessMap(false);
    setQuizRevealed(false);
    revealedRef.current = false;
    setFeedback('');
    setCelebration(null);
  }
  async function arrive(id: string) {
    const place = getPlace(id);
    if (!place) throw new Error('Unknown destination.');
    await c.current.travelTo(place);
    if (place.mode === 'street') {
      for (let i = 0; i < 160 && c.current.getState().loading; i++)
        await new Promise((resolve) => setTimeout(resolve, 75));
    }
    const state = c.current.getState();
    if (state.id !== id || state.loading || state.error)
      throw new Error('这处风景没有载入，重试后再继续。');
  }
  async function startHunt(id?: string) {
    const spot = id
      ? getSpot(id)
      : (spotsFor(c.current.active.id).find(
          (s) => !memoryRef.current.discoveries.some((d) => d.id === s.id),
        ) ?? spotsFor(c.current.active.id)[0]);
    if (!spot)
      throw new Error(
        '这处街景使用平台自己的漫游操作，请选择一处站内全景来寻景。',
      );
    const token = ++operation.current;
    busyRef.current = false;
    setBusy(false);
    setOpen(false);
    setPassport(false);
    setCelebration(null);
    if (c.current.auto) c.current.toggleAuto();
    if (c.current.immersive) void c.current.toggleImmersive();
    target(spot.id);
    changeMode('hunt');
    if (c.current.active.id !== spot.placeId) {
      try {
        await arrive(spot.placeId);
      } catch (error) {
        if (token === operation.current) setFeedback((error as Error).message);
      }
    }
    return getState();
  }
  async function startJourney(id: string, restart = false) {
    const journey = getJourney(id);
    if (!journey) throw new Error('Unknown journey.');
    const old = memoryRef.current.journey;
    const index = !restart && old?.id === id ? old.index : 0;
    write({ ...memoryRef.current, journey: { id, index } });
    await startHunt(journey.stops[index].spotId);
    return getState();
  }
  async function continueJourney() {
    const progress = memoryRef.current.journey,
      journey = progress ? getJourney(progress.id) : undefined;
    if (!journey || !progress) throw new Error('No active journey.');
    const stop = journey.stops[progress.index];
    if (!memoryRef.current.discoveries.some((d) => d.id === stop.spotId))
      throw new Error('先找到这一站的景物，或使用镜头引导。');
    if (progress.index === journey.stops.length - 1) {
      if (
        !journey.stops.every((s) =>
          memoryRef.current.discoveries.some((d) => d.id === s.spotId),
        )
      )
        throw new Error('还有没有完成的站点。');
      write({
        ...memoryRef.current,
        completedJourneys: [
          ...new Set([...memoryRef.current.completedJourneys, journey.id]),
        ],
        journey: null,
      });
      setCelebration('journey:' + journey.id);
      return getState();
    }
    const index = progress.index + 1;
    write({ ...memoryRef.current, journey: { id: journey.id, index } });
    await startHunt(journey.stops[index].spotId);
    return getState();
  }
  function confirmDiscovery() {
    const spot = getSpot(targetRef.current ?? ''),
      view = c.current.getState();
    if (
      modeRef.current !== 'hunt' ||
      !spot ||
      view.id !== spot.placeId ||
      view.loading ||
      view.error ||
      !view.view
    )
      throw new Error('先载入这一站，再寻找景物。');
    const distance = angularDistance(view.view, spot);
    if (!inDiscoveryReticle(spot, view.view, view.viewport)) {
      setHint((v) => Math.max(v, 1));
      setFeedback(
        distance < 25
          ? '已经很近了，再把目标移到画面中央。'
          : '这里还不是目标。跟着线索继续环顾，或打开方向提示。',
      );
      return { found: false, distance: Math.round(distance) };
    }
    const assisted = assistedRef.current;
    write(recordDiscovery(memoryRef.current, spot.id, assisted));
    setReplaying(false);
    setCelebration(spot.id);
    setFeedback(
      assisted
        ? '这一眼风景，已和你一起看见。'
        : '找到了！这处细节已经收入发现册。',
    );
    return { found: true, id: spot.id, assisted };
  }
  function revealHint(level: number) {
    const spot = getSpot(targetRef.current ?? '');
    if (!spot || modeRef.current !== 'hunt')
      throw new Error('No active discovery.');
    if (level !== 1 && level !== 2)
      throw new Error('Hint level must be 1 or 2.');
    setHint(level);
    setFeedback('');
    if (level === 2) {
      const state = c.current.getState();
      if (state.loading || state.id !== spot.placeId || state.error)
        throw new Error('Wait for the panorama to load.');
      assistedRef.current = true;
      c.current.lookAround({ yaw: spot.yaw, pitch: spot.pitch, fov: 60 });
    }
    return { level, assisted: assistedRef.current };
  }
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key !== 'Enter' ||
        event.target !== c.current.canvas.current ||
        modeRef.current !== 'hunt'
      )
        return;
      event.preventDefault();
      try {
        confirmDiscovery();
      } catch (error) {
        setFeedback((error as Error).message);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  function retryDiscovery() {
    const spot = getSpot(targetRef.current ?? '');
    if (!spot) return;
    target(spot.id);
    setReplaying(true);
    const place = getPlace(spot.placeId)!;
    c.current.lookAround({
      yaw: place.initialYaw ?? 0,
      pitch: place.initialPitch ?? 0,
      fov: 76,
    });
  }
  function nextDiscovery() {
    const current = getSpot(targetRef.current ?? '');
    if (!current) return;
    if (!memoryRef.current.discoveries.some((d) => d.id === current.id))
      throw new Error('先完成这一条发现。');
    const choices = spotsFor(current.placeId),
      index = choices.findIndex((s) => s.id === current.id);
    const next = choices
      .slice(index + 1)
      .concat(choices.slice(0, index + 1))
      .find((s) => !memoryRef.current.discoveries.some((d) => d.id === s.id));
    if (next) target(next.id);
    else {
      changeMode('free');
      setPassport(true);
    }
  }
  async function startQuiz(resume = false) {
    const token = ++operation.current;
    let quiz = memoryRef.current.quiz;
    if (!resume || !quiz || quiz.answers.length === 5) {
      quiz = { ids: shuffledRoundIds(PANORAMAS.map((p) => p.id)), answers: [] };
      write({ ...memoryRef.current, quiz });
    }
    const index = quiz.answers.length;
    roundRef.current = index;
    setRoundIndex(index);
    revealedRef.current = false;
    setQuizRevealed(false);
    guessRef.current = null;
    setGuess(null);
    setOpen(false);
    setPassport(false);
    setGuessMap(false);
    setFeedback('');
    setCelebration(null);
    changeMode('quiz');
    if (c.current.auto) c.current.toggleAuto();
    if (c.current.immersive) void c.current.toggleImmersive();
    busyRef.current = true;
    setBusy(true);
    try {
      await arrive(quiz.ids[index]);
    } catch (error) {
      if (token === operation.current) setFeedback((error as Error).message);
    } finally {
      if (token === operation.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
    return getState();
  }
  function selectGuess(coords: Coordinates) {
    if (
      !validCoordinates(coords) ||
      modeRef.current !== 'quiz' ||
      revealedRef.current
    )
      throw new Error('Choose a valid globe position during an open round.');
    guessRef.current = [...coords];
    setGuess([...coords]);
  }
  function submitGuess(coords?: Coordinates) {
    if (coords) selectGuess(coords);
    const quiz = memoryRef.current.quiz,
      point = guessRef.current,
      view = c.current.getState();
    if (modeRef.current !== 'quiz' || revealedRef.current || !quiz || !point)
      throw new Error('先在地球上放置一个猜测点。');
    if (
      busyRef.current ||
      view.loading ||
      view.error ||
      view.id !== quiz.ids[roundRef.current] ||
      quiz.answers.length !== roundRef.current
    )
      throw new Error('Wait for the current round.');
    const next = addGuess(memoryRef.current, point);
    write(next);
    revealedRef.current = true;
    setQuizRevealed(true);
    setGuessMap(true);
    return next.quiz!.answers.at(-1)!;
  }
  async function nextRound() {
    const quiz = memoryRef.current.quiz;
    if (!quiz || !revealedRef.current || busyRef.current)
      throw new Error('Finish the current round first.');
    if (quiz.answers.length === 5) {
      setGuessMap(false);
      setCelebration('quiz');
      return getState();
    }
    const token = ++operation.current;
    const index = quiz.answers.length;
    roundRef.current = index;
    setRoundIndex(index);
    revealedRef.current = false;
    setQuizRevealed(false);
    guessRef.current = null;
    setGuess(null);
    setGuessMap(false);
    setFeedback('');
    busyRef.current = true;
    setBusy(true);
    try {
      await arrive(quiz.ids[index]);
    } catch (error) {
      if (token === operation.current) setFeedback((error as Error).message);
    } finally {
      if (token === operation.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
    return getState();
  }
  function beginNote(note?: TravelNote) {
    const view = c.current.getState();
    noteContext.current = note
      ? {
          placeId: note.placeId,
          yaw: note.yaw,
          pitch: note.pitch,
          fov: note.fov,
        }
      : {
          placeId: view.id,
          yaw: view.view?.yaw ?? 0,
          pitch: view.view?.pitch ?? 0,
          fov: view.view?.fov ?? 76,
        };
    setEditingNote(note ?? null);
    setNoteDraft(note?.text ?? '');
    setNoteOpen(true);
  }
  function saveNote(text = noteDraft, asNew = false) {
    const view = c.current.getState();
    const previous = asNew ? null : editingNote;
    const captured = asNew ? null : noteContext.current;
    const note: TravelNote = {
      id: previous?.id ?? crypto.randomUUID(),
      placeId: captured?.placeId ?? previous?.placeId ?? view.id,
      text: text.trim(),
      at: new Date().toISOString(),
      yaw: captured?.yaw ?? previous?.yaw ?? view.view?.yaw ?? 0,
      pitch: captured?.pitch ?? previous?.pitch ?? view.view?.pitch ?? 0,
      fov: captured?.fov ?? previous?.fov ?? view.view?.fov ?? 76,
    };
    write(saveTravelNote(memoryRef.current, note));
    setNoteOpen(false);
    setEditingNote(null);
    setNoteDraft('');
    setFeedback('手记已保存在这台设备。');
    return note;
  }
  async function revisitNote(note: TravelNote) {
    exitPlay();
    setPassport(false);
    await arrive(note.placeId);
    if (getPlace(note.placeId)?.mode === 'panorama')
      c.current.lookAround({ yaw: note.yaw, pitch: note.pitch, fov: note.fov });
  }
  function exportJournal() {
    const state = memoryRef.current;
    const lines = [
      '# 远方 · 我的旅行手记',
      '',
      '导出时间：' + new Date().toLocaleString('zh-CN'),
      '记录仅代表线上旅行。',
      '',
      ...state.notes.flatMap((n) => [
        '## ' +
          getPlace(n.placeId)!.name +
          ' · ' +
          new Date(n.at).toLocaleDateString('zh-CN'),
        '',
        n.text,
        '',
        '影像来源：' + getPlace(n.placeId)!.source,
        '',
      ]),
      '## 发现册',
      '',
      ...state.discoveries.map(
        (d) =>
          '- ' +
          getPlace(getSpot(d.id)!.placeId)!.name +
          ' / ' +
          getSpot(d.id)!.title +
          '（' +
          (d.assisted ? '跟随镜头看见' : '自己找到') +
          '）',
      ),
    ];
    const blob = new Blob([lines.join('\n')], {
        type: 'text/markdown;charset=utf-8',
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = '远方-旅行手记.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function getState() {
    const state = memoryRef.current,
      spot = getSpot(targetRef.current ?? '');
    return {
      mode: modeRef.current,
      target:
        modeRef.current === 'hunt' && spot
          ? { id: spot.id, title: spot.title, hint: spot.hint }
          : null,
      discoveries: state.discoveries.length,
      selfFound: state.discoveries.filter((d) => !d.assisted).length,
      journey: state.journey,
      completedJourneys: state.completedJourneys,
      notes: state.notes.map((n) => ({
        id: n.id,
        placeId: n.placeId,
        text: n.text,
      })),
      quiz:
        modeRef.current === 'quiz'
          ? {
              round: roundRef.current + 1,
              revealed: revealedRef.current,
              guess: guessRef.current,
              answers: state.quiz?.answers ?? [],
              total:
                state.quiz?.answers.reduce((sum, a) => sum + a.score, 0) ?? 0,
            }
          : null,
      bestScore: state.bestScore,
    };
  }
  const targetSpot = getSpot(targetId ?? ''),
    currentJourney = memory.journey ? getJourney(memory.journey.id) : undefined;
  const gap =
    targetSpot && travel.active.id === targetSpot.placeId
      ? angularDistance(travel.pose, targetSpot)
      : 180;
  const actualView = c.current.getState();
  const onTarget =
    !!targetSpot &&
    actualView.id === targetSpot.placeId &&
    !!actualView.view &&
    inDiscoveryReticle(targetSpot, actualView.view, actualView.viewport);
  const targetRecord = replaying
    ? undefined
    : memory.discoveries.find((d) => d.id === targetId);
  const answer = quizRevealed ? memory.quiz?.answers[roundIndex] : undefined;
  return {
    memory,
    mode,
    open,
    setOpen,
    passport,
    setPassport,
    noteOpen,
    setNoteOpen,
    noteDraft,
    setNoteDraft,
    editingNote,
    target: targetSpot,
    hint,
    feedback,
    celebration,
    setCelebration,
    gap,
    targetRecord,
    onTarget,
    notePlaceId: noteContext.current?.placeId ?? travel.active.id,
    currentJourney,
    guess,
    guessMap,
    setGuessMap,
    quizRevealed,
    roundIndex,
    answer,
    busy,
    startHunt,
    startJourney,
    continueJourney,
    confirmDiscovery,
    revealHint,
    retryDiscovery,
    nextDiscovery,
    exitPlay,
    startQuiz,
    selectGuess,
    submitGuess,
    nextRound,
    beginNote,
    saveNote,
    revisitNote,
    exportJournal,
    getState,
    spots: SPOTS,
    journeys: JOURNEYS,
  };
}
