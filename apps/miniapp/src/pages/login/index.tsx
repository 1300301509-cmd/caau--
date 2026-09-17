import { useState } from 'react';
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Image,
  Label,
  Text,
  View,
} from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import logo from '../../assets/caau-logo.jpg';
import { session } from '../../features/materials/session';
import './index.css';

function localEntryAvailable() {
  try {
    return Taro.getAccountInfoSync().miniProgram.envVersion === 'develop';
  } catch {
    return false;
  }
}

export default function Login() {
  const [agreed, setAgreed] = useState(false);
  const [notice, setNotice] = useState('');
  const [showLocalEntry] = useState(localEntryAvailable);

  useDidShow(() => {
    if (session.token) {
      void Taro.reLaunch({ url: '/pages/home/index' });
    }
  });

  function startWechatLogin() {
    if (!agreed) {
      setNotice('请先阅读并同意用户服务协议与隐私政策');
      return;
    }

    setNotice('微信登录服务正在接入，当前不会创建或模拟正式会话');
  }

  return (
    <View className="login-page">
      <View className="login-brand" ariaLabel="CAAU 中国学生体育艺术联合会">
        <View className="login-logo-frame">
          <Image
            className="login-logo"
            src={logo}
            mode="aspectFit"
            ariaLabel="CAAU 标志"
          />
        </View>
        <Text className="login-brand-name">CAAU</Text>
        <Text className="login-brand-subtitle">赛事协作平台</Text>
      </View>

      <View className="login-hero">
        <Text className="login-kicker">承办工作台</Text>
        <Text className="login-title">把热爱，有序展开。</Text>
        <Text className="login-description">
          登录后查看承办申请、赛事任务与材料审核进度
        </Text>
      </View>

      <View className="login-panel">
        <View className="login-panel-heading">
          <Text className="login-panel-title">欢迎回来</Text>
          <Text className="login-panel-note">使用已绑定的微信身份登录</Text>
        </View>

        <Button
          className="wechat-login-button"
          ariaLabel="微信快捷登录"
          onClick={startWechatLogin}
        >
          <View className="wechat-mark" />
          <Text>微信快捷登录</Text>
        </Button>

        <CheckboxGroup
          className="login-consent"
          onChange={(event) => {
            const nextAgreed = event.detail.value.includes('agreed');
            setAgreed(nextAgreed);
            if (nextAgreed) setNotice('');
          }}
        >
          <Label className="login-consent-label">
            <Checkbox
              className="login-checkbox"
              value="agreed"
              checked={agreed}
              color="#23695b"
            />
            <Text>我已阅读并同意《用户服务协议》与《隐私政策》</Text>
          </Label>
        </CheckboxGroup>

        {notice && (
          <View className="login-notice" role="alert">
            <Text>{notice}</Text>
          </View>
        )}

        {showLocalEntry && (
          <Button
            className="local-login-link"
            onClick={() => void Taro.switchTab({ url: '/pages/profile/index' })}
          >
            本地联调入口（非微信登录）
          </Button>
        )}
      </View>

      <View className="login-assurance">
        <View className="login-assurance-icon">
          <View className="login-assurance-check" />
        </View>
        <Text>身份与权限由 CAAU 统一管理</Text>
      </View>
    </View>
  );
}
