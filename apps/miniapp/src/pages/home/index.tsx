import { useState } from 'react';
import { Button, Image, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { session } from '../../features/materials/session';
import banner from '../../assets/event-banner-placeholder.png';
import approvalIcon from '../../assets/material-approval.png';

const materialApproval = 'material-approval';

export default function Home() {
  const [identity, setIdentity] = useState(session.identity?.displayName ?? '');
  const [selected, setSelected] = useState(materialApproval);
  useDidShow(() => {
    if (!session.token) {
      void Taro.redirectTo({ url: '/pages/profile/index' });
      return;
    }
    setIdentity(session.identity?.displayName ?? '');
  });
  if (!session.token) return <View className="page" />;
  return (
    <View className="page home-page">
      <Image
        className="home-banner"
        src={banner}
        mode="aspectFill"
        ariaLabel="可替换的赛事主题占位横幅"
      />

      <View className="home-section">
        <Text className="home-section-title">业务板块</Text>
        <View className="business-grid">
          <Button
            className={`business-tile ${selected === materialApproval ? 'selected' : ''}`}
            ariaLabel="材料审批，当前选中"
            onClick={() => setSelected(materialApproval)}
          >
            <Image
              className="business-icon"
              src={approvalIcon}
              mode="aspectFit"
              ariaLabel=""
            />
            <Text>材料审批</Text>
          </Button>
        </View>
      </View>

      {selected === materialApproval && (
        <View className="home-section home-submodules">
          <Text className="home-section-title">材料审批</Text>
          <Text className="description">选择需要办理的子模块</Text>
          <View className="submodule-grid">
            <Button
              className="submodule-card"
              onClick={() =>
                void Taro.navigateTo({ url: '/pages/materials/index' })
              }
            >
              <Text className="submodule-title">材料提交</Text>
              <Text className="submodule-description">
                选择赛事和任务，新增或继续提交材料
              </Text>
            </Button>
            <Button
              className="submodule-card"
              onClick={() =>
                void Taro.navigateTo({ url: '/pages/progress/index' })
              }
            >
              <Text className="submodule-title">审核进度</Text>
              <Text className="submodule-description">
                查看材料状态、退回原因与版本历史
              </Text>
            </Button>
          </View>
        </View>
      )}

      <View className="home-account">
        <Text className="home-account-name">{identity}</Text>
        <Button
          className="text-button compact-button"
          onClick={() => void Taro.navigateTo({ url: '/pages/profile/index' })}
        >
          切换测试身份
        </Button>
      </View>
    </View>
  );
}
