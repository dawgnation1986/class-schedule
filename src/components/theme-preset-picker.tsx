/**
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
import { applyPreset, applyThemeFile, CUSTOM_PALETTES, deleteThemeFile, exportTheme, getCustomPaletteId, listThemeFiles, PRESETS, setCustomPaletteId, subscribeCustomPalette, type CustomPaletteId, type PresetFile } from '@/lib/theme-preset';
import { hasClassAccess, requestClassAccess, resetAccessAndEnsureDirs } from '@/lib/class-folder';

export function ThemePresetPicker() {
  const colors = useTheme();
  const scheme = useColorScheme();
  const uiMode = useUiMode();
  const night = uiMode === 'night';
  const bgSetting = useBgSetting();
  const glass = !!bgSetting.uri && !!bgSetting.ctrl;
  const glassLine = scheme === 'dark' ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.30)';
  const presetId = usePresetId();
  const [open, setOpen] = useState(false);
  const [paletteId, setPaletteId] = useState<CustomPaletteId>(() => getCustomPaletteId());
  useEffect(() => subscribeCustomPalette(() => setPaletteId(getCustomPaletteId())), []);
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

  /** 导出前实时重测权限(从授权页回来立即生效, 不用重启) */
  const tryExport = async () => {
    setBusy(true);
    try {
      const ok = await resetAccessAndEnsureDirs();
      setAccess(ok);
      if (ok) await doExport();
      else
        Alert.alert('需要权限', '请先授权"所有文件访问"', [
          { text: '取消', style: 'cancel' },
          { text: '去授权', onPress: requestClassAccess },
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
      onPress={requestClassAccess}
      style={({ pressed }) => [styles.grantRow, pressed && { opacity: 0.6 }]}>
      <Ionicons name="folder-open-outline" size={16} color="#f59e0b" />
      <Text style={styles.grantText}>
        授权"所有文件访问"后, 主题与背景可存到手机 /Class 文件夹
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
              return (
                <Pressable
                  key={p.id}
                  onPress={() => onPreset(p.id)}
                  style={({ pressed }) => [
                    styles.cell,
                    pressed && { opacity: 0.7 },
                    night && { backgroundColor: 'rgba(91,140,255,0.08)', borderColor: active ? 'rgba(91,140,255,0.55)' : NightTint.line },
                    !night && !glass && { backgroundColor: active ? colors.backgroundSelected : colors.background, borderColor: active ? '#2563eb' : 'rgba(100,116,139,0.25)' },
                    !night && glass && {
                      backgroundColor: active ? 'rgba(37,99,235,0.18)' : scheme === 'dark' ? 'rgba(0,0,0,0.30)' : 'rgba(255,255,255,0.30)',
                      borderColor: active ? 'rgba(37,99,235,0.55)' : glassLine,
                    },
                  ]}>
                  <View style={styles.swatchWrap}>
                    <View style={[styles.swatchA, { backgroundColor: p.swatch[0] }, !night && { borderColor: 'rgba(100,116,139,0.3)' }]} />
                    <View style={[styles.swatchB, { backgroundColor: p.swatch[1] }, !night && { borderColor: 'rgba(100,116,139,0.3)' }]} />
                    {active && (
                      <View style={[styles.check, night && { backgroundColor: 'rgba(91,140,255,0.9)' }]}>
                        <Ionicons name="checkmark" size={12} color="#fff" />
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name={p.icon as keyof typeof Ionicons.glyphMap} size={14} color={active ? '#2563eb' : colors.textSecondary} />
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
                          borderColor: active ? '#2563eb' : night ? NightTint.line : glass ? glassLine : 'rgba(100,116,139,0.3)',
                          backgroundColor: active
                            ? night || glass
                              ? 'rgba(37,99,235,0.18)'
                              : colors.backgroundSelected
                            : 'transparent',
                        },
                      ]}>
                      <View style={[styles.chipDot, { backgroundColor: p.swatch }]} />
                      <Text style={{ color: active ? '#2563eb' : colors.text, fontSize: 12, fontWeight: active ? '700' : '500' }}>{p.label}</Text>
                      {active && <Ionicons name="checkmark" size={13} color="#2563eb" />}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 10 }}>
              选"自定义"档位后，可在此自由搭配底色配色
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
              <Ionicons name="cloud-upload-outline" size={15} color="#2563eb" />
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
              <Ionicons name="cloud-download-outline" size={15} color="#2563eb" />
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
                style={[styles.boxBtn, { backgroundColor: busy ? colors.backgroundElement : '#2563eb' }]}>
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
                      {item.data.uiMode === 'night' ? '墨夜' : item.data.scheme === 'dark' ? '深色' : '浅色'} · {item.data.at.slice(0, 10)}
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
