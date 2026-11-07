import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { usePageBackground } from '@/lib/background';
import { useUiMode } from '@/hooks/use-ui-mode';
import GlassTabs from '@/components/glass-tabs';

export default function AppTabs() {
  const uiMode = useUiMode();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  // 液态玻璃模式: 自定义玻璃标签栏(水滴形变指示器)
  if (uiMode === 'glass') return <GlassTabs />;

  return (
    <NativeTabs
      backgroundColor={usePageBackground(colors)}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="home" contentStyle={{ backgroundColor: 'transparent' }}>
        <NativeTabs.Trigger.Label>主站</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="timetable" contentStyle={{ backgroundColor: 'transparent' }}>
        <NativeTabs.Trigger.Label>课表</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile" contentStyle={{ backgroundColor: 'transparent' }}>
        <NativeTabs.Trigger.Label>我的</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/person.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
