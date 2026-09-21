import { useState, useRef } from 'react';
import { Text, View, Picker } from '@tarojs/components';
import { useDidShow } from '@tarojs/taro';
import { ApiError } from '@caau/api-client';
import { client, newKey } from '../materials/session';
import { Action, Field, Shell, confirm, saved, useCompetition } from './shared';
import { emptyTeam, teamFields, teamError, type S } from './model';
type Team = S['TeamViewDto'];
type Editor = {
  id: string;
  row?: Team;
  master: boolean;
  profile: S['TeamProfileDto'];
  organizationId: string;
};
export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]),
    [masters, setMasters] = useState<Team[]>([]);
  const [orgs, setOrgs] = useState<S['TeamOrganizationDto'][]>([]);
  const [mode, setMode] = useState<'event' | 'master' | 'add'>('event');
  const [query, setQuery] = useState(''),
    [inactive, setInactive] = useState(false);
  const [ready, setReady] = useState(false),
    [editor, setEditor] = useState<Editor>();
  const pending = useRef<S['CreateTeamDto']>();
  const [frozen, setFrozen] = useState(false);
  const ctx = useCompetition(() => {
    setTeams([]);
    setMasters([]);
    setOrgs([]);
    setReady(false);
    setEditor(undefined);
    pending.current = undefined;
    setFrozen(false);
  }, !!editor);
  async function load() {
    await ctx.run(async (token, valid) => {
      const [a, b, c] = await Promise.all([
        client.request('listEventTeams', {
          token,
          path: { eventId: ctx.eventId },
        }),
        client.request('listTeams', { token }),
        client.request('listTeamOrganizations', { token }),
      ]);
      if (valid()) {
        setTeams(a);
        setMasters(b);
        setOrgs(c);
        setReady(true);
      }
    });
  }
  useDidShow(() => {
    if (!editor) void load();
  });
  async function edit(row?: Team) {
    await ctx.run(async (_token, valid) => {
      const id = row?.id ?? (await newKey());
      if (valid()) {
        pending.current = undefined;
        setFrozen(false);
        setEditor({
          id,
          row,
          master: mode === 'master',
          profile: row ? { ...row.profile } : emptyTeam(),
          organizationId: row?.organizationId ?? orgs[0]?.id ?? '',
        });
      }
    });
  }
  async function save() {
    if (!editor) return;
    const problem = teamError(editor.profile);
    if (problem) {
      ctx.setError(problem);
      return;
    }
    await ctx.run(async (token, valid) => {
      if (editor.row) {
        const body = {
          profile: editor.profile,
          active: editor.row.active,
          expectedRevision: editor.row.revision,
        };
        if (editor.master)
          await client.request('updateTeam', {
            token,
            path: { id: editor.id },
            body,
          });
        else
          await client.request('updateEventTeam', {
            token,
            path: { eventId: ctx.eventId, id: editor.id },
            body,
          });
      } else {
        const body = pending.current ?? {
          id: editor.id,
          organizationId: editor.organizationId,
          ...(!editor.master ? { eventId: ctx.eventId } : {}),
          profile: editor.profile,
        };
        pending.current = body;
        setFrozen(true);
        try {
          await client.request('createTeam', { token, body });
        } catch (e) {
          if (valid() && e instanceof ApiError && e.status === 400) {
            pending.current = undefined;
            setFrozen(false);
          }
          throw e;
        }
      }
      if (valid()) {
        setEditor(undefined);
        pending.current = undefined;
        setFrozen(false);
        saved();
        try {
          const [a, b] = await Promise.all([
            client.request('listEventTeams', {
              token,
              path: { eventId: ctx.eventId },
            }),
            client.request('listTeams', { token }),
          ]);
          if (valid()) {
            setTeams(a);
            setMasters(b);
          }
        } catch (e) {
          if (e instanceof ApiError && (e.status === 401 || e.status === 403))
            throw e;
          if (valid())
            ctx.setError('球队已保存，但列表刷新失败，请点击刷新核对。');
        }
      }
    });
  }
  async function toggle(row: Team) {
    await ctx.run(async (token, valid) => {
      let warning = '此操作保留档案及历史，不修改其他赛事资料。';
      if (mode === 'event' && row.active) {
        const schedule = await client.request('getEventSchedule', {
          token,
          path: { eventId: ctx.eventId },
        });
        if (!valid()) return;
        if (schedule.config.teamIds.includes(row.id))
          warning +=
            '该球队已在赛程内，退出不会删除赛程，但会产生球队不可用冲突。';
      }
      if (
        !(await confirm(
          row.active
            ? mode === 'master'
              ? '归档球队'
              : '移出本赛事'
            : '恢复球队',
          `${row.profile.name}\n${warning}`,
        )) ||
        !valid()
      )
        return;
      const body = {
        profile: row.profile,
        active: !row.active,
        expectedRevision: row.revision,
      };
      const next =
        mode === 'master'
          ? await client.request('updateTeam', {
              token,
              path: { id: row.id },
              body,
            })
          : await client.request('updateEventTeam', {
              token,
              path: { eventId: ctx.eventId, id: row.id },
              body,
            });
      if (valid()) {
        if (mode === 'master')
          setMasters((v) => v.map((t) => (t.id === next.id ? next : t)));
        else setTeams((v) => v.map((t) => (t.id === next.id ? next : t)));
        saved();
      }
    });
  }
  async function add(row: Team) {
    await ctx.run(async (token, valid) => {
      const next = await client.request('addEventTeam', {
        token,
        path: { eventId: ctx.eventId },
        body: { teamId: row.id },
      });
      if (valid()) {
        setTeams((v) => [...v.filter((t) => t.id !== next.id), next]);
        saved();
      }
    });
  }
  async function cancel() {
    if (
      await confirm(
        '退出编辑',
        frozen
          ? '新增结果尚未确认，请刷新核对后再新增，避免重复。'
          : '放弃本次未保存的输入？',
      )
    ) {
      setEditor(undefined);
      pending.current = undefined;
      setFrozen(false);
      void load();
    }
  }
  const list = (mode === 'event' ? teams : masters)
    .filter((t) =>
      mode === 'add'
        ? t.active && !teams.some((e) => e.teamId === t.id)
        : t.active !== inactive,
    )
    .filter((t) =>
      `${t.profile.name} ${t.profile.contactName}`.includes(query.trim()),
    );
  return (
    <Shell title="球队管理" ctx={ctx}>
      <Text className="competition-note">
        球队档案和本赛事资料独立保存，修改不会相互覆盖。
      </Text>
      {editor ? (
        <View className="card">
          <Text className="subtitle">
            {editor.row ? '编辑' : '录入'}
            {editor.master ? '球队档案' : '本赛事球队'}
          </Text>
          {frozen && (
            <Text className="competition-note">
              新增结果待确认，重试使用原请求；暂时锁定输入。
            </Text>
          )}
          {!editor.row && (
            <Picker
              disabled={ctx.busy || frozen}
              range={orgs.map((o) => o.name)}
              onChange={(e) =>
                setEditor({
                  ...editor,
                  organizationId: orgs[Number(e.detail.value)]?.id ?? '',
                })
              }
            >
              <Text>
                录入机构：
                {orgs.find((o) => o.id === editor.organizationId)?.name ??
                  '无可用机构'}
              </Text>
            </Picker>
          )}
          {teamFields.map(([key, label, max]) => (
            <View key={key}>
              {key === 'name' && (
                <Text className="competition-form-section">基本资料</Text>
              )}
              {key === 'province' && (
                <Text className="competition-form-section">所在地区</Text>
              )}
              {key === 'shortName' && (
                <Text className="competition-form-section">
                  补充信息 · 选填
                </Text>
              )}
              <Field
                key={key}
                label={label}
                max={max}
                value={editor.profile[key]}
                disabled={ctx.busy || frozen}
                onChange={(v) =>
                  setEditor({
                    ...editor,
                    profile: { ...editor.profile, [key]: v },
                  })
                }
              />
            </View>
          ))}
          <Action
            primary
            disabled={ctx.busy || (!editor.row && !editor.organizationId)}
            onClick={() => void save()}
          >
            {frozen ? '重试原请求' : '保存球队'}
          </Action>
          <Action disabled={ctx.busy} onClick={() => void cancel()}>
            取消编辑
          </Action>
        </View>
      ) : (
        <View>
          <View className="competition-row">
            {(
              [
                ['event', '本赛事球队'],
                ['master', '球队档案'],
                ['add', '从档案添加'],
              ] as const
            ).map(([v, label]) => (
              <Action
                key={v}
                primary={mode === v}
                disabled={ctx.busy}
                onClick={() => {
                  setMode(v);
                  setInactive(false);
                }}
              >
                {label}
              </Action>
            ))}
          </View>
          <Action disabled={ctx.busy} onClick={() => void load()}>
            刷新列表
          </Action>
          {mode !== 'add' && (
            <Action
              primary
              disabled={ctx.busy || !ready}
              onClick={() => void edit()}
            >
              录入球队
            </Action>
          )}
          <Field label="搜索球队或负责人" value={query} onChange={setQuery} />
          {mode !== 'add' && (
            <Action onClick={() => setInactive((v) => !v)}>
              {inactive ? '查看参赛中 / 在用' : '查看已退出 / 已归档'}
            </Action>
          )}
          {list.map((row) => (
            <View className="card" key={row.id}>
              <Text className="subtitle">{row.profile.name}</Text>
              <Text className="competition-line">
                {row.profile.province} {row.profile.city} ·{' '}
                {row.active ? '在用' : '已退出 / 归档'}
              </Text>
              <Text className="competition-line">
                {row.profile.contactName} · {row.profile.contactPhone}
              </Text>
              <Text className="competition-note">
                {row.profile.introduction}
              </Text>
              {mode === 'add' ? (
                <Action disabled={ctx.busy} onClick={() => void add(row)}>
                  加入本赛事
                </Action>
              ) : row.canEdit ? (
                <View className="competition-row">
                  <Action disabled={ctx.busy} onClick={() => void edit(row)}>
                    编辑资料
                  </Action>
                  <Action disabled={ctx.busy} onClick={() => void toggle(row)}>
                    {row.active
                      ? mode === 'master'
                        ? '归档'
                        : '移出本赛事'
                      : '恢复'}
                  </Action>
                </View>
              ) : (
                <Text className="competition-note">当前身份仅可查看</Text>
              )}
            </View>
          ))}
          {ready && !list.length && (
            <View className="competition-empty">暂无符合条件的球队</View>
          )}
        </View>
      )}
    </Shell>
  );
}
