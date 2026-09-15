import { useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { session } from '../../features/materials/session';

export default function Home() {
  const [identity, setIdentity] = useState(session.identity?.displayName ?? '');
  useDidShow(() => setIdentity(session.identity?.displayName ?? ''));
  return (
    <View className="page home-page">
      <View className="home-heading">
        <Text className="eyebrow">CAAU · 承办方</Text>
        <Text className="title">材料提交</Text>
        <Text className="description">
          选择赛事和任务，新增或继续办理办赛材料。
        </Text>
      </View>
      <View className="home-primary-card">
        <Text className="home-primary-title">材料提交</Text>
        <Text className="description">
          查看当前有权办理的赛事、任务、草稿及审核进度。
        </Text>
        <Button
          type="primary"
          onClick={() =>
            void Taro.navigateTo({ url: '/pages/materials/index' })
          }
        >
          进入材料提交
        </Button>
      </View>
      <View className="home-secondary">
        <Text className="description">
          {identity ? `当前测试身份：${identity}` : '当前尚未载入测试身份'}
        </Text>
        <Button
          className="text-button"
          onClick={() => void Taro.navigateTo({ url: '/pages/profile/index' })}
        >
          本地测试身份
        </Button>
      </View>
    </View>
  );
}
