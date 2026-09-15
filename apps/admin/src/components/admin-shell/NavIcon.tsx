import type { ReactNode } from 'react';

type IconName = 'review' | 'menu' | 'collapse' | 'close' | 'status';

const paths: Record<IconName, ReactNode> = {
  review: (
    <>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v4h4M9 12l2 2 4-4M9 18h6" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  collapse: <path d="m14 6-6 6 6 6" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  status: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </>
  ),
};

export function NavIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="shell-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
