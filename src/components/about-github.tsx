/** 关于本项目页脚: GitHub 图标 + 文字, 点击打开仓库主页 */
import { Pressable, StyleSheet, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Linking } from 'react-native';

import { Colors } from '@/constants/theme';

export const REPO_HOME = 'https://github.com/dawgnation1986/class-schedule';

export function AboutGithub({
  colors,
}: {
  colors: (typeof Colors)[keyof typeof Colors];
}) {
  return (
    <Pressable
      onPress={() => void Linking.openURL(REPO_HOME)}
      style={[styles.footer, { backgroundColor: colors.backgroundElement }]}>
      <Ionicons name="logo-github" size={18} color={colors.text} />
      <Text style={{ color: colors.textSecondary, fontSize: 13 }}>关于本项目</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 11 }} numberOfLines={1}>
        dawgnation1986/class-schedule
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 20,
  },
});
