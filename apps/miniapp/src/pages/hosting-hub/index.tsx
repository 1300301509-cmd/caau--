import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { session } from '../../features/materials/session';

const entries = [
  {
    title: '申请比赛',
    note: '填写地点、日期与联系方式',
    page: 'hosting',
  },
  {
    title: '材料提交',
    note: '申请获批后，提交七项必填材料',
    page: 'event-materials',
  },
  {
    title: '办赛进度',
    note: '跟踪申请、材料、合同与批准办赛',
    page: 'hosting-progress',
  },
];
export default function HostingHub() {
  useDidShow(() => {
    if (!session.token) void Taro.reLaunch({ url: '/pages/login/index' });
  });
  return (
    <View className="page">
      <Text className="eyebrow">CAAU · 承办方</Text>
      <Text className="title">我要办赛</Text>
      <Text className="description">
        从一份申请开始，让每一步筹备都有进展。
      </Text>
      <View className="submodule-grid">
        {entries.map((entry, index) => (
          <Button
            key={entry.page}
            className="submodule-card"
            onClick={() =>
              void Taro.navigateTo({ url: `/pages/${entry.page}/index` })
            }
          >
            <Text className={`submodule-index ${index === 1 ? 'mint' : ''}`}>
              0{index + 1}
            </Text>
            <View className="submodule-copy">
              <Text className="submodule-title">{entry.title}</Text>
              <Text className="submodule-description">{entry.note}</Text>
            </View>
          </Button>
        ))}
      </View>
      <View className="card">
        <Text className="subtitle">办赛流程</Text>
        <Text className="description">
          申请审核 → 材料审核 → 合同签订 → 批准办赛
        </Text>
        <Text className="description">
          合同在线下签订，签好后由总部工作人员确认推进。
        </Text>
      </View>
    </View>
  );
}
