/** 自定义应用背景: 展示主副本存应用私有目录(零权限依赖, 100% 可显示) + 镜像到 /Class/背景图 供文件管理器查看 */
import { useEffect, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { AppState, Image, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { type Palette } from '@/constants/theme';
import { DIR_BG, classCopy, classCopyFrom, hasClassAccess, toDisplayUri } from '@/lib/class-folder';

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

/**
 * 启动预热(_layout 调用):
 * - 背景路径还不是私有目录(旧版存的 class:// 或直连路径): 拷回私有目录作为展示主副本, 之后显示不再依赖任何权限
 * - 已是私有目录: 补一份镜像到 /Class/背景图(有权限时), 保持文件管理器可见
 */
export async function primeBackground(): Promise<void> {
  await load();
  const uri = cache.uri;
  if (!uri) return;
  const docDir = FileSystem.documentDirectory ?? '';
  const isPrivate = uri.startsWith(docDir);
  if (!isPrivate) {
    // 旧路径迁移: 经 toDisplayUri 解析(内部会拷到缓存目录) → 复制进私有目录
    try {
      const real = await toDisplayUri(uri);
      if (real) {
        const ext = uri.split('.').pop()?.toLowerCase().split('?')[0] || 'jpg';
        const dest = `${docDir}custom-bg.${ext}`;
        await FileSystem.copyAsync({ from: real, to: dest });
        await persist({ ...cache, uri: dest });
        mirrorToClass(dest);
        return;
      }
    } catch {
      // 迁移失败保留原路径, 展示层另有兜底
    }
    return;
  }
  mirrorToClass(uri);
}

/** 镜像私有目录背景到 /Class/背景图(无权限/失败静默) */
function mirrorToClass(srcUri: string): void {
  void (async () => {
    try {
      if (!(await hasClassAccess())) return;
      const ext = srcUri.split('.').pop()?.toLowerCase() || 'jpg';
      await classCopy(srcUri, `${DIR_BG}custom-bg.${ext}`);
    } catch {
      // 镜像失败不影响显示
    }
  })();
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

/** 选择图片: 展示主副本存应用私有目录(必然可显示), /Class/背景图 存镜像供文件管理器查看 */
export async function pickBackground(): Promise<void> {
  const r = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
  if (r.canceled) return;
  const asset = r.assets?.[0];
  if (!asset) return;
  const ext = asset.name?.split('.').pop()?.toLowerCase() || 'jpg';
  const dest = `${FileSystem.documentDirectory}custom-bg.${ext}`;
  await FileSystem.copyAsync({ from: asset.uri, to: dest });
  await persist({ ...cache, uri: dest });
  mirrorToClass(dest);
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

/** 背景持久化 uri(私有目录/class:// 虚拟路径/file://)→ Image 可展示的真实 uri; 解析失败自动重试(权限状态可能稍后才就绪) */
function useDisplayUri(rawUri: string | null): string | null {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (!rawUri) {
      setUri(null);
      return;
    }
    const resolve = (attempt: number) => {
      void toDisplayUri(rawUri).then((u) => {
        if (!alive) return;
        if (u) {
          setUri(u);
        } else if (attempt < 4) {
          // 权限/SAF 可能还没就绪: 2s/4s/6s 递增重试, 回前台也会重试
          timer = setTimeout(() => resolve(attempt + 1), 2000 * attempt);
        }
      });
    };
    resolve(1);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') resolve(1);
    });
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      sub.remove();
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
