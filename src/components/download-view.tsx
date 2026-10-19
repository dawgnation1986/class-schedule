/** 内置 APK 下载视图: 按钮 → 进度条 + 下载日志(固定宽度可滚动), 两处更新入口共用 */
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';
import {
  downloadApk,
  fmtSize,
  installApk,
  type DlEvent,
  type UpdateInfo,
} from '@/lib/updates';

export function ApkDownload({
  info,
  colors,
}: {
  info: UpdateInfo;
  colors: (typeof Colors)[keyof typeof Colors];
}) {
  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'done' | 'error'>('idle');
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const cancelled = useRef({ current: false });
  const logRef = useRef<ScrollView>(null);

  const push = (line: string) => {
    const t = new Date();
    const stamp = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
    setLogs((prev) => [...prev.slice(-60), `[${stamp}] ${line}`]);
  };

  const onEvent = (e: DlEvent) => {
    if (e.type === 'log') push(e.line);
    else {
      setSpeed(e.speed);
      setProgress(e.total > 0 ? Math.min(e.written / e.total, 1) : 0);
    }
  };

  const start = () => {
    setLogs([]);
    setProgress(0);
    setSpeed(0);
    setErrMsg(null);
    setFileUri(null);
    setPhase('downloading');
    cancelled.current.current = false;
    downloadApk(info, onEvent, cancelled.current)
      .then((uri) => {
        setFileUri(uri);
        setPhase('done');
        push('正在拉起安装程序…');
        void installApk(uri);
      })
      .catch((e) => {
        if (cancelled.current.current) {
          setPhase('idle');
          push('已取消下载');
          return;
        }
        setErrMsg(e instanceof Error ? e.message : '下载失败');
        setPhase('error');
      });
  };

  if (phase === 'idle' || phase === 'error') {
    return (
      <View style={{ gap: 8 }}>
        {phase === 'error' && (
          <Text style={{ color: '#ef4444', fontSize: 13 }}>下载失败：{errMsg}，可重试</Text>
        )}
        <Pressable
          onPress={start}
          style={{ backgroundColor: '#2563eb', borderRadius: 10, alignItems: 'center', paddingVertical: 11 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>
            {phase === 'error' ? '重试下载 APK' : '下载 APK 安装包'}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'done') {
    return (
      <View style={{ gap: 8 }}>
        <Text style={{ color: '#16a34a', fontSize: 13, fontWeight: '700' }}>下载完成 ✓ 如未自动弹出安装，点下方按钮</Text>
        <Pressable
          onPress={() => fileUri && void installApk(fileUri)}
          style={{ backgroundColor: '#16a34a', borderRadius: 10, alignItems: 'center', paddingVertical: 11 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>安装 APK</Text>
        </Pressable>
      </View>
    );
  }

  const total = info.sizeHint ?? 0;
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(progress * 100, 2)}%` }]} />
      </View>
      <View style={styles.row}>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
          {fmtSize(total * progress)}
          {total > 0 ? ` / ${fmtSize(total)}` : ''} · {(progress * 100).toFixed(1)}%
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
          {speed > 0 ? `${fmtSize(speed)}/s` : ''}
        </Text>
      </View>
      {/* 下载日志: 固定宽度固定高度, 可滚动 */}
      <ScrollView
        ref={logRef}
        style={[styles.logBox, { backgroundColor: colors.backgroundElement }]}
        contentContainerStyle={styles.logContent}
        onContentSizeChange={() => logRef.current?.scrollToEnd({ animated: false })}
        nestedScrollEnabled>
        {logs.map((l, i) => (
          <Text key={i} style={[styles.logLine, { color: colors.textSecondary }]}>
            {l}
          </Text>
        ))}
      </ScrollView>
      <Pressable
        onPress={() => {
          cancelled.current.current = true;
        }}
        style={{ borderRadius: 10, alignItems: 'center', paddingVertical: 9, backgroundColor: colors.backgroundElement }}>
        <Text style={{ color: '#ef4444', fontWeight: '600' }}>取消下载</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(128,128,128,0.2)', overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: '#2563eb' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  logBox: { height: 120, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(128,128,128,0.3)' },
  logContent: { padding: 8, gap: 2 },
  logLine: { fontSize: 11, lineHeight: 16 },
});
