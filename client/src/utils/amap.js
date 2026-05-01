const AMAP_JS_KEY = import.meta.env.VITE_AMAP_JS_KEY;
const AMAP_SECURITY_JS_CODE = import.meta.env.VITE_AMAP_SECURITY_JS_CODE;
const DEFAULT_CENTER = [
  Number(import.meta.env.VITE_AMAP_DEFAULT_LNG) || 116.397428,
  Number(import.meta.env.VITE_AMAP_DEFAULT_LAT) || 39.90923,
];
const CHINA_LNG_RANGE = [73, 136];
const CHINA_LAT_RANGE = [3, 54];

let amapLoadPromise = null;

const toNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const inRange = (value, [min, max]) => value >= min && value <= max;

const isUsableCoordinate = (lng, lat) => (
  Number.isFinite(lng)
  && Number.isFinite(lat)
  && inRange(lng, CHINA_LNG_RANGE)
  && inRange(lat, CHINA_LAT_RANGE)
);

const normalizePlugins = (plugins = []) => Array.from(new Set(
  (Array.isArray(plugins) ? plugins : [plugins]).filter(Boolean),
));

export const hasAmapKey = () => Boolean(AMAP_JS_KEY);

export const loadAmap = async (plugins = []) => {
  if (!AMAP_JS_KEY) {
    throw new Error('未配置高德地图 JS Key，请在 client/.env 中设置 VITE_AMAP_JS_KEY');
  }

  if (!amapLoadPromise) {
    amapLoadPromise = new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        reject(new Error('当前环境不支持加载地图'));
        return;
      }

      if (window.AMap) {
        resolve(window.AMap);
        return;
      }

      if (AMAP_SECURITY_JS_CODE) {
        window._AMapSecurityConfig = {
          securityJsCode: AMAP_SECURITY_JS_CODE,
        };
      }

      const existed = document.querySelector('script[data-amap-loader="true"]');
      if (existed) {
        existed.addEventListener('load', () => resolve(window.AMap), { once: true });
        existed.addEventListener('error', () => reject(new Error('高德地图脚本加载失败，请检查 Key 是否有效')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_JS_KEY}`;
      script.async = true;
      script.defer = true;
      script.dataset.amapLoader = 'true';
      script.onload = () => {
        if (window.AMap) {
          resolve(window.AMap);
          return;
        }
        reject(new Error('高德地图脚本已加载，但 AMap 对象不可用'));
      };
      script.onerror = () => reject(new Error('高德地图脚本加载失败，请检查 Key 是否有效'));
      document.head.appendChild(script);
    }).catch((error) => {
      amapLoadPromise = null;
      throw error;
    });
  }

  const AMap = await amapLoadPromise;
  const pluginList = normalizePlugins(plugins);
  if (!pluginList.length) return AMap;

  await new Promise((resolve, reject) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('高德地图插件加载超时'));
    }, 10000);

    try {
      AMap.plugin(pluginList, () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve();
      });
    } catch (error) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      reject(error);
    }
  });

  return AMap;
};

export const getVenueCoordinate = (venue) => {
  const lng = toNumber(venue?.lng ?? venue?.map_x ?? venue?.longitude);
  const lat = toNumber(venue?.lat ?? venue?.map_y ?? venue?.latitude);
  if (!isUsableCoordinate(lng, lat)) return null;
  return { lng, lat };
};

export const isVenueCoordinateValid = (venue) => Boolean(getVenueCoordinate(venue));

export const getDefaultMapCenter = (venues = []) => {
  const coordinates = venues
    .map((item) => getVenueCoordinate(item))
    .filter(Boolean);

  if (!coordinates.length) {
    return DEFAULT_CENTER;
  }

  const avgLng = coordinates.reduce((sum, item) => sum + item.lng, 0) / coordinates.length;
  const avgLat = coordinates.reduce((sum, item) => sum + item.lat, 0) / coordinates.length;
  return [Number(avgLng.toFixed(6)), Number(avgLat.toFixed(6))];
};

export const formatCoordinate = (value) => {
  const next = toNumber(value);
  return next === null ? '--' : next.toFixed(6);
};

export const splitEquipments = (value) => (
  value
    ? String(value).split(/[,，、;；\s]+/).map((item) => item.trim()).filter(Boolean)
    : []
);

export const getVenueStatusMeta = (status) => {
  switch (Number(status)) {
    case 2:
      return {
        value: 2,
        label: '使用中',
        color: '#1677ff',
        lightColor: '#e6f4ff',
      };
    case 1:
      return {
        value: 1,
        label: '开放',
        color: '#00b578',
        lightColor: '#e8fff3',
      };
    default:
      return {
        value: 0,
        label: '维护中',
        color: '#ff4d4f',
        lightColor: '#fff1f0',
      };
  }
};

export const buildVenueNavigationUrl = (venue) => {
  const coordinate = getVenueCoordinate(venue);
  if (!coordinate) return '';
  const name = encodeURIComponent(venue?.name || '校园场地');
  return `https://uri.amap.com/navigation?to=${coordinate.lng},${coordinate.lat},${name}&mode=walk&policy=1&src=campus-booking&coordinate=gaode&callnative=0`;
};
