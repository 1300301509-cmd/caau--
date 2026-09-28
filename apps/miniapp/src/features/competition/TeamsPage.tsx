import { useEffect, useState, useRef } from 'react';
import { Text, View, Picker } from '@tarojs/components';
import { useDidHide, useDidShow } from '@tarojs/taro';
import { ApiError } from '@caau/api-client';
import { clearSession, client, newKey, session } from '../materials/session';
import {
  Action,
  Field,
  Shell,
  confirm,
  saved,
  useCompetition,
  useVisibleAutoRefresh,
} from './shared';
import { emptyTeam, teamFields, teamError, type S } from './model';
type Team = S['TeamViewDto'];
type Division = S['EventDivisionViewDto'];
type Editor = {
  id: string;
  row?: Team;
  master: boolean;
  profile: S['TeamProfileDto'];
  organizationId: string;
  divisionId: string;
};
type DivisionEditor = {
  id: string;
  row?: Division;
  name: string;
  active: boolean;
};
export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]),
    [masters, setMasters] = useState<Team[]>([]);
  const [orgs, setOrgs] = useState<S['TeamOrganizationDto'][]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [mode, setMode] = useState<'event' | 'master' | 'add' | 'division'>(
    'event',
  );
  const [addDivisionId, setAddDivisionId] = useState('');
  const [query, setQuery] = useState(''),
    [inactive, setInactive] = useState(false);
  const [ready, setReady] = useState(false),
    [editor, setEditor] = useState<Editor>();
  const [divisionEditor, setDivisionEditor] = useState<DivisionEditor>();
  const pending = useRef<S['CreateTeamDto']>();
  const [frozen, setFrozen] = useState(false);
  const visible = useRef(false);
  const readVersion = useRef(0);
  const editing = useRef(false);
  const acting = useRef(false);
  const busy = useRef(false);
  const hasList = useRef(false);
  editing.current = !!editor || !!divisionEditor;
  hasList.current = ready;
  const ctx = useCompetition(() => {
    readVersion.current += 1;
    setTeams([]);
    setMasters([]);
    setOrgs([]);
    setDivisions([]);
    setAddDivisionId('');
    setReady(false);
    setEditor(undefined);
    setDivisionEditor(undefined);
    pending.current = undefined;
    setFrozen(false);
  }, !!editor || !!divisionEditor);
  busy.current = ctx.busy;
  const readLists = (token: string) =>
    Promise.all([
      client.request('listEventTeams', {
        token,
        path: { eventId: ctx.eventId },
      }),
      client.request('listTeams', { token }),
      client.request('listTeamOrganizations', { token }),
      client.request('listEventDivisions', {
        token,
        path: { eventId: ctx.eventId },
      }),
    ]);
  function applyLists([eventTeams, allTeams, organizations, groups]: Awaited<
    ReturnType<typeof readLists>
  >) {
    setTeams(eventTeams);
    setMasters(allTeams);
    setOrgs(organizations);
    setDivisions(groups);
    setReady(true);
  }
  async function load() {
    if (!visible.current || editing.current || acting.current || busy.current)
      return;
    const token = session.token;
    if (!token || !ctx.eventId) return;
    const epoch = session.epoch;
    const version = ++readVersion.current;
    const valid = () =>
      visible.current &&
      !editing.current &&
      !acting.current &&
      !busy.current &&
      token === session.token &&
      epoch === session.epoch &&
      version === readVersion.current;
    try {
      const lists = await readLists(token);
      if (valid()) {
        applyLists(lists);
        ctx.setError('');
      }
    } catch (error) {
      if (!valid()) return;
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
      } else if (error instanceof ApiError && error.status === 403) {
        setTeams([]);
        setMasters([]);
        setOrgs([]);
        setDivisions([]);
        setReady(false);
        ctx.setError('当前身份没有此赛事的操作权限，请返回首页。');
      } else {
        ctx.setError(
          hasList.current
            ? '球队列表暂时无法自动更新，稍后会重试。'
            : '球队列表加载失败，正在自动重试。',
        );
      }
    }
  }
  useDidShow(() => {
    visible.current = true;
  });
  useDidHide(() => {
    visible.current = false;
    readVersion.current += 1;
  });
  useEffect(
    () => () => {
      visible.current = false;
      readVersion.current += 1;
    },
    [],
  );
  useVisibleAutoRefresh(load, !editor && !divisionEditor);
  async function runAction(work: Parameters<typeof ctx.run>[0]) {
    readVersion.current += 1;
    acting.current = true;
    try {
      await ctx.run(work);
    } finally {
      acting.current = false;
    }
  }
  async function refreshAfterWrite(token: string, valid: () => boolean) {
    try {
      const lists = await readLists(token);
      if (valid()) applyLists(lists);
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      )
        throw error;
      if (valid()) ctx.setError('球队已保存，列表暂时未更新，页面会自动重试。');
    }
  }
  async function edit(row?: Team) {
    await runAction(async (_token, valid) => {
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
          divisionId: row?.divisionId ?? '',
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
    if (!editor.master && !editor.divisionId) {
      ctx.setError('请选择本赛事竞赛组别');
      return;
    }
    await runAction(async (token, valid) => {
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
            body: { ...body, divisionId: editor.divisionId },
          });
      } else {
        const body = pending.current ?? {
          id: editor.id,
          organizationId: editor.organizationId,
          ...(!editor.master
            ? { eventId: ctx.eventId, divisionId: editor.divisionId }
            : {}),
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
        await refreshAfterWrite(token, valid);
      }
    });
  }
  async function toggle(row: Team) {
    await runAction(async (token, valid) => {
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
        await refreshAfterWrite(token, valid);
      }
    });
  }
  async function add(row: Team) {
    if (!addDivisionId) {
      ctx.setError('请先选择本赛事竞赛组别');
      return;
    }
    await runAction(async (token, valid) => {
      const next = await client.request('addEventTeam', {
        token,
        path: { eventId: ctx.eventId },
        body: { teamId: row.id, divisionId: addDivisionId },
      });
      if (valid()) {
        setTeams((v) => [...v.filter((t) => t.id !== next.id), next]);
        saved();
        await refreshAfterWrite(token, valid);
      }
    });
  }
  async function editDivision(row?: Division) {
    await runAction(async (_token, valid) => {
      const id = row?.id ?? (await newKey());
      if (valid())
        setDivisionEditor({
          id,
          row,
          name: row?.name ?? '',
          active: row?.active ?? true,
        });
    });
  }
  async function saveDivision() {
    if (!divisionEditor) return;
    const name = divisionEditor.name.trim();
    if (!name || name.length > 120) {
      ctx.setError('请填写不超过 120 字的组别名称');
      return;
    }
    await runAction(async (token, valid) => {
      if (divisionEditor.row) {
        await client.request('updateEventDivision', {
          token,
          path: { eventId: ctx.eventId, id: divisionEditor.id },
          body: {
            name,
            active: divisionEditor.active,
            expectedRevision: divisionEditor.row.revision,
          },
        });
      } else {
        await client.request('createEventDivision', {
          token,
          path: { eventId: ctx.eventId },
          body: { id: divisionEditor.id, name },
        });
      }
      if (valid()) {
        setDivisionEditor(undefined);
        saved();
        await refreshAfterWrite(token, valid);
      }
    });
  }
  async function cancel() {
    if (
      await confirm(
        '退出编辑',
        frozen
          ? '新增结果尚未确认，返回列表后会自动核对，避免重复新增。'
          : '放弃本次未保存的输入？',
      )
    ) {
      setEditor(undefined);
      pending.current = undefined;
      setFrozen(false);
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
      {divisionEditor ? (
        <View className="card">
          <Text className="subtitle">
            {divisionEditor.row ? '编辑' : '新建'}竞赛组别
          </Text>
          <Text className="competition-note">
            组别属于本赛事，例如 U12 男子组。
          </Text>
          <Field
            label="组别名称 *"
            max={120}
            value={divisionEditor.name}
            disabled={ctx.busy}
            onChange={(name) => setDivisionEditor({ ...divisionEditor, name })}
          />
          {divisionEditor.row && (
            <Action
              disabled={ctx.busy}
              onClick={() =>
                setDivisionEditor({
                  ...divisionEditor,
                  active: !divisionEditor.active,
                })
              }
            >
              {divisionEditor.active
                ? '状态：启用，点击停用'
                : '状态：停用，点击启用'}
            </Action>
          )}
          <Action
            primary
            disabled={ctx.busy}
            onClick={() => void saveDivision()}
          >
            保存组别
          </Action>
          <Action
            disabled={ctx.busy}
            onClick={() => setDivisionEditor(undefined)}
          >
            取消编辑
          </Action>
        </View>
      ) : editor ? (
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
          {!editor.master && (
            <Picker
              disabled={ctx.busy || frozen}
              range={divisions
                .filter((group) => group.active)
                .map((group) => group.name)}
              onChange={(e) =>
                setEditor({
                  ...editor,
                  divisionId:
                    divisions.filter((group) => group.active)[
                      Number(e.detail.value)
                    ]?.id ?? '',
                })
              }
            >
              <Text>
                竞赛组别 *：
                {divisions.find((group) => group.id === editor.divisionId)
                  ?.name ?? '请选择'}
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
            disabled={
              ctx.busy ||
              (!editor.row && !editor.organizationId) ||
              (!editor.master && !editor.divisionId)
            }
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
                ['event', '本赛事'],
                ['master', '球队档案'],
                ['add', '从档案加'],
                ['division', '组别管理'],
              ] as const
            ).map(([v, label]) => (
              <Action
                key={v}
                primary={mode === v}
                disabled={ctx.busy}
                onClick={() => {
                  setMode(v);
                  setInactive(false);
                  void load();
                }}
              >
                {label}
              </Action>
            ))}
          </View>
          {mode === 'division' ? (
            <View>
              <Action
                primary
                disabled={ctx.busy}
                onClick={() => void editDivision()}
              >
                新建组别
              </Action>
              {divisions.map((group) => (
                <View className="card" key={group.id}>
                  <Text className="subtitle">{group.name}</Text>
                  <Text className="competition-line">
                    {group.active ? '启用中' : '已停用'} ·{' '}
                    {
                      teams.filter(
                        (team) => team.divisionId === group.id && team.active,
                      ).length
                    }{' '}
                    支参赛球队
                  </Text>
                  <Action
                    disabled={ctx.busy}
                    onClick={() => void editDivision(group)}
                  >
                    编辑组别
                  </Action>
                </View>
              ))}
              {ready && !divisions.length && (
                <View className="competition-empty">
                  暂无竞赛组别，请先创建。
                </View>
              )}
            </View>
          ) : (
            <View>
              {mode !== 'add' && (
                <Action
                  primary
                  disabled={
                    ctx.busy ||
                    !ready ||
                    (mode === 'event' &&
                      !divisions.some((group) => group.active))
                  }
                  onClick={() => void edit()}
                >
                  录入球队
                </Action>
              )}
              {mode === 'event' &&
                ready &&
                !divisions.some((group) => group.active) && (
                  <Text className="competition-note">
                    请先在“组别管理”创建竞赛组别，再录入本赛事球队。
                  </Text>
                )}
              {mode === 'add' && (
                <Picker
                  range={divisions
                    .filter((group) => group.active)
                    .map((group) => group.name)}
                  onChange={(e) =>
                    setAddDivisionId(
                      divisions.filter((group) => group.active)[
                        Number(e.detail.value)
                      ]?.id ?? '',
                    )
                  }
                >
                  <Text>
                    加入组别 *：
                    {divisions.find((group) => group.id === addDivisionId)
                      ?.name ?? '请选择'}
                  </Text>
                </Picker>
              )}
              <Field
                label="搜索球队或负责人"
                value={query}
                onChange={setQuery}
              />
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
                  {mode === 'event' && (
                    <Text className="competition-line">
                      竞赛组别：
                      {row.divisionId
                        ? (divisions.find(
                            (group) => group.id === row.divisionId,
                          )?.name ?? '组别暂不可见')
                        : '待归组'}
                    </Text>
                  )}
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
                      <Action
                        disabled={ctx.busy}
                        onClick={() => void edit(row)}
                      >
                        编辑资料
                      </Action>
                      <Action
                        disabled={ctx.busy}
                        onClick={() => void toggle(row)}
                      >
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
        </View>
      )}
    </Shell>
  );
}
