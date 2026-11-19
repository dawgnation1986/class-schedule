/** 自定义应用背景: 选图(优先存到 /Class/背景图, 无权限时退回 documentDirectory) + 透明度, AsyncStorage 持久化 */
import { useEffect, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { type Palette } from '@/constants/theme';
import { DIR_BG, classCopy, hasClassAccess, toDisplayUri } from '@/lib/class-folder';

export type BgSetting = { uri: string | null; opacity: number; ctrl?: boolean };

const KEY = 'app-background-v1';
const DEFAULT_BG: BgSetting = { uri: null, opacity: 0.25, ctrl: false };

let cache: BgSetting = DEFAULT_BG;
const subs = new Set<() => void>();

function notify() {
  subs.forEach((cb) => cb());
}

async function load(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) cache = { ...DEFAULT_BG, ...(JSON.parse(raw) as BgSetting) };
  } catch {
    // 保持默认
  }
  notify();
}

/** 启动预热(_layout 调用): 读取设置并把旧私有目录里的背景图迁移到 /Class/背景图 */
export async function primeBackground(): Promise<void> {
  await load();
  const ok = await hasClassAccess();
  if (!ok) return;
  if (cache.uri && cache.uri.startsWith(FileSystem.documentDirectory ?? '')) {
    const ext = cache.uri.split('.').pop()?.toLowerCase() || 'jpg';
    const dest = `${DIR_BG}custom-bg.${ext}`;
    try {
      await classCopy(cache.uri, dest);
      await persist({ ...cache, uri: dest });
    } catch {
      // 迁移失败保留原路径
    }
  }
}

export function getBackground(): BgSetting {
  return cache;
}

export function subscribeBackground(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

async function persist(next: BgSetting): Promise<void> {
  cache = next;
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  notify();
}

/** 选择图片并复制到 /Class/背景图(无权限时退回 documentDirectory), 替换旧背景文件 */
export async function pickBackground(): Promise<void> {
  const r = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
  if (r.canceled) return;
  const asset = r.assets?.[0];
  if (!asset) return;
  const ext = asset.name?.split('.').pop()?.toLowerCase() || 'jpg';
  let dest: string;
  if (await hasClassAccess()) {
    // 存到 /Class/背景图(手机文件管理器可见); uri 为虚拟路径, 展示时经 toDisplayUri 解析
    dest = `${DIR_BG}custom-bg.${ext}`;
    await classCopy(asset.uri, dest);
  } else {
    dest = `${FileSystem.documentDirectory}custom-bg.${ext}`;
    await FileSystem.copyAsync({ from: asset.uri, to: dest });
  }
  await persist({ ...cache, uri: dest });
}

/** 整体写入背景设置(预设应用/导入主题用) */
export async function setBgSetting(next: BgSetting): Promise<void> {
  await persist(next);
}

export async function clearBackground(): Promise<void> {
  await persist({ ...cache, uri: null });
}

export async function setBackgroundOpacity(opacity: number): Promise<void> {
  await persist({ ...cache, opacity });
}

/** 控件全透明开关: 开启后按钮/卡片/表格只显示文字 + 1px 外轮廓 */
export async function setControlsTransparent(ctrl: boolean): Promise<void> {
  await persist({ ...cache, ctrl });
}

/** 读取完整背景设置(订阅变化) */
export function useBgSetting(): BgSetting {
  const [bg, setBg] = useState<BgSetting>(() => cache);
  useEffect(() => subscribeBackground(() => setBg({ ...cache })), []);
  return bg;
}

/** 页面背景色: 有自定义背景时页面透明露出底层图, 否则用主题色 */
export function usePageBackground(colors: Palette): string {
  const [bg, setBg] = useState<BgSetting>(() => cache);
  useEffect(() => subscribeBackground(() => setBg({ ...cache })), []);
  return bg.uri ? 'transparent' : colors.background;
}

/** 背景持久化 uri(class:// 虚拟路径或 file://)→ Image 可展示的真实 uri */
function useDisplayUri(rawUri: string | null): string | null {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!rawUri) {
      setUri(null);
      return;
    }
    void toDisplayUri(rawUri).then((u) => {
      if (alive) setUri(u);
    });
    return () => {
      alive = false;
    };
  }, [rawUri]);
  return uri;
}

/** 全局背景图层(渲染在根布局最底层, 标签栏等透明区域可见) */
export function BackgroundLayer() {
  const [bg, setBg] = useState<BgSetting>(() => cache);
  useEffect(() => subscribeBackground(() => setBg({ ...cache })), []);
  const uri = useDisplayUri(bg.uri);
  if (!uri) return null;
  return <Image source={{ uri }} style={[StyleSheet.absoluteFill, { opacity: bg.opacity }]} resizeMode="cover" />;
}

/** 页面级背景图层(渲染在每页 SafeAreaView 内, 穿透导航容器的遮挡, 不拦截触摸) */
export function PageBackdrop() {
  const [bg, setBg] = useState<BgSetting>(() => cache);
  useEffect(() => subscribeBackground(() => setBg({ ...cache })), []);
  const uri = useDisplayUri(bg.uri);
  if (!uri) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Image source={{ uri }} style={[StyleSheet.absoluteFill, { opacity: bg.opacity }]} resizeMode="cover" />
    </View>
  );
}
