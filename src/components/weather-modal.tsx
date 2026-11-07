/** 天气弹层: 15 天预报列表(今天蓝圈高亮) + 单日详情(滑动过渡) */
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { setWeatherCity, type DayForecast, type WeatherFull } from '@/lib/weather';

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

type DetailTarget = { day: DayForecast; today: boolean; index: number };

export function WeatherModal({
  visible,
  data,
  loading,
  onClose,
  onChangeCity,
}: {
  visible: boolean;
  data: WeatherFull | null;
  loading: boolean;
  onClose: () => void;
  /** 切换城市: 传 null 恢复自动定位 */
  onChangeCity?: (city: string | null) => void;
}) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [cityOpen, setCityOpen] = useState(false);
  const [cityInput, setCityInput] = useState('');
  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(640)).current;
  const detailX = useRef(new Animated.Value(0)).current;

  // 弹层打开: 背景淡入 + 底部面板上滑
  useEffect(() => {
    if (visible) {
      setDetail(null);
      detailX.setValue(0);
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(sheetY, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, backdrop, sheetY, detailX]);

  const openDetail = (t: DetailTarget) => {
    setDetail(t);
    detailX.setValue(0);
    Animated.timing(detailX, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const closeDetail = () => {
    Animated.timing(detailX, {
      toValue: 0,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setDetail(null));
  };

  const sheetBg = scheme === 'dark' ? colors.background : '#f8fafc';
  const translateX = detailX.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={StyleSheet.absoluteFill}>
        {/* 背景 */}
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdrop }]}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,23,42,0.45)' }]} onPress={onClose} />
        </Animated.View>

        {/* 底部面板 */}
        <Animated.View style={[styles.sheet, { backgroundColor: sheetBg, transform: [{ translateY: sheetY }] }]}>
          <View style={styles.grabber} />
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                未来 15 天天气{data ? ` · ${data.city}` : ''}
              </Text>
              <Pressable
                onPress={() => {
                  setCityInput(data?.city ?? '');
                  setCityOpen(true);
                }}
                hitSlop={6}
                style={[styles.cityBtn, { borderColor: 'rgba(100,116,139,0.45)' }]}>
                <Ionicons name="location-outline" size={12} color="#2563eb" />
                <Text style={{ color: '#2563eb', fontSize: 11 }}>切换城市</Text>
              </Pressable>
            </View>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          {!data && (
            <View style={styles.loadingWrap}>
              {loading ? <ActivityIndicator color="#2563eb" /> : <Text style={{ color: colors.textSecondary }}>暂无天气数据</Text>}
            </View>
          )}

          {data && (
            <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
              {data.days.map((d, i) => {
                const today = i === 0;
                const dt = new Date(`${d.date}T12:00:00`);
                return (
                  <Pressable
                    key={d.date}
                    onPress={() => openDetail({ day: d, today, index: i })}
                    style={[
                      styles.dayCard,
                      { backgroundColor: colors.backgroundElement },
                      today && { borderWidth: 2, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.08)' },
                    ]}>
                    <Ionicons name={d.icon as React.ComponentProps<typeof Ionicons>['name']} size={24} color={d.tint} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
                        {today ? '今天' : WEEK[dt.getDay()]}
                        <Text style={{ color: colors.textSecondary, fontWeight: '400', fontSize: 13 }}>
                          {'  '}
                          {d.date.slice(5).replace('-', '/')}
                        </Text>
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                        {d.desc} · 湿度 {d.humidity}%
                        {d.precipProb > 0 ? ` · 降水 ${d.precipProb}%` : ''}
                      </Text>
                    </View>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
                      {d.min}° ~ {d.max}°
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </Pressable>
                );
              })}
              <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
                免费接口预报，不一定准确，仅供参考
              </Text>
            </ScrollView>
          )}
        </Animated.View>

        {/* 城市输入弹窗 */}
        <Modal visible={cityOpen} transparent animationType="fade" onRequestClose={() => setCityOpen(false)}>
          <Pressable style={styles.cityMask} onPress={() => setCityOpen(false)}>
            <Pressable style={[styles.cityBox, { backgroundColor: sheetBg }]} onPress={() => {}}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>切换天气城市</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 18 }}>
                输入城市名（如：长沙、儋州、海口），留空保存恢复自动定位
              </Text>
              <TextInput
                value={cityInput}
                onChangeText={setCityInput}
                placeholder="长沙"
                placeholderTextColor={colors.textSecondary}
                autoFocus
                style={[
                  styles.cityInput,
                  { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: 'rgba(100,116,139,0.45)' },
                ]}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Pressable onPress={() => setCityOpen(false)} style={[styles.cityBtnBig, { backgroundColor: colors.backgroundElement }]}>
                  <Text style={{ color: colors.text }}>取消</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    const c = cityInput.trim() || null;
                    void setWeatherCity(c).then(() => {
                      setCityOpen(false);
                      onChangeCity?.(c);
                    });
                  }}
                  style={[styles.cityBtnBig, { backgroundColor: '#2563eb' }]}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>保存</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* 单日详情(从右滑入) */}
        {detail && (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: sheetBg, transform: [{ translateX }] },
            ]}>
            <View style={[styles.sheetHeader, { marginTop: 52 }]}>
              <Pressable onPress={closeDetail} hitSlop={10} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
                <Text style={{ color: colors.text, fontSize: 15 }}>返回</Text>
              </Pressable>
              <Text style={[styles.sheetTitle, { color: colors.text }]}>
                {detail.today ? '今天' : WEEK[new Date(`${detail.day.date}T12:00:00`).getDay()]} ·{' '}
                {detail.day.date.slice(5).replace('-', '/')}
              </Text>
              <View style={{ width: 64 }} />
            </View>

            <ScrollView contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>
              <View style={styles.detailHero}>
                <Ionicons
                  name={detail.day.icon as React.ComponentProps<typeof Ionicons>['name']}
                  size={68}
                  color={detail.day.tint}
                />
                <Text style={[styles.heroDesc, { color: colors.text }]}>{detail.day.desc}</Text>
                <Text style={[styles.heroTemp, { color: colors.text }]}>
                  {detail.day.min}° ~ {detail.day.max}°
                </Text>
              </View>

              <View style={styles.grid}>
                <View style={[styles.cell, { backgroundColor: colors.backgroundElement }]}>
                  <Text style={[styles.cellLabel, { color: colors.textSecondary }]}>湿度</Text>
                  <Text style={[styles.cellValue, { color: colors.text }]}>{detail.day.humidity}%</Text>
                </View>
                <View style={[styles.cell, { backgroundColor: colors.backgroundElement }]}>
                  <Text style={[styles.cellLabel, { color: colors.textSecondary }]}>降水概率</Text>
                  <Text style={[styles.cellValue, { color: colors.text }]}>{detail.day.precipProb}%</Text>
                </View>
                {detail.today && data?.pm25 != null && (
                  <View style={[styles.cell, { backgroundColor: colors.backgroundElement }]}>
                    <Text style={[styles.cellLabel, { color: colors.textSecondary }]}>PM2.5 (当前)</Text>
                    <Text style={[styles.cellValue, { color: colors.text }]}>{data.pm25} μg/m³</Text>
                  </View>
                )}
                <View style={[styles.cell, { backgroundColor: colors.backgroundElement }]}>
                  <Text style={[styles.cellLabel, { color: colors.textSecondary }]}>最大风速</Text>
                  <Text style={[styles.cellValue, { color: colors.text }]}>{detail.day.wind} km/h</Text>
                </View>
                <View style={[styles.cell, { backgroundColor: colors.backgroundElement }]}>
                  <Text style={[styles.cellLabel, { color: colors.textSecondary }]}>紫外线指数</Text>
                  <Text style={[styles.cellValue, { color: colors.text }]}>{detail.day.uv}</Text>
                </View>
                <View style={[styles.cell, { backgroundColor: colors.backgroundElement }]}>
                  <Text style={[styles.cellLabel, { color: colors.textSecondary }]}>日出</Text>
                  <Text style={[styles.cellValue, { color: colors.text }]}>{detail.day.sunrise || '—'}</Text>
                </View>
                <View style={[styles.cell, { backgroundColor: colors.backgroundElement }]}>
                  <Text style={[styles.cellLabel, { color: colors.textSecondary }]}>日落</Text>
                  <Text style={[styles.cellValue, { color: colors.text }]}>{detail.day.sunset || '—'}</Text>
                </View>
              </View>
              <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
                免费接口预报，不一定准确，仅供参考
              </Text>
            </ScrollView>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '88%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', marginTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '800' },
  cityBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6 },
  cityMask: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  cityBox: { width: '100%', maxWidth: 420, borderRadius: 18, padding: 20 },
  cityInput: { borderWidth: 1, borderRadius: 12, minHeight: 44, paddingHorizontal: 12, fontSize: 15, marginTop: 12 },
  cityBtnBig: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, minHeight: 44, flexDirection: 'row' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 8, paddingBottom: 10 },
  disclaimer: { fontSize: 11, textAlign: 'center', marginTop: 6 },
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 64 },
  detailBody: { paddingBottom: 30 },
  detailHero: { alignItems: 'center', paddingVertical: 18, gap: 6 },
  heroDesc: { fontSize: 20, fontWeight: '800' },
  heroTemp: { fontSize: 30, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { width: '47.5%', flexGrow: 1, borderRadius: 14, padding: 14 },
  cellLabel: { fontSize: 12 },
  cellValue: { fontSize: 18, fontWeight: '700', marginTop: 4 },
});
