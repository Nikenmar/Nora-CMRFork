type Props = {
  label: string;
  value: string | number;
  title?: string;
};

const StatTile = (props: Props) => {
  const { label, value, title } = props;

  return (
    <span
      className="flex min-h-[130px] flex-col items-center justify-center rounded-lg border-[3px] border-background-color-2 py-4 text-lg dark:border-dark-background-color-2"
      title={title ?? `${value} ${label}`}
    >
      <span className="text-xl font-medium text-font-color-highlight dark:text-dark-font-color-highlight">
        {value}
      </span>
      <span className="px-2 text-center lowercase opacity-75">{label}</span>
    </span>
  );
};

export default StatTile;
