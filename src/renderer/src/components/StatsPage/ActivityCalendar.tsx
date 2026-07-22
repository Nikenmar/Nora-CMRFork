import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

type CalendarDay = { date: string; listens: number };

type Props = {
  days: CalendarDay[];
  className?: string;
};

const WEEK_DAYS = 7;
const CELL_PX = 10;
const GAP_PX = 2;

const toLocalDate = (isoDate: string) => new Date(`${isoDate}T00:00:00`);

/**
 * Compact GitHub-style activity heatmap: 7 weekday rows x N week columns on a
 * fixed 10px/2px grid pitch (shared by the month-label row and the cell grid,
 * so labels always sit exactly over their columns). The card spans the full
 * section width like its siblings; the fixed-size heatmap stays centered.
 */
const ActivityCalendar = (props: Props) => {
  const { days, className } = props;
  const { t, i18n } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Format with the app language (i18next), not the OS locale.
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }),
    [i18n.language]
  );
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: 'short' }),
    [i18n.language]
  );

  // Keep the scrollable heatmap anchored to the newest (rightmost) week -
  // the scrollbar is hidden, so the latest data must be visible by default.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [days]);

  const maxListens = Math.max(1, ...days.map((day) => day.listens));

  // Pad the front so the first day lands on its real weekday row (Sunday-first,
  // GitHub-style). Null cells render as transparent placeholders.
  const cells = useMemo(() => {
    if (days.length === 0) return [] as (CalendarDay | null)[];
    const leadingBlanks = toLocalDate(days[0].date).getDay();
    return [...Array<CalendarDay | null>(leadingBlanks).fill(null), ...days];
  }, [days]);

  const columnCount = Math.ceil(cells.length / WEEK_DAYS);
  const gridTemplateColumns = `repeat(${columnCount}, ${CELL_PX}px)`;

  // A month label sits over the column CONTAINING the 1st of that month
  // (GitHub-style) - labeling by the column's top cell drops months whose
  // 1st falls mid-week.
  const monthLabels = useMemo(
    () =>
      Array.from({ length: columnCount }, (_, columnIndex) => {
        const column = cells.slice(columnIndex * WEEK_DAYS, (columnIndex + 1) * WEEK_DAYS);
        const monthStart = column.find((day) => !!day && toLocalDate(day.date).getDate() === 1);
        return {
          key: column.find((day) => !!day)?.date ?? `blank-${columnIndex}`,
          label: monthStart ? monthFormatter.format(toLocalDate(monthStart.date)) : ''
        };
      }),
    [cells, columnCount, monthFormatter]
  );

  if (days.length === 0) return null;

  const getCellOpacity = (listens: number) => {
    if (listens <= 0) return undefined;
    const ratio = listens / maxListens;
    if (ratio <= 0.25) return 0.2;
    if (ratio <= 0.5) return 0.4;
    if (ratio <= 0.75) return 0.65;
    return 1;
  };

  return (
    <div
      ref={scrollRef}
      className={`appear-from-bottom w-full max-w-full overflow-x-auto rounded-md bg-background-color-2/70 p-4 backdrop-blur-md [-ms-overflow-style:none] [scrollbar-width:none] dark:bg-dark-background-color-2/70 [&::-webkit-scrollbar]:hidden ${className ?? ''}`}
    >
      <div className="mx-auto w-max">
        <div
          className="grid text-[10px] leading-none text-font-color/60 dark:text-font-color-white/60"
          style={{ gridTemplateColumns, columnGap: GAP_PX }}
        >
          {monthLabels.map((monthLabel) => (
            <span key={monthLabel.key} className="h-3.5 overflow-visible whitespace-nowrap">
              {monthLabel.label}
            </span>
          ))}
        </div>
        <div
          className="grid [grid-auto-flow:column]"
          style={{
            gridTemplateColumns,
            gridTemplateRows: `repeat(${WEEK_DAYS}, ${CELL_PX}px)`,
            gap: GAP_PX,
            marginTop: GAP_PX
          }}
        >
          {cells.map((day, index) =>
            day === null ? (
              <span key={`blank-${index}`} style={{ width: CELL_PX, height: CELL_PX }} />
            ) : (
              <span
                key={day.date}
                className={`rounded-[2px] ${
                  day.listens === 0
                    ? 'bg-seekbar-track-background-color/30 dark:bg-dark-seekbar-track-background-color/30'
                    : 'bg-font-color-highlight dark:bg-dark-font-color-highlight'
                }`}
                style={{
                  width: CELL_PX,
                  height: CELL_PX,
                  opacity: day.listens === 0 ? undefined : getCellOpacity(day.listens)
                }}
                title={`${dateFormatter.format(toLocalDate(day.date))} - ${t(
                  'songInfoPage.listensCount',
                  { count: day.listens }
                )}`}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityCalendar;
