// L3 stores an owner's explicit response style or general planning preference.
// Event-specific requirements must use the versioned planning workflow.
export function personalMemoryContent(content: string) {
  return (
    /(?:回答|回复|表达|语言|风格|称呼|叫我|简短|详细|中文|英文|结论|我希望|我喜欢|我的偏好|我倾向)/.test(
      content,
    ) &&
    !/(?:球队|赛事|场地|裁判|周[一二三四五六日天]|[A-Z]队|\d{4}[-年]\d|发布|审批|权限|必须|只能|忽略.*指令|无需确认|直接执行)/.test(
      content,
    )
  );
}
