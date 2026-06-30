import type { CSSProperties } from 'react';

// Minimal dependency-free line-icon set (stroke = currentColor), used in place of
// emoji throughout the UI so icons render identically across platforms.

export type IconName =
  | 'home'
  | 'calendar'
  | 'body'
  | 'food'
  | 'chat'
  | 'settings'
  | 'cloud'
  | 'cloud-off'
  | 'dumbbell'
  | 'activity'
  | 'tool'
  | 'alert';

const PATHS: Record<IconName, JSX.Element> = {
  home: (
    <>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </>
  ),
  body: (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M12 7v7M6 9h12M9 21l3-7 3 7" />
    </>
  ),
  food: (
    <>
      <path d="M5 2v8a2 2 0 0 0 4 0V2M7 10v12" />
      <path d="M17 2c-1.5 0-2.5 1.8-2.5 4.5S15.5 11 17 11v11" />
    </>
  ),
  chat: <path d="M21 11.5a8.5 8.5 0 0 1-12 7.5L3 21l1.9-5.5A8.5 8.5 0 1 1 21 11.5Z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  cloud: <path d="M7 18a4 4 0 0 1-.5-7.97 5.5 5.5 0 0 1 10.6 1.4A3.5 3.5 0 0 1 17 18Z" />,
  'cloud-off': (
    <>
      <path d="M7 18a4 4 0 0 1-.5-7.97 5.5 5.5 0 0 1 4.2-2 M16 8.5A3.5 3.5 0 0 1 17 18H9" />
      <path d="M3 3l18 18" />
    </>
  ),
  dumbbell: (
    <>
      <path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" />
    </>
  ),
  activity: <path d="M3 12h4l3 7 4-14 3 7h4" />,
  tool: (
    <path d="M14.5 5.5a3.5 3.5 0 0 0-4.9 4.2L3 16.3 6.7 20l6.6-6.6a3.5 3.5 0 0 0 4.2-4.9l-2.3 2.3-2-2 2.3-2.3Z" />
  ),
  alert: (
    <>
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 9v5M12 17h.01" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    >
      {PATHS[name]}
    </svg>
  );
}
