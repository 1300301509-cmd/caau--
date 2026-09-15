export function NavIcon({ name }: { name: 'review' }) {
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
      data-icon={name}
    >
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v4h4M9 12l2 2 4-4M9 18h6" />
    </svg>
  );
}
