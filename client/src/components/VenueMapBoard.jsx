import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { Button, List, SearchBar, SpinLoading } from 'antd-mobile';
import {
  formatCoordinate,
  getDefaultMapCenter,
  getVenueCoordinate,
  getVenueStatusMeta,
  hasAmapKey,
  loadAmap,
} from '../utils/amap';

const PLUGINS = ['AMap.Scale', 'AMap.ToolBar', 'AMap.PlaceSearch', 'AMap.Geocoder', 'AMap.Geolocation'];
const logMapDebug = (action, error) => {
  if (import.meta.env.DEV) {
    console.debug(`[VenueMapBoard] ${action}`, error);
  }
};

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getMarkerMetrics = () => ({
  size: 28,
});

const createMarkerSvg = (color, active = false) => {
  const stroke = active ? '#0b1f44' : '#ffffff';
  const { size } = getMarkerMetrics();
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true">
      <path d="M20 2c-7.18 0-13 5.82-13 13 0 8.84 10.13 20.31 12.28 22.65a1 1 0 0 0 1.45 0C22.87 35.31 33 23.84 33 15 33 7.82 27.18 2 20 2Z" fill="${color}" stroke="${stroke}" stroke-width="${active ? 2.6 : 2}" />
      <circle cx="20" cy="15" r="5.8" fill="#ffffff" />
    </svg>
  `)}`;
};

const VenueMapBoard = ({
  venues = [],
  selectedVenueId,
  onSelectVenue,
  allowPick = false,
  pickerValue = null,
  onPick,
  height = 420,
  showLegend = true,
  showSearch = false,
  visible = true,
  selectedMarkerOffsetY = 0,
  className,
  style,
}) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const placeSearchRef = useRef(null);
  const geocoderRef = useRef(null);
  const geolocationRef = useRef(null);
  const pickerMarkerRef = useRef(null);
  const pickerRef = useRef(onPick);
  const selectorRef = useRef(onSelectVenue);
  const autoFitDoneRef = useRef(false);
  const mapReadyRef = useRef(false);
  const resizeObserverRef = useRef(null);
  const renderMarkersRef = useRef(() => {});
  const syncTimersRef = useRef([]);
  const syncRafRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [markerRenderKey, setMarkerRenderKey] = useState(0);
  const [mapReadyToken, setMapReadyToken] = useState(0);

  useEffect(() => {
    pickerRef.current = onPick;
    selectorRef.current = onSelectVenue;
  }, [onPick, onSelectVenue]);

  const validVenues = useMemo(
    () => venues.filter((item) => getVenueCoordinate(item)),
    [venues],
  );
  const mapHeight = typeof height === 'number' ? `${height}px` : height;
  const defaultCenter = useMemo(() => getDefaultMapCenter(validVenues), [validVenues]);
  const selectedPicker = useMemo(() => {
    if (!pickerValue) return null;
    const lng = Number(pickerValue.lng ?? pickerValue.map_x);
    const lat = Number(pickerValue.lat ?? pickerValue.map_y);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return {
      lng,
      lat,
      address: pickerValue.address || '',
    };
  }, [pickerValue]);

  const clearScheduledSyncs = useCallback(() => {
    if (syncRafRef.current) {
      window.cancelAnimationFrame(syncRafRef.current);
      syncRafRef.current = 0;
    }
    syncTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    syncTimersRef.current = [];
  }, []);

  const clearVenueMarkers = useCallback(() => {
    markersRef.current.forEach((marker) => {
      try {
        marker.off?.('click');
        marker.setMap(null);
      } catch (error) {
        logMapDebug('clearVenueMarkers', error);
      }
    });
    markersRef.current.clear();
  }, []);

  const restoreMarkerOverlays = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => {
      try {
        marker.setMap(map);
        marker.show?.();
      } catch (error) {
        logMapDebug('restoreMarkerOverlays:marker', error);
      }
    });

    if (pickerMarkerRef.current) {
      try {
        pickerMarkerRef.current.setMap(map);
        pickerMarkerRef.current.show?.();
      } catch (error) {
        logMapDebug('restoreMarkerOverlays:picker', error);
      }
    }
  }, []);

  const scheduleMapSync = useCallback(({ delay = 0, refit = false } = {}) => {
    const run = () => {
      const map = mapRef.current;
      if (!map) return;
      map.resize?.();
      restoreMarkerOverlays();
      if (mapReadyRef.current) {
        renderMarkersRef.current?.({ refit });
      }
    };

    if (delay > 0) {
      const timer = window.setTimeout(() => {
        syncTimersRef.current = syncTimersRef.current.filter((item) => item !== timer);
        syncRafRef.current = window.requestAnimationFrame(run);
      }, delay);
      syncTimersRef.current.push(timer);
      return;
    }

    syncRafRef.current = window.requestAnimationFrame(run);
  }, [restoreMarkerOverlays]);

  const renderMarkers = useCallback(({ refit = false } = {}) => {
    const map = mapRef.current;
    const AMap = window.AMap;
    if (!map || !AMap || loading || error || !mapReadyRef.current) return;

    clearVenueMarkers();

    const markerList = [];
    validVenues.forEach((venue) => {
      const coordinate = getVenueCoordinate(venue);
      if (!coordinate) return;

      const active = Number(selectedVenueId) === Number(venue.id);
      const statusMeta = getVenueStatusMeta(venue.status);
      const { size } = getMarkerMetrics();
      const marker = new AMap.Marker({
        map,
        position: [coordinate.lng, coordinate.lat],
        anchor: 'bottom-center',
        offset: new AMap.Pixel(0, 0),
        icon: new AMap.Icon({
          image: createMarkerSvg(statusMeta.color, active),
          size: new AMap.Size(size, size),
          imageSize: new AMap.Size(size, size),
        }),
        label: {
          content: `<div class="venue-map-board__marker-label${active ? ' is-active' : ''}">${escapeHtml(venue.name || '')}</div>`,
          direction: 'top',
          offset: new AMap.Pixel(0, -10),
        },
        title: venue.name,
        zIndex: active ? 130 : 100,
        extData: venue,
      });

      marker.on('click', () => {
        selectorRef.current?.(venue);
      });

      markersRef.current.set(venue.id, marker);
      markerList.push(marker);
    });

    window.requestAnimationFrame(() => {
      const latestMap = mapRef.current;
      if (!latestMap) return;

      latestMap.resize?.();
      restoreMarkerOverlays();

      if ((refit || !autoFitDoneRef.current) && markerList.length) {
        autoFitDoneRef.current = true;
        latestMap.setFitView(
          markerList,
          false,
          [72, 78, allowPick ? 120 : Math.max(54, selectedMarkerOffsetY + 80), 72],
        );
      }

      setMarkerRenderKey((prev) => prev + 1);
    });
  }, [allowPick, clearVenueMarkers, error, loading, restoreMarkerOverlays, selectedMarkerOffsetY, selectedVenueId, validVenues]);

  useEffect(() => {
    renderMarkersRef.current = renderMarkers;
  }, [renderMarkers]);

  const resolveAddress = useCallback((point) => new Promise((resolve) => {
    if (!geocoderRef.current) {
      resolve('');
      return;
    }

    geocoderRef.current.getAddress([point.lng, point.lat], (status, result) => {
      if (status === 'complete' && result?.regeocode) {
        resolve(result.regeocode.formattedAddress || '');
        return;
      }
      resolve('');
    });
  }), []);

  const handlePickedPoint = useCallback(async (point, injectedAddress = '') => {
    const address = injectedAddress || await resolveAddress(point);
    pickerRef.current?.({
      lng: Number(point.lng.toFixed(6)),
      lat: Number(point.lat.toFixed(6)),
      address,
    });
  }, [resolveAddress]);

  useEffect(() => {
    let disposed = false;

    const initMap = async () => {
      if (!containerRef.current) return;
      setLoading(true);
      setError('');
      autoFitDoneRef.current = false;
      mapReadyRef.current = false;
      setMapReadyToken(0);
      clearScheduledSyncs();
      resizeObserverRef.current?.disconnect?.();
      resizeObserverRef.current = null;

      if (!hasAmapKey()) {
        setError('未配置高德地图 JS Key，请在 client/.env 中设置 VITE_AMAP_JS_KEY');
        setLoading(false);
        return;
      }

      try {
        const AMap = await loadAmap(PLUGINS);
        if (disposed || !containerRef.current) return;

        containerRef.current.innerHTML = '';

        const map = new AMap.Map(containerRef.current, {
          zoom: 17,
          center: defaultCenter,
          viewMode: '2D',
          resizeEnable: true,
        });
        mapRef.current = map;

        map.on('complete', () => {
          if (disposed || map !== mapRef.current) return;
          mapReadyRef.current = true;
          setMapReadyToken((prev) => prev + 1);
          scheduleMapSync({ refit: true });
          scheduleMapSync({ delay: 180 });
          scheduleMapSync({ delay: 420 });
        });

        map.on('resize', () => {
          if (disposed || map !== mapRef.current) return;
          restoreMarkerOverlays();
        });

        geocoderRef.current = new AMap.Geocoder();
        placeSearchRef.current = new AMap.PlaceSearch({ pageSize: 8, city: '全国' });
        geolocationRef.current = new AMap.Geolocation({
          enableHighAccuracy: true,
          timeout: 10000,
          position: 'RB',
        });

        map.addControl(new AMap.Scale());
        map.addControl(new AMap.ToolBar({ position: { right: '12px', bottom: allowPick ? '76px' : '20px' } }));

        if (allowPick) {
          map.on('click', (event) => {
            const point = event?.lnglat;
            if (!point) return;
            handlePickedPoint({ lng: point.lng, lat: point.lat });
          });
        }

        if (typeof ResizeObserver !== 'undefined') {
          resizeObserverRef.current = new ResizeObserver((entries) => {
            const entry = entries[0];
            const width = Math.round(entry?.contentRect?.width || 0);
            const height = Math.round(entry?.contentRect?.height || 0);
            if (!width || !height) return;
            scheduleMapSync();
          });
          resizeObserverRef.current.observe(containerRef.current);
        }

        setLoading(false);
        setError('');
        scheduleMapSync({ delay: 60 });
      } catch (err) {
        console.error(err);
        if (!disposed) {
          setLoading(false);
          setError(err.message || '地图初始化失败，请检查配置或 Key 状态');
        }
      }
    };

    initMap();

    return () => {
      disposed = true;
      clearScheduledSyncs();
      resizeObserverRef.current?.disconnect?.();
      resizeObserverRef.current = null;
      mapReadyRef.current = false;
      clearVenueMarkers();
      if (pickerMarkerRef.current) {
        pickerMarkerRef.current.setMap(null);
        pickerMarkerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [allowPick, clearScheduledSyncs, clearVenueMarkers, defaultCenter, handlePickedPoint, restoreMarkerOverlays, scheduleMapSync]);

  useEffect(() => {
    if (!visible || !mapRef.current) return undefined;
    scheduleMapSync();
    scheduleMapSync({ delay: 120 });
    scheduleMapSync({ delay: 320 });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleMapSync({ delay: 30 });
      }
    };
    const handlePageShow = () => {
      scheduleMapSync({ delay: 30 });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [scheduleMapSync, visible]);

  useEffect(() => {
    if (!mapReadyToken) return;
    renderMarkers({ refit: !autoFitDoneRef.current });
  }, [mapReadyToken, renderMarkers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedVenueId) return;
    const marker = markersRef.current.get(selectedVenueId);
    if (!marker) {
      scheduleMapSync({ delay: 80 });
      return;
    }

    window.requestAnimationFrame(() => {
      const currentMap = mapRef.current;
      const currentMarker = markersRef.current.get(selectedVenueId);
      if (!currentMap || !currentMarker) return;
      currentMap.setCenter(currentMarker.getPosition());
      if (selectedMarkerOffsetY && typeof currentMap.panBy === 'function') {
        currentMap.panBy(0, -selectedMarkerOffsetY);
      }
      if (currentMap.getZoom() < 17) {
        currentMap.setZoom(17);
      }
      restoreMarkerOverlays();
    });
  }, [markerRenderKey, restoreMarkerOverlays, scheduleMapSync, selectedMarkerOffsetY, selectedVenueId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !allowPick || loading || error) return;
    const AMap = window.AMap;

    if (!selectedPicker) {
      if (pickerMarkerRef.current) {
        pickerMarkerRef.current.setMap(null);
        pickerMarkerRef.current = null;
      }
      return;
    }

    if (!pickerMarkerRef.current) {
      const { size } = getMarkerMetrics();
      const marker = new AMap.Marker({
        position: [selectedPicker.lng, selectedPicker.lat],
        anchor: 'bottom-center',
        offset: new AMap.Pixel(0, 0),
        draggable: true,
        zIndex: 150,
        icon: new AMap.Icon({
          image: createMarkerSvg('#ff4d4f', true),
          size: new AMap.Size(size, size),
          imageSize: new AMap.Size(size, size),
        }),
        map,
      });
      marker.on('dragend', (event) => {
        const point = event?.lnglat;
        if (!point) return;
        handlePickedPoint({ lng: point.lng, lat: point.lat });
      });
      pickerMarkerRef.current = marker;
    } else {
      pickerMarkerRef.current.setPosition([selectedPicker.lng, selectedPicker.lat]);
      pickerMarkerRef.current.setMap(map);
    }

    map.setCenter([selectedPicker.lng, selectedPicker.lat]);
    if (map.getZoom() < 18) {
      map.setZoom(18);
    }
  }, [selectedPicker, allowPick, loading, error, handlePickedPoint]);

  const handleSearch = async (input = keyword) => {
    const value = input.trim();
    if (!value || !placeSearchRef.current) return;

    setSearching(true);
    setSearchResults([]);

    placeSearchRef.current.search(value, (status, result) => {
      setSearching(false);
      if (status !== 'complete' || !result?.poiList?.pois?.length) {
        setSearchResults([]);
        return;
      }

      const list = result.poiList.pois
        .map((item) => {
          const lng = item?.location?.lng;
          const lat = item?.location?.lat;
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
          return {
            id: item.id || `${item.name}-${lng}-${lat}`,
            name: item.name,
            address: [item.pname, item.cityname, item.adname, item.address].filter(Boolean).join(' '),
            lng,
            lat,
          };
        })
        .filter(Boolean);

      setSearchResults(list);
      if (list[0] && mapRef.current) {
        mapRef.current.setCenter([list[0].lng, list[0].lat]);
        mapRef.current.setZoom(18);
      }
    });
  };

  const handleUseCurrentLocation = () => {
    if (!geolocationRef.current) return;
    setSearching(true);
    geolocationRef.current.getCurrentPosition((status, result) => {
      setSearching(false);
      if (status !== 'complete' || !result?.position) return;
      const point = {
        lng: result.position.lng,
        lat: result.position.lat,
      };
      mapRef.current?.setCenter([point.lng, point.lat]);
      mapRef.current?.setZoom(18);
      if (allowPick) {
        handlePickedPoint(point);
      }
    });
  };

  const handleSearchResultClick = (item) => {
    setKeyword(item.name);
    setSearchResults([]);
    mapRef.current?.setCenter([item.lng, item.lat]);
    mapRef.current?.setZoom(18);
    if (allowPick) {
      handlePickedPoint({ lng: item.lng, lat: item.lat }, item.address || item.name);
    }
  };

  return (
    <div className={classNames('venue-map-board', className)} style={style}>
      {showSearch ? (
        <div className='venue-map-board__toolbar'>
          <div className='venue-map-board__toolbar-main'>
            <SearchBar
              value={keyword}
              placeholder={allowPick ? '搜索地点后可点击地图选点' : '搜索场地名称'}
              onChange={setKeyword}
              onSearch={handleSearch}
            />
          </div>
          <div className='venue-map-board__toolbar-actions'>
            <Button size='small' onClick={() => handleSearch()} loading={searching}>搜索</Button>
            <Button size='small' color='primary' fill='outline' onClick={handleUseCurrentLocation} loading={searching}>定位</Button>
          </div>
        </div>
      ) : null}

      <div className='venue-map-board__canvas' style={{ height: mapHeight }} ref={containerRef} />

      {(loading || error) ? (
        <div className='venue-map-board__overlay'>
          {loading ? (
            <div className='venue-map-board__overlay-card'>
              <SpinLoading color='primary' style={{ '--size': '28px' }} />
              <div style={{ marginTop: 12 }}>地图加载中...</div>
            </div>
          ) : (
            <div className='venue-map-board__overlay-card is-error'>
              <div>{error}</div>
              <div className='venue-map-board__overlay-tip'>
                请确认已在高德开放平台创建 Web 端（JS API）Key，并在 Web 安全域名中配置当前站点。
              </div>
            </div>
          )}
        </div>
      ) : null}

      {showLegend ? (
        <div className='venue-map-board__legend'>
          {['开放', '使用中', '维护中', allowPick ? '已选位置' : null].filter(Boolean).map((label) => {
            let color = '#00b578';
            if (label === '使用中') color = '#1677ff';
            if (label === '维护中') color = '#ff4d4f';
            if (label === '已选位置') color = '#ff4d4f';
            return (
              <div className='venue-map-board__legend-item' key={label}>
                <span className='venue-map-board__legend-dot' style={{ background: color }} />
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {searchResults.length ? (
        <div className='venue-map-board__search-results'>
          <List>
            {searchResults.slice(0, 6).map((item) => (
              <List.Item
                key={item.id}
                description={item.address || `${formatCoordinate(item.lng)}, ${formatCoordinate(item.lat)}`}
                onClick={() => handleSearchResultClick(item)}
              >
                {item.name}
              </List.Item>
            ))}
          </List>
        </div>
      ) : null}

    </div>
  );
};

export default VenueMapBoard;
