/** 用户协议: 首次启动在图文教程后弹出(全屏, 必须勾选才能同意, 拒绝则退出 App);
 *  「我的」页可随时查看(view 模式, 仅关闭)。支持控件全透明(glass)模式 */
import { useState } from 'react';
import { BackHandler, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useBgSetting } from '@/lib/background';
import { Colors } from '@/constants/theme';

const AGREEMENT_KEY = 'agreement.accepted.v1';

export async function shouldShowAgreement(): Promise<boolean> {
  try {
    return !(await AsyncStorage.getItem(AGREEMENT_KEY));
  } catch {
    return false;
  }
}

export async function markAgreementAccepted(): Promise<void> {
  try {
    await AsyncStorage.setItem(AGREEMENT_KEY, '1');
  } catch {
    // 存储失败不影响使用
  }
}

const AGREEMENT_TEXT: string[] = [
  '欢迎使用学生综合管理平台（课表助手）。在使用前，请仔细阅读并理解本协议。',
  '一、服务说明',
  '本应用为非官方的学生辅助工具，课表、考试等数据来自学校综合管理平台的公开查询接口，仅限本人查询自己的班级信息，本应用不会批量抓取或存储他人数据。',
  '二、账号与隐私',
  '1. 你在「我的」页填写的主站账号与密码仅保存在本机本地存储中，用于登录学校平台查询数据，本应用不上传、不同步、不收集你的账号密码。',
  '2. 课表设置、背景、课程提醒等配置均保存在本机；卸载应用即全部删除。',
  '3. 应用不内置任何统计 SDK，不采集设备标识，不申请与你使用功能无关的系统权限。',
  '三、上课提醒',
  '课程上课提醒为本地通知，由系统按课表在本机触发，不依赖服务器推送，可能因系统省电策略而延迟或丢失。',
  '四、免责声明',
  '1. 本应用尽力保证课表数据展示准确，但数据以学校官方平台为准；因数据接口变动、网络异常等导致的展示错误，请以学校通知为准。',
  '2. 本应用为免费的开源学习项目，按"现状"提供，开发者不对因使用本应用造成的任何直接或间接损失承担责任。',
  '五、其他',
  '1. 请勿利用本应用从事任何违反校规或法律法规的行为。',
  '2. 本协议自你勾选并点击"同意并进入"时生效。如有疑问可通过「我的」页的项目主页联系开发者。',
];

export function AgreementModal({
  visible,
  mode,
  onAccepted,
  onClose,
}: {
  visible: boolean;
  /** gate: 首次启动必须选择(同意/退出); view: 仅查看, 可关闭 */
  mode: 'gate' | 'view';
  onAccepted?: () => void;
  onClose?: () => void;
}) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const bgSetting = useBgSetting();
  const glass = !!bgSetting.uri && !!bgSetting.ctrl;
  const glassLine = scheme === 'dark' ? 'rgba(255,255,255,0.40)' : 'rgba(0,0,0,0.30)';
  const [checked, setChecked] = useState(false);

  const decline = () => BackHandler.exitApp();

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={mode === 'view' ? onClose : undefined}>
      {/* 全屏透明底, 露出自定义背景图 */}
      <View style={[styles.root, { backgroundColor: glass ? 'transparent' : colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>用户协议</Text>

        <ScrollView
          style={[styles.body, glass && { borderWidth: 1, borderColor: glassLine }]}
          contentContainerStyle={styles.bodyContent}>
          {AGREEMENT_TEXT.map((p, i) => (
            <Text
              key={i}
              style={[
                styles.para,
                { color: colors.textSecondary },
                /^[一二三四五]、/.test(p) && { color: colors.text, fontWeight: '700', marginTop: 10 },
              ]}>
              {p}
            </Text>
          ))}
        </ScrollView>

        {mode === 'gate' && (
          <Pressable onPress={() => setChecked((v) => !v)} style={styles.checkRow} hitSlop={6}>
            <View
              style={[
                styles.checkBox,
                { borderColor: checked ? '#2563eb' : glass ? glassLine : colors.backgroundElement },
                checked && { backgroundColor: '#2563eb' },
                glass && !checked && { borderWidth: 1.5 },
              ]}>
              {checked && <Ionicons name="checkmark" size={15} color="#fff" />}
            </View>
            <Text style={{ color: colors.text, fontSize: 13.5 }}>我已阅读并同意《用户协议》</Text>
          </Pressable>
        )}

        {mode === 'gate' ? (
          <View style={styles.btnRow}>
            <Pressable onPress={decline} style={[styles.declineBtn, glass && { borderWidth: 1, borderColor: glassLine }]}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>不同意并退出</Text>
            </Pressable>
            <Pressable
              disabled={!checked}
              onPress={() => {
                void markAgreementAccepted();
                onAccepted?.();
              }}
              style={[
                styles.acceptBtn,
                { opacity: checked ? 1 : 0.4 },
                glass && checked && { borderWidth: 1, borderColor: 'rgba(37,99,235,0.55)' },
              ]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>同意并进入</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={onClose}
            style={[styles.closeBtn, glass && { borderWidth: 1, borderColor: glassLine, backgroundColor: 'transparent' }]}>
            <Text style={{ color: glass ? colors.text : '#fff', fontWeight: '700' }}>关闭</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 54, paddingBottom: 30, paddingHorizontal: Spacing.three, gap: Spacing.two },
  title: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  body: { flex: 1, borderRadius: 14 },
  bodyContent: { padding: Spacing.two, gap: 6 },
  para: { fontSize: 13.5, lineHeight: 21 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkBox: { width: 21, height: 21, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  btnRow: { flexDirection: 'row', gap: Spacing.two },
  declineBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: 'rgba(128,128,128,0.15)' },
  acceptBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#2563eb' },
  closeBtn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#2563eb' },
});
