const paths: Record<string, string> = {
  today: 'M3 11.5 12 4l9 7.5M5.5 9.8V20h13V9.8',
  mic: 'M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3ZM6 12a6 6 0 0 0 12 0M12 18v3M9 21h6',
  chart: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16ZM4 18.5A2.5 2.5 0 0 1 6.5 16H20',
  repeat: 'M4 9h13l-3-3m6 9H7l3 3',
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.3a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15h-.2a2 2 0 1 1 0-4h.3A1.7 1.7 0 0 0 4.3 8L4.2 8a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2v-.3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.3a2 2 0 1 1 0 4h-.2Z',
  play: 'M8 5v14l11-7L8 5Z',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  check: 'm5 13 4 4L19 7',
  stop: 'M7 7h10v10H7z',
  flame: 'M12 3c1.5 4 5 5.5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.6 1 2.5 2 2.5 1.5 0 1.5-3 1-7Z',
  headphones: 'M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1v-5Zm16 0h-3v6h2a1 1 0 0 0 1-1v-5Z',
  pen: 'M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Zm10-13 3 3',
  bookopen: 'M12 6.5C10 4.8 7 4 4 4v14c3 0 6 .8 8 2.5 2-1.7 5-2.5 8-2.5V4c-3 0-6 .8-8 2.5Zm0 0V20',
  wave: 'M3 12h2l2-5 3 10 3-14 3 12 2-3h3',
};

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: keyof typeof paths | string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={paths[name] || paths.today} />
    </svg>
  );
}
