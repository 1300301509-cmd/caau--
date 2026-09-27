import { useEffect, useState, type ComponentType } from 'react';
import { Button, Image, Text, View } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { session, subscribeSession } from '../materials/session';
import assistantIcon from '../../assets/caau-assistant.svg';
import './agent.css';

// A WeChat page owns its own native tree. Mount the same lightweight entry
// beside each authorized page; the conversation lives on one dedicated route.
export function withAgentEntry(Page: ComponentType) {
  return function AgentPageHost() {
    const route = useRouter();
    const [authorized, setAuthorized] = useState(!!session.token);
    useEffect(() => {
      const unsubscribe = subscribeSession(() =>
        setAuthorized(!!session.token),
      );
      return () => {
        unsubscribe();
      };
    }, []);
    const pageEventId = route.params.event ?? '';
    return (
      <View className="agent-page-host">
        <Page />
        {authorized && (
          <Button
            className="agent-floating-entry"
            ariaLabel="打开 CAAU 智能助手"
            onClick={() =>
              void Taro.navigateTo({
                url: `/pages/agent/index${pageEventId ? `?event=${encodeURIComponent(pageEventId)}` : ''}`,
              })
            }
          >
            <View aria-hidden="true" className="agent-entry-mark">
              <Image src={assistantIcon} mode="aspectFit" />
            </View>
            <Text className="agent-visually-hidden">打开 CAAU 智能助手</Text>
          </Button>
        )}
      </View>
    );
  };
}
