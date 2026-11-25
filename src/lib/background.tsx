/** 自定义应用背景: 展示主副本存应用私有目录(零权限依赖, 100% 可显示) + 镜像到 /Class/背景图 供文件管理器查看 */
import { useEffect, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { AppState, Image, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { type Palette } from '@/constants/theme';
import { useUiMode } from '@/hooks/use-ui-mode';
import { toDisplayUri } from '@/lib/class-folder';

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
 * 背景路径还不是私有目录(旧版存的 class:// 或直连路径) → 拷回私有目录作为展示主副本, 之后显示不再依赖任何权限。
 * 不做 /Class 镜像(避免大图 base64 拷贝卡顿); /Class 只在"导出主题"时才写入。
 */
export async function primeBackground(): Promise<void> {
  await load();
  const uri = cache.uri;
  if (!uri) return;
  const docDir = FileSystem.documentDirectory ?? '';
  if (uri.startsWith(docDir)) return;
  // 旧路径迁移: 经 toDisplayUri 解析(内部会拷到缓存目录) → 复制进私有目录
  try {
    const real = await toDisplayUri(uri);
    if (!real) return;
    const ext = uri.split('.').pop()?.toLowerCase().split('?')[0] || 'jpg';
    const dest = `${docDir}custom-bg.${ext}`;
    await FileSystem.copyAsync({ from: real, to: dest });
    await persist({ ...cache, uri: dest });
  } catch {
    // 迁移失败保留原路径, 展示层另有兜底
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

/** 选择图片: 直接存应用私有目录(copyAsync 原生拷贝, 零 base64, 无卡顿); 导出主题时才写 /Class */
export async function pickBackground(): Promise<void> {
  const r = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
  if (r.canceled) return;
  const asset = r.assets?.[0];
  if (!asset) return;
  const ext = asset.name?.split('.').pop()?.toLowerCase() || 'jpg';
  const dest = `${FileSystem.documentDirectory}custom-bg.${ext}`;
  await FileSystem.copyAsync({ from: asset.uri, to: dest });
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

/** 读取完整背景设置(订阅变化); 液态玻璃模式下强制开启半透明控件 */
export function useBgSetting(): BgSetting {
  const [bg, setBg] = useState<BgSetting>(() => cache);
  const mode = useUiMode();
  useEffect(() => subscribeBackground(() => setBg({ ...cache })), []);
  return mode === 'glass' ? { ...bg, ctrl: true } : bg;
}

/** 页面背景色: 有自定义背景或液态玻璃时页面透明露出底层图, 否则用主题色 */
export function usePageBackground(colors: Palette): string {
  const [bg, setBg] = useState<BgSetting>(() => cache);
  const mode = useUiMode();
  useEffect(() => subscribeBackground(() => setBg({ ...cache })), []);
  return mode === 'glass' || bg.uri ? 'transparent' : colors.background;
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

/**
 * 液态玻璃底图: 在根布局最底层铺一层彩色流光, 再做一次全屏原生模糊。
 * 页面背景透明后, 这张「已经模糊的壁纸」就是所有玻璃卡片的折射来源。
 * 没有自定义背景时显示; 自定义背景优先(BackgroundLayer 在其之上)。
 */
export function GlassWallpaper() {
  const mode = useUiMode();
  if (mode !== 'glass') return null;
  const dark = false; // 液态玻璃固定明亮风格
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={dark ? ['#0A0F20', '#16204A', '#241238', '#0C1830'] : ['#EAF2FF', '#E2E9FF', '#FBEFF8', '#EDF6FF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.wBlob, dark ? styles.wBlueDark : styles.wBlueLight]} />
      <View style={[styles.wBlob, dark ? styles.wVioletDark : styles.wVioletLight]} />
      <View style={[styles.wBlob, dark ? styles.wPinkDark : styles.wPinkLight]} />
      <View style={[styles.wBlob, dark ? styles.wCyanDark : styles.wCyanLight]} />
      {/* 全屏模糊: 把上面的彩色光斑揉开, 形成柔和的磨砂壁纸 */}
      <BlurView
        intensity={dark ? 55 : 70}
        tint={dark ? 'dark' : 'light'}
        blurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={dark ? ['rgba(255,255,255,0.10)', 'transparent'] : ['rgba(255,255,255,0.55)', 'transparent']}
        style={styles.wTopSheen}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wBlob: { position: 'absolute', borderRadius: 999 },
  wBlueLight: { width: 620, height: 620, top: -240, left: -220, backgroundColor: 'rgba(70,140,255,0.35)' },
  wVioletLight: { width: 520, height: 520, top: 160, right: -240, backgroundColor: 'rgba(150,100,255,0.28)' },
  wPinkLight: { width: 460, height: 460, bottom: -180, left: 30, backgroundColor: 'rgba(255,120,190,0.24)' },
  wCyanLight: { width: 420, height: 420, bottom: 120, right: -160, backgroundColor: 'rgba(80,220,255,0.22)' },
  wBlueDark: { width: 620, height: 620, top: -240, left: -220, backgroundColor: 'rgba(40,100,255,0.38)' },
  wVioletDark: { width: 520, height: 520, top: 160, right: -240, backgroundColor: 'rgba(130,70,255,0.32)' },
  wPinkDark: { width: 460, height: 460, bottom: -180, left: 30, backgroundColor: 'rgba(255,70,150,0.22)' },
  wCyanDark: { width: 420, height: 420, bottom: 120, right: -160, backgroundColor: 'rgba(0,200,255,0.18)' },
  wTopSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 300 },
});
