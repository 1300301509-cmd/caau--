import { useEffect, useState } from 'react';
import { Alert, Button, Select } from 'antd';
import { ApiError, type components } from '@caau/api-client';
import { client } from '../materials/client';
import { useAuth } from '../auth/AuthContext';
import { NavIcon } from '../../components/admin-shell/NavIcon';
import './competition.css';
import { TeamManagementPanel } from './TeamManagementPanel';
import { SchedulingPanel } from './SchedulingPanel';
import { SuppliesPanel } from './SuppliesPanel';
import { EventSituationPanel } from './EventSituationPanel';
import { StaffManagementPanel } from './StaffManagementPanel';

const modules = [
  {
    key: 'staff',
    title: '人员管理',
    english: 'STAFF',
    icon: 'account',
    note: '管理裁判及赛事工作人员。',
    columns: ['姓名', '岗位', '联系方式'],
    sections: ['人员名单', '人员历史'],
    description: '维护本赛事的工作人员名单。',
  },
  {
    key: 'teams',
    title: '球队管理',
    english: 'TEAMS',
    icon: 'teams',
    note: '让每支参赛球队的信息清晰有序。',
    columns: ['球队名称', '参赛组别', '领队 / 联系人', '球员名单', '参赛状态'],
    sections: ['球队列表', '球队详情', '参赛名单'],
    description: '建议以球队列表为主，点击球队后查看详情与参赛名单。',
  },
  {
    key: 'schedule',
    title: '赛程编排',
    english: 'SCHEDULE',
    icon: 'calendar',
    note: '集中查看对阵、比赛时间与场地安排。',
    columns: ['阶段 / 轮次', '对阵双方', '比赛日期', '开赛时间', '比赛场地'],
    sections: ['赛程视图', '对阵安排', '时间与场地'],
    description: '建议按比赛日期查看赛程，并集中调整对阵、时间与场地。',
  },
  {
    key: 'supplies',
    title: '物料管理',
    english: 'SUPPLIES',
    icon: 'supplies',
    note: '把办赛所需物料归集到一张清单。',
    columns: ['物料名称', '类别', '需求数量', '负责人', '准备状态'],
    sections: ['物料清单', '数量需求', '准备情况'],
    description: '建议用清单呈现赛事物料、数量需求及准备情况。',
  },
  {
    key: 'data',
    title: '赛事情况',
    english: 'EVENT SITUATION',
    icon: 'chart',
    note: '通过日历查看比赛安排与场次人员。',
    columns: ['比赛日期', '比赛场次', '对阵双方', '工作人员', '参赛人员'],
    sections: ['赛事日历', '场次详情', '人员信息'],
    description: '按日期定位比赛，再进入场次详情查看工作人员与参赛人员。',
  },
] as const;
type ModuleKey = (typeof modules)[number]['key'];
const readModule = (): ModuleKey => {
  const key = new URLSearchParams(location.search).get('module');
  return modules.find((item) => item.key === key)?.key ?? 'teams';
};

export function CompetitionPage() {
  const auth = useAuth();
  const [active, setActive] = useState<ModuleKey>(readModule);
  const [events, setEvents] = useState<components['schemas']['EventViewDto'][]>(
    [],
  );
  const [eventId, setEventId] = useState(
    () => new URLSearchParams(location.search).get('event') ?? '',
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const module = modules.find((item) => item.key === active)!;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    setEvents([]);
    const token =
      auth.mode === 'local'
        ? (sessionStorage.getItem('caau.local-test-session') ?? '')
        : '';
    void client
      .request('listEvents', { token })
      .then((rows) => {
        if (!alive) return;
        setEvents(rows);
        setEventId((current) =>
          rows.some((row) => row.id === current)
            ? current
            : (rows[0]?.id ?? ''),
        );
      })
      .catch((cause) => {
        if (!alive) return;
        setEventId('');
        setError(
          cause instanceof ApiError && cause.status === 403
            ? '当前账号没有可查看赛事的权限。'
            : '赛事列表暂时无法读取，请稍后重试。',
        );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [auth.mode, auth.identity?.id, attempt]);
  useEffect(() => {
    const onBack = () => {
      setActive(readModule());
      setEventId(new URLSearchParams(location.search).get('event') ?? '');
    };
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, []);
  function navigate(key: ModuleKey, id: string) {
    setActive(key);
    setEventId(id);
    const query = new URLSearchParams({ module: key });
    if (id) query.set('event', id);
    history.pushState(null, '', `/competition?${query}`);
    window.dispatchEvent(new Event('caau:page-context'));
  }
  return (
    <div className="competition-page">
      <section className="competition-context" aria-label="当前赛事">
        <div className="competition-context-label">
          <span className="competition-context-icon">
            <NavIcon name="calendar" />
          </span>
          <div>
            <label htmlFor="competition-event">当前赛事</label>
            <p>各模块共用同一场赛事</p>
          </div>
        </div>
        <Select
          id="competition-event"
          aria-label="当前赛事"
          className="competition-event-select"
          showSearch
          optionFilterProp="label"
          loading={loading}
          disabled={loading || !!error || !events.length}
          value={
            events.some((event) => event.id === eventId) ? eventId : undefined
          }
          placeholder={
            loading
              ? '正在读取赛事…'
              : error
                ? '赛事读取失败'
                : '暂无可查看赛事'
          }
          options={events.map((event) => ({
            value: event.id,
            label: event.name,
          }))}
          onChange={(id) => navigate(active, id)}
        />
      </section>
      {error && (
        <Alert
          type="warning"
          showIcon
          title={error}
          action={
            <Button
              size="small"
              onClick={() => setAttempt((value) => value + 1)}
            >
              重试
            </Button>
          }
        />
      )}
      <nav className="competition-modules" aria-label="比赛管理子模块">
        {modules.map((item, index) => (
          <a
            key={item.key}
            href={`/competition?${new URLSearchParams({ module: item.key, ...(eventId ? { event: eventId } : {}) })}`}
            aria-current={active === item.key ? 'page' : undefined}
            className={`competition-module module-${item.key} ${active === item.key ? 'active' : ''}`}
            onClick={(event) => {
              if (
                event.button ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              navigate(item.key, eventId);
            }}
          >
            <div className="competition-module-top">
              <NavIcon name={item.icon} />
              <small>0{index + 1}</small>
            </div>
            <strong>{item.title}</strong>
            <span>{item.english}</span>
          </a>
        ))}
      </nav>
      {active === 'teams' ? (
        <TeamManagementPanel
          key={`${auth.identity?.id}-${eventId}`}
          eventId={eventId}
          eventName={events.find((event) => event.id === eventId)?.name ?? ''}
        />
      ) : active === 'staff' ? (
        <StaffManagementPanel
          key={`${auth.identity?.id}-${eventId}`}
          eventId={eventId}
        />
      ) : active === 'schedule' ? (
        <SchedulingPanel
          key={`${auth.identity?.id}-${eventId}`}
          eventId={eventId}
        />
      ) : active === 'supplies' ? (
        <SuppliesPanel
          key={`${auth.identity?.id}-${eventId}`}
          eventId={eventId}
        />
      ) : active === 'data' ? (
        <EventSituationPanel
          key={`${auth.identity?.id}-${eventId}`}
          eventId={eventId}
        />
      ) : (
        <div className="competition-workspace">
          <section
            className="competition-panel"
            aria-labelledby="competition-module-title"
          >
            <header>
              <div>
                <span className="competition-kicker">{module.english}</span>
                <h2 id="competition-module-title">{module.title}</h2>
                <p>{module.note}</p>
              </div>
              <span className="competition-preview-badge">布局预览</span>
            </header>
            <div className="competition-table-scroll">
              <table>
                <caption className="competition-caption">
                  建议列表布局 · 字段待确认
                </caption>
                <thead>
                  <tr>
                    {module.columns.map((column) => (
                      <th key={column} scope="col">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody />
              </table>
            </div>
            <div className="competition-empty">
              <span>
                <NavIcon name={module.icon} />
              </span>
              <h3>{module.title}工作区</h3>
              <p>页面结构已预留，具体功能将按后续需求完善。</p>
              <small>当前展示为布局方案，未加载该模块的业务数据。</small>
            </div>
          </section>
          <aside className="competition-plan" aria-label="模块布局说明">
            <span className="competition-kicker">模块规划</span>
            <h3>这一页如何展开</h3>
            <p>{module.description}</p>
            <ol>
              {module.sections.map((section, index) => (
                <li key={section}>
                  <span>0{index + 1}</span>
                  {section}
                </li>
              ))}
            </ol>
            <div className="competition-plan-note">
              先确定模块布局，再逐项完善操作流程。
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
