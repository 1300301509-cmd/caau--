export function NavIcon({
  name,
}: {
  name:
    | 'review'
    | 'calendar'
    | 'application'
    | 'account'
    | 'teams'
    | 'supplies'
    | 'chart';
}) {
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
      {name === 'teams' ? (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" />
        </>
      ) : name === 'supplies' ? (
        <>
          <path d="m3 7 9-4 9 4v10l-9 4-9-4ZM3 7l9 4 9-4M12 11v10M7.5 5l9 4" />
        </>
      ) : name === 'chart' ? (
        <>
          <path d="M3 3v18h18M7 16v-4M12 16V8M17 16V5" />
        </>
      ) : name === 'account' ? (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0M19 3v4M17 5h4" />
        </>
      ) : name === 'calendar' ? (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
        </>
      ) : name === 'application' ? (
        <>
          <path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2Z" />
          <path d="M9 8h6M9 12h6M9 16h3M15 15l1.5 1.5L20 13" />
        </>
      ) : (
        <>
          <path d="M6 3h9l3 3v15H6z" />
          <path d="M15 3v4h4M9 12l2 2 4-4M9 18h6" />
        </>
      )}
    </svg>
  );
}
