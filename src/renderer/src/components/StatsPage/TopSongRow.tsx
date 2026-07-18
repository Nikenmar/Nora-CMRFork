import Img from '../Img';

type Props = {
  rank: number;
  entry: StatsSongEntry;
  count: number;
  countTitle?: string;
  details?: string;
  onTitleClick: (songId: string) => void;
};

const TopSongRow = (props: Props) => {
  const { rank, entry, count, countTitle, details, onTitleClick } = props;

  return (
    <li className="flex items-center gap-3 py-1">
      <span className="w-6 shrink-0 text-right font-medium opacity-60">{rank}</span>
      {entry.artworkPath && (
        <Img
          src={entry.artworkPath}
          alt=""
          loading="lazy"
          className="h-10 w-10 shrink-0 rounded-md object-cover"
        />
      )}
      <div className="flex min-w-0 grow flex-col">
        <button
          type="button"
          className="w-fit max-w-full truncate text-left hover:underline"
          onClick={() => onTitleClick(entry.songId)}
        >
          {entry.title}
        </button>
        <span className="truncate text-xs opacity-60">
          {entry.artists.join(', ')}
          {details ? ` · ${details}` : ''}
        </span>
      </div>
      <span
        className="shrink-0 font-medium text-font-color-highlight dark:text-dark-font-color-highlight"
        title={countTitle}
      >
        {count}
      </span>
    </li>
  );
};

export default TopSongRow;
