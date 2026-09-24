export function AgentUiIcon({
  name,
}: {
  name:
    | 'expand'
    | 'collapse'
    | 'close'
    | 'send'
    | 'calendar'
    | 'plan'
    | 'arrow';
}) {
  return (
    <svg
      className="agent-ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'expand' ? (
        <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5" />
      ) : name === 'collapse' ? (
        <path d="M3 8h5V3M21 8h-5V3M16 21v-5h5M8 21v-5H3" />
      ) : name === 'close' ? (
        <path d="m5 5 14 14M19 5 5 19" />
      ) : name === 'send' ? (
        <path d="M12 20V4m-7 7 7-7 7 7" />
      ) : name === 'arrow' ? (
        <path d="m9 5 7 7-7 7" />
      ) : name === 'calendar' ? (
        <>
          <rect x="3" y="5" width="18" height="16" rx="3" />
          <path d="M7 3v4m10-4v4M3 11h18M8 15h2m4 0h2M8 18h2" />
        </>
      ) : (
        <>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4V2h6v2M9 9h6m-6 4h6m-6 4h3" />
        </>
      )}
    </svg>
  );
}
