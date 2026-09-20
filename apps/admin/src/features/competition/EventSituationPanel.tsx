import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Empty, Modal, Skeleton, Tag } from 'antd';
import { ApiError, type components } from '@caau/api-client';
import { NavIcon } from '../../components/admin-shell/NavIcon';
import { useAuth } from '../auth/AuthContext';
import { client } from '../materials/client';

type Situation = components['schemas']['EventSituationViewDto'];
type Match = components['schemas']['EventSituationMatchDto'];
type Team = components['schemas']['EventTeamRosterViewDto'];

const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const dateLabel = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});
const timeLabel = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function localKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function teamName(team: Team | null, fallback: string) {
  return team?.teamName || fallback || '待定';
}

function roleLabel(role: string) {
  return (
    (
      {
        PLAYER: '球员',
        COACH: '教练',
        MANAGER: '领队',
        MEDICAL: '医疗',
        OTHER: '其他',
      } as Record<string, string>
    )[role] ?? role
  );
}

function Roster({ team, fallback }: { team: Team | null; fallback: string }) {
  return (
    <section className="situation-roster">
      <div className="situation-roster-heading">
        <div>
          <span>参赛球队</span>
          <h4>{teamName(team, fallback)}</h4>
        </div>
        <Tag>{team?.members.length ?? 0} 人</Tag>
      </div>
      {team?.members.length ? (
        <div className="situation-person-list">
          {team.members.map((person) => (
            <article key={person.id} className="situation-person">
              <span className="situation-person-number">
                {person.jerseyNumber || '—'}
              </span>
              <div>
                <strong>{person.name}</strong>
                <small>
                  {roleLabel(person.role)}
                  {person.position ? ` · ${person.position}` : ''}
                </small>
              </div>
              {person.contactPhone && (
                <a href={`tel:${person.contactPhone}`}>{person.contactPhone}</a>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="situation-inline-empty">承办方尚未登记该队参赛人员</p>
      )}
    </section>
  );
}

function errorMessage(cause: unknown) {
  if (cause instanceof ApiError && cause.status === 403)
    return '当前账号没有查看这场赛事的权限。';
  return '赛事情况暂时无法读取，请稍后重试。';
}

export function EventSituationPanel({ eventId }: { eventId: string }) {
  const auth = useAuth();
  const token =
    auth.mode === 'local'
      ? (sessionStorage.getItem('caau.local-test-session') ?? '')
      : '';
  const [data, setData] = useState<Situation>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Match>();
  const [month, setMonth] = useState(() => new Date());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    setData(undefined);
    setSelected(undefined);
    if (!eventId) {
      setLoading(false);
      return () => {
        alive = false;
      };
    }
    void client
      .request('getEventSituation', { token, path: { eventId } })
      .then((result) => {
        if (!alive) return;
        setData(result);
        if (result.matches[0]?.startAt) {
          const first = new Date(result.matches[0].startAt);
          setMonth(new Date(first.getFullYear(), first.getMonth(), 1));
        }
      })
      .catch((cause) => {
        if (alive) setError(errorMessage(cause));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [eventId, token, attempt]);

  const byDate = useMemo(() => {
    const result = new Map<string, Match[]>();
    for (const match of data?.matches ?? []) {
      const key = localKey(match.startAt);
      result.set(key, [...(result.get(key) ?? []), match]);
    }
    for (const matches of result.values())
      matches.sort((left, right) => left.startAt.localeCompare(right.startAt));
    return result;
  }, [data]);
  const cells = useMemo(() => monthCells(month), [month]);

  return (
    <section className="competition-panel situation-panel">
      <header>
        <div>
          <span className="competition-kicker">EVENT SITUATION</span>
          <h2>赛事情况</h2>
          <p>按日期查看每一场比赛，点击场次可查看工作人员与参赛人员。</p>
        </div>
        {data?.exists && (
          <Tag color={data.scheduleStatus === 'PUBLISHED' ? 'green' : 'gold'}>
            {data.scheduleStatus === 'PUBLISHED' ? '已发布赛程' : '待发布赛程'}{' '}
            · V{data.scheduleRevision}
          </Tag>
        )}
      </header>
      {error && (
        <Alert
          type="error"
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
      {loading ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : !data?.exists || !data.matches.length ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前赛事还没有可展示的赛程，请先完成赛程编排"
        />
      ) : (
        <div className="situation-calendar-shell">
          <div className="situation-calendar-toolbar">
            <div>
              <span>{data.eventName}</span>
              <h3>
                {month.getFullYear()}年 {month.getMonth() + 1}月
              </h3>
            </div>
            <div className="situation-month-actions">
              <Button
                aria-label="上个月"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() - 1, 1),
                  )
                }
              >
                ‹
              </Button>
              <Button onClick={() => setMonth(new Date())}>本月</Button>
              <Button
                aria-label="下个月"
                onClick={() =>
                  setMonth(
                    new Date(month.getFullYear(), month.getMonth() + 1, 1),
                  )
                }
              >
                ›
              </Button>
            </div>
          </div>
          <div className="situation-calendar" role="grid" aria-label="赛事月历">
            {weekDays.map((day) => (
              <div key={day} className="situation-weekday" role="columnheader">
                {day}
              </div>
            ))}
            {cells.map((date) => {
              const key = localKey(date);
              const matches = byDate.get(key) ?? [];
              const currentMonth = date.getMonth() === month.getMonth();
              const today = key === localKey(new Date());
              return (
                <div
                  key={key}
                  className={`situation-day ${currentMonth ? '' : 'is-outside'} ${matches.length ? 'has-matches' : ''}`}
                  role="gridcell"
                >
                  <div className="situation-day-number">
                    <span className={today ? 'is-today' : ''}>
                      {date.getDate()}
                    </span>
                    {!!matches.length && <small>{matches.length} 场</small>}
                  </div>
                  <div className="situation-day-matches">
                    {matches.map((match) => (
                      <button
                        key={match.id}
                        type="button"
                        onClick={() => setSelected(match)}
                      >
                        <time>{timeLabel.format(new Date(match.startAt))}</time>
                        <span>
                          {teamName(match.homeTeam, match.homeLabel)}
                          <b>vs</b>
                          {teamName(match.awayTeam, match.awayLabel)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Modal
        open={!!selected}
        width={860}
        centered
        footer={null}
        destroyOnHidden
        className="situation-modal"
        title="比赛详情"
        onCancel={() => setSelected(undefined)}
      >
        {selected && (
          <div className="situation-detail">
            <section className="situation-match-hero">
              <div className="situation-match-meta">
                <span>
                  第 {selected.round} 轮 · 第 {selected.order} 场
                </span>
                <strong>{dateLabel.format(new Date(selected.startAt))}</strong>
                <small>
                  {timeLabel.format(new Date(selected.startAt))} ·{' '}
                  {selected.venue}
                </small>
              </div>
              <div className="situation-versus">
                <strong>
                  {teamName(selected.homeTeam, selected.homeLabel)}
                </strong>
                <span>VS</span>
                <strong>
                  {teamName(selected.awayTeam, selected.awayLabel)}
                </strong>
              </div>
            </section>
            <section className="situation-staff-section">
              <div className="situation-section-title">
                <span className="situation-section-icon">
                  <NavIcon name="teams" />
                </span>
                <div>
                  <h4>相关工作人员</h4>
                  <p>场次对应的裁判、记录台及现场保障人员</p>
                </div>
              </div>
              {selected.staff.length ? (
                <div className="situation-staff-grid">
                  {selected.staff.map((person) => (
                    <article key={person.id}>
                      <span>{person.role}</span>
                      <strong>{person.name}</strong>
                      <small>{person.organization || '未填写所属单位'}</small>
                      {person.contactPhone && (
                        <a href={`tel:${person.contactPhone}`}>
                          {person.contactPhone}
                        </a>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="situation-inline-empty">
                  承办方尚未登记本场工作人员
                </p>
              )}
            </section>
            <div className="situation-rosters">
              <Roster team={selected.homeTeam} fallback={selected.homeLabel} />
              <Roster team={selected.awayTeam} fallback={selected.awayLabel} />
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
