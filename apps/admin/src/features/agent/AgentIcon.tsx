import assistantIcon from '../../assets/caau-assistant.svg';

/** Decorative avatar; the surrounding button or message supplies its label. */
export function AgentIcon() {
  return (
    <img
      className="agent-icon"
      src={assistantIcon}
      width={64}
      height={64}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
