import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button, Drawer } from 'antd';
import { useAuth } from '../auth/AuthContext';
import { ScheduleCard } from './ScheduleCard';
import { AgentIcon } from './AgentIcon';
import { AgentUiIcon } from './AgentUiIcon';
import './agent.css';

type AgentWindow = { open: (eventId?: string) => void };
const AgentWindowContext = createContext<AgentWindow | undefined>(undefined);
export function useAgentWindow() {
  const context = useContext(AgentWindowContext);
  if (!context) throw new Error('AgentHost is required');
  return context;
}
function pageEvent() {
  return location.pathname === '/competition'
    ? (new URLSearchParams(location.search).get('event') ?? '')
    : '';
}

export function AgentHost({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [shown, setShown] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hint, setHint] = useState(pageEvent);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const identity = `${auth.mode}:${auth.identity?.id ?? ''}:${auth.mode === 'local' ? (sessionStorage.getItem('caau.local-test-session') ?? '') : (auth.session?.id ?? '')}`;
  useEffect(() => {
    const update = () => setHint(pageEvent());
    window.addEventListener('popstate', update);
    window.addEventListener('caau:page-context', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('caau:page-context', update);
    };
  }, []);
  useEffect(() => {
    setShown(false);
  }, [identity]);
  const open = (eventId?: string) => {
    returnFocus.current = document.activeElement as HTMLElement;
    if (eventId) setHint(eventId);
    setShown(true);
  };
  const close = () => {
    setShown(false);
    requestAnimationFrame(() =>
      (returnFocus.current ?? trigger.current)?.focus(),
    );
  };
  return (
    <AgentWindowContext.Provider value={{ open }}>
      {children}
      <button
        ref={trigger}
        className="agent-float"
        type="button"
        aria-label="打开 CAAU 智能助手"
        aria-expanded={shown}
        aria-haspopup="dialog"
        onClick={() => open()}
      >
        <AgentIcon />
      </button>
      <Drawer
        title={
          <span className="agent-title">
            <AgentIcon />
            CAAU 智能助手
          </span>
        }
        open={shown}
        onClose={close}
        width={expanded ? 'min(920px, 100vw)' : 'min(460px, 100vw)'}
        mask={false}
        closable={false}
        rootClassName={`agent-window${expanded ? ' agent-window-expanded' : ''}`}
        destroyOnHidden={false}
        className="agent-drawer"
        extra={
          <div className="agent-window-actions">
            <Button
              type="text"
              aria-label={expanded ? '还原窗口' : '放大窗口'}
              title={expanded ? '还原窗口' : '放大窗口'}
              onClick={() => setExpanded((value) => !value)}
            >
              <AgentUiIcon name={expanded ? 'collapse' : 'expand'} />
            </Button>
            <Button
              type="text"
              aria-label="关闭智能助手"
              title="关闭"
              onClick={close}
            >
              <AgentUiIcon name="close" />
            </Button>
          </div>
        }
      >
        <ScheduleCard key={identity} pageEventId={hint} visible={shown} />
      </Drawer>
    </AgentWindowContext.Provider>
  );
}
