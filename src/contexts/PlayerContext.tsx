import { convertFileSrc } from '@tauri-apps/api/core';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useHistory } from '@/contexts/HistoryContext';
import { ensureAssetPathAccess } from '@/lib/asset-access';
import { isPlayableAudioEntry, reconcilePlayableAudioQueue } from '@/lib/player-queue';
import type { HistoryEntry } from '@/lib/types';

export type PlayMode = 'sequence' | 'repeat-one' | 'shuffle';

export function isAudioEntry(entry: HistoryEntry): boolean {
  return isPlayableAudioEntry(entry);
}

interface PlayerContextType {
  queue: HistoryEntry[];
  currentIndex: number;
  currentEntry: HistoryEntry | null;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  volume: number;
  mode: PlayMode;
  playFrom: (queue: HistoryEntry[], index: number) => void;
  togglePlay: () => void;
  playNext: () => void;
  playPrev: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  setMode: (mode: PlayMode) => void;
  close: () => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { entries } = useHistory();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [queue, setQueue] = useState<HistoryEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('youwee_player_volume');
    return saved ? parseFloat(saved) : 1;
  });
  const [mode, setModeState] = useState<PlayMode>(() => {
    return (localStorage.getItem('youwee_player_mode') as PlayMode) ?? 'sequence';
  });

  const getNextIndex = useCallback((current: number, total: number, m: PlayMode): number => {
    if (m === 'repeat-one') return current;
    if (m === 'shuffle') return Math.floor(Math.random() * total);
    return (current + 1) % total;
  }, []);

  // Use refs to keep the ended handler in sync without recreating the audio element.
  const modeRef = useRef(mode);
  const queueRef = useRef(queue);
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Init audio element once
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onEnded = () => {
      const q = queueRef.current;
      const m = modeRef.current;
      const ci = currentIndexRef.current;
      if (q.length === 0) return;
      const next = getNextIndex(ci, q.length, m);
      setCurrentIndex(next);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onError = () => {
      console.error('[Player] Audio error:', audio.error?.message, 'src:', audio.src);
      setIsPlaying(false);

      const failedEntryId = queueRef.current[currentIndexRef.current]?.id;
      const nextQueue = queueRef.current.filter((entry) => entry.id !== failedEntryId);
      if (nextQueue.length === 0) {
        audio.pause();
        audio.src = '';
        setQueue([]);
        setCurrentIndex(0);
        setCurrentTime(0);
        setDuration(0);
        return;
      }

      setQueue(nextQueue);
      setCurrentIndex(Math.min(currentIndexRef.current, nextQueue.length - 1));
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.src = '';
    };
  }, [getNextIndex]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Load and play whenever currentIndex or queue changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || queue.length === 0) return;
    const entry = queue[currentIndex];
    if (!entry) return;
    let cancelled = false;

    audio.pause();
    audio.src = '';
    audio.currentTime = 0;
    setCurrentTime(0);
    setDuration(0);

    const loadCurrentTrack = async () => {
      try {
        const cleanPath = await ensureAssetPathAccess(entry.filepath);
        if (cancelled) return;

        const src = convertFileSrc(cleanPath);
        audio.src = src;
        audio.currentTime = 0;
        audio.play().catch(() => setIsPlaying(false));
      } catch (error) {
        console.error('[Player] Failed to authorize asset path:', error);
        setIsPlaying(false);
      }
    };

    void loadCurrentTrack();

    return () => {
      cancelled = true;
    };
  }, [currentIndex, queue]);

  const playFrom = useCallback((newQueue: HistoryEntry[], index: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    setQueue(newQueue);
    setCurrentIndex(index);
    // Actual load + play is handled by the effect above
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || queue.length === 0) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [queue.length]);

  const playNext = useCallback(() => {
    if (queue.length === 0) return;
    const next = getNextIndex(currentIndex, queue.length, mode);
    setCurrentIndex(next);
  }, [currentIndex, queue.length, mode, getNextIndex]);

  const playPrev = useCallback(() => {
    if (queue.length === 0) return;
    const audio = audioRef.current;
    // If more than 3s in, restart current track; otherwise go to previous
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const prev = (currentIndex - 1 + queue.length) % queue.length;
    setCurrentIndex(prev);
  }, [currentIndex, queue.length]);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    localStorage.setItem('youwee_player_volume', String(clamped));
    if (audioRef.current) audioRef.current.volume = clamped;
  }, []);

  const setMode = useCallback((m: PlayMode) => {
    setModeState(m);
    localStorage.setItem('youwee_player_mode', m);
  }, []);

  const close = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
    }
    setQueue([]);
    setCurrentIndex(0);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  useEffect(() => {
    if (queue.length === 0) return;

    const reconciled = reconcilePlayableAudioQueue(queue, currentIndex, entries);
    const sameQueue =
      reconciled.queue.length === queue.length &&
      reconciled.currentIndex === currentIndex &&
      reconciled.queue.every((entry, index) => entry.id === queue[index]?.id);

    if (sameQueue) return;

    if (reconciled.queue.length === 0) {
      close();
      return;
    }

    setQueue(reconciled.queue);
    setCurrentIndex(reconciled.currentIndex);
  }, [entries, queue, currentIndex, close]);

  const currentEntry = queue[currentIndex] ?? null;

  return (
    <PlayerContext.Provider
      value={{
        queue,
        currentIndex,
        currentEntry,
        isPlaying,
        duration,
        currentTime,
        volume,
        mode,
        playFrom,
        togglePlay,
        playNext,
        playPrev,
        seek,
        setVolume,
        setMode,
        close,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
