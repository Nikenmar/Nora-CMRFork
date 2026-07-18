import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useResizeObserver from '../../hooks/useResizeObserver';

type ActivityDatum = { id: string; label: string; listens: number };

type Props = {
  data: ActivityDatum[];
  className?: string;
  minBarWidth?: number;
};

const MIN_VISIBLE_BARS = 6;

const ActivityBarGraph = (props: Props) => {
  const { data, className, minBarWidth = 46 } = props;
  const { t } = useTranslation();

  const containerRef = useRef<HTMLDivElement>(null);
  const { width } = useResizeObserver(containerRef, 100);

  const visibleCount = useMemo(() => {
    const count = Math.floor(width / minBarWidth);
    if (count <= 0) return Math.min(MIN_VISIBLE_BARS, data.length);
    return Math.max(1, Math.min(count, data.length));
  }, [width, minBarWidth, data.length]);

  const visibleData = useMemo(() => data.slice(-visibleCount), [data, visibleCount]);
  const maxListens = Math.max(1, ...visibleData.map((datum) => datum.listens));

  if (data.length === 0) return null;

  return (
    <div
      className={`appear-from-bottom flex h-64 w-full max-w-full flex-col overflow-hidden rounded-md bg-background-color-2/70 px-4 pb-2 pt-4 backdrop-blur-md dark:bg-dark-background-color-2/70 ${className ?? ''}`}
    >
      <div
        ref={containerRef}
        style={{
          gridTemplateColumns: `repeat(${visibleData.length}, minmax(0, 1fr))`
        }}
        className="grid h-full min-w-0 items-center justify-around overflow-hidden"
      >
        {visibleData.map((datum, index) => (
          <div
            key={datum.id}
            className="relative flex h-full min-w-0 flex-col items-center justify-end"
          >
            <div className="flex h-full items-end rounded-2xl bg-seekbar-track-background-color/20 dark:bg-dark-seekbar-track-background-color">
              <div
                className="order-1 w-[10px] rounded-2xl bg-font-color-highlight transition-[height] delay-200 duration-300 ease-in-out dark:bg-dark-font-color-highlight"
                style={{
                  height: datum.listens === 0 ? '10px' : `${(datum.listens / maxListens) * 90}%`,
                  transitionDelay: `${index * 30 + 200}`
                }}
                title={t('songInfoPage.listensCount', { count: datum.listens })}
              />
            </div>
            <div className="order-2 flex w-full grow-0 flex-col pt-1 text-font-color dark:text-font-color-white">
              <span className="font-thin">{datum.listens}</span>
              <span className="w-full truncate px-1 text-xs">{datum.label}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActivityBarGraph;
