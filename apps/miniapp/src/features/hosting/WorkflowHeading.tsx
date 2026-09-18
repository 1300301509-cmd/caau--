import { Image, Text, View } from '@tarojs/components';
import logo from '../../assets/caau-logo.jpg';

export function WorkflowHeading({
  title,
  note,
  tone = 'apricot',
}: {
  title: string;
  note: string;
  tone?: 'apricot' | 'mint' | 'blue';
}) {
  return (
    <View className={`workflow-heading ${tone}`}>
      <View className="workflow-brand">
        <Image src={logo} mode="aspectFit" className="workflow-logo" />
        <Text>CAAU · 赛事协作</Text>
      </View>
      <Text className="workflow-title">{title}</Text>
      <Text className="workflow-note">{note}</Text>
    </View>
  );
}

export function WorkflowSection({
  number,
  title,
}: {
  number: string;
  title: string;
}) {
  return (
    <View className="workflow-section">
      <Text className="workflow-section-number">{number}</Text>
      <Text>{title}</Text>
    </View>
  );
}

export function WorkflowEmptyIcon() {
  return (
    <View className="workflow-empty-icon">
      <View className="home-module-document">
        <View className="home-module-line" />
        <View className="home-module-line short" />
        <View className="home-module-check" />
      </View>
    </View>
  );
}
