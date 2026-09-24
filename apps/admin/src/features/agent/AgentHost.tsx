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
      <Button
        ref={trigger}
        className="agent-float"
        type="primary"
        aria-label="打开 CAAU 智能助手"
        onClick={() => open()}
      >
        <span aria-hidden="true" className="agent-float-mark">
          ◈
        </span>
        <span className="agent-float-label">智能助手</span>
      </Button>
      <Drawer
        title="CAAU 智能助手"
        open={shown}
        onClose={close}
        width={620}
        destroyOnHidden={false}
        className="agent-drawer"
        extra={<Button onClick={close}>最小化</Button>}
      >
        <ScheduleCard key={identity} pageEventId={hint} visible={shown} />
      </Drawer>
    </AgentWindowContext.Provider>
  );
}
