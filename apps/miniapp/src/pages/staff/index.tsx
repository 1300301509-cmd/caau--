import { useEffect, useRef, useState } from 'react';
import { Button, Input, Text, Textarea, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { ApiError, type components } from '@caau/api-client';
import {
  clearSession,
  client,
  newKey,
  session,
  subscribeSession,
} from '../../features/materials/session';
import {
  addAssignment,
  blankProfile,
  profileError,
  roles,
  type Assignment,
  type Profile,
  type Staff,
} from '../../features/staff/model';
import './index.css';

type S = components['schemas'];
type Situation = S['EventSituationViewDto'];
type Match = S['EventSituationMatchDto'];
type Editor = { id: string; row?: Staff; profile: Profile };
type MatchEditor = {
  match: Match;
  scheduleRevision: number;
  rows: Assignment[];
};

function timeLabel(value: string) {
  if (!value) return '时间未安排';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return `${new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ')}（北京时间）`;
}

export default function StaffPage() {
  const eventId = useRouter().params.event ?? '';
  const [rows, setRows] = useState<Staff[]>([]);
  const [situation, setSituation] = useState<Situation>();
  const [tab, setTab] = useState<'people' | 'matches'>('people');
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [editor, setEditor] = useState<Editor>();
  const [matchEditor, setMatchEditor] = useState<MatchEditor>();
  const [history, setHistory] = useState<{
    name: string;
    rows: S['EventStaffHistoryDto'][];
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const lock = useRef(false);
  const alive = useRef(true);
  const generation = useRef(0);
  // An uncertain create must retry exactly the same id and body.
  const pendingCreate = useRef<{ id: string; profile: Profile }>();
  const [uncertain, setUncertain] = useState(false);

  useEffect(() => {
    alive.current = true;
    const unsubscribe = subscribeSession(() => {
      generation.current++;
      setRows([]);
      setSituation(undefined);
      setEditor(undefined);
      setMatchEditor(undefined);
      setHistory(undefined);
      pendingCreate.current = undefined;
      setUncertain(false);
      void Taro.reLaunch({ url: '/pages/login/index' });
    });
    return () => {
      alive.current = false;
      generation.current++;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (editor || matchEditor)
      void Taro.enableAlertBeforeUnload({
        message: '尚有未保存的人员信息，确定离开？',
      });
    else Taro.disableAlertBeforeUnload();
    return () => {
      Taro.disableAlertBeforeUnload();
    };
  }, [!!editor, !!matchEditor]);

  async function run(
    action: (token: string, valid: () => boolean) => Promise<void>,
  ) {
    if (lock.current) return;
    if (!session.token) {
      void Taro.reLaunch({ url: '/pages/login/index' });
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    const token = session.token;
    const epoch = generation.current;
    const valid = () =>
      alive.current && session.token === token && generation.current === epoch;
    try {
      await action(token, valid);
    } catch (cause) {
      if (!valid()) return;
      if (cause instanceof ApiError && cause.status === 401) {
        clearSession();
        return;
      }
      if (cause instanceof ApiError && cause.status === 403) {
        setRows([]);
        setSituation(undefined);
        setEditor(undefined);
        setMatchEditor(undefined);
        setHistory(undefined);
        setLoaded(false);
        pendingCreate.current = undefined;
        setUncertain(false);
        setError('当前身份没有此赛事的人员管理权限，请返回首页重新选择赛事。');
      } else
        setError(
          cause instanceof ApiError
            ? cause.status === 409
              ? '数据已发生变化。输入已保留，请核对当前数据后再操作；单场安排请取消编辑、刷新后重新安排。'
              : '操作未完成，请检查填写内容或网络后重试。输入已保留。'
            : cause instanceof Error
              ? cause.message
              : '操作未完成，请重试',
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function refresh() {
    if (!eventId) {
      setError('请先返回首页选择赛事');
      return;
    }
    await run(async (token, valid) => {
      const people = await client.request('listEventStaff', {
        token,
        path: { eventId },
      });
      const next = await client.request('getEventSituation', {
        token,
        path: { eventId },
      });
      if (!valid()) return;
      setRows(people);
      setSituation(next);
      setLoaded(true);
    });
  }
  useDidShow(() => {
    if (!editor && !matchEditor) void refresh();
  });

  function changeProfile(field: keyof Profile, value: string | string[]) {
    if (!editor || busy || uncertain) return;
    setEditor({ ...editor, profile: { ...editor.profile, [field]: value } });
  }
  async function edit(row?: Staff) {
    await run(async (_token, valid) => {
      const id = row?.id ?? (await newKey());
      if (valid()) {
        pendingCreate.current = undefined;
        setUncertain(false);
        setEditor({
          id,
          row,
          profile: row
            ? { ...row.profile, roles: [...row.profile.roles] }
            : blankProfile(),
        });
      }
    });
  }
  async function savePerson() {
    if (!editor) return;
    const problem = profileError(editor.profile);
    if (problem) {
      setError(problem);
      return;
    }
    await run(async (token, valid) => {
      let saved: Staff;
      if (editor.row)
        saved = await client.request('updateEventStaff', {
          token,
          path: { eventId, id: editor.id },
          body: {
            expectedRevision: editor.row.revision,
            active: editor.row.active,
            profile: editor.profile,
          },
        });
      else {
        const body = pendingCreate.current ?? {
          id: editor.id,
          profile: editor.profile,
        };
        pendingCreate.current = body;
        setUncertain(true);
        try {
          saved = await client.request('createEventStaff', {
            token,
            path: { eventId },
            body,
          });
        } catch (cause) {
          if (valid() && cause instanceof ApiError && cause.status === 400) {
            pendingCreate.current = undefined;
            setUncertain(false);
          }
          throw cause;
        }
      }
      if (!valid()) return;
      setRows((old) => [saved, ...old.filter((row) => row.id !== saved.id)]);
      pendingCreate.current = undefined;
      setUncertain(false);
      setEditor(undefined);
      void Taro.showToast({ title: '已保存', icon: 'success' });
    });
  }
  async function toggle(row: Staff) {
    await run(async (token, valid) => {
      const result = await Taro.showModal({
        title: row.active ? '停用人员' : '恢复人员',
        content: `${row.profile.name}：${row.active ? '停用后不能新增安排，已保存的比赛记录保留。' : '恢复后可再次安排比赛。'}`,
      });
      if (!result.confirm || !valid()) return;
      const saved = await client.request('updateEventStaff', {
        token,
        path: { eventId, id: row.id },
        body: {
          expectedRevision: row.revision,
          active: !row.active,
          profile: row.profile,
        },
      });
      if (valid())
        setRows((old) =>
          old.map((item) => (item.id === saved.id ? saved : item)),
        );
    });
  }
  async function showHistory(row: Staff) {
    await run(async (token, valid) => {
      const result = await client.request('getEventStaffHistory', {
        token,
        path: { eventId, id: row.id },
      });
      if (valid()) setHistory({ name: row.profile.name, rows: result });
    });
  }
  async function addPerson(person: Staff) {
    if (!matchEditor) return;
    await run(async (_token, valid) => {
      const id = await newKey();
      const next = addAssignment(matchEditor.rows, person, id);
      if (valid()) setMatchEditor({ ...matchEditor, rows: next });
    });
  }
  async function saveMatch() {
    if (!matchEditor) return;
    if (matchEditor.rows.some((row) => !row.role.trim())) {
      setError('请填写每位人员的本场岗位');
      return;
    }
    await run(async (token, valid) => {
      const confirm = await Taro.showModal({
        title: '确认本场安排',
        content: `${matchEditor.match.homeLabel} vs ${matchEditor.match.awayLabel}\n${matchEditor.rows.map((row) => `${row.name}（${row.role}）`).join('、') || '清空本场工作人员'}`,
      });
      if (!confirm.confirm || !valid()) return;
      const next = await client.request('replaceEventMatchStaff', {
        token,
        path: { eventId, matchId: matchEditor.match.id },
        body: {
          expectedScheduleRevision: matchEditor.scheduleRevision,
          expectedRevision: matchEditor.match.staffRevision,
          staff: matchEditor.rows,
        },
      });
      if (valid()) {
        setSituation(next);
        setMatchEditor(undefined);
        void Taro.showToast({ title: '安排已保存', icon: 'success' });
      }
    });
  }
  async function cancel() {
    if (busy) return;
    const result = await Taro.showModal({
      title: '退出编辑',
      content: uncertain
        ? '新增结果尚未确认，建议先重试原请求。退出后请刷新名单核对，避免重复新增。'
        : '退出会放弃当前未保存的输入。',
    });
    if (!result.confirm) return;
    setEditor(undefined);
    setMatchEditor(undefined);
    setError('');
    pendingCreate.current = undefined;
    setUncertain(false);
    void refresh();
  }
  const filtered = rows.filter(
    (row) =>
      row.active !== showInactive &&
      `${row.profile.name} ${row.profile.roles.join(' ')} ${row.profile.organization}`.includes(
        query.trim(),
      ),
  );
  return (
    <View className="page staff-page">
      <Text className="eyebrow">CAAU · 赛事协作</Text>
      <View className="staff-heading">
        <Text className="title">
          {editor
            ? '人员资料'
            : matchEditor
              ? '单场安排'
              : history
                ? '变更历史'
                : '人员管理'}
        </Text>
      </View>
      <Text className="description">
        {situation?.eventName || '当前赛事'} · 人员信息仅限本赛事
      </Text>
      {error && (
        <View className="staff-error" role="alert">
          {error}
        </View>
      )}
      {busy && <Text className="staff-hint">正在处理，请稍候…</Text>}
      {editor ? (
        <View className="card staff-form">
          <Text className="subtitle">
            {editor.row ? '编辑工作人员' : '新增工作人员'}
          </Text>
          {uncertain && (
            <Text className="staff-hint">
              正在确认新增结果。重试会使用同一请求，不重复创建；确认前暂不可改动内容。
            </Text>
          )}
          <Text>姓名 *</Text>
          <Input
            maxlength={80}
            disabled={busy || uncertain}
            value={editor.profile.name}
            placeholder="填写姓名"
            onInput={(e) => changeProfile('name', e.detail.value)}
          />
          <Text>岗位 *（可多选）</Text>
          <View className="staff-chips">
            {Array.from(new Set([...roles, ...editor.profile.roles])).map(
              (role) => (
                <Button
                  key={role}
                  disabled={busy || uncertain}
                  className={
                    editor.profile.roles.includes(role) ? 'selected' : ''
                  }
                  onClick={() =>
                    changeProfile(
                      'roles',
                      editor.profile.roles.includes(role)
                        ? editor.profile.roles.filter((r) => r !== role)
                        : [...editor.profile.roles, role],
                    )
                  }
                >
                  {role}
                </Button>
              ),
            )}
          </View>
          <Text>联系电话</Text>
          <Input
            maxlength={40}
            disabled={busy || uncertain}
            value={editor.profile.contactPhone}
            placeholder="选填"
            onInput={(e) => changeProfile('contactPhone', e.detail.value)}
          />
          <Text>所属单位</Text>
          <Input
            maxlength={120}
            disabled={busy || uncertain}
            value={editor.profile.organization}
            placeholder="选填"
            onInput={(e) => changeProfile('organization', e.detail.value)}
          />
          <Text>职责说明</Text>
          <Textarea
            maxlength={1000}
            disabled={busy || uncertain}
            value={editor.profile.duties}
            placeholder="选填，例如负责哪个场地"
            onInput={(e) => changeProfile('duties', e.detail.value)}
          />
          <Text>备注</Text>
          <Textarea
            maxlength={1000}
            disabled={busy || uncertain}
            value={editor.profile.notes}
            placeholder="选填"
            onInput={(e) => changeProfile('notes', e.detail.value)}
          />
          <Button
            className="staff-primary"
            disabled={busy}
            onClick={() => void savePerson()}
          >
            {uncertain ? '重试并确认结果' : '保存人员'}
          </Button>
          <Button disabled={busy} onClick={() => void cancel()}>
            取消编辑
          </Button>
        </View>
      ) : matchEditor ? (
        <View>
          <View className="card">
            <Text className="subtitle">
              {matchEditor.match.homeLabel} vs {matchEditor.match.awayLabel}
            </Text>
            <Text className="staff-hint">
              {timeLabel(matchEditor.match.startAt)} · {matchEditor.match.venue}
            </Text>
            <Text className="staff-hint">
              保存后保留本场资料快照；不随人员档案修改而变化。
            </Text>
          </View>
          {matchEditor.rows.map((person) => (
            <View className="card staff-form" key={person.id}>
              <Text className="subtitle">{person.name}</Text>
              <Text className="staff-hint">
                {person.organization || '未填单位'} ·{' '}
                {person.contactPhone || '未填电话'}
              </Text>
              {person.sourceStaffId &&
                !rows.some(
                  (row) =>
                    row.id === person.sourceStaffId &&
                    row.active &&
                    row.revision === person.sourceStaffRevision,
                ) && (
                  <Text className="staff-hint">
                    来源人员已变更或停用。历史快照仍保留；本次保存前请移出并重新选择有效人员。
                  </Text>
                )}
              <Text>本场岗位 *</Text>
              <Input
                disabled={busy}
                maxlength={80}
                value={person.role}
                onInput={(e) =>
                  setMatchEditor({
                    ...matchEditor,
                    rows: matchEditor.rows.map((r) =>
                      r.id === person.id ? { ...r, role: e.detail.value } : r,
                    ),
                  })
                }
              />
              <Text>本场备注</Text>
              <Textarea
                disabled={busy}
                maxlength={1000}
                value={person.notes}
                onInput={(e) =>
                  setMatchEditor({
                    ...matchEditor,
                    rows: matchEditor.rows.map((r) =>
                      r.id === person.id ? { ...r, notes: e.detail.value } : r,
                    ),
                  })
                }
              />
              <Button
                disabled={busy}
                onClick={() =>
                  setMatchEditor({
                    ...matchEditor,
                    rows: matchEditor.rows.filter((r) => r.id !== person.id),
                  })
                }
              >
                移出本场
              </Button>
            </View>
          ))}
          <View className="card">
            <Text className="subtitle">从赛事名单添加</Text>
            <Input
              className="staff-search"
              value={query}
              placeholder="搜索姓名、岗位、单位"
              onInput={(e) => setQuery(e.detail.value)}
            />
            {rows
              .filter(
                (r) =>
                  r.active &&
                  !matchEditor.rows.some((p) => p.sourceStaffId === r.id) &&
                  `${r.profile.name} ${r.profile.roles.join(' ')} ${r.profile.organization}`.includes(
                    query.trim(),
                  ),
              )
              .map((person) => (
                <Button
                  className="staff-pick"
                  key={person.id}
                  disabled={busy || matchEditor.rows.length >= 30}
                  onClick={() => void addPerson(person)}
                >
                  {person.profile.name} · {person.profile.roles.join(' / ')} ＋
                </Button>
              ))}
            {!rows.some((r) => r.active) && (
              <Text className="staff-hint">
                暂无可用人员，请先在人员名单中新增。
              </Text>
            )}
          </View>
          <Button
            className="staff-primary"
            disabled={busy}
            onClick={() => void saveMatch()}
          >
            保存本场安排（{matchEditor.rows.length} 人）
          </Button>
          <Button disabled={busy} onClick={() => void cancel()}>
            取消编辑
          </Button>
        </View>
      ) : history ? (
        <View>
          <Button onClick={() => setHistory(undefined)}>返回人员名单</Button>
          {history.rows.map((item) => (
            <View className="card" key={item.revision}>
              <Text className="subtitle">
                V{item.revision} · {item.profile.name} ·{' '}
                {item.active ? '启用' : '停用'}
              </Text>
              <Text className="staff-hint">
                {item.actorName} · {item.createdAt}
              </Text>
              <Text className="staff-line">
                {item.profile.roles.join(' / ')}
              </Text>
              <Text className="staff-line">
                {item.profile.organization || '未填单位'} ·{' '}
                {item.profile.contactPhone || '未填电话'}
              </Text>
              <Text className="staff-line">
                职责：{item.profile.duties || '未填写'}
              </Text>
              <Text className="staff-line">
                备注：{item.profile.notes || '未填写'}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <View>
          <View className="staff-tabs">
            <Button
              className={tab === 'people' ? 'selected' : ''}
              onClick={() => {
                setTab('people');
                setQuery('');
              }}
            >
              人员名单
            </Button>
            <Button
              className={tab === 'matches' ? 'selected' : ''}
              onClick={() => {
                setTab('matches');
                setQuery('');
              }}
            >
              单场安排
            </Button>
          </View>
          <View className="staff-actions">
            <Button disabled={busy} onClick={() => void refresh()}>
              刷新
            </Button>
            {tab === 'people' && (
              <Button
                className="staff-primary"
                disabled={busy || !loaded}
                onClick={() => void edit()}
              >
                新增人员
              </Button>
            )}
          </View>
          {tab === 'people' ? (
            <View>
              <Input
                className="staff-search"
                value={query}
                placeholder="搜索姓名、岗位、单位"
                onInput={(e) => setQuery(e.detail.value)}
              />
              <View className="staff-tabs">
                <Button
                  className={!showInactive ? 'selected' : ''}
                  onClick={() => setShowInactive(false)}
                >
                  在用人员
                </Button>
                <Button
                  className={showInactive ? 'selected' : ''}
                  onClick={() => setShowInactive(true)}
                >
                  已停用
                </Button>
              </View>
              {filtered.map((row) => (
                <View className="card" key={row.id}>
                  <View className="staff-heading">
                    <Text className="subtitle">{row.profile.name}</Text>
                    <Text className="staff-badge">
                      {row.active ? '在用' : '停用'}
                    </Text>
                  </View>
                  <Text className="staff-line">
                    {row.profile.roles.join(' / ')}
                  </Text>
                  <Text className="staff-hint">
                    {row.profile.organization || '未填单位'} ·{' '}
                    {row.profile.contactPhone || '未填电话'}
                  </Text>
                  <Text className="staff-line">{row.profile.duties}</Text>
                  <View className="staff-actions">
                    <Button disabled={busy} onClick={() => void edit(row)}>
                      编辑
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() => void showHistory(row)}
                    >
                      历史
                    </Button>
                    <Button disabled={busy} onClick={() => void toggle(row)}>
                      {row.active ? '停用' : '恢复'}
                    </Button>
                  </View>
                </View>
              ))}
              {loaded && !filtered.length && (
                <View className="card staff-empty">
                  {query
                    ? '未找到匹配人员'
                    : showInactive
                      ? '暂无停用人员'
                      : '尚未添加人员，点击“新增人员”开始'}
                </View>
              )}
            </View>
          ) : (
            <View>
              <Text className="staff-hint">
                仅安排当前已发布赛程的工作人员。
              </Text>
              {situation?.exists && situation.scheduleStatus === 'PUBLISHED'
                ? situation.matches.map((match) => (
                    <View className="card" key={match.id}>
                      <Text className="staff-hint">
                        第 {match.round} 轮 · {match.venue}
                      </Text>
                      <Text className="subtitle">
                        {match.homeLabel} vs {match.awayLabel}
                      </Text>
                      <Text className="staff-line">
                        {timeLabel(match.startAt)}
                      </Text>
                      <Text className="staff-hint">
                        {match.staff.length
                          ? match.staff
                              .map(
                                (person) => `${person.name}（${person.role}）`,
                              )
                              .join('、')
                          : '尚未安排工作人员'}
                      </Text>
                      <Button
                        disabled={busy}
                        onClick={() => {
                          setError('');
                          setQuery('');
                          setMatchEditor({
                            match,
                            scheduleRevision: situation.scheduleRevision,
                            rows: match.staff.map((p) => ({ ...p })),
                          });
                        }}
                      >
                        安排人员
                      </Button>
                    </View>
                  ))
                : loaded && (
                    <View className="card staff-empty">
                      暂无已发布赛程，请先在 Web 端发布赛程。
                    </View>
                  )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
