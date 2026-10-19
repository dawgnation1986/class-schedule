/** 天气: 按当前 IP 定位 → Open-Meteo 查询天气 (免 key, 30 分钟缓存) */
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

/** 定位兜底: 学校所在城市(长沙) */
const FALLBACK = { lat: 28.228, lon: 112.939, city: '长沙' };

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

/** 按 IP 定位, 失败用学校城市兜底 */
async function locate(): Promise<{ lat: number; lon: number; city: string }> {
  try {
    const r = await fetch('https://ipwho.is/', { headers: { accept: 'application/json' } });
    const j = await r.json();
    if (j && j.success !== false && typeof j.latitude === 'number' && typeof j.longitude === 'number') {
      return {
        lat: j.latitude,
        lon: j.longitude,
        city: typeof j.city === 'string' && j.city ? j.city : FALLBACK.city,
      };
    }
  } catch {
    // IP 定位失败 → 用学校城市兜底
  }
  return FALLBACK;
}

export async function fetchWeather(): Promise<Weather> {
  if (chipCache && Date.now() - chipCache.at < TTL) return chipCache.data;

  const { lat, lon, city } = await locate();
  const r = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,weather_code,is_day&timezone=auto',
  );
  if (!r.ok) throw new Error('weather http ' + r.status);
  const w = await r.json();
  const cur = w.current;
  const [desc, icon, tint] = describe(cur.weather_code, cur.is_day === 1);
  const data: Weather = { city, temp: Math.round(cur.temperature_2m), desc, icon, tint };
  chipCache = { at: Date.now(), data };
  return data;
}

export async function fetchWeatherFull(): Promise<WeatherFull> {
  if (fullCache && Date.now() - fullCache.at < TTL) return fullCache.data;

  const { lat, lon, city } = await locate();
  const r = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&current=temperature_2m,weather_code,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,' +
      'wind_speed_10m_max,uv_index_max,sunrise,sunset' +
      '&hourly=relative_humidity_2m&forecast_days=15&timezone=auto',
  );
  if (!r.ok) throw new Error('weather http ' + r.status);
  const w = await r.json();

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
    const r2 = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
        '&current=pm2_5&timezone=auto',
    );
    if (r2.ok) {
      const a = await r2.json();
      if (typeof a.current?.pm2_5 === 'number') pm25 = Math.round(a.current.pm2_5);
    }
  } catch {
    // 忽略, pm25 保持 null
  }

  const data: WeatherFull = { city, pm25, days };
  fullCache = { at: Date.now(), data };

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
