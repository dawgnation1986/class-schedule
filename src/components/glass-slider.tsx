/**
 * 玻璃风拖动条: 无需额外依赖, 用 PanResponder 实现。
 * 拖动时连续 onChange(实时预览), 松手回调 onComplete(落盘)。
 */
import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

const THUMB = 20;

export function GlassSlider({
  value,
  min = 0,
  max = 1,
  onChange,
  onComplete,
  activeColor = '#2563EB',
  trackColor = 'rgba(128,128,128,0.32)',
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  onComplete?: (v: number) => void;
  activeColor?: string;
  trackColor?: string;
}) {
  const [w, setW] = useState(0);
  const wRef = useRef(0);
  wRef.current = w;
  const start = useRef(0);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const doneRef = useRef(onComplete);
  doneRef.current = onComplete;

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const fromX = (x: number) => clamp(min + ((max - min) * x) / Math.max(1, wRef.current));

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const next = fromX(e.nativeEvent.locationX);
        start.current = next;
        changeRef.current(next);
      },
      onPanResponderMove: (_e, g) => {
        changeRef.current(clamp(start.current + ((max - min) * g.dx) / Math.max(1, wRef.current)));
      },
      onPanResponderRelease: (_e, g) => {
        doneRef.current?.(clamp(start.current + ((max - min) * g.dx) / Math.max(1, wRef.current)));
      },
      onPanResponderTerminate: (_e, g) => {
        doneRef.current?.(clamp(start.current + ((max - min) * g.dx) / Math.max(1, wRef.current)));
      },
    }),
  ).current;

  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));

  return (
    <View style={styles.wrap} onLayout={(e) => setW(e.nativeEvent.layout.width)} {...pan.panHandlers}>
      <View style={[styles.track, { backgroundColor: trackColor }]} />
      <View style={[styles.fill, { backgroundColor: activeColor, width: `${ratio * 100}%` }]} />
      <View
        style={[
          styles.thumb,
          { left: Math.max(0, ratio * w - THUMB / 2), borderColor: activeColor },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 32, justifyContent: 'center', marginTop: 2 },
  track: { height: 4, borderRadius: 2 },
  fill: { position: 'absolute', left: 0, height: 4, borderRadius: 2 },
  thumb: {
    position: 'absolute',
    top: 6,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    elevation: 2,
  },
});
