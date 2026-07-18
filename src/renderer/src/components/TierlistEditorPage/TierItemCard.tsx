import { forwardRef, memo, type HTMLAttributes, type MouseEvent as ReactMouseEvent } from 'react';
import { useTranslation } from 'react-i18next';

import Img from '../Img';
import DefaultSongCover from '../../assets/images/webp/song_cover_default.webp';

const getCaption = (song: SongData, labelMode: TierlistLabelMode, unknownArtist: string) => {
  if (labelMode === 'artistAndTrack') {
    const artistNames =
      song.artists && song.artists.length > 0
        ? song.artists.map((a) => a.name).join(', ')
        : unknownArtist;
    return `${artistNames} - ${song.title}`;
  }
  return song.title;
};

// Length-based caption scaling, ported verbatim from the reference site's
// applyLabelStyles(): all-caps text is scored ×1.3 (it's visually wider), and a
// single very long word forces character wrapping so it never overflows.
const getCaptionClass = (text: string) => {
  const isAllCaps = text === text.toUpperCase() && text !== text.toLowerCase();
  const score = isAllCaps ? text.length * 1.3 : text.length;

  let cls: string;
  if (score > 54) cls = 'text-[8.5px] leading-[1] px-[1.5px] py-[1px]';
  else if (score > 32) cls = 'text-[10px] leading-[1.05] p-[2px]';
  else if (score > 16) cls = 'text-[11px] leading-[1.1] px-[3.5px] py-[2px]';
  else cls = 'text-[12px] leading-[1.2] px-[5px] pb-1.5 pt-1';

  const words = text.split(/\s+/);
  const maxWordLen = words.reduce((m, w) => Math.max(m, w.length), 0);
  if (maxWordLen > 12) cls += ' [overflow-wrap:anywhere] [hyphens:auto]';
  return cls;
};

interface TierItemCardProps extends HTMLAttributes<HTMLDivElement> {
  song?: SongData;
  labelMode: TierlistLabelMode;
  showPlayButton?: boolean;
  onPlay?: (_songId: string) => void;
  onCardContextMenu?: (_e: ReactMouseEvent<HTMLDivElement>, _songId: string) => void;
  /** Cached 200px thumbnail; falls back to the tiny optimized cover until ready. */
  thumbSrc?: string;
  /** 'playing'/'paused' when this card is the current track, else 'none'. */
  playState?: 'none' | 'playing' | 'paused';
}

// Plain presentational card (SortableJS owns the drag behaviour). 96px wide with
// square art and a centered caption bar, themed with Nora's palette.
const TierItemCard = forwardRef<HTMLDivElement, TierItemCardProps>(
  (
    {
      song,
      labelMode,
      showPlayButton = true,
      onPlay,
      onCardContextMenu,
      thumbSrc,
      playState = 'none',
      className = '',
      ...rest
    },
    ref
  ) => {
    const { t } = useTranslation();

    if (!song) return <div ref={ref} {...rest} className={className} />;
    const isCurrent = playState !== 'none';

    const caption = getCaption(song, labelMode, t('tierlistsPage.unknownArtist'));
    // Use the cheap medium thumbnail (200px). Until it's generated, show the tiny
    // optimized cover — NEVER the full-res original, which is what causes grid lag.
    const artwork = thumbSrc || song.artworkPaths?.optimizedArtworkPath || DefaultSongCover;

    return (
      <div
        ref={ref}
        {...rest}
        onContextMenu={(e) => {
          e.preventDefault();
          onCardContextMenu?.(e, song.songId);
        }}
        title={caption}
        className={`tier-item group/item relative flex w-24 shrink-0 cursor-grab flex-col overflow-hidden rounded-lg border bg-background-color-1 shadow-[0_2px_8px_rgba(0,0,0,0.28)] transition-shadow [contain-intrinsic-size:96px_138px] [content-visibility:auto] hover:shadow-[0_4px_14px_rgba(0,0,0,0.4)] dark:bg-dark-background-color-1 ${
          isCurrent
            ? 'border-font-color-highlight ring-1 ring-font-color-highlight dark:border-dark-font-color-highlight dark:ring-dark-font-color-highlight'
            : 'border-black/10 dark:border-white/10'
        } ${className}`}
      >
        <Img
          src={artwork}
          fallbackSrc={DefaultSongCover}
          alt=""
          loading="lazy"
          enableImgFadeIns={false}
          className="block aspect-square w-full object-cover [image-rendering:high-quality]"
        />
        {(showPlayButton || isCurrent) && (
          <button
            type="button"
            // .tier-play-btn is excluded from SortableJS dragging via `filter`.
            className={`tier-play-btn absolute right-1 top-1 flex items-center justify-center leading-none drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)] transition-[opacity,color,transform] hover:scale-110 hover:text-font-color-highlight ${
              isCurrent
                ? 'visible text-font-color-highlight opacity-100 dark:text-dark-font-color-highlight'
                : 'invisible text-font-color-white opacity-0 group-hover/item:visible group-hover/item:opacity-100'
            }`}
            title={t('tierlistsPage.playTrack')}
            onClick={(e) => {
              e.stopPropagation();
              onPlay?.(song.songId);
            }}
          >
            <span className="material-icons-round text-2xl leading-none">
              {playState === 'playing' ? 'pause_circle' : 'play_circle'}
            </span>
          </button>
        )}
        <span
          className={`caption flex h-[42px] items-center justify-center overflow-hidden border-t border-black/10 bg-background-color-2 text-center text-font-color-black dark:border-white/10 dark:bg-dark-background-color-2 dark:text-font-color-white ${getCaptionClass(caption)}`}
        >
          {caption}
        </span>
      </div>
    );
  }
);

TierItemCard.displayName = 'TierItemCard';

// Memoized so that dragging (which re-renders the parent list on every move)
// does not re-render the other ~hundreds of cards — that mass re-render is what
// causes the flicker / image flash during a drag.
export default memo(TierItemCard);
