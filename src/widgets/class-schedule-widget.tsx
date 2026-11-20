'use no memo';
/**
 * 今日课程桌面小组件 UI
 * 注意: 小组件在 Headless JS 里由 buildWidgetTree 直接调用, 不能使用 hooks;
 * "use no memo" 用于关闭 React Compiler, 否则纯函数会被改写成 hooks 导致渲染失败。
 */

import { FlexWidget, TextWidget, type ColorProp } from 'react-native-android-widget';

import { countdownText, type WidgetCourse, type WidgetView } from '../lib/widget-data';

type Palette = {
  bgFrom: ColorProp;
  bgTo: ColorProp;
  title: ColorProp;
  body: ColorProp;
  sub: ColorProp;
  accent: ColorProp;
  green: ColorProp;
  greenSoft: ColorProp;
  divider: ColorProp;
};

const LIGHT: Palette = {
  bgFrom: '#FFFFFF',
  bgTo: '#ECF3FF',
  title: '#0F172A',
  body: '#334155',
  sub: '#64748B',
  accent: '#1D6FE0',
  green: '#15803D',
  greenSoft: '#DCFCE7',
  divider: '#E2E8F0',
};

const DARK: Palette = {
  bgFrom: '#16203A',
  bgTo: '#0B1220',
  title: '#F8FAFC',
  body: '#CBD5E1',
  sub: '#94A3B8',
  accent: '#7CB4FF',
  green: '#4ADE80',
  greenSoft: '#14351F',
  divider: '#263244',
};

type OkView = Extract<WidgetView, { kind: 'ok' }>;

function metaLine(c: WidgetCourse): string {
  return c.location ? `${c.start}-${c.end} · ${c.location}` : `${c.start}-${c.end}`;
}

function mainBlock(view: OkView, p: Palette, nameSize: number) {
  if (view.current) {
    const c = view.current;
    return (
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', marginTop: 8 }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <FlexWidget
            style={{
              backgroundColor: p.greenSoft,
              borderRadius: 6,
              paddingHorizontal: 6,
              paddingVertical: 2,
              marginRight: 6,
            }}>
            <TextWidget
              text="上课中"
              style={{ fontSize: 10, fontWeight: '700', color: p.green }}
              allowFontScaling={false}
            />
          </FlexWidget>
          <TextWidget
            text={`${c.period} 节`}
            style={{ fontSize: 10, color: p.sub }}
            allowFontScaling={false}
          />
        </FlexWidget>
        <TextWidget
          text={c.name}
          maxLines={1}
          truncate="END"
          style={{ fontSize: nameSize, fontWeight: '700', color: p.title, marginTop: 3 }}
          allowFontScaling={false}
        />
        <TextWidget
          text={metaLine(c)}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 11, color: p.sub, marginTop: 2 }}
          allowFontScaling={false}
        />
        <TextWidget
          text={`${countdownText(c.endMin - view.nowMin)}下课`}
          style={{ fontSize: 11, fontWeight: '600', color: p.green, marginTop: 2 }}
          allowFontScaling={false}
        />
      </FlexWidget>
    );
  }

  if (view.next) {
    const c = view.next;
    return (
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', marginTop: 8 }}>
        <TextWidget
          text={`下一节 · ${c.start}`}
          style={{ fontSize: 10, fontWeight: '700', color: p.accent }}
          allowFontScaling={false}
        />
        <TextWidget
          text={c.name}
          maxLines={1}
          truncate="END"
          style={{ fontSize: nameSize, fontWeight: '700', color: p.title, marginTop: 3 }}
          allowFontScaling={false}
        />
        <TextWidget
          text={metaLine(c)}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 11, color: p.sub, marginTop: 2 }}
          allowFontScaling={false}
        />
        <TextWidget
          text={`${countdownText(c.startMin - view.nowMin)}上课`}
          style={{ fontSize: 11, fontWeight: '600', color: p.accent, marginTop: 2 }}
          allowFontScaling={false}
        />
      </FlexWidget>
    );
  }

  if (view.courses.length > 0) {
    return (
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', marginTop: 8 }}>
        <TextWidget
          text="今天的课已结束"
          style={{ fontSize: nameSize - 2, fontWeight: '700', color: p.title }}
          allowFontScaling={false}
        />
        <TextWidget
          text="好好休息一下"
          style={{ fontSize: 11, color: p.sub, marginTop: 3 }}
          allowFontScaling={false}
        />
      </FlexWidget>
    );
  }

  return (
    <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', marginTop: 8 }}>
      <TextWidget
        text="今天没有课"
        style={{ fontSize: nameSize - 1, fontWeight: '700', color: p.title }}
        allowFontScaling={false}
      />
      <TextWidget
        text="好好休息，或去图书馆自习吧"
        style={{ fontSize: 11, color: p.sub, marginTop: 3 }}
        allowFontScaling={false}
      />
    </FlexWidget>
  );
}

function placeholderBlock(kind: 'stale' | 'unconfigured', p: Palette) {
  const title = kind === 'stale' ? '课表待更新' : '还没设置班级';
  const tip = kind === 'stale' ? '点开 App 同步本周课表' : '点开 App 完成课表设置';
  return (
    <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', marginTop: 10 }}>
      <TextWidget
        text={title}
        style={{ fontSize: 17, fontWeight: '700', color: p.title }}
        allowFontScaling={false}
      />
      <TextWidget
        text={tip}
        style={{ fontSize: 11, color: p.sub, marginTop: 3 }}
        allowFontScaling={false}
      />
    </FlexWidget>
  );
}

/** 下方剩余课程列表(高度够才显示) */
function restRows(view: OkView, p: Palette, count: number) {
  if (count <= 0) return [];
  const rest = view.courses
    .filter((c) => c !== view.current && c !== view.next && c.endMin > view.nowMin)
    .slice(0, count);
  if (!rest.length) return [];
  return [
    <FlexWidget
      key="divider"
      style={{ width: 'match_parent', height: 1, backgroundColor: p.divider, marginTop: 8 }}
    />,
    ...rest.map((c, i) => (
      <FlexWidget
        key={`${c.period}-${c.name}-${i}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          width: 'match_parent',
          marginTop: i === 0 ? 5 : 4,
        }}>
        <TextWidget
          text={c.start}
          style={{ fontSize: 10, color: p.accent, width: 34 }}
          allowFontScaling={false}
        />
        <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 4 }}>
          <TextWidget
            text={c.name}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 11, color: p.body }}
            allowFontScaling={false}
          />
        </FlexWidget>
        {!!c.location && (
          <TextWidget
            text={c.location}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 10, color: p.sub, width: 76, textAlign: 'right' }}
            allowFontScaling={false}
          />
        )}
      </FlexWidget>
    )),
  ];
}

type CardProps = { view: WidgetView; height: number; p: Palette };

function Card({ view, height, p }: CardProps) {
  const nameSize = height < 140 ? 17 : 20;
  const listCount = Math.max(0, Math.min(4, Math.floor((height - 128) / 22)));
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="今日课程"
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'column',
        padding: 14,
        borderRadius: 20,
        backgroundGradient: { from: p.bgFrom, to: p.bgTo, orientation: 'TL_BR' },
        overflow: 'hidden',
      }}>
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: 'match_parent',
        }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <FlexWidget
            style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: p.accent, marginRight: 6 }}
          />
          <TextWidget
            text="今日课程"
            style={{ fontSize: 12, fontWeight: '700', color: p.accent }}
            allowFontScaling={false}
          />
        </FlexWidget>
        <TextWidget
          text={`${view.weekday} ${view.dateText}`}
          style={{ fontSize: 11, color: p.sub }}
          allowFontScaling={false}
        />
      </FlexWidget>
      {view.kind === 'ok' ? mainBlock(view, p, nameSize) : placeholderBlock(view.kind, p)}
      {view.kind === 'ok' ? restRows(view, p, listCount) : []}
    </FlexWidget>
  );
}

/** 同时生成浅色/深色两套, 由系统深色模式自动切换 */
export function buildClassScheduleWidgets(view: WidgetView, height: number) {
  return {
    light: <Card view={view} height={height} p={LIGHT} />,
    dark: <Card view={view} height={height} p={DARK} />,
  };
}
