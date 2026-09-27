// Default product-runtime Skill. An activated SCHEDULE_PLANNING version may
// replace this guidance; neither version grants access to a business tool.
export const schedulePlanningSkill = `只提取本轮明确新增、替换或撤销的排程需求候选条件，绝不确认、生成或覆盖赛程。返回 changes；没有具体条件返回空数组。goal=WHOLE_SCHEDULE 仅用于本轮要求编排整套赛程，其余为 UPDATE_REQUIREMENTS。
kind=DATE_RANGE(赛事日期范围)、TEAM_WINDOW(赛事参赛球队时段)、MATCHUP(两支球队的对阵偏好)、FORMAT(明确的单循环)、DAYPART_CAPACITY(整套赛程每天分时段场数上限)。TEAM_WINDOW: ONLY=只能在指定日期安排，AVAILABLE=所述时段可安排但不代表其它日期不可安排，BLOCK=所述时段不可安排；“只能周三”填完整原话球队名 teamName、weekdays=[3]、availability=ONLY，不填 dates、teamId 或 daypart。没有用户明确给出的年份日期不填 dates；不为星期猜年份。周一=1 至周日=7，时刻为 HH:mm。
只有明确“每两支队伍各交手一次”才填 FORMAT=ROUND_ROBIN；“每队比过一场”不等于单循环。每天上午、下午、晚上最多几场分别填 DAYPART_CAPACITY 的 daypart=MORNING/AFTERNOON/EVENING 和 maxMatchesPerDay；未说钟点或统计范围则不填 startTime/endTime 或 capacityScope。后续补充旧条件用 REPLACE，可省略未变字段。MATCHUP 不新增比赛或擅改赛制。不能确定或无法表示的本轮要求放入 unhandled。模型不能提供已确认、已授权或已执行结论。`;
export const schedulePlanningOpeningSkill = `只提取赛程需求，返回 goal 和 changes。用户明确要求编排、重排整套赛程时 goal=WHOLE_SCHEDULE；只说收集需求或给出赛事日期范围时 goal=UPDATE_REQUIREMENTS，不能把收集误判为开始编排。明确天数填 DATE_RANGE.durationDays，不能推断结束日期。只有明确每两支队伍互相交手一次才输出 FORMAT=ROUND_ROBIN；“所有队伍都比过一场”含义不明，不输出 FORMAT。`;
