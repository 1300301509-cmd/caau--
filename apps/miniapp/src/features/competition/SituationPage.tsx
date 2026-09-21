import { useState } from 'react';
import { Picker, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { client, newKey } from '../materials/session';
import { Action, Field, Shell, confirm, saved, useCompetition } from './shared';
import { bj, participantRoles, type S } from './model';
type Team = S['EventTeamRosterViewDto'];
type Member = S['EventParticipantDto'];
export default function SituationPage() {
  const initialMatch = useRouter().params.match ?? '';
  const [data, setData] = useState<S['EventSituationViewDto']>(),
    [date, setDate] = useState(''),
    [matchId, setMatchId] = useState(initialMatch);
  const [edit, setEdit] = useState<Team>();
  const ctx = useCompetition(() => {
    setData(undefined);
    setMatchId('');
    setEdit(undefined);
  }, !!edit);
  async function load() {
    await ctx.run(async (token, valid) => {
      const next = await client.request('getEventSituation', {
        token,
        path: { eventId: ctx.eventId },
      });
      if (valid()) {
        setData(next);
      }
    });
  }
  useDidShow(() => {
    if (!edit) void load();
  });
  const match = data?.matches.find((m) => m.id === matchId);
  function update(id: string, key: keyof Member, value: string) {
    if (edit)
      setEdit({
        ...edit,
        members: edit.members.map((m) =>
          m.id === id ? { ...m, [key]: value } : m,
        ),
      });
  }
  async function add() {
    if (!edit) return;
    await ctx.run(async (_token, valid) => {
      const id = await newKey();
      if (valid())
        setEdit({
          ...edit,
          members: [
            ...edit.members,
            {
              id,
              name: '',
              role: 'PLAYER',
              jerseyNumber: '',
              position: '',
              contactPhone: '',
              notes: '',
            },
          ],
        });
    });
  }
  async function save() {
    if (!edit) return;
    if (edit.members.some((m) => !m.name.trim())) {
      ctx.setError('请填写每位参赛人员的姓名');
      return;
    }
    await ctx.run(async (token, valid) => {
      if (
        !(await confirm(
          '保存参赛名单',
          `${edit.teamName}：共 ${edit.members.length} 人。该名单用于本赛事所有相关场次，不是只修改当前一场。`,
        )) ||
        !valid()
      )
        return;
      const next = await client.request('replaceEventTeamRoster', {
        token,
        path: { eventId: ctx.eventId, eventTeamId: edit.eventTeamId },
        body: { expectedRevision: edit.revision, members: edit.members },
      });
      if (valid()) {
        setData((old) =>
          old
            ? {
                ...old,
                matches: old.matches.map((m) => ({
                  ...m,
                  homeTeam:
                    m.homeTeam?.eventTeamId === next.eventTeamId
                      ? next
                      : m.homeTeam,
                  awayTeam:
                    m.awayTeam?.eventTeamId === next.eventTeamId
                      ? next
                      : m.awayTeam,
                })),
              }
            : old,
        );
        setEdit(undefined);
        saved();
      }
    });
  }
  const teamCard = (team: Team | null, fallback: string) => (
    <View className="card">
      <Text className="subtitle">
        {team?.teamName ?? fallback} · {team?.members.length ?? 0} 人
      </Text>
      {team?.members.map((m) => (
        <View key={m.id}>
          <Text className="competition-line">
            {m.jerseyNumber && `${m.jerseyNumber}号 · `}
            {m.name} · {participantRoles[m.role]}
          </Text>
          <Text className="competition-note">
            {m.position} {m.contactPhone} {m.notes}
          </Text>
        </View>
      ))}
      {team && (
        <Action
          disabled={ctx.busy}
          onClick={() =>
            setEdit({ ...team, members: team.members.map((m) => ({ ...m })) })
          }
        >
          维护本赛事参赛名单
        </Action>
      )}
    </View>
  );
  return (
    <Shell title="赛事情况" ctx={ctx}>
      {edit ? (
        <View>
          <Text className="subtitle">{edit.teamName} · 本赛事参赛名单</Text>
          <Text className="competition-note">
            参赛名单与工作人员分开维护，保存影响本赛事该球队相关场次。
          </Text>
          {edit.members.map((m) => (
            <View className="card" key={m.id}>
              <Field
                label="姓名 *"
                max={80}
                value={m.name}
                disabled={ctx.busy}
                onChange={(v) => update(m.id, 'name', v)}
              />
              <Picker
                disabled={ctx.busy}
                range={Object.values(participantRoles)}
                onChange={(e) =>
                  update(
                    m.id,
                    'role',
                    Object.keys(participantRoles)[Number(e.detail.value)] ??
                      'PLAYER',
                  )
                }
              >
                <Text>角色：{participantRoles[m.role]}</Text>
              </Picker>
              {(
                [
                  ['jerseyNumber', '球衣号码', 12],
                  ['position', '位置', 40],
                  ['contactPhone', '联系电话', 40],
                  ['notes', '备注', 1000],
                ] as const
              ).map(([key, label, max]) => (
                <Field
                  key={key}
                  max={max}
                  label={label}
                  value={m[key]}
                  disabled={ctx.busy}
                  onChange={(v) => update(m.id, key, v)}
                />
              ))}
              <Action
                disabled={ctx.busy}
                onClick={() =>
                  setEdit({
                    ...edit,
                    members: edit.members.filter((p) => p.id !== m.id),
                  })
                }
              >
                移出名单（保存后生效）
              </Action>
            </View>
          ))}
          <Action
            disabled={ctx.busy || edit.members.length >= 100}
            onClick={() => void add()}
          >
            添加参赛人员
          </Action>
          <Action primary disabled={ctx.busy} onClick={() => void save()}>
            保存名单
          </Action>
          <Action
            disabled={ctx.busy}
            onClick={() =>
              void confirm('取消修改', '放弃尚未保存的名单修改？').then(
                (ok) => {
                  if (ok) setEdit(undefined);
                },
              )
            }
          >
            取消编辑
          </Action>
        </View>
      ) : match ? (
        <View>
          <Action onClick={() => setMatchId('')}>返回比赛列表</Action>
          <View className="card">
            <Text className="subtitle">
              {match.homeLabel} vs {match.awayLabel}
            </Text>
            <Text className="competition-note">
              {match.startAt ? bj(match.startAt).replace('T', ' ') : '待安排'} ·{' '}
              {match.venue}
            </Text>
            <Text className="subtitle">工作人员 · {match.staff.length} 人</Text>
            {match.staff.map((p) => (
              <Text className="competition-line" key={p.id}>
                {p.name} · {p.role} · {p.organization} {p.contactPhone}{' '}
                {p.notes}
              </Text>
            ))}
            {!match.staff.length && (
              <Text className="competition-note">尚未安排工作人员</Text>
            )}
            <Action
              disabled={data?.scheduleStatus !== 'PUBLISHED'}
              onClick={() =>
                void Taro.navigateTo({
                  url: `/pages/staff/index?event=${encodeURIComponent(ctx.eventId)}`,
                })
              }
            >
              前往人员管理安排工作人员
            </Action>
          </View>
          {teamCard(match.homeTeam, match.homeLabel)}
          {teamCard(match.awayTeam, match.awayLabel)}
        </View>
      ) : (
        <View>
          <Text className="competition-note">
            {data?.eventName} ·{' '}
            {data?.exists
              ? data.scheduleStatus === 'PUBLISHED'
                ? '已发布赛程'
                : '候选赛程'
              : '暂无赛程'}
          </Text>
          <Action disabled={ctx.busy} onClick={() => void load()}>
            刷新比赛
          </Action>
          <Picker
            mode="date"
            value={date || bj(Date.now()).slice(0, 10)}
            onChange={(e) => setDate(e.detail.value)}
          >
            <Text>比赛日期：{date || '全部日期'}</Text>
          </Picker>
          {date && <Action onClick={() => setDate('')}>查看全部日期</Action>}
          {data?.matches
            .filter(
              (m) =>
                !date || (m.startAt && bj(m.startAt).slice(0, 10) === date),
            )
            .map((m) => (
              <View className="card" key={m.id}>
                <Text className="competition-note">
                  第 {m.round} 轮 ·{' '}
                  {m.startAt ? bj(m.startAt).replace('T', ' ') : '待安排'} ·{' '}
                  {m.venue}
                </Text>
                <Text className="subtitle">
                  {m.homeLabel} vs {m.awayLabel}
                </Text>
                <Text className="competition-line">
                  工作人员 {m.staff.length} 人
                </Text>
                <Action onClick={() => setMatchId(m.id)}>查看场次详情</Action>
              </View>
            ))}
          {data &&
            !data.matches.some(
              (m) =>
                !date || (m.startAt && bj(m.startAt).slice(0, 10) === date),
            ) && (
              <View className="competition-empty">
                {date
                  ? '当天没有比赛，可切换日期或查看全部日期。'
                  : '暂无比赛，请先完成赛程编排。'}
              </View>
            )}
        </View>
      )}
    </Shell>
  );
}
