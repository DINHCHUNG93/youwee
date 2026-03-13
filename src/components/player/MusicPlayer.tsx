import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type PlayMode, usePlayer } from '@/contexts/PlayerContext';
import { cn } from '@/lib/utils';

function formatTime(secs: number): string {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function MusicPlayer() {
  const { t } = useTranslation('pages');
  const {
    currentEntry,
    isPlaying,
    duration,
    currentTime,
    volume,
    mode,
    queue,
    togglePlay,
    playNext,
    playPrev,
    seek,
    setVolume,
    setMode,
    close,
  } = usePlayer();

  const [thumbError, setThumbError] = useState(false);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      seek(parseFloat(e.target.value));
    },
    [seek],
  );

  const handleVolume = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(parseFloat(e.target.value));
    },
    [setVolume],
  );

  const cycleMode = useCallback(() => {
    const modes: PlayMode[] = ['sequence', 'repeat-one', 'shuffle'];
    const next = modes[(modes.indexOf(mode) + 1) % modes.length];
    setMode(next);
  }, [mode, setMode]);

  if (!currentEntry) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={cn(
        'flex-shrink-0 flex items-center gap-4 px-4 h-16',
        'border-t border-white/[0.06] dark:border-white/[0.04]',
        'bg-card/60 backdrop-blur-xl',
      )}
    >
      {/* Track info */}
      <div className="flex items-center gap-3 w-56 flex-shrink-0 min-w-0">
        {/* Thumbnail */}
        <div className="relative w-9 h-9 flex-shrink-0 rounded-md overflow-hidden bg-muted">
          {currentEntry.thumbnail && !thumbError ? (
            <img
              src={currentEntry.thumbnail.replace(/^http:\/\//, 'https://')}
              alt=""
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={() => setThumbError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary/10">
              <Volume2 className="w-4 h-4 text-primary/60" />
            </div>
          )}
          {/* subtle playing animation dot */}
          {isPlaying && (
            <span className="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          )}
        </div>

        <div className="min-w-0">
          <p className="text-xs font-medium truncate leading-tight" title={currentEntry.title}>
            {currentEntry.title}
          </p>
          <p className="text-[10px] text-muted-foreground truncate mt-0.5 uppercase tracking-wide">
            {currentEntry.format} ·{' '}
            {queue.length > 1
              ? t('player.trackCount', { count: queue.length })
              : t('player.oneTrack')}
          </p>
        </div>
      </div>

      {/* Center: controls + progress */}
      <div className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
        {/* Playback buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={playPrev}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            title={t('player.prev')}
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center transition-all',
              'bg-primary text-primary-foreground hover:opacity-90 shadow-sm',
            )}
            title={isPlaying ? t('player.pause') : t('player.play')}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current translate-x-px" />
            )}
          </button>

          <button
            type="button"
            onClick={playNext}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
            title={t('player.next')}
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 w-full max-w-sm">
          <span className="text-[10px] text-muted-foreground tabular-nums w-6 text-right flex-shrink-0">
            {formatTime(currentTime)}
          </span>
          <div className="relative flex-1 h-1 group">
            <div className="absolute inset-y-0 w-full bg-muted rounded-full" />
            <div
              className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
            <input
              type="range"
              min={0}
              max={duration || 1}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums w-6 flex-shrink-0">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Right: mode + volume + close */}
      <div className="flex items-center gap-2 w-40 flex-shrink-0 justify-end">
        {/* Play mode */}
        <button
          type="button"
          onClick={cycleMode}
          className={cn(
            'p-1.5 rounded transition-colors',
            mode === 'sequence' ? 'text-muted-foreground hover:text-foreground' : 'text-primary',
          )}
          title={
            mode === 'sequence'
              ? t('player.modeSequence')
              : mode === 'repeat-one'
                ? t('player.modeRepeatOne')
                : t('player.modeShuffle')
          }
        >
          {mode === 'shuffle' ? (
            <Shuffle className="w-3.5 h-3.5" />
          ) : mode === 'repeat-one' ? (
            <Repeat1 className="w-3.5 h-3.5" />
          ) : (
            <Repeat className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Volume */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setVolume(volume > 0 ? 0 : 1)}
            className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            {volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>
          <div className="relative w-16 h-1 group">
            <div className="absolute inset-y-0 w-full bg-muted rounded-full" />
            <div
              className="absolute inset-y-0 left-0 bg-muted-foreground/50 rounded-full"
              style={{ width: `${volume * 100}%` }}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={volume}
              onChange={handleVolume}
              className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
            />
          </div>
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={close}
          className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors ml-1"
          title={t('player.close')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
