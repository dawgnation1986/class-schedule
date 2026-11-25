/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    primary: '#2563eb',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    primary: '#2563eb',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** 调色板结构: 原版/墨夜主题通用的颜色形状(值随主题变化) */
export type Palette = {
  text: string;
  background: string;
  backgroundElement: string;
  backgroundSelected: string;
  textSecondary: string;
  /** 控件主色(按钮/链接/高亮), 可由用户自定义 */
  primary: string;
};

/**
 * 墨夜主题配色: iOS 26 液态玻璃风格 —— 深空底色 + 半透明玻璃面板 + 高对比文字。
 * 控件在墨夜模式下由 night-kit 重绘; 玻璃效果可在界面设置里关闭(兼容模式)。
 */
export const NightColors: Palette = {
  text: '#F3F6FF',
  background: '#070A12',
  backgroundElement: 'rgba(255,255,255,0.10)',
  backgroundSelected: 'rgba(255,255,255,0.17)',
  textSecondary: '#A7B2CC',
  primary: '#4C8DFF',
};

/** 护眼米黄预设: 暖米色纸感底色, 低刺激适合长时间阅读 */
export const SepiaColors: Palette = {
  text: '#3E3423',
  background: '#F7F1E3',
  backgroundElement: '#EFE7D3',
  backgroundSelected: '#E3D9BF',
  textSecondary: '#857A61',
  primary: '#2563eb',
};

/** 淡雅蓝预设: 浅蓝清爽底色, 蓝色点缀 */
export const AzureColors: Palette = {
  text: '#1B3A5C',
  background: '#F3F8FD',
  backgroundElement: '#E4EEF8',
  backgroundSelected: '#CFE0F0',
  textSecondary: '#5B7B9E',
  primary: '#2563eb',
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
