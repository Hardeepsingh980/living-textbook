// Single-weight line icons (24-unit grid, 2.5 px marker stroke). One visual language across the app; no emoji anywhere.
import type { SVGProps } from 'react';

const PATHS: Record<string, string> = {
  back: 'M15 5l-7 7 7 7',
  play: 'M8 5v14l11-7z',
  pause: 'M7 5h4v14H7zM13 5h4v14h-4z',
  replay: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v5h5',
  next: 'M9 5l7 7-7 7',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6',
  stop: 'M7 7h10v10H7z',
  sound: 'M4 10v4h4l5 4V6l-5 4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  soundOff: 'M4 10v4h4l5 4V6l-5 4H4zM17 9l4 6M21 9l-4 6',
  layers: 'M12 4l9 5-9 5-9-5 9-5zM3 14l9 5 9-5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cross: 'M6 6l12 12M18 6L6 18',
  question: 'M9.5 9a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.1 1-1.1 1.7v.5M12 17h.01',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  upload: 'M12 16V5M7 10l5-5 5 5M5 19h14',
  library: 'M4 5h4v14H4zM10 5h4v14h-4zM16.5 5.5l3.5 1-3 13-3.5-1z',
  close: 'M6 6l12 12M18 6L6 18',
  trash: 'M5 7h14M9 7V4h6v3M8 7l1 13h6l1-13',
  knob: 'M4 12h16M8 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  film: 'M4 5h16v14H4zM4 9h16M4 15h16M8 5v14M16 5v14',
  plus: 'M12 5v14M5 12h14',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  chart: 'M5 19V10M12 19V5M19 19v-6M3 19h18',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  open: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  key: 'M8 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 12h9M17.5 12v3M21 12v2.5',
  code: 'M9 7l-5 5 5 5M15 7l5 5-5 5',
  copy: 'M9 9h11v11H9zM5 15V4h11',
};

export function Icon({ name, size = 22, ...rest }: { name: keyof typeof PATHS | string; size?: number } & SVGProps<SVGSVGElement>) {
  const d = PATHS[name] ?? PATHS.question!;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'play' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      <path d={d} />
    </svg>
  );
}
