﻿/**
 * 主题预设档位: 自定义 / 纯白 / 纯黑 / 墨夜 / 护眼米黄 / 淡雅蓝
 * 可折叠卡片(默认收起); 网格色卡点选即换; 支持导出当前主题 / 导入 /Class/主题预设 下的主题文件
 * 适配"控件全透明"(glass)模式与墨夜模式
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme } from '@/hooks/use-theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { NightCard, NightTint } from '@/components/night-kit';
import { usePresetId } from '@/hooks/use-preset-id';
import { useUiMode } from '@/hooks/use-ui-mode';
import { useBgSetting } from '@/lib/background';
import { applyPreset, applyThemeFile, ACCENT_PRESETS, CUSTOM_PALETTES, deleteThemeFile, exportTheme, getAccentColor, getCustomHex, getCustomPaletteId, listThemeFiles, normalizeHex, PRESETS, resetCustomHex, setAccentColor, setCustomHex, setCustomPaletteId, subscribeCustomPalette, type CustomHex, type CustomPaletteId, type PresetFile } from '@/lib/theme-preset';
import { hasClassAccess, lastAccessError, requestClassAccess, resetAccessAndEnsureDirs } from '@/lib/class-folder';

/** 可单独覆盖的配色项 */
const HEX_TOKENS: { key: keyof CustomHex; label: string; hint: string }[] = [
  { key: 'background', label: '页面底色', hint: '整个页面的背景' },
  { key: 'backgroundElement', label: '卡片底色', hint: '卡片 / 输入框 / 分区块' },
  { key: 'backgroundSelected', label: '选中控件', hint: '选中项、按钮底色' },
  { key: 'text', label: '主文字', hint: '标题与正文' },
  { key: 'textSecondary', label: '次文字', hint: '说明与提示' },
];

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** 调色板: 1 行灰阶 + 6 行彩色(10 列, 由亮到暗) */
const PALETTE_ROWS: string[][] = [
  ['#ffffff', '#f6f7f9', '#eceef2', '#dfe2e7', '#c9ced6', '#a3abb8', '#767f8d', '#4b5563', '#2b313b', '#000000'],
  ...[90, 76, 62, 48, 34, 22].map((l) =>
    Array.from({ length: 10 }, (_, i) => hslToHex(i * 36, l > 85 ? 55 : 68, l)),
  ),
];

export function ThemePresetPicker() {
  const colors = useTheme();
  const scheme = useColorScheme();
  const uiMode = useUiMode();
  const night = uiMode === 'night';
  const bgSetting = useBgSetting();
  const glass = !!bgSetting.ctrl;
  const glassLine = scheme === 'dark' ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.30)';
  const presetId = usePresetId();
  const [open, setOpen] = useState(false);
  const [paletteId, setPaletteId] = useState<CustomPaletteId>(() => getCustomPaletteId());
  const [accent, setAccentState] = useState(() => getAccentColor());
  const [accentDraft, setAccentDraft] = useState(() => getAccentColor());
  const [hexDraft, setHexDraft] = useState<CustomHex>(() => getCustomHex());
  const [token, setToken] = useState<keyof CustomHex>('background');
  const [hexErr, setHexErr] = useState<string | null>(null);
  useEffect(
    () =>
      subscribeCustomPalette(() => {
        setPaletteId(getCustomPaletteId());
        setAccentState(getAccentColor());
        setAccentDraft(getAccentColor());
        setHexDraft(getCustomHex());
      }),
    [],
  );
  const [access, setAccess] = useState<boolean | null>(null);
  const [expOpen, setExpOpen] = useState(false);
  const [impOpen, setImpOpen] = useState(false);
  const [expName, setExpName] = useState('我的主题');
  const [files, setFiles] = useState<PresetFile[] | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshAccess = useCallback(() => {
    void hasClassAccess().then(setAccess);
  }, []);
  useEffect(refreshAccess, [refreshAccess]);

  const loadFiles = useCallback(() => {
    setFiles(null);
    void listThemeFiles().then(setFiles);
  }, []);

  const onPreset = (id: (typeof PRESETS)[number]['id']) => {
    void applyPreset(id);
  };

  const doExport = async () => {
    setBusy(true);
    try {
      const r = await exportTheme(expName);
      if (r.ok) {
        setExpOpen(false);
        Alert.alert('导出成功', `已保存到 /Class/主题预设/${expName.trim() || '我的主题'}.theme.json`);
      } else {
        Alert.alert('导出失败', r.error ?? '未知错误');
      }
    } finally {
      setBusy(false);
    }
  };

  /** 弹出系统"选择文件夹"授权, 结束后刷新权限状态 */
  const askAccess = () => {
    void requestClassAccess().then((ok) => setAccess(ok));
  };

  /** 导出前实时重测权限(从授权页回来立即生效, 不用重启) */
  const tryExport = async () => {
    setBusy(true);
    try {
      const ok = await resetAccessAndEnsureDirs();
      setAccess(ok);
      if (ok) await doExport();
      else
        Alert.alert('需要授权', '请先授权访问手机 Class 文件夹（在弹出的窗口中选中 Class 文件夹）', [
          { text: '取消', style: 'cancel' },
          { text: '去授权', onPress: askAccess },
        ]);
    } finally {
      setBusy(false);
    }
  };

  const doImport = (item: PresetFile) => {
    void applyThemeFile(item).then(() => {
      setImpOpen(false);
      Alert.alert('已应用主题', item.data.name);
    });
  };

  const grantRow = access === false && (
    <Pressable
      onPress={askAccess}
      style={({ pressed }) => [styles.grantRow, pressed && { opacity: 0.6 }]}>
      <Ionicons name="folder-open-outline" size={16} color="#f59e0b" />
      <Text style={styles.grantText}>
        授权访问手机 Class 文件夹后, 主题与背景可存到 /Class（点按后在弹窗中选中 Class 文件夹）
        {lastAccessError ? `\n检测失败: ${lastAccessError}` : ''}
      </Text>
      <Ionicons name="chevron-forward" size={15} color={colors.textSecondary} />
    </Pressable>
  );

  const activeName = PRESETS.find((p) => p.id === presetId)?.name ?? '自定义';

  const body = (
    <>
      {/* 折叠头: 标题 + 当前档位 + 展开/收起 */}
      <Pressable onPress={() => setOpen((v) => !v)} style={({ pressed }) => [styles.header, pressed && { opacity: 0.7 }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>主题预设</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            {open ? '一键切换整体配色; 选"自定义"回到自己搭配的样子' : `当前: ${activeName} · 点击展开选择`}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
      </Pressable>

      {open && (
        <>
          <View style={styles.grid}>
            {PRESETS.map((p) => {
              const active = presetId === p.id;
              // 自定义档用当前实际配色预览, 而不是固定色块
              const swatch: [string, string] =
                p.id === 'custom' && presetId === 'custom'
                  ? [colors.background, colors.backgroundElement]
                  : p.swatch;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => onPreset(p.id)}
                  style={({ pressed }) => [
                    styles.cell,
                    pressed && { opacity: 0.7 },
                    night && { backgroundColor: 'rgba(91,140,255,0.08)', borderColor: active ? 'rgba(91,140,255,0.55)' : NightTint.line },
                    !night && !glass && { backgroundColor: active ? colors.backgroundSelected : colors.background, borderColor: active ? colors.primary : 'rgba(100,116,139,0.25)' },
                    !night && glass && {
                      backgroundColor: active ? 'rgba(37,99,235,0.18)' : scheme === 'dark' ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.30)',
                      borderColor: active ? 'rgba(37,99,235,0.55)' : glassLine,
                    },
                  ]}>
                  <View style={styles.swatchWrap}>
                    <View style={[styles.swatchA, { backgroundColor: swatch[0] }, !night && { borderColor: 'rgba(100,116,139,0.3)' }]} />
                    <View style={[styles.swatchB, { backgroundColor: swatch[1] }, !night && { borderColor: 'rgba(100,116,139,0.3)' }]} />
                    {active && (
                      <View style={[styles.check, night && { backgroundColor: 'rgba(91,140,255,0.9)' }]}>
                        <Ionicons name="checkmark" size={12} color="#fff" />
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name={p.icon as keyof typeof Ionicons.glyphMap} size={14} color={active ? colors.primary : colors.textSecondary} />
                    <Text style={{ color: colors.text, fontWeight: active ? '800' : '600', fontSize: 13.5 }}>{p.name}</Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: 10.5 }} numberOfLines={1}>
                    {p.desc}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {grantRow}

          {/* 自定义配色: 仅"自定义"档生效 */}
          {presetId === 'custom' ? (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13.5 }}>自定义配色</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {CUSTOM_PALETTES.map((p) => {
                  const active = paletteId === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => void setCustomPaletteId(p.id)}
                      style={({ pressed }) => [
                        styles.chip,
                        pressed && { opacity: 0.7 },
                        {
                          borderColor: active ? colors.primary : night ? NightTint.line : glass ? glassLine : 'rgba(100,116,139,0.3)',
                          backgroundColor: active
                            ? night || glass
                              ? 'rgba(37,99,235,0.18)'
                              : colors.backgroundSelected
                            : 'transparent',
                        },
                      ]}>
                      <View style={[styles.chipDot, { backgroundColor: p.swatch }]} />
                      <Text style={{ color: active ? colors.primary : colors.text, fontSize: 12, fontWeight: active ? '700' : '500' }}>{p.label}</Text>
                      {active && <Ionicons name="checkmark" size={13} color={colors.primary} />}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* 控件主色: 全局生效(按钮/链接/高亮) */}
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13.5 }}>控件主色</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {ACCENT_PRESETS.map((p) => {
                const active = accent.toLowerCase() === p.hex.toLowerCase();
                return (
                  <Pressable
                    key={p.hex}
                    onPress={() => void setAccentColor(p.hex)}
                    style={({ pressed }) => [
                      styles.chip,
                      pressed && { opacity: 0.7 },
                      {
                        borderColor: active ? p.hex : night ? NightTint.line : glass ? glassLine : 'rgba(100,116,139,0.3)',
                        backgroundColor: active ? (night || glass ? 'rgba(128,128,128,0.15)' : colors.backgroundSelected) : 'transparent',
                      },
                    ]}>
                    <View style={[styles.chipDot, { backgroundColor: p.hex }]} />
                    <Text style={{ color: active ? p.hex : colors.text, fontSize: 12, fontWeight: active ? '700' : '500' }}>{p.label}</Text>
                    {active && <Ionicons name="checkmark" size={13} color={p.hex} />}
                  </Pressable>
                );
              })}
            </View>
            {/* 自定义主色: 调色板之外的任意颜色 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <View style={[styles.chipDot, { backgroundColor: accent, width: 18, height: 18, borderRadius: 9 }]} />
              <TextInput
                value={accentDraft}
                onChangeText={setAccentDraft}
                placeholder="#2563eb"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.hexInput, { color: colors.text, borderColor: night || glass ? glassLine : 'rgba(100,116,139,0.4)', flex: 1 }]}
              />
              <Pressable
                onPress={() => {
                  const clean = normalizeHex(accentDraft);
                  if (!clean) {
                    Alert.alert('颜色格式不对', '请输入 #RGB 或 #RRGGBB，如 #2563eb');
                    return;
                  }
                  void setAccentColor(clean);
                }}
                style={[styles.chip, { borderColor: accent, backgroundColor: night || glass ? 'rgba(37,99,235,0.16)' : colors.backgroundSelected }]}>
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>应用主色</Text>
              </Pressable>
            </View>
          </View>

          {/* 自定义颜色调色板: 仅"自定义"档生效, 可覆盖上方所选配色的任意一项 */}
          {presetId === 'custom' ? (
            <View style={{ marginTop: 14 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13.5 }}>自定义颜色（调色板）</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 2, lineHeight: 17 }}>
                先选要改的部位，再点色块即时生效；会覆盖上面的配色，可单独恢复。已自定义项显示小圆点。
              </Text>

              {/* 部位选择 */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {HEX_TOKENS.map((t) => {
                  const active = token === t.key;
                  return (
                    <Pressable
                      key={t.key}
                      onPress={() => {
                        setToken(t.key);
                        setHexErr(null);
                      }}
                      style={({ pressed }) => [
                        styles.chip,
                        pressed && { opacity: 0.7 },
                        {
                          borderColor: active ? colors.primary : night ? NightTint.line : glass ? glassLine : 'rgba(100,116,139,0.3)',
                          backgroundColor: active ? (night || glass ? 'rgba(37,99,235,0.18)' : colors.backgroundSelected) : 'transparent',
                        },
                      ]}>
                      <View style={[styles.chipDot, { backgroundColor: colors[t.key] }]} />
                      <Text style={{ color: active ? colors.primary : colors.text, fontSize: 12, fontWeight: active ? '700' : '500' }}>{t.label}</Text>
                      {!!hexDraft[t.key] && <View style={styles.customDot} />}
                    </Pressable>
                  );
                })}
              </View>

              {/* 色板 */}
              <View style={{ marginTop: 10, gap: 6 }}>
                {PALETTE_ROWS.map((row, ri) => (
                  <View key={ri} style={{ flexDirection: 'row', gap: 6 }}>
                    {row.map((hex) => {
                      const selected = (hexDraft[token] ?? '').toLowerCase() === hex.toLowerCase();
                      return (
                        <Pressable
                          key={hex}
                          onPress={() => {
                            setHexDraft((d) => ({ ...d, [token]: hex }));
                            setHexErr(null);
                            void setCustomHex({ [token]: hex } as CustomHex);
                          }}
                          style={[
                            styles.swatch,
                            { backgroundColor: hex, borderColor: selected ? colors.primary : 'rgba(100,116,139,0.35)' },
                            selected && { borderWidth: 3 },
                          ]}
                        />
                      );
                    })}
                  </View>
                ))}
              </View>

              {/* 当前部位: 颜色值输入 + 恢复 */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {HEX_TOKENS.find((t) => t.key === token)?.label}
                </Text>
                <TextInput
                  value={hexDraft[token] ?? ''}
                  onChangeText={(v) => {
                    setHexDraft((d) => ({ ...d, [token]: v }));
                    setHexErr(null);
                  }}
                  placeholder={colors[token]}
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.hexInput, { color: colors.text, borderColor: 'rgba(100,116,139,0.4)', flex: 1 }]}
                />
                <Pressable
                  onPress={() => {
                    const clean = normalizeHex(hexDraft[token] ?? '');
                    if (!clean) {
                      setHexErr('格式应为 #RGB 或 #RRGGBB');
                      return;
                    }
                    setHexDraft((d) => ({ ...d, [token]: clean }));
                    void setCustomHex({ [token]: clean } as CustomHex);
                  }}
                  style={[styles.chip, { borderColor: colors.primary, backgroundColor: night || glass ? 'rgba(37,99,235,0.16)' : colors.backgroundSelected }]}>
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>应用</Text>
                </Pressable>
              </View>
              {!!hexErr && <Text style={{ color: '#ef4444', fontSize: 11.5, marginTop: 4 }}>{hexErr}</Text>}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                <Pressable
                  onPress={() => {
                    setHexDraft((d) => ({ ...d, [token]: '' }));
                    void setCustomHex({ [token]: '' } as CustomHex);
                  }}
                  style={[styles.actionBtn, { backgroundColor: night ? 'rgba(91,140,255,0.14)' : colors.backgroundSelected, flex: 1 }]}>
                  <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: '700' }}>恢复此项</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setHexDraft({});
                    setHexErr(null);
                    void resetCustomHex();
                  }}
                  style={[styles.actionBtn, { backgroundColor: night ? 'rgba(91,140,255,0.14)' : colors.backgroundSelected, flex: 1 }]}>
                  <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: '700' }}>全部恢复默认</Text>
                </Pressable>
              </View>

              {/* 实时预览 */}
              <View
                style={{
                  marginTop: 10,
                  borderRadius: 12,
                  padding: 12,
                  backgroundColor: colors.background,
                  borderWidth: 1,
                  borderColor: colors.backgroundSelected,
                }}>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13 }}>预览 · 今日课程</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 2 }}>次文字说明 / 时间与地点</Text>
                <View
                  style={{
                    marginTop: 8,
                    padding: 10,
                    borderRadius: 8,
                    backgroundColor: colors.backgroundElement,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                  <Text style={{ color: colors.text, fontSize: 12 }}>高等数学 · 3-4 节</Text>
                  <View style={{ backgroundColor: colors.primary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>按钮</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 10 }}>
              选"自定义"档位后，可在此用调色板自由搭配底色配色
            </Text>
          )}

          <View style={styles.btnRow}>
            <Pressable
              onPress={() => {
                refreshAccess();
                setExpName('我的主题');
                setExpOpen(true);
              }}
              style={[
                styles.actionBtn,
                night && { backgroundColor: 'rgba(91,140,255,0.14)' },
                !night && !glass && { backgroundColor: colors.backgroundSelected },
                !night && glass && { borderWidth: 1, borderColor: glassLine },
              ]}>
              <Ionicons name="cloud-upload-outline" size={15} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: '700' }}>导出主题</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                refreshAccess();
                loadFiles();
                setImpOpen(true);
              }}
              style={[
                styles.actionBtn,
                night && { backgroundColor: 'rgba(91,140,255,0.14)' },
                !night && !glass && { backgroundColor: colors.backgroundSelected },
                !night && glass && { borderWidth: 1, borderColor: glassLine },
              ]}>
              <Ionicons name="cloud-download-outline" size={15} color={colors.primary} />
              <Text style={{ color: colors.text, fontSize: 12.5, fontWeight: '700' }}>导入主题</Text>
            </Pressable>
          </View>
        </>
      )}
    </>
  );

  return (
    <>
      {night ? (
        <NightCard style={styles.nightCard}>{body}</NightCard>
      ) : glass ? (
        <View style={[styles.card, { backgroundColor: 'transparent', borderWidth: 1, borderColor: glassLine }]}>{body}</View>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>{body}</View>
      )}

      {/* 导出主题 */}
      <Modal visible={expOpen} transparent animationType="fade" onRequestClose={() => setExpOpen(false)}>
        <Pressable style={styles.mask} onPress={() => setExpOpen(false)}>
          <Pressable style={[styles.box, { backgroundColor: colors.background }]} onPress={() => {}}>
            <Text style={[styles.boxTitle, { color: colors.text }]}>导出当前主题</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12.5, lineHeight: 19 }}>
              把当前界面模式、亮/深配色与背景参数打包保存到手机 /Class/主题预设 文件夹（背景图一并保存），可分享给别人导入。
            </Text>
            <TextInput
              value={expName}
              onChangeText={setExpName}
              placeholder="主题名称"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: 'rgba(100,116,139,0.45)' }]}
            />
            <View style={styles.boxBtnRow}>
              <Pressable onPress={() => setExpOpen(false)} style={[styles.boxBtn, { backgroundColor: colors.backgroundElement }]}>
                <Text style={{ color: colors.text }}>取消</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                onPress={() => void tryExport()}
                style={[styles.boxBtn, { backgroundColor: busy ? colors.backgroundElement : colors.primary }]}>
                {busy ? <ActivityIndicator size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>导出</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 导入主题 */}
      <Modal visible={impOpen} transparent animationType="fade" onRequestClose={() => setImpOpen(false)}>
        <Pressable style={styles.mask} onPress={() => setImpOpen(false)}>
          <Pressable style={[styles.box, { backgroundColor: colors.background }]} onPress={() => {}}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[styles.boxTitle, { color: colors.text }]}>导入主题</Text>
              <Pressable hitSlop={10} onPress={loadFiles}>
                <Ionicons name="refresh" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 12.5, marginBottom: 10 }}>
              来自手机 /Class/主题预设 文件夹
            </Text>
            <ScrollView style={{ maxHeight: 240 }}>
              {access === false && (
                <Pressable onPress={requestClassAccess} style={styles.grantRow}>
                  <Ionicons name="warning-outline" size={15} color="#f59e0b" />
                  <Text style={styles.grantText}>需要"所有文件访问"权限，点击去授权</Text>
                </Pressable>
              )}
              {files === null && access !== false && <ActivityIndicator style={{ paddingVertical: 20 }} />}
              {files?.length === 0 && access !== false && (
                <Text style={{ color: colors.textSecondary, fontSize: 13, paddingVertical: 16, textAlign: 'center' }}>
                  还没有可导入的主题，先在另一台设备导出并拷贝到 /Class/主题预设
                </Text>
              )}
              {files?.map((item) => (
                <View key={item.file} style={[styles.fileRow, { borderColor: 'rgba(100,116,139,0.3)' }]}>
                  <Pressable onPress={() => doImport(item)} style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>{item.data.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                      {item.data.uiMode === 'night' || item.data.uiMode === 'glass' ? '液态玻璃' : item.data.scheme === 'dark' ? '深色' : '浅色'} · {item.data.at.slice(0, 10)}
                    </Text>
                  </Pressable>
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      void deleteThemeFile(item).then(() => {
                        loadFiles();
                      })
                    }>
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={() => setImpOpen(false)} style={[styles.boxBtn, { backgroundColor: colors.backgroundElement, alignSelf: 'flex-end', marginTop: 12 }]}>
              <Text style={{ color: colors.text }}>关闭</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, marginTop: 24, gap: 4 },
  nightCard: { padding: 16, marginTop: 24, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  cell: {
    width: '47.5%',
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 12,
    gap: 6,
  },
  swatchWrap: { height: 34, position: 'relative' },
  swatchA: { position: 'absolute', left: 0, top: 0, width: '72%', height: '100%', borderRadius: 8, borderWidth: 1 },
  swatchB: { position: 'absolute', right: 0, top: 6, width: '58%', height: '88%', borderRadius: 8, borderWidth: 1 },
  check: {
    position: 'absolute',
    right: -4,
    top: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  grantRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginTop: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)' },
  customDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b' },
  swatch: { flex: 1, aspectRatio: 1, borderRadius: 7, borderWidth: 1 },
  hexInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
  },
  grantText: { color: '#f59e0b', fontSize: 12, flex: 1, lineHeight: 17 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 10,
    paddingVertical: 11,
  },
  mask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  box: { borderRadius: 14, padding: 18 },
  boxTitle: { fontSize: 17, fontWeight: '800', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12, fontSize: 14 },
  boxBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  boxBtn: { borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 8,
  },
});
