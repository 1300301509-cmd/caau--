import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { session } from '../../features/materials/session';

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
        <Button
          className="submodule-card"
          disabled={!eventId}
          onClick={() =>
            void Taro.navigateTo({
              url: `/pages/staff/index?event=${encodeURIComponent(eventId)}`,
            })
          }
        >
          <Text className="submodule-index mint">01</Text>
          <View className="submodule-copy">
            <Text className="submodule-title">人员管理</Text>
            <Text className="submodule-description">
              维护工作人员，安排单场岗位
            </Text>
          </View>
        </Button>
      </View>
    </View>
  );
}
