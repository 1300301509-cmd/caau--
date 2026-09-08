import { useState } from 'react';
import { Button, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { getHealth } from '../../features/health/api';

export default function Index() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('尚未检查后端连接');

  async function checkConnection() {
    if (loading) return;
    setLoading(true);
    setMessage('正在请求后端…');
    try {
      await getHealth(__API_BASE_URL__, (options) =>
        Taro.request<unknown>(options),
      );
      setMessage('已连接 caau-api，服务状态正常');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : '连接失败，请检查 API 地址、网络和开发者工具域名设置',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="page">
      <Text className="title">CAAU 工程连接检查</Text>
      <Text className="description">
        仅验证 API 存活，不代表业务功能、数据库或真机验收通过。
      </Text>
      <Text className="endpoint">{__API_BASE_URL__}/api/v1/health</Text>
      <Button
        type="primary"
        loading={loading}
        disabled={loading}
        onClick={() => void checkConnection()}
      >
        检查后端连接
      </Button>
      <Text className="result">{message}</Text>
    </View>
  );
}
