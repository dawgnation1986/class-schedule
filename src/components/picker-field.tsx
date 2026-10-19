import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import type { Option } from '@/lib/timetable';

/** 简单的选择器: 按钮 + 弹出选项列表 (设置页/临时查询页共用) */
export function PickerField({
  label,
  placeholder,
  value,
  options,
  disabled,
  onPick,
  colors,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: Option[];
  disabled?: boolean;
  onPick: (o: Option) => void;
  colors: (typeof Colors)[keyof typeof Colors];
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[
          styles.pickerBtn,
          { backgroundColor: colors.backgroundElement, opacity: disabled ? 0.5 : 1 },
        ]}>
        <Text style={{ color: current ? colors.text : colors.textSecondary }} numberOfLines={1}>
          {current ? current.label : placeholder}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalMask} onPress={() => setOpen(false)}>
          <View style={[styles.modalBox, { backgroundColor: colors.background }]}>
            <ScrollView style={{ maxHeight: 400 }}>
              {options.map((o) => (
                <Pressable
                  key={o.value}
                  style={[styles.optionRow, o.value === value && { backgroundColor: colors.backgroundSelected }]}
                  onPress={() => {
                    setOpen(false);
                    onPick(o);
                  }}>
                  <Text style={{ color: colors.text }}>{o.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldWrap: { marginBottom: Spacing.three },
  fieldLabel: { fontSize: 13, marginBottom: 6 },
  pickerBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  modalMask: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: Spacing.three },
  modalBox: { borderRadius: 14, padding: Spacing.two },
  optionRow: { paddingVertical: 12, paddingHorizontal: Spacing.two, borderRadius: 8 },
});
