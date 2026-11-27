/**
 * 开机自启动 / 后台保活设置跳转(Android)
 *
 * 说明: Android 10+ 禁止应用在后台(包括开机广播里)直接拉起界面,
 * 所以「开机自启动」在这类系统上只能靠用户在系统的自启动白名单里放行,
 * App 能做的是把他准确送到对应页面, 而不是自己"申请"一个权限。
 * 国产 ROM 没有统一 API, 只能按厂商跳各自的自启动管理页, 失败则退回应用详情页。
 */
import * as Device from 'expo-device';
import * as IntentLauncher from 'expo-intent-launcher';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const FLAG_NEW_TASK = 0x10000000;

const VENDORS: { match: RegExp; pkg: string; cls: string }[] = [
  {
    match: /xiaomi|redmi|poco/i,
    pkg: 'com.miui.securitycenter',
    cls: 'com.miui.permcenter.autostart.AutoStartManagementActivity',
  },
  {
    match: /huawei|honor/i,
    pkg: 'com.huawei.systemmanager',
    cls: 'com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity',
  },
  {
    match: /oppo|realme|oneplus/i,
    pkg: 'com.coloros.safecenter',
    cls: 'com.coloros.safecenter.permission.startup.StartupAppListActivity',
  },
  {
    match: /vivo|iqoo/i,
    pkg: 'com.vivo.permissionmanager',
    cls: 'com.vivo.permissionmanager.activity.BgStartUpManagerActivity',
  },
  {
    match: /meizu/i,
    pkg: 'com.meizu.safe',
    cls: 'com.meizu.safe.permission.SmartBGActivity',
  },
  {
    match: /asus|zenfone/i,
    pkg: 'com.asus.mobilemanager',
    cls: 'com.asus.mobilemanager.autostart.AutoStartActivity',
  },
];

function appId(): string {
  return Constants.expoConfig?.android?.package ?? 'com.classhoke.classschedule';
}

/** 打开系统「应用详情」页(自启动管理的兜底入口) */
export async function openAppDetails(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    await IntentLauncher.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', {
      data: `package:${appId()}`,
    });
    return true;
  } catch {
    return false;
  }
}

/** 打开厂商的自启动管理页; 打不开就退回应用详情页 */
export async function openAutoStartSettings(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const device = `${Device.manufacturer ?? ''} ${Device.brand ?? ''} ${Device.modelName ?? ''}`;
  const vendor = VENDORS.find((v) => v.match.test(device));
  if (vendor) {
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
        packageName: vendor.pkg,
        className: vendor.cls,
        flags: FLAG_NEW_TASK,
      });
      return true;
    } catch {
      // 该 ROM 上没有这个页面, 走兜底
    }
  }
  return openAppDetails();
}

/** 把 App 加入电池优化白名单(否则息屏后提醒会被系统掐掉) */
export async function openBatteryWhitelist(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    await IntentLauncher.startActivityAsync('android.settings.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', {
      data: `package:${appId()}`,
    });
    return true;
  } catch {
    return openAppDetails();
  }
}
