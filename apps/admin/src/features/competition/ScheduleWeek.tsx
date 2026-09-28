import { useState } from 'react';
import { Button, Empty, Input, Select, Space, Tag } from 'antd';
import type { components } from '@caau/api-client';
import { beijingDateTime, inWeek, mondayOf, shiftDate } from './schedule-week';

type Schedule = components['schemas']['ScheduleViewDto'];
type Match = components['schemas']['ScheduleMatchDto'];
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function ScheduleWeek({
  schedule,
  divisions,
  disabled,
  onEdit,
}: {
  schedule: Schedule;
  divisions: { id: string; name: string }[];
  disabled: boolean;
  onEdit: (match: Match) => void;
}) {
  const today = beijingDateTime(Date.now()).slice(0, 10);
  const first = [...schedule.matches]
    .filter((m) => m.startAt)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  const initialDate = first
    ? beijingDateTime(first.startAt).slice(0, 10)
    : schedule.config.startDate || today;
  const [selected, setSelected] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('ALL');
  const divisionName = (id: string | null, label = '') =>
    id
      ? label ||
        divisions.find((division) => division.id === id)?.name ||
        '历史组别'
      : '待归组（历史）';
  const divisionOptions = [
    { value: 'ALL', label: '全部组别' },
    ...Array.from(
      new Set(schedule.matches.map((match) => match.divisionId ?? 'LEGACY')),
    ).map((id) => ({
      value: id,
      label:
        id === 'LEGACY'
          ? '待归组（历史）'
          : divisionName(
              id,
              schedule.matches.find((match) => match.divisionId === id)
                ?.divisionLabel,
            ),
    })),
  ];
  const visibleMatches = schedule.matches.filter(
    (match) =>
      selectedDivision === 'ALL' ||
      (match.divisionId ?? 'LEGACY') === selectedDivision,
  );
  const monday = selected || mondayOf(initialDate);
  const days = weekdays.map((label, i) => ({
    label,
    date: shiftDate(monday, i),
  }));
  const matches = visibleMatches
    .filter((m) => inWeek(m.startAt, monday))
    .sort((a, b) => a.startAt.localeCompare(b.startAt) || a.order - b.order);
  const pending = visibleMatches.filter((m) => !m.startAt);
  const startHour = Math.min(
    Number(schedule.config.dailyStart.slice(0, 2)),
    ...matches.map((m) => Number(beijingDateTime(m.startAt).slice(11, 13))),
  );
  const endHour = Math.max(
    Number(schedule.config.dailyEnd.slice(0, 2)) || 18,
    ...matches.map((m) => Number(beijingDateTime(m.startAt).slice(11, 13)) + 1),
  );
  const hours = Array.from(
    { length: endHour - startHour },
    (_, i) => startHour + i,
  );
  function card(match: Match) {
    const start = match.startAt ? beijingDateTime(match.startAt) : '';
    const end = match.startAt
      ? beijingDateTime(
          Date.parse(match.startAt) + schedule.config.durationMinutes * 60000,
        )
      : '';
    const issues = schedule.issues.filter((issue) =>
      issue.matchIds.includes(match.id),
    );
    return (
      <button
        key={match.id}
        type="button"
        className={`schedule-match-card${issues.length ? ' has-conflict' : ''}`}
        disabled={disabled}
        onClick={() => onEdit(match)}
        aria-label={`调整 第${match.round}轮 ${match.homeLabel} vs ${match.awayLabel}`}
      >
        <span className="schedule-card-meta">
          {divisionName(match.divisionId, match.divisionLabel)} · 第
          {match.round}轮{issues.length > 0 && <span> · 有冲突</span>}
        </span>
        <strong>
          {match.homeLabel}
          <span className="schedule-vs">vs</span>
          {match.awayLabel}
        </strong>
        <span className="schedule-card-detail">
          {start
            ? `${start.slice(11)}–${end.slice(0, 10) !== start.slice(0, 10) ? '次日 ' : ''}${end.slice(11)}`
            : '时间待安排'}
          <span aria-hidden="true"> · </span>
          {match.venue || '场地待安排'}
        </span>
      </button>
    );
  }
  return (
    <div className="schedule-week">
      <div className="schedule-week-toolbar">
        <div>
          <h3>每周赛程</h3>
          <strong aria-live="polite" data-testid="schedule-week-range">
            {monday.replaceAll('-', '/')} —{' '}
            {shiftDate(monday, 6).replaceAll('-', '/')}
          </strong>
          <p>北京时间 · 本周 {matches.length} 场 · 按开始时间排列</p>
        </div>
        <Space wrap>
          <Select
            aria-label="筛选竞赛组别"
            value={selectedDivision}
            options={divisionOptions}
            onChange={setSelectedDivision}
            style={{ minWidth: 144 }}
          />
          <Button onClick={() => setSelected(shiftDate(monday, -7))}>
            上一周
          </Button>
          <Button onClick={() => setSelected(mondayOf(today))}>本周</Button>
          <Button onClick={() => setSelected(shiftDate(monday, 7))}>
            下一周
          </Button>
          <Input
            type="date"
            aria-label="跳转赛程日期"
            value={monday}
            onChange={(e) => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))
                setSelected(mondayOf(e.target.value));
            }}
          />
        </Space>
      </div>
      {!matches.length && (
        <p className="schedule-week-empty">
          本周暂无比赛，可切换周次或调整待安排比赛。
        </p>
      )}
      <div
        className="schedule-week-scroll"
        role="region"
        aria-label="每周赛程课表，可横向滚动"
        tabIndex={0}
      >
        <table className="schedule-week-table">
          <caption className="schedule-sr-only">
            周一至周日比赛，按北京时间开始小时分组，点击比赛调整
          </caption>
          <thead>
            <tr>
              <th scope="col">时间</th>
              {days.map((day) => (
                <th
                  scope="col"
                  key={day.date}
                  className={day.date === today ? 'is-today' : ''}
                >
                  {day.label}
                  <span>{day.date.slice(5).replace('-', '/')}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((hour) => (
              <tr key={hour}>
                <th scope="row">{String(hour).padStart(2, '0')}:00</th>
                {days.map((day) => (
                  <td key={day.date}>
                    {matches
                      .filter((m) => {
                        const time = beijingDateTime(m.startAt);
                        return (
                          time.slice(0, 10) === day.date &&
                          Number(time.slice(11, 13)) === hour
                        );
                      })
                      .map(card)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="schedule-pending" aria-label="待安排比赛">
        <h3>
          待安排 <Tag>{pending.length}</Tag>
        </h3>
        {pending.length ? (
          <div className="schedule-pending-list">{pending.map(card)}</div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="没有待安排比赛"
          />
        )}
      </section>
    </div>
  );
}
