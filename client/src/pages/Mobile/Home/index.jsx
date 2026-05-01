import React, { useEffect, useMemo, useState } from 'react';
import { CheckOutlined } from '@ant-design/icons';
import { Card, Tag, ErrorBlock, Button, Selector, SearchBar, Popup } from 'antd-mobile';
import { DownOutline, EnvironmentOutline } from 'antd-mobile-icons';
import { useNavigate } from 'react-router-dom';
import axios from '../../../services/request';
import { resolveImageUrl } from '../../../utils/image';
import { getVenueStatusMeta, splitEquipments } from '../../../utils/amap';

const PLACEHOLDER_IMG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjgwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiNlZWUiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1zaXplPSIxMiIgZmlsbD0iIjk5OSIgZHk9Ii4zZW0iIHRleHQtYW5jaG9yPSJtaWRkbGUiPuaiguaXoOWbvuefhy88L3RleHQ+PC9zdmc+';
const createInitialFilters = () => ({
    keyword: '',
    type: undefined,
    minCap: '',
    maxCap: '',
    equipments: [],
});

const previewEquipmentChipStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    maxWidth: 108,
    minWidth: 0,
    height: 24,
    padding: '0 8px',
    borderRadius: 6,
    background: '#f5f5f5',
    color: '#262626',
    fontSize: 12,
    lineHeight: 1,
    border: '1px solid #d9d9d9',
    boxSizing: 'border-box',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
};

const MobileHome = ({ active = true } = {}) => {
    const [venues, setVenues] = useState([]);
    const [venueTypes, setVenueTypes] = useState([]);
    const [equipmentOptions, setEquipmentOptions] = useState([]);
    const [showFilters, setShowFilters] = useState(false);
    const [showEquipmentDropdown, setShowEquipmentDropdown] = useState(false);
    const [filters, setFilters] = useState(createInitialFilters);
    const [draftFilters, setDraftFilters] = useState(createInitialFilters);
    const navigate = useNavigate();
    const activeEquipmentPreview = filters.equipments.slice(0, 3);
    const activeEquipmentHiddenCount = Math.max(0, filters.equipments.length - activeEquipmentPreview.length);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [typeRes, venueRes] = await Promise.all([
                    axios.get('/venue-types'),
                    axios.get('/venues'),
                ]);

                if (typeRes.code === 200) {
                    setVenueTypes(typeRes.data || []);
                }

                if (venueRes.code === 200) {
                    const list = (venueRes.data || []).filter((item) => Number(item.status) !== 0);
                    setVenues(list);
                    const tags = new Set();
                    list.forEach((item) => splitEquipments(item.equipment).forEach((tag) => tags.add(tag)));
                    setEquipmentOptions(Array.from(tags).map((item) => ({ label: item, value: item })));
                }
            } catch (err) {
                console.error(err);
            }
        };

        if (active) void fetchData();
    }, [active]);

    const getTypeName = (id) => {
        const type = venueTypes.find((item) => Number(item.id) === Number(id));
        return type ? type.name : '-';
    };

    const filteredVenues = useMemo(() => (
        venues.filter((item) => {
            if (filters.type && Number(item.type_id) !== Number(filters.type)) return false;
            if (filters.minCap && Number(item.capacity) < Number(filters.minCap)) return false;
            if (filters.maxCap && Number(item.capacity) > Number(filters.maxCap)) return false;

            if (filters.keyword) {
                const keyword = filters.keyword.trim().toLowerCase();
                const matched = item.name?.toLowerCase().includes(keyword) || item.equipment?.toLowerCase().includes(keyword);
                if (!matched) return false;
            }

            if (filters.equipments.length) {
                const tags = splitEquipments(item.equipment);
                if (!filters.equipments.every((tag) => tags.includes(tag))) return false;
            }

            return true;
        })
    ), [venues, filters]);

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (filters.type) count += 1;
        if (filters.minCap || filters.maxCap) count += 1;
        if (filters.equipments.length) count += filters.equipments.length;
        return count;
    }, [filters]);

    const openFilters = () => {
        setDraftFilters({
            ...filters,
            equipments: [...filters.equipments],
        });
        setShowEquipmentDropdown(false);
        setShowFilters(true);
    };

    const applyFilters = () => {
        setFilters((prev) => ({
            ...prev,
            type: draftFilters.type,
            minCap: draftFilters.minCap,
            maxCap: draftFilters.maxCap,
            equipments: [...draftFilters.equipments],
        }));
        setShowEquipmentDropdown(false);
        setShowFilters(false);
    };

    const resetDraftFilters = () => {
        setDraftFilters((prev) => ({
            ...prev,
            type: undefined,
            minCap: '',
            maxCap: '',
            equipments: [],
        }));
        setShowEquipmentDropdown(false);
    };

    const clearAllFilters = () => {
        const next = createInitialFilters();
        setFilters(next);
        setDraftFilters(next);
    };

    const toggleDraftEquipment = (value) => {
        setDraftFilters((prev) => ({
            ...prev,
            equipments: prev.equipments.includes(value)
                ? prev.equipments.filter((item) => item !== value)
                : [...prev.equipments, value],
        }));
    };

    return (
        <>
            <div style={{ padding: 12 }}>
                <div
                    style={{
                        background: '#fff',
                        borderRadius: 16,
                        padding: 12,
                        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.04)',
                    }}
                >
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                            <SearchBar
                                placeholder='搜索场地名称或设备'
                                value={filters.keyword}
                                onChange={(val) => setFilters((prev) => ({ ...prev, keyword: val }))}
                            />
                        </div>
                        <Button size='small' fill='outline' onClick={openFilters}>
                            筛选{activeFilterCount ? `(${activeFilterCount})` : ''}
                        </Button>
                    </div>

                    {(filters.type || filters.minCap || filters.maxCap || filters.equipments.length > 0) ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                            {filters.type ? (
                                <Tag color='primary' onClick={() => setFilters((prev) => ({ ...prev, type: undefined }))}>
                                    {getTypeName(filters.type)} ×
                                </Tag>
                            ) : null}
                            {(filters.minCap || filters.maxCap) ? (
                                <Tag color='primary' onClick={() => setFilters((prev) => ({ ...prev, minCap: '', maxCap: '' }))}>
                                    容量 {filters.minCap || 0}-{filters.maxCap || '不限'} ×
                                </Tag>
                            ) : null}
                            {activeEquipmentPreview.map((tag) => (
                                <Tag
                                    key={tag}
                                    color='primary'
                                    style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                    onClick={() => setFilters((prev) => ({ ...prev, equipments: prev.equipments.filter((item) => item !== tag) }))}
                                >
                                    {tag} ×
                                </Tag>
                            ))}
                            {activeEquipmentHiddenCount > 0 ? <Tag color='default'>+{activeEquipmentHiddenCount}</Tag> : null}
                            <Tag color='default' onClick={clearAllFilters}>清空</Tag>
                        </div>
                    ) : null}
                </div>
            </div>

            <Popup
                visible={showFilters}
                onMaskClick={() => setShowFilters(false)}
                bodyStyle={{ borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
            >
                <div style={{ padding: 16 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', marginBottom: 16 }}>筛选场地</div>

                    <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>场地类型</div>
                    <Selector
                        columns={3}
                        options={[
                            { label: '全部', value: 'all' },
                            ...venueTypes.map((item) => ({ label: item.name, value: item.id })),
                        ]}
                        value={draftFilters.type ? [draftFilters.type] : ['all']}
                        onChange={(value) => {
                            const nextValue = value[0];
                            setDraftFilters((prev) => ({ ...prev, type: nextValue === 'all' ? undefined : nextValue }));
                        }}
                        className='mobile-filter-selector'
                    />

                    <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '16px 0 8px' }}>容量范围</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
                        <input
                            type='number'
                            placeholder='最小容量'
                            value={draftFilters.minCap}
                            onChange={(e) => setDraftFilters((prev) => ({ ...prev, minCap: e.target.value }))}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 10,
                                border: '1px solid #d9d9d9',
                                fontSize: 14,
                                boxSizing: 'border-box',
                            }}
                        />
                        <input
                            type='number'
                            placeholder='最大容量'
                            value={draftFilters.maxCap}
                            onChange={(e) => setDraftFilters((prev) => ({ ...prev, maxCap: e.target.value }))}
                            style={{
                                width: '100%',
                                padding: '10px 12px',
                                borderRadius: 10,
                                border: '1px solid #d9d9d9',
                                fontSize: 14,
                                boxSizing: 'border-box',
                            }}
                        />
                    </div>

                    <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '16px 0 8px' }}>设备标签</div>
                    {equipmentOptions.length ? (
                        <div>
                            <button
                                type='button'
                                onClick={() => setShowEquipmentDropdown((prev) => !prev)}
                                style={{
                                    width: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    padding: '11px 12px',
                                    borderRadius: 10,
                                    border: '1px solid #d9d9d9',
                                    background: '#fff',
                                    color: draftFilters.equipments.length ? '#1f2937' : '#9ca3af',
                                    fontSize: 14,
                                    textAlign: 'left',
                                }}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    {draftFilters.equipments.length ? (
                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                minWidth: 0,
                                                overflowX: 'auto',
                                                overflowY: 'hidden',
                                                whiteSpace: 'nowrap',
                                                scrollbarWidth: 'none',
                                                msOverflowStyle: 'none',
                                                paddingBottom: 2,
                                            }}
                                        >
                                            {draftFilters.equipments.map((item) => (
                                                <span
                                                    key={item}
                                                    style={previewEquipmentChipStyle}
                                                >
                                                    {item}
                                                </span>
                                            ))}
                                        </div>
                                    ) : (
                                        <span style={{ color: '#9ca3af' }}>请选择设备标签</span>
                                    )}
                                </div>
                                <DownOutline
                                    style={{
                                        fontSize: 12,
                                        transform: showEquipmentDropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                                        transition: 'transform 0.2s ease',
                                        flex: '0 0 auto',
                                    }}
                                />
                            </button>
                            {showEquipmentDropdown ? (
                                <div
                                    style={{
                                        marginTop: 8,
                                        border: '1px solid #d9d9d9',
                                        borderRadius: 10,
                                        background: '#fff',
                                        maxHeight: 240,
                                        overflowY: 'auto',
                                        boxShadow: '0 6px 16px rgba(0, 0, 0, 0.08)',
                                        padding: '4px 0',
                                    }}
                                >
                                    {equipmentOptions.map((item, index) => {
                                        const checked = draftFilters.equipments.includes(item.value);
                                        return (
                                            <button
                                                key={item.value}
                                                type='button'
                                                onClick={() => toggleDraftEquipment(item.value)}
                                                style={{
                                                    width: '100%',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: 12,
                                                    minHeight: 38,
                                                    padding: '8px 12px',
                                                    border: 'none',
                                                    borderBottom: index === equipmentOptions.length - 1 ? 'none' : '1px solid #f0f0f0',
                                                    background: checked ? '#e6f4ff' : '#fff',
                                                    color: checked ? '#1677ff' : '#262626',
                                                    fontWeight: checked ? 500 : 400,
                                                    fontSize: 14,
                                                    textAlign: 'left',
                                                    transition: 'background-color 0.2s ease, color 0.2s ease',
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        flex: 1,
                                                        minWidth: 0,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {item.label}
                                                </span>
                                                <span
                                                    style={{
                                                        width: 16,
                                                        height: 16,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: checked ? '#1677ff' : 'transparent',
                                                        fontSize: 12,
                                                        flex: '0 0 auto',
                                                    }}
                                                >
                                                    {checked ? <CheckOutlined /> : null}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div style={{ color: '#999', fontSize: 12, padding: '6px 0 2px' }}>暂无设备标签</div>
                    )}

                    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                        <Button block fill='outline' onClick={resetDraftFilters}>重置筛选</Button>
                        <Button block color='primary' onClick={applyFilters}>确定</Button>
                    </div>
                </div>
            </Popup>

            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12, padding: '0 12px 12px' }}>
                {filteredVenues.map((venue) => (
                    <Card
                        key={venue.id}
                        onClick={() => navigate(`/venue/${venue.id}`)}
                    >
                        <div style={{ display: 'flex', gap: 12 }}>
                            <div
                                style={{
                                    width: 104,
                                    height: 80,
                                    borderRadius: 8,
                                    overflow: 'hidden',
                                    background: '#f0f0f0',
                                    flex: '0 0 auto',
                                }}
                            >
                                <img
                                    src={resolveImageUrl(venue.image_url) || PLACEHOLDER_IMG}
                                    alt={venue.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                    loading='lazy'
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 16, fontWeight: 'bold' }}>{venue.name}</div>
                                <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
                                    <EnvironmentOutline /> {venue.capacity}人 | {getTypeName(venue.type_id)}
                                </div>
                                <div style={{ marginTop: 8 }}>
                                    {(() => {
                                        const statusMeta = getVenueStatusMeta(venue.status);
                                        return (
                                            <Tag style={{
                                                '--text-color': statusMeta.color,
                                                '--border-color': statusMeta.color,
                                                '--background-color': statusMeta.lightColor,
                                            }}>
                                                {statusMeta.label}
                                            </Tag>
                                        );
                                    })()}
                                    <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
                                        {venue.open_start?.slice(0, 5)} - {venue.open_end?.slice(0, 5)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </Card>
                ))}
                {filteredVenues.length === 0 && <ErrorBlock status='empty' title='暂无可用场地' description='当前没有符合条件的场地' />}
            </div>
        </>
    );
};

export default MobileHome;
