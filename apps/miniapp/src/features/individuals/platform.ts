export const individualExtensions = ['txt', 'pdf', 'png', 'jpg', 'jpeg'];
export const individualMaxBytes = 10 * 1024 * 1024;

export function safeLocalName(value: string) {
  const reserved = '\\/:*?"<>|';
  const name = [...value]
    .map((character) =>
      character.charCodeAt(0) < 32 || reserved.includes(character)
        ? '_'
        : character,
    )
    .join('')
    .trim();
  return (name || '材料附件').slice(-120);
}

export function isAllowedIndividualFile(value: string) {
  const extension = value.split('.').at(-1)?.toLowerCase() ?? '';
  return individualExtensions.includes(extension);
}

export function isPreviewImage(value: string) {
  return /\.(png|jpe?g)$/i.test(value);
}

export function materialStateLabel(state: string) {
  return (
    {
      DRAFT: '待提交',
      PENDING_REVIEW: '待审核',
      IN_REVIEW: '审核中',
      RETURNED: '退回修改',
      APPROVED: '审核通过',
    }[state] ?? state
  );
}

export function materialActionLabel(action: string) {
  return (
    {
      CREATE: '新增材料',
      SAVE: '保存草稿',
      SUBMIT: '正式提交',
      START: '开始审核',
      APPROVE: '审核通过',
      RETURN: '退回修改',
    }[action] ?? action
  );
}
