import { useState } from 'react';
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Image,
  Input,
  Label,
  Text,
  View,
} from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { ApiError } from '@caau/api-client';
import logo from '../../assets/caau-logo.jpg';
import {
  client,
  importSession,
  session,
} from '../../features/materials/session';
import './index.css';

function localEntryAvailable() {
  try {
    return Taro.getAccountInfoSync().miniProgram.envVersion === 'develop';
  } catch {
    return false;
  }
}

async function wechatCode() {
  const result = await Taro.login({ timeout: 10000 });
  if (!result.code) throw new Error('WeChat login code unavailable');
  return result.code;
}

export default function Login() {
  const [agreed, setAgreed] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [bindingRequired, setBindingRequired] = useState(false);
  const [bindingToken, setBindingToken] = useState('');
  const [showLocalEntry] = useState(localEntryAvailable);

  useDidShow(() => {
    if (session.token) {
      void Taro.reLaunch({ url: '/pages/home/index' });
    }
  });

  async function acceptToken(token: string) {
    await importSession(token);
    await Taro.reLaunch({ url: '/pages/home/index' });
  }

  async function startWechatLogin() {
    if (!agreed) {
      setNotice('请先阅读并同意用户服务协议与隐私政策');
      return;
    }
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      const result = await client.request('wechatMiniappLogin', {
        body: { code: await wechatCode() },
      });
      await acceptToken(result.token);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setBindingRequired(true);
        setNotice('当前微信尚未绑定承办方账号，请使用网页端生成的绑定凭证。');
      } else if (error instanceof ApiError && error.status === 503) {
        setNotice('当前环境尚未配置微信登录，请联系管理员。');
      } else {
        setNotice('微信登录暂时失败，请检查网络后重试。');
      }
    } finally {
      setBusy(false);
    }
  }

  async function bindWechat() {
    if (!/^[A-Za-z0-9_-]{43}$/.test(bindingToken.trim()) || busy) {
      setNotice('请输入网页端生成的完整绑定凭证。');
      return;
    }
    setBusy(true);
    setNotice('');
    try {
      const result = await client.request('bindWechatMiniapp', {
        body: {
          code: await wechatCode(),
          bindingToken: bindingToken.trim(),
        },
      });
      await acceptToken(result.token);
    } catch (error) {
      setNotice(
        error instanceof ApiError && [401, 409].includes(error.status)
          ? '绑定凭证已失效、已使用或该微信已绑定，请在网页端重新生成。'
          : error instanceof ApiError && error.status === 503
            ? '当前环境尚未配置微信登录，请联系管理员。'
            : '绑定暂时失败，请检查网络后重试。',
      );
    } finally {
      setBusy(false);
    }
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
          loading={busy && !bindingRequired}
          disabled={busy}
          onClick={() => void startWechatLogin()}
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

        {bindingRequired && (
          <View className="wechat-binding">
            <Text className="wechat-binding-title">首次绑定</Text>
            <Text className="wechat-binding-note">
              在承办方网页端的账号安全页生成一次性凭证，然后粘贴到这里。
            </Text>
            <Input
              className="wechat-binding-input"
              ariaLabel="一次性微信绑定凭证"
              maxlength={43}
              value={bindingToken}
              disabled={busy}
              onInput={(event) => setBindingToken(event.detail.value)}
            />
            <Button
              className="wechat-bind-button"
              loading={busy}
              disabled={busy || bindingToken.trim().length !== 43}
              onClick={() => void bindWechat()}
            >
              绑定并登录
            </Button>
          </View>
        )}

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
        <Text>同一账号 · Web 与小程序数据同步</Text>
      </View>
    </View>
  );
}
