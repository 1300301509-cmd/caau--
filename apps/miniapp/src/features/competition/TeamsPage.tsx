import { useEffect, useState, useRef } from 'react';
import { Button, Image, Input, Text, View, Picker } from '@tarojs/components';
import Taro, { useDidHide, useDidShow } from '@tarojs/taro';
import { ApiError } from '@caau/api-client';
import { clearSession, client, newKey, session } from '../materials/session';
import {
  Action,
  Field,
  confirm,
  saved,
  useCompetition,
  useVisibleAutoRefresh,
} from './shared';
import { emptyTeam, teamFields, teamError, type S } from './model';
import logo from '../../assets/caau-logo.jpg';
import searchIcon from '../../assets/competition/team-search.svg';
import pinIcon from '../../assets/competition/team-pin.svg';
import contactIcon from '../../assets/competition/team-contact.svg';
import phoneIcon from '../../assets/competition/team-phone.svg';
import backIcon from '../../assets/competition/team-back.svg';
import moreIcon from '../../assets/competition/team-more.svg';
import plusIcon from '../../assets/competition/team-plus.svg';
import './teams.css';
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
type StatusFilter = 'active' | 'inactive' | 'all';

function headerTop() {
  try {
    const status = Taro.getWindowInfo().statusBarHeight ?? 24;
    const menu = Taro.getMenuButtonBoundingClientRect();
    return Math.max(status + 28, menu.bottom + 8);
  } catch {
    return 64;
  }
}

function teamMark(name: string) {
  return name.trim().slice(-2) || '队';
}

function teamTone(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return hash % 4;
}

function maskPhone(phone: string) {
  const clean = phone.trim();
  return clean.length >= 7
    ? `${clean.slice(0, 3)}****${clean.slice(-4)}`
    : clean;
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]),
    [masters, setMasters] = useState<Team[]>([]);
  const [orgs, setOrgs] = useState<S['TeamOrganizationDto'][]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [eventName, setEventName] = useState('当前赛事');
  const [mode, setMode] = useState<'event' | 'master' | 'add' | 'division'>(
    'event',
  );
  const [addDivisionId, setAddDivisionId] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [manageOpen, setManageOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [detailTeam, setDetailTeam] = useState<Team>();
  const [teamMenu, setTeamMenu] = useState<Team>();
  const [toggleTarget, setToggleTarget] = useState<Team>();
  const [toggleWarning, setToggleWarning] = useState('');
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
  editing.current = !!editor || !!divisionEditor || !!toggleTarget;
  hasList.current = ready;
  const ctx = useCompetition(() => {
    readVersion.current += 1;
    setTeams([]);
    setMasters([]);
    setOrgs([]);
    setDivisions([]);
    setEventName('当前赛事');
    setAddDivisionId('');
    setStatusFilter('active');
    setManageOpen(false);
    setAddOpen(false);
    setDetailTeam(undefined);
    setTeamMenu(undefined);
    setToggleTarget(undefined);
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
      client.request('listCompetitionEvents', { token }),
    ]);
  function applyLists([
    eventTeams,
    allTeams,
    organizations,
    groups,
    events,
  ]: Awaited<ReturnType<typeof readLists>>) {
    setTeams(eventTeams);
    setMasters(allTeams);
    setOrgs(organizations);
    setDivisions(groups);
    setEventName(
      events.find((event) => event.id === ctx.eventId)?.name ?? '当前赛事',
    );
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
  useVisibleAutoRefresh(load, !editor && !divisionEditor && !toggleTarget);
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
  async function prepareToggle(row: Team) {
    if (!row.canEdit) return;
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
      if (valid()) {
        setTeamMenu(undefined);
        setToggleWarning(warning);
        setToggleTarget(row);
      }
    });
  }
  async function toggle(row: Team) {
    await runAction(async (token, valid) => {
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
        setToggleTarget(undefined);
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
        : statusFilter === 'all' || t.active === (statusFilter === 'active'),
    )
    .filter((t) =>
      `${t.profile.name} ${t.profile.contactName}`.includes(query.trim()),
    );
  const source = mode === 'master' ? masters : teams;
  const activeCount = source.filter((team) => team.active).length;
  const inactiveCount = source.length - activeCount;
  const modeTitle = {
    event: '本赛事球队',
    master: '球队档案',
    add: '从档案添加',
    division: '竞赛组别',
  }[mode];
  function openMode(next: typeof mode) {
    setMode(next);
    setStatusFilter('active');
    setQuery('');
    setManageOpen(false);
    setAddOpen(false);
    setDetailTeam(undefined);
    setTeamMenu(undefined);
    setToggleTarget(undefined);
  }
  return (
    <View className="page competition-mobile teams-page">
      <View className="teams-header" style={{ paddingTop: `${headerTop()}px` }}>
        <Button
          className="teams-header-back"
          ariaLabel="返回我的比赛"
          onClick={() => void Taro.navigateBack()}
        >
          <Image src={backIcon} mode="aspectFit" />
          <Text className="teams-sr-only">返回我的比赛</Text>
        </Button>
        <View className="teams-header-copy">
          <Text className="teams-header-title">{eventName}</Text>
          <Text className="teams-header-subtitle">承办方 · 球队管理</Text>
        </View>
        <View className="teams-header-logo" aria-hidden>
          <Image src={logo} mode="aspectFit" />
        </View>
      </View>
      {ctx.error && (
        <View className="competition-error" role="alert">
          {ctx.error}
        </View>
      )}
      {ctx.busy && (
        <View className="competition-loading" role="status">
          正在更新，请稍候…
        </View>
      )}
      <View className="teams-main">
        {divisionEditor ? (
          <View className="card teams-form">
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
              onChange={(name) =>
                setDivisionEditor({ ...divisionEditor, name })
              }
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
          <View className="card teams-form">
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
          <View className="teams-list-area">
            {mode !== 'event' && (
              <View className="teams-section-head">
                <Button onClick={() => openMode('event')}>
                  返回本赛事球队
                </Button>
                <Text>{modeTitle}</Text>
              </View>
            )}
            {mode === 'division' ? (
              <View>
                <Text className="teams-section-note">
                  每支参赛球队须选择当前赛事的竞赛组别。
                </Text>
                <Action
                  primary
                  disabled={ctx.busy}
                  onClick={() => void editDivision()}
                >
                  新建组别
                </Action>
                {divisions.map((group) => (
                  <View className="teams-division-card" key={group.id}>
                    <View>
                      <Text className="teams-division-name">{group.name}</Text>
                      <Text className="teams-division-meta">
                        {group.active ? '启用中' : '已停用'} ·{' '}
                        {
                          teams.filter(
                            (team) =>
                              team.divisionId === group.id && team.active,
                          ).length
                        }{' '}
                        支参赛球队
                      </Text>
                    </View>
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
                {mode === 'add' && (
                  <View className="teams-add-context">
                    <Text className="teams-section-note">
                      从已有档案加入当前赛事，资料会作为本赛事独立快照保存。
                    </Text>
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
                  </View>
                )}
                <View className="teams-search">
                  <Image src={searchIcon} mode="aspectFit" />
                  <Input
                    ariaLabel="搜索球队或负责人"
                    placeholder="搜索球队或负责人"
                    maxlength={120}
                    value={query}
                    onInput={(e) => setQuery(e.detail.value)}
                  />
                </View>
                {mode !== 'add' && (
                  <View className="teams-filters">
                    {(
                      [
                        [
                          'active',
                          mode === 'master' ? '在用' : '参赛中',
                          activeCount,
                        ],
                        [
                          'inactive',
                          mode === 'master' ? '已归档' : '已退出',
                          inactiveCount,
                        ],
                        ['all', '全部', source.length],
                      ] as const
                    ).map(([status, label, count]) => (
                      <Button
                        key={status}
                        className={
                          statusFilter === status
                            ? 'teams-filter selected'
                            : 'teams-filter'
                        }
                        ariaLabel={`${label} ${count} 支球队`}
                        onClick={() => setStatusFilter(status)}
                      >
                        {label} {status === 'all' ? '' : count}
                      </Button>
                    ))}
                    <Button
                      className="teams-manage-link"
                      onClick={() => setManageOpen(true)}
                    >
                      更多管理
                    </Button>
                  </View>
                )}
                {(mode === 'event' || mode === 'master') && ready && (
                  <View className="teams-list-toolbar">
                    <Text>{mode === 'master' ? '球队档案' : '球队列表'}</Text>
                    <Button
                      className="teams-inline-add"
                      ariaLabel={
                        mode === 'master' ? '录入球队档案' : '添加球队'
                      }
                      disabled={ctx.busy}
                      onClick={() =>
                        mode === 'master' ? void edit() : setAddOpen(true)
                      }
                    >
                      <Image src={plusIcon} mode="aspectFit" />
                      {mode === 'master' ? '录入档案' : '添加球队'}
                    </Button>
                  </View>
                )}
                {mode === 'event' &&
                  ready &&
                  !divisions.some((group) => group.active) && (
                    <View className="teams-guidance">
                      <Text>先建立竞赛组别，才能录入本赛事球队。</Text>
                      <Button onClick={() => openMode('division')}>
                        去管理 ›
                      </Button>
                    </View>
                  )}
                <View className="teams-card-list">
                  {list.map((row) => (
                    <View className="teams-card" key={row.id}>
                      <View
                        className={`teams-avatar teams-avatar-${teamTone(row.profile.name)}`}
                      >
                        <Text>{teamMark(row.profile.name)}</Text>
                      </View>
                      <View className="teams-card-body">
                        <View className="teams-card-heading">
                          <Text className="teams-card-name">
                            {row.profile.name}
                          </Text>
                          {mode !== 'add' && row.canEdit && (
                            <Button
                              className="teams-card-more"
                              ariaLabel={`管理${row.profile.name}`}
                              onClick={() => setTeamMenu(row)}
                            >
                              <Image src={moreIcon} mode="aspectFit" />
                              <Text className="teams-sr-only">
                                管理{row.profile.name}
                              </Text>
                            </Button>
                          )}
                        </View>
                        <View className="teams-card-fact">
                          <Image src={pinIcon} mode="aspectFit" />
                          <Text>
                            {[row.profile.province, row.profile.city]
                              .filter(Boolean)
                              .join(' · ') || '地区未填写'}
                          </Text>
                        </View>
                        <View className="teams-card-fact">
                          <Image src={contactIcon} mode="aspectFit" />
                          <Text>
                            负责人：{row.profile.contactName || '未填写'}
                          </Text>
                        </View>
                        <View className="teams-card-fact">
                          <Image src={phoneIcon} mode="aspectFit" />
                          <Text>{maskPhone(row.profile.contactPhone)}</Text>
                        </View>
                        {mode !== 'add' && (
                          <View className="teams-card-tags">
                            <Text
                              className={
                                row.active
                                  ? 'teams-status'
                                  : 'teams-status teams-status-inactive'
                              }
                            >
                              {row.active
                                ? mode === 'master'
                                  ? '在用'
                                  : '参赛中'
                                : mode === 'master'
                                  ? '已归档'
                                  : '已退出'}
                            </Text>
                            {mode === 'event' && (
                              <Text className="teams-card-division">
                                {row.divisionId
                                  ? (divisions.find(
                                      (group) => group.id === row.divisionId,
                                    )?.name ?? '组别暂不可见')
                                  : '待归组'}
                              </Text>
                            )}
                          </View>
                        )}
                      </View>
                      <View className="teams-card-actions">
                        <Button onClick={() => setDetailTeam(row)}>
                          查看资料
                        </Button>
                        {mode === 'add' ? (
                          <Button
                            className="teams-card-primary"
                            disabled={ctx.busy || !addDivisionId}
                            onClick={() => void add(row)}
                          >
                            加入赛事
                          </Button>
                        ) : row.canEdit ? (
                          <Button
                            className="teams-card-primary"
                            disabled={ctx.busy}
                            onClick={() => void edit(row)}
                          >
                            编辑
                          </Button>
                        ) : (
                          <Text className="teams-read-only">仅可查看</Text>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
                {ready && !list.length && (
                  <View className="teams-empty">
                    <Text>
                      {query
                        ? '没有找到符合搜索条件的球队'
                        : mode === 'add'
                          ? '暂无可加入的球队档案'
                          : statusFilter === 'inactive'
                            ? '暂无已退出的球队'
                            : '暂无符合条件的球队'}
                    </Text>
                  </View>
                )}
                {mode === 'master' && (
                  <Text className="teams-footer-note">
                    球队档案与本赛事资料独立保存，修改不会互相覆盖。
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {(manageOpen || addOpen || teamMenu || detailTeam || toggleTarget) && (
          <View
            className="teams-sheet-backdrop"
            onClick={() => {
              setManageOpen(false);
              setAddOpen(false);
              setTeamMenu(undefined);
              setDetailTeam(undefined);
              if (!ctx.busy) setToggleTarget(undefined);
            }}
          />
        )}
        {manageOpen && (
          <View className="teams-sheet" role="dialog">
            <View className="teams-sheet-heading">
              <Text>球队管理</Text>
              <Button ariaLabel="关闭" onClick={() => setManageOpen(false)}>
                ×
              </Button>
            </View>
            <Button
              className="teams-sheet-option"
              onClick={() => openMode('event')}
            >
              本赛事球队
            </Button>
            <Button
              className="teams-sheet-option"
              onClick={() => openMode('master')}
            >
              球队档案
            </Button>
            <Button
              className="teams-sheet-option"
              onClick={() => openMode('add')}
            >
              从档案添加
            </Button>
            <Button
              className="teams-sheet-option"
              onClick={() => openMode('division')}
            >
              竞赛组别
            </Button>
          </View>
        )}
        {addOpen && (
          <View className="teams-sheet" role="dialog">
            <View className="teams-sheet-heading">
              <Text>添加球队</Text>
              <Button ariaLabel="关闭" onClick={() => setAddOpen(false)}>
                ×
              </Button>
            </View>
            <Button
              className="teams-sheet-option"
              disabled={!divisions.some((group) => group.active)}
              onClick={() => {
                setAddOpen(false);
                void edit();
              }}
            >
              录入本赛事球队
            </Button>
            {!divisions.some((group) => group.active) && (
              <Text className="teams-sheet-hint">请先创建竞赛组别。</Text>
            )}
            <Button
              className="teams-sheet-option"
              onClick={() => openMode('add')}
            >
              从球队档案添加
            </Button>
            <Button
              className="teams-sheet-option"
              onClick={() => openMode('division')}
            >
              管理竞赛组别
            </Button>
          </View>
        )}
        {teamMenu && (
          <View className="teams-sheet" role="dialog">
            <View className="teams-sheet-heading">
              <Text>{teamMenu.profile.name}</Text>
              <Button ariaLabel="关闭" onClick={() => setTeamMenu(undefined)}>
                ×
              </Button>
            </View>
            <Button
              className="teams-sheet-option"
              onClick={() => {
                setDetailTeam(teamMenu);
                setTeamMenu(undefined);
              }}
            >
              查看完整资料
            </Button>
            <Button
              className="teams-sheet-option"
              onClick={() => {
                const row = teamMenu;
                setTeamMenu(undefined);
                void edit(row);
              }}
            >
              编辑资料
            </Button>
            <Button
              className="teams-sheet-option teams-sheet-destructive"
              disabled={ctx.busy}
              onClick={() => void prepareToggle(teamMenu)}
            >
              {teamMenu.active
                ? mode === 'master'
                  ? '归档球队'
                  : '移出本赛事'
                : mode === 'master'
                  ? '恢复档案'
                  : '恢复参赛'}
            </Button>
          </View>
        )}
        {detailTeam && (
          <View className="teams-sheet teams-detail-sheet" role="dialog">
            <View className="teams-sheet-heading">
              <Text>球队资料</Text>
              <Button ariaLabel="关闭" onClick={() => setDetailTeam(undefined)}>
                ×
              </Button>
            </View>
            <View className="teams-sheet-team">
              <View
                className={`teams-avatar teams-avatar-${teamTone(detailTeam.profile.name)}`}
              >
                <Text>{teamMark(detailTeam.profile.name)}</Text>
              </View>
              <View>
                <Text className="teams-sheet-team-name">
                  {detailTeam.profile.name}
                </Text>
                <Text className="teams-sheet-team-note">
                  {detailTeam.active ? '参赛中 / 在用' : '已退出 / 已归档'}
                </Text>
              </View>
            </View>
            {mode === 'event' && (
              <View className="teams-detail-row">
                <Text>竞赛组别</Text>
                <Text>
                  {detailTeam.divisionId
                    ? (divisions.find(
                        (group) => group.id === detailTeam.divisionId,
                      )?.name ?? '组别暂不可见')
                    : '待归组'}
                </Text>
              </View>
            )}
            {teamFields.map(
              ([key, label]) =>
                detailTeam.profile[key] && (
                  <View className="teams-detail-row" key={key}>
                    <Text>{label.replace(' *', '')}</Text>
                    <Text>{detailTeam.profile[key]}</Text>
                  </View>
                ),
            )}
            {detailTeam.canEdit && mode !== 'add' && (
              <Button
                className="teams-detail-edit"
                onClick={() => {
                  const row = detailTeam;
                  setDetailTeam(undefined);
                  void edit(row);
                }}
              >
                编辑资料
              </Button>
            )}
          </View>
        )}
        {toggleTarget && (
          <View className="teams-sheet teams-confirm-sheet" role="dialog">
            <View className="teams-sheet-heading">
              <Text>
                {toggleTarget.active
                  ? mode === 'master'
                    ? '归档球队'
                    : '移出本赛事'
                  : mode === 'master'
                    ? '恢复档案'
                    : '恢复参赛'}
              </Text>
              <Button
                ariaLabel="关闭"
                disabled={ctx.busy}
                onClick={() => setToggleTarget(undefined)}
              >
                ×
              </Button>
            </View>
            <View className="teams-sheet-team">
              <View
                className={`teams-avatar teams-avatar-${teamTone(toggleTarget.profile.name)}`}
              >
                <Text>{teamMark(toggleTarget.profile.name)}</Text>
              </View>
              <View>
                <Text className="teams-sheet-team-name">
                  {toggleTarget.profile.name}
                </Text>
                <Text className="teams-sheet-team-note">{toggleWarning}</Text>
              </View>
            </View>
            {ctx.error && (
              <Text className="teams-sheet-error">{ctx.error}</Text>
            )}
            <View className="teams-confirm-actions">
              <Button
                disabled={ctx.busy}
                onClick={() => setToggleTarget(undefined)}
              >
                取消
              </Button>
              <Button
                className="teams-confirm-primary"
                disabled={ctx.busy}
                onClick={() => void toggle(toggleTarget)}
              >
                {toggleTarget.active
                  ? mode === 'master'
                    ? '确认归档'
                    : '确认移出'
                  : '确认恢复'}
              </Button>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
