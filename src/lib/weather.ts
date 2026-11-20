/** 天气: 手动城市(持久化) / IP 定位 → Open-Meteo 查询天气 (免 key, 30 分钟缓存)
 *  备用链: Open-Meteo(境外) 失败 → 中国天气网数据源(sojson, 国内免代理) → 上次成功缓存 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { CN_CITY_CODES } from './cn-city-codes';

export type Weather = {
  city: string;
  /** 摄氏度(已取整) */
  temp: number;
  desc: string;
  /** Ionicons 图标名 */
  icon: string;
  /** 图标颜色 */
  tint: string;
};

/** 单日预报(用于 15 天列表与详情) */
export type DayForecast = {
  /** YYYY-MM-DD */
  date: string;
  desc: string;
  icon: string;
  tint: string;
  max: number;
  min: number;
  /** 平均湿度 % */
  humidity: number;
  /** 降水概率 % */
  precipProb: number;
  /** 最大风速 km/h */
  wind: number;
  /** 紫外线指数 */
  uv: number;
  /** HH:mm */
  sunrise: string;
  sunset: string;
};

/** 15 天完整天气(弹层数据) */
export type WeatherFull = {
  city: string;
  /** 当前 PM2.5 (仅"今天"详情展示; 获取失败为 null) */
  pm25: number | null;
  days: DayForecast[];
};

const TTL = 30 * 60 * 1000;
let chipCache: { at: number; data: Weather } | null = null;
let fullCache: { at: number; data: WeatherFull } | null = null;
let locCache: { at: number; data: { lat: number; lon: number; city: string } } | null = null;

/** 定位兜底: 学校所在城市(长沙) */
const FALLBACK = { lat: 28.228, lon: 112.939, city: '长沙' };

/* ---------- 手动城市设置(持久化) ---------- */
const CITY_KEY = 'weather-city-v1';
let cityOverride: string | null | undefined; // undefined=未加载, null=跟随定位

/** 读取手动城市; null 表示跟随定位 */
export async function getWeatherCity(): Promise<string | null> {
  if (cityOverride === undefined) cityOverride = (await AsyncStorage.getItem(CITY_KEY)) ?? null;
  return cityOverride;
}

/** 设置手动城市; 传 null 恢复自动定位 */
export async function setWeatherCity(c: string | null): Promise<void> {
  cityOverride = c;
  if (c) await AsyncStorage.setItem(CITY_KEY, c);
  else await AsyncStorage.removeItem(CITY_KEY);
  chipCache = null;
  fullCache = null;
  locCache = null;
}

/** WMO weather code → (描述, 图标, 颜色) */
function describe(code: number, isDay: boolean): [string, string, string] {
  if (code === 0) return isDay ? ['晴', 'sunny', '#f59e0b'] : ['晴', 'moon', '#6366f1'];
  if (code === 1) return isDay ? ['晴间多云', 'partly-sunny', '#f59e0b'] : ['晴间多云', 'cloudy-night', '#6366f1'];
  if (code === 2) return isDay ? ['多云', 'partly-sunny', '#f59e0b'] : ['多云', 'cloudy-night', '#6366f1'];
  if (code === 3) return ['阴', 'cloudy', '#64748b'];
  if (code === 45 || code === 48) return ['雾', 'cloudy', '#94a3b8'];
  if (code >= 51 && code <= 57) return ['毛毛雨', 'rainy', '#3b82f6'];
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ['雨', 'rainy', '#3b82f6'];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ['雪', 'snow', '#38bdf8'];
  if (code >= 95) return ['雷阵雨', 'thunderstorm', '#8b5cf6'];
  return ['未知', 'help-circle-outline', '#94a3b8'];
}

/** 中文天气描述 → (描述, 图标, 颜色) */
function describeText(type: string): [string, string, string] {
  const t = (type || '').trim();
  if (t.includes('雷')) return [t, 'thunderstorm', '#8b5cf6'];
  if (t.includes('雪')) return [t, 'snow', '#38bdf8'];
  if (t.includes('雨')) return [t, 'rainy', '#3b82f6'];
  if (t.includes('雾') || t.includes('霾')) return [t, 'cloudy', '#94a3b8'];
  if (t.includes('阴')) return [t, 'cloudy', '#64748b'];
  if (t.includes('云')) return [t, 'partly-sunny', '#f59e0b'];
  if (t.includes('晴')) return [t, 'sunny', '#f59e0b'];
  if (t.includes('沙') || t.includes('尘') || t.includes('风')) return [t, 'partly-sunny', '#94a3b8'];
  return [t || '未知', 'cloudy', '#94a3b8'];
}

/** 城市名 → 经纬度 + 中文名(Open-Meteo 地理编码, 结果缓存) */
const geoCache = new Map<string, { lat: number; lon: number; city: string }>();

/** 带超时的 JSON 请求: 校园网/未开代理时 open-meteo 可能长时间无响应 */
async function fetchJson(url: string, timeoutMs: number, init?: RequestInit): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

async function geocode(name: string): Promise<{ lat: number; lon: number; city: string } | null> {
  const key = name.trim();
  if (!key) return null;
  const hit = geoCache.get(key);
  if (hit) return hit;
  try {
    const j = await fetchJson(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(key)}&count=1&language=zh&format=json`,
      6000,
    );
    const g = j.results?.[0];
    if (g && typeof g.latitude === 'number' && typeof g.longitude === 'number') {
      const res = { lat: g.latitude, lon: g.longitude, city: typeof g.name === 'string' && g.name ? g.name : key };
      geoCache.set(key, res);
      return res;
    }
  } catch {
    // 地理编码失败 → 返回 null
  }
  return null;
}

/** 定位优先级: 手动城市 > IP 定位(转中文城市名) > 学校城市兜底 */
async function locate(): Promise<{ lat: number; lon: number; city: string }> {
  if (locCache && Date.now() - locCache.at < TTL) return locCache.data;

  const manual = await getWeatherCity();
  let out: { lat: number; lon: number; city: string } | null = null;
  if (manual) {
    out = await geocode(manual);
  } else {
    try {
      const j = await fetchJson('https://ipwho.is/', 4000, { headers: { accept: 'application/json' } });
      if (j && j.success !== false && typeof j.latitude === 'number' && typeof j.longitude === 'number') {
        const lat = j.latitude as number;
        const lon = j.longitude as number;
        const en = typeof j.city === 'string' ? j.city : '';
        // IP 定位给的是英文名(如 Changsha) → 地理编码转中文
        const zh = en ? await geocode(en) : null;
        out = zh ?? (en ? { lat, lon, city: en } : null);
      }
    } catch {
      // IP 定位失败 → 用学校城市兜底
    }
  }
  // 兜底结果不缓存: 网络恢复(如开了代理)后下一次查询可重新定位
  if (!out) return FALLBACK;
  locCache = { at: Date.now(), data: out };
  return out;
}

/* ---------- 国内备用源: 中国天气网数据(sojson 镜像, 免 key, HTTP) ---------- */

/** 城市名 → 中国天气网代码(支持"长沙市"/"海南省海口市"这类写法) */
function cityCodeOf(name: string): string | null {
  const raw = (name || '').trim();
  if (!raw) return null;
  if (CN_CITY_CODES[raw]) return CN_CITY_CODES[raw];
  const stripped = raw.replace(/(市|地区|自治州|自治县|县|区|盟)$/, '');
  if (CN_CITY_CODES[stripped]) return CN_CITY_CODES[stripped];
  const hit = Object.keys(CN_CITY_CODES).find((k) => raw.includes(k));
  return hit ? CN_CITY_CODES[hit] : null;
}

/** 国内 IP 定位(免代理): 主源被墙时用来确定城市 */
async function ipCityDomestic(): Promise<string | null> {
  try {
    const j = await fetchJson('https://myip.ipip.net/json', 5000);
    const loc = j?.data?.location;
    if (Array.isArray(loc)) {
      const city = String(loc[2] ?? '').trim();
      if (city && city !== 'None') return city;
      const prov = String(loc[1] ?? '').trim();
      if (prov && prov !== 'None') return prov;
    }
  } catch {
    // 忽略, 继续用学校城市兜底
  }
  return null;
}

/** 备用源: 实时天气 */
async function fetchDomesticWeather(): Promise<Weather> {
  const manual = await getWeatherCity();
  const cityName = manual || (await ipCityDomestic()) || FALLBACK.city;
  const code = cityCodeOf(cityName) ?? cityCodeOf(FALLBACK.city);
  if (!code) throw new Error('city code not found');
  const j = await fetchJson(`http://t.weather.sojson.com/api/weather/city/${code}`, 8000);
  const today = j?.data?.forecast?.[0];
  const temp = Math.round(Number(j?.data?.wendu));
  if (j?.status !== 200 || !today || !Number.isFinite(temp)) throw new Error('domestic weather failed');
  const [desc, icon, tint] = describeText(String(today.type ?? ''));
  const city = String(j.cityInfo?.city ?? cityName).replace(/市$/, '') || cityName;
  return { city, temp, desc, icon, tint };
}

/** 备用源: 15 天预报(该源没有湿度/降水概率/紫外线, 用 0 占位) */
async function fetchDomesticFull(): Promise<WeatherFull> {
  const manual = await getWeatherCity();
  const cityName = manual || (await ipCityDomestic()) || FALLBACK.city;
  const code = cityCodeOf(cityName) ?? cityCodeOf(FALLBACK.city);
  if (!code) throw new Error('city code not found');
  const j = await fetchJson(`http://t.weather.sojson.com/api/weather/city/${code}`, 8000);
  const list = j?.data?.forecast;
  if (j?.status !== 200 || !Array.isArray(list) || !list.length) throw new Error('domestic weather failed');

  const todayHum = Math.round(Number(String(j.data.shidu ?? '').replace(/[^\d]/g, '')));
  const days: DayForecast[] = list.slice(0, 15).map((f: any, i: number) => {
    const type = String(f.type ?? '');
    const [desc, icon, tint] = describeText(type);
    const level = Number(String(f.fl ?? '').replace(/[^\d]/g, '')) || 0;
    return {
      date: String(f.ymd ?? ''),
      desc,
      icon,
      tint,
      max: Math.round(Number(String(f.high ?? '').replace(/[^\d-]/g, ''))) || 0,
      min: Math.round(Number(String(f.low ?? '').replace(/[^\d-]/g, ''))) || 0,
      humidity: i === 0 && Number.isFinite(todayHum) ? todayHum : 0,
      precipProb: type.includes('雨') ? 60 : type.includes('雪') ? 50 : 0,
      wind: level * 5,
      uv: 0,
      sunrise: String(f.sunrise ?? ''),
      sunset: String(f.sunset ?? ''),
    };
  });
  const pm25Raw = Number(j.data.pm25);
  const pm25 = Number.isFinite(pm25Raw) && pm25Raw > 0 ? Math.round(pm25Raw) : null;
  const city = String(j.cityInfo?.city ?? cityName).replace(/市$/, '') || cityName;
  return { city, pm25, days };
}

const LAST_WEATHER_KEY = 'weather-last-v1';

/** 读取当天成功获取的天气(不发请求): 小组件/早报用, 非当天视为过期 */
export async function getCachedWeather(): Promise<Weather | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_WEATHER_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as { at?: number; data?: Weather } | Weather;
    if (!('at' in c) || !c.at || !c.data) return null; // 旧格式没有时间戳, 可能已过期
    const at = new Date(c.at);
    const now = new Date();
    const sameDay =
      at.getFullYear() === now.getFullYear() &&
      at.getMonth() === now.getMonth() &&
      at.getDate() === now.getDate();
    return sameDay ? c.data : null;
  } catch {
    return null;
  }
}

export async function fetchWeather(): Promise<Weather> {
  if (chipCache && Date.now() - chipCache.at < TTL) return chipCache.data;

  let data: Weather | null = null;
  try {
    // 主源: Open-Meteo(境外, 数据最全)
    const { lat, lon, city } = await locate();
    const w = await fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        '&current=temperature_2m,weather_code,is_day&timezone=auto',
      6000,
    );
    const cur = w.current;
    const [desc, icon, tint] = describe(cur.weather_code, cur.is_day === 1);
    data = { city, temp: Math.round(cur.temperature_2m), desc, icon, tint };
  } catch {
    // 备用源: 国内天气接口(不需要代理)
    try {
      data = await fetchDomesticWeather();
    } catch {
      data = null;
    }
  }

  if (data) {
    chipCache = { at: Date.now(), data };
    // 持久化最近一次成功结果: 网络失败时兜底展示
    await AsyncStorage.setItem(LAST_WEATHER_KEY, JSON.stringify({ at: Date.now(), data })).catch(() => {});
    return data;
  }

  // 都失败 → 展示最近一次缓存的天气(保持胶囊常显)
  const stale = await AsyncStorage.getItem(LAST_WEATHER_KEY).catch(() => null);
  if (stale) {
    try {
      const parsed = JSON.parse(stale) as { data?: Weather } | Weather;
      const cached = 'data' in parsed && parsed.data ? parsed.data : (parsed as Weather);
      chipCache = { at: Date.now(), data: cached };
      return cached;
    } catch {
      // 缓存损坏 → 抛错
    }
  }
  throw new Error('weather unavailable');
}

/** 主源: Open-Meteo 15 天预报 */
async function fetchOpenMeteoFull(): Promise<WeatherFull> {
  const { lat, lon, city } = await locate();
  const w = await fetchJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,weather_code,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,' +
      'wind_speed_10m_max,uv_index_max,sunrise,sunset' +
      '&hourly=relative_humidity_2m&forecast_days=15&timezone=auto',
    8000,
  );

  // 逐日平均湿度(小时值聚合)
  const hum: number[] = w.hourly?.relative_humidity_2m ?? [];
  const d = w.daily;
  const days: DayForecast[] = [];
  for (let i = 0; i < d.time.length; i++) {
    const slice = hum.slice(i * 24, i * 24 + 24).filter((v: number | null) => typeof v === 'number');
    const humidity = slice.length ? Math.round(slice.reduce((a, b) => a + b, 0) / slice.length) : 0;
    const [desc, icon, tint] = describe(d.weather_code[i], true);
    days.push({
      date: d.time[i],
      desc,
      icon,
      tint,
      max: Math.round(d.temperature_2m_max[i]),
      min: Math.round(d.temperature_2m_min[i]),
      humidity,
      precipProb: d.precipitation_probability_max?.[i] ?? 0,
      wind: Math.round(d.wind_speed_10m_max?.[i] ?? 0),
      uv: d.uv_index_max?.[i] ?? 0,
      sunrise: (d.sunrise?.[i] ?? '').slice(11),
      sunset: (d.sunset?.[i] ?? '').slice(11),
    });
  }

  // 当前 PM2.5 (空气质量接口, 失败不影响主体)
  let pm25: number | null = null;
  try {
    const a = await fetchJson(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
        '&current=pm2_5&timezone=auto',
      6000,
    );
    if (typeof a.current?.pm2_5 === 'number') pm25 = Math.round(a.current.pm2_5);
  } catch {
    // 忽略, pm25 保持 null
  }

  const data: WeatherFull = { city, pm25, days };

  // 顺带刷新胶囊缓存(同一请求里的 current)
  const cur = w.current;
  if (cur) {
    const [desc, icon, tint] = describe(cur.weather_code, cur.is_day === 1);
    chipCache = {
      at: Date.now(),
      data: { city, temp: Math.round(cur.temperature_2m), desc, icon, tint },
    };
  }
  return data;
}

export async function fetchWeatherFull(): Promise<WeatherFull> {
  if (fullCache && Date.now() - fullCache.at < TTL) return fullCache.data;

  let data: WeatherFull;
  try {
    data = await fetchOpenMeteoFull();
  } catch {
    // 主源不可用 → 国内备用源
    data = await fetchDomesticFull();
  }
  fullCache = { at: Date.now(), data };
  return data;
}
