/**
 * App 入口: 先注册 Android 桌面小组件的 Headless JS 任务, 再交给 expo-router。
 * 小组件原生模块只存在于原生包中(Expo Go 没有), 这里用 try/catch 兜住。
 */
const { Platform } = require('react-native');

if (Platform.OS === 'android') {
  try {
    require('./src/lib/widget').registerClassScheduleWidget();
  } catch {
    // Expo Go / 未安装原生模块时忽略
  }
}

require('expo-router/entry');
