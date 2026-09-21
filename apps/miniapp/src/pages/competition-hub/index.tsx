import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { session } from '../../features/materials/session';

const entries = [
  {
    page: 'competition-teams',
    title: '球队管理',
    note: '维护球队档案与本赛事球队',
  },
  {
    page: 'competition-schedule',
    title: '赛程编排',
    note: '按周查看、生成与调整赛程',
  },
  {
    page: 'competition-supplies',
    title: '物料管理',
    note: '登记数量、照片与准备进度',
  },
  {
    page: 'competition-situation',
    title: '赛事情况',
    note: '查看场次与参赛人员名单',
  },
  { page: 'staff', title: '人员管理', note: '维护工作人员，安排单场岗位' },
];

export default function CompetitionHub() {
  const eventId = useRouter().params.event ?? '';
  useDidShow(() => {
    if (!session.token) void Taro.reLaunch({ url: '/pages/login/index' });
  });
  return (
    <View className="page">
      <Text className="eyebrow">CAAU · 承办方</Text>
      <Text className="title">我的比赛</Text>
      <Text className="description">
        {eventId
          ? '管理当前赛事的执行工作。切换比赛请返回首页选择赛事。'
          : '请先返回首页选择赛事。'}
      </Text>
      <View className="submodule-grid">
        {entries.map((entry, index) => (
          <Button
            key={entry.page}
            className="submodule-card"
            disabled={!eventId}
            onClick={() =>
              void Taro.navigateTo({
                url: `/pages/${entry.page}/index?event=${encodeURIComponent(eventId)}`,
              })
            }
          >
            <Text className="submodule-index mint">0{index + 1}</Text>
            <View className="submodule-copy">
              <Text className="submodule-title">{entry.title}</Text>
              <Text className="submodule-description">{entry.note}</Text>
            </View>
          </Button>
        ))}
      </View>
    </View>
  );
}
