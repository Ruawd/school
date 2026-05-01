import React, { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Empty,
  Image,
  List,
  Popup,
  SearchBar,
  Selector,
  SpinLoading,
  Tag,
} from 'antd-mobile';
import { EnvironmentOutline, FilterOutline, RightOutline } from 'antd-mobile-icons';
import { useNavigate } from 'react-router-dom';
import VenueMapBoard from '../../../components/VenueMapBoard';
import axios from '../../../services/request';
import { resolveImageUrl } from '../../../utils/image';
import {
  buildVenueNavigationUrl,
  getVenueStatusMeta,
  getVenueCoordinate,
  splitEquipments,
} from '../../../utils/amap';

const PLACEHOLDER_IMG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZWVlIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIGR5PSIuM2VtIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj7mmoLml6Dlm77niYcvPC90ZXh0Pjwvc3ZnPg==';

const STATUS_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '开放', value: '1' },
  { label: '使用中', value: '2' },
  { label: '维护中', value: '0' },
];

const MobileMap = () => {
  const navigate = useNavigate();
  const [venues, setVenues] = useState([]);
  const [venueTypes, setVenueTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState(['all']);
  const [typeFilter, setTypeFilter] = useState([]);
  const [filterVisible, setFilterVisible] = useState(false);
  const [missingVisible, setMissingVisible] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [venueRes, typeRes] = await Promise.all([
          axios.get('/venues'),
          axios.get('/venue-types'),
        ]);
        if (venueRes.code === 200) {
          setVenues(venueRes.data || []);
        }
        if (typeRes.code === 200) {
          setVenueTypes(typeRes.data || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const typeNameMap = useMemo(() => {
    const map = new Map();
    venueTypes.forEach((item) => map.set(item.id, item.name));
    return map;
  }, [venueTypes]);

  const filteredVenues = useMemo(() => {
    const currentStatus = statusFilter[0] || 'all';
    const normalizedKeyword = keyword.trim().toLowerCase();
    return venues.filter((item) => {
      if (currentStatus !== 'all' && Number(item.status) !== Number(currentStatus)) return false;
      if (typeFilter.length && !typeFilter.includes(item.type_id)) return false;
      if (!normalizedKeyword) return true;
      const typeName = typeNameMap.get(item.type_id) || '';
      const matched = [item.name, item.equipment, typeName]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedKeyword));
      return matched;
    });
  }, [venues, statusFilter, typeFilter, keyword, typeNameMap]);

  const mappedVenues = useMemo(
    () => filteredVenues.filter((item) => getVenueCoordinate(item)),
    [filteredVenues],
  );

  const missingCoordinateVenues = useMemo(
    () => filteredVenues.filter((item) => !getVenueCoordinate(item)),
    [filteredVenues],
  );

  useEffect(() => {
    if (!mappedVenues.length) {
      setSelectedVenue(null);
      return;
    }

    if (!selectedVenue || !mappedVenues.some((item) => item.id === selectedVenue.id)) {
      setSelectedVenue(mappedVenues[0]);
    }
  }, [mappedVenues, selectedVenue]);

  const selectedStatusMeta = selectedVenue ? getVenueStatusMeta(selectedVenue.status) : null;
  const equipmentTags = splitEquipments(selectedVenue?.equipment);

  const openNavigation = () => {
    if (!selectedVenue) return;
    const url = buildVenueNavigationUrl(selectedVenue);
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className='mobile-map-page'>
      <div className='mobile-map-page__header'>
        <div className='mobile-map-page__search-row'>
          <div className='mobile-map-page__search'>
            <SearchBar
              value={keyword}
              placeholder='搜索场地名称、类型或设备'
              onChange={setKeyword}
              onClear={() => setKeyword('')}
            />
          </div>
          <Button
            color='primary'
            fill='outline'
            onClick={() => setFilterVisible(true)}
          >
            <FilterOutline />
            筛选
          </Button>
        </div>

        <div className='mobile-map-page__summary'>
          <div className='mobile-map-page__summary-main'>
            <span>地图已展示</span>
            <strong>{mappedVenues.length}</strong>
            <span>/ {filteredVenues.length} 个场地</span>
          </div>
          {missingCoordinateVenues.length ? (
            <Button size='mini' fill='none' onClick={() => setMissingVisible(true)}>
              <Badge content={missingCoordinateVenues.length}>
                <span>未定位</span>
              </Badge>
            </Button>
          ) : null}
        </div>
      </div>

      <div className='mobile-map-page__map-area'>
        {loading ? (
          <div className='mobile-map-page__loading'>
            <SpinLoading color='primary' style={{ '--size': '32px' }} />
            <div style={{ marginTop: 12 }}>正在加载地图和场地数据...</div>
          </div>
        ) : mappedVenues.length ? (
          <VenueMapBoard
            venues={mappedVenues}
            selectedVenueId={selectedVenue?.id}
            onSelectVenue={setSelectedVenue}
            height='100%'
            showSearch={false}
            showLegend
            selectedMarkerOffsetY={120}
          />
        ) : (
          <div className='mobile-map-page__empty'>
            <Empty description='当前筛选条件下没有可展示的场地' />
            {missingCoordinateVenues.length ? (
              <Button color='primary' fill='outline' onClick={() => setMissingVisible(true)}>
                查看未设置坐标的场地
              </Button>
            ) : null}
          </div>
        )}

        {selectedVenue ? (
          <div className='mobile-map-page__detail-card'>
            <div className='mobile-map-page__detail-media'>
              <Image
                src={resolveImageUrl(selectedVenue.image_url) || PLACEHOLDER_IMG}
                fit='cover'
                width='100%'
                height='100%'
              />
            </div>
            <div className='mobile-map-page__detail-content'>
              <div className='mobile-map-page__detail-title-row'>
                <div className='mobile-map-page__detail-title'>{selectedVenue.name}</div>
                {selectedStatusMeta ? (
                  <Tag color={selectedStatusMeta.value === 1 ? 'success' : selectedStatusMeta.value === 2 ? 'primary' : 'danger'} fill='outline'>
                    {selectedStatusMeta.label}
                  </Tag>
                ) : null}
              </div>
              <div className='mobile-map-page__detail-meta'>
                {typeNameMap.get(selectedVenue.type_id) || '未分类'} · 容纳 {selectedVenue.capacity || 0} 人
              </div>
              <div className='mobile-map-page__detail-meta'>
                开放时间 {selectedVenue.open_start?.slice(0, 5)} - {selectedVenue.open_end?.slice(0, 5)}
              </div>
              {equipmentTags.length ? (
                <div className='mobile-map-page__detail-tags'>
                  {equipmentTags.slice(0, 4).map((tag) => (
                    <span className='mobile-map-page__detail-chip' key={tag}>{tag}</span>
                  ))}
                </div>
              ) : null}
              <div className='mobile-map-page__detail-actions'>
                <Button size='small' fill='outline' onClick={openNavigation}>地图导航</Button>
                <Button color='primary' size='small' onClick={() => navigate(`/venue/${selectedVenue.id}`)}>
                  查看并预约
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <Popup
        visible={filterVisible}
        onMaskClick={() => setFilterVisible(false)}
        bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
      >
        <div className='mobile-map-page__popup'>
          <div className='mobile-map-page__popup-title'>筛选条件</div>
          <div className='mobile-map-page__popup-section'>
            <div className='mobile-map-page__popup-label'>场地状态</div>
            <Selector options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} />
          </div>
          <div className='mobile-map-page__popup-section'>
            <div className='mobile-map-page__popup-label'>场地类型</div>
            <Selector
              options={venueTypes.map((item) => ({ label: item.name, value: item.id }))}
              multiple
              value={typeFilter}
              onChange={setTypeFilter}
            />
          </div>
          <div className='mobile-map-page__popup-actions'>
            <Button
              onClick={() => {
                setStatusFilter(['all']);
                setTypeFilter([]);
              }}
            >
              重置
            </Button>
            <Button color='primary' onClick={() => setFilterVisible(false)}>完成</Button>
          </div>
        </div>
      </Popup>

      <Popup
        visible={missingVisible}
        onMaskClick={() => setMissingVisible(false)}
        bodyStyle={{ height: '55vh', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
      >
        <div className='mobile-map-page__popup'>
          <div className='mobile-map-page__popup-title'>未设置坐标的场地</div>
          <div className='mobile-map-page__popup-tip'>以下场地尚未配置地图坐标，暂时无法在地图中展示，你仍然可以进入详情页查看并预约。</div>
          <div className='mobile-map-page__missing-list'>
            <List>
              {missingCoordinateVenues.map((item) => (
                <List.Item
                  key={item.id}
                  prefix={<EnvironmentOutline />}
                  description={`${typeNameMap.get(item.type_id) || '未分类'} · ${item.open_start?.slice(0, 5)} - ${item.open_end?.slice(0, 5)}`}
                  extra={<RightOutline />}
                  onClick={() => navigate(`/venue/${item.id}`)}
                >
                  {item.name}
                </List.Item>
              ))}
            </List>
          </div>
        </div>
      </Popup>
    </div>
  );
};

export default MobileMap;
