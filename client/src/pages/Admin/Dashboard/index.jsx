import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Empty, List, Progress, Row, Spin, Statistic, Table, Tabs, Tag } from 'antd';
import { ReloadOutlined, ShopOutlined, ThunderboltOutlined, ToolOutlined, UsergroupAddOutlined } from '@ant-design/icons';
import { Swiper } from 'antd-mobile';
import ReactECharts from 'echarts-for-react';
import axios from '../../../services/request';
import dayjs from 'dayjs';
import VenueCardCompact from '../../../components/VenueCardCompact';
import { resolveImageUrl } from '../../../utils/image';

const REPORT_TABS = [
  { key: 'weekly', label: '周报表' },
  { key: 'monthly', label: '月报表' },
];
const WEEKDAY_TEXT = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const getHeatPieces = (maxValue) => {
  const safeMax = Math.max(1, maxValue);
  const level1 = Math.max(1, Math.ceil(safeMax / 3));
  const level2 = Math.max(level1 + 1, Math.ceil((safeMax * 2) / 3));

  return [
    { value: 0, label: '0 次', color: '#f3f4f6' },
    { min: 1, max: level1, label: `1-${level1} 次`, color: '#e6f4ff' },
    { min: level1 + 1, max: level2, label: `${level1 + 1}-${level2} 次`, color: '#91caff' },
    { min: level2 + 1, max: safeMax, label: `${level2 + 1}-${safeMax} 次`, color: '#1677ff' },
  ];
};

const getHeatLevelColor = (value, maxValue) => {
  const count = Number(value) || 0;
  if (count <= 0) return '#f3f4f6';
  const pieces = getHeatPieces(maxValue);
  if (count <= (pieces[1]?.max || 1)) return pieces[1].color;
  if (count <= (pieces[2]?.max || 2)) return pieces[2].color;
  return pieces[3].color;
};

const Dashboard = () => {
  const [venues, setVenues] = useState([]);
  const [venueTypes, setVenueTypes] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [reports, setReports] = useState({ weekly: null, monthly: null });
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [activeReportKey, setActiveReportKey] = useState('weekly');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  const fetchBaseData = async () => {
    setLoading(true);
    try {
      const [venueRes, typeRes, heatmapRes] = await Promise.all([
        axios.get('/venues'),
        axios.get('/venue-types'),
        axios.get('/reservations/stats'),
      ]);
      if (venueRes.code === 200) setVenues(venueRes.data || []);
      if (typeRes.code === 200) setVenueTypes(typeRes.data || []);
      if (heatmapRes.code === 200) setHeatmapData(heatmapRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchReports = async () => {
    setReportLoading(true);
    try {
      const [weeklyRes, monthlyRes] = await Promise.all([
        axios.get('/reservations/reports/weekly'),
        axios.get('/reservations/reports/monthly'),
      ]);
      setReports({
        weekly: weeklyRes.code === 200 ? weeklyRes.data : null,
        monthly: monthlyRes.code === 200 ? monthlyRes.data : null,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setReportLoading(false);
    }
  };

  const reloadAll = async () => {
    await Promise.all([fetchBaseData(), fetchReports()]);
  };

  useEffect(() => {
    reloadAll();
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getTypeName = (typeId) => venueTypes.find((item) => item.id === typeId)?.name || '未分类';

  const stats = useMemo(() => ({
    total: venues.length,
    open: venues.filter((item) => Number(item.status) === 1).length,
    inUse: venues.filter((item) => Number(item.status) === 2).length,
    maintenance: venues.filter((item) => Number(item.status) === 0).length,
  }), [venues]);

  const currentReport = reports[activeReportKey];
  const currentYear = dayjs().year();
  const currentMonthIndex = dayjs().month();
  const heatmapMax = useMemo(
    () => Math.max(10, ...heatmapData.map((item) => Number(item?.[1]) || 0), 1),
    [heatmapData],
  );
  const heatmapValueMap = useMemo(() => {
    const map = new Map();
    heatmapData.forEach((item) => {
      const key = dayjs(item?.[0]).format('YYYY-MM-DD');
      map.set(key, Number(item?.[1]) || 0);
    });
    return map;
  }, [heatmapData]);

  const reportChartOption = useMemo(() => {
    if (!currentReport) return null;
    const xData = currentReport.trend.map((item) => dayjs(item.date).format('MM-DD'));
    const reservedHoursData = currentReport.trend.map((item) => Number(item.reservedHours || 0));
    const actualHoursData = currentReport.trend.map((item) => Number(item.actualHours || 0));
    const reservationCountData = currentReport.trend.map((item) => Number(item.reservationCount || 0));

    return {
      animationDuration: 700,
      color: ['#f59e0b', '#52b788', '#7c3aed'],
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        borderWidth: 0,
        padding: [10, 14],
        textStyle: {
          color: '#fff',
          fontSize: 12,
        },
        axisPointer: {
          type: 'line',
          lineStyle: {
            color: 'rgba(148, 163, 184, 0.45)',
            width: 1,
          },
        },
      },
      legend: {
        data: ['预约占用小时', '实际使用小时', '预约单数'],
        top: 6,
        left: 'center',
        itemWidth: 10,
        itemHeight: 10,
        icon: 'circle',
        textStyle: {
          color: '#64748b',
          fontSize: 12,
        },
      },
      grid: {
        left: isMobile ? 10 : 18,
        right: isMobile ? 10 : 18,
        top: 64,
        bottom: 16,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: xData,
        axisTick: { show: false },
        axisLine: {
          lineStyle: {
            color: '#e5e7eb',
          },
        },
        axisLabel: {
          margin: 10,
          color: '#6b7280',
          fontSize: 12,
        },
      },
      yAxis: [
        {
          type: 'value',
          minInterval: 1,
          axisLabel: {
            color: '#6b7280',
            fontSize: 12,
          },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: {
            lineStyle: {
              color: 'rgba(148, 163, 184, 0.16)',
            },
          },
        },
        {
          type: 'value',
          minInterval: 1,
          axisLabel: {
            color: '#94a3b8',
            fontSize: 11,
          },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '预约占用小时',
          type: 'line',
          smooth: 0.42,
          symbol: 'circle',
          symbolSize: isMobile ? 7 : 9,
          data: reservedHoursData,
          lineStyle: {
            color: '#f59e0b',
            width: 3,
          },
          itemStyle: {
            color: '#f59e0b',
            borderColor: '#fff7ed',
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: 'rgba(245, 158, 11, 0.28)',
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(245, 158, 11, 0.34)' },
                { offset: 1, color: 'rgba(245, 158, 11, 0.06)' },
              ],
            },
          },
          z: 3,
        },
        {
          name: '实际使用小时',
          type: 'line',
          smooth: 0.42,
          symbol: 'circle',
          symbolSize: isMobile ? 7 : 9,
          data: actualHoursData,
          lineStyle: {
            color: '#52b788',
            width: 3,
          },
          itemStyle: {
            color: '#52b788',
            borderColor: '#ecfdf5',
            borderWidth: 2,
            shadowBlur: 10,
            shadowColor: 'rgba(82, 183, 136, 0.22)',
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(82, 183, 136, 0.28)' },
                { offset: 1, color: 'rgba(82, 183, 136, 0.05)' },
              ],
            },
          },
          z: 4,
        },
        {
          name: '预约单数',
          type: 'line',
          yAxisIndex: 1,
          smooth: 0.38,
          symbol: 'circle',
          symbolSize: isMobile ? 5 : 6,
          data: reservationCountData,
          lineStyle: {
            color: '#7c3aed',
            width: 2,
            type: 'dashed',
            opacity: 0.85,
          },
          itemStyle: {
            color: '#7c3aed',
            borderColor: '#ede9fe',
            borderWidth: 2,
          },
          z: 2,
        },
      ],
    };
  }, [currentReport, isMobile]);

  const monthlyHeatmapBuckets = useMemo(
    () => Array.from({ length: 12 }, (_, monthIndex) => {
      const monthStart = dayjs().year(currentYear).month(monthIndex).startOf('month');
      const monthKey = monthStart.format('YYYY-MM');
      return {
        key: monthKey,
        shortLabel: monthStart.format('M月'),
        label: monthStart.format('YYYY 年 M 月'),
      };
    }),
    [currentYear],
  );

  const mobileHeatmapMonths = monthlyHeatmapBuckets;
  const desktopHeatmapYears = useMemo(() => {
    const years = Array.from(new Set(
      heatmapData
        .map((item) => dayjs(item?.[0]).year())
        .filter((value) => Number.isFinite(value)),
    ));
    if (!years.length) return [currentYear];
    return years.sort((a, b) => a - b);
  }, [currentYear, heatmapData]);

  const buildCalendarHeatmap = (rangeKey, mode = 'month') => {
    const periodStart = mode === 'year'
      ? dayjs(`${rangeKey}-01-01`).startOf('year')
      : dayjs(`${rangeKey}-01`).startOf('month');
    const periodEnd = mode === 'year'
      ? periodStart.endOf('year')
      : periodStart.endOf('month');

    const startOffset = (periodStart.day() + 6) % 7;
    const endOffset = 6 - ((periodEnd.day() + 6) % 7);
    const gridStart = periodStart.subtract(startOffset, 'day');
    const gridEnd = periodEnd.add(endOffset, 'day');
    const totalDays = gridEnd.diff(gridStart, 'day') + 1;
    const totalWeeks = Math.ceil(totalDays / 7);

    const cells = Array.from({ length: totalDays }, (_, index) => {
      const date = gridStart.add(index, 'day');
      const key = date.format('YYYY-MM-DD');
      const inRange = mode === 'year'
        ? date.year() === periodStart.year()
        : date.format('YYYY-MM') === periodStart.format('YYYY-MM');
      const value = inRange ? (heatmapValueMap.get(key) || 0) : null;
      return {
        key,
        inRange,
        value,
        color: inRange ? getHeatLevelColor(value, heatmapMax) : 'transparent',
      };
    });

    const monthLabels = mode === 'year'
      ? Array.from({ length: 12 }, (_, monthIndex) => {
        const monthStart = periodStart.month(monthIndex).startOf('month');
        return {
          key: monthStart.format('YYYY-MM'),
          label: monthStart.format('MMM'),
          weekIndex: Math.floor(monthStart.diff(gridStart, 'day') / 7),
        };
      })
      : [
        {
          key: periodStart.format('YYYY-MM'),
          label: periodStart.format('MMM'),
          weekIndex: 0,
        },
      ];

    return {
      label: mode === 'year' ? String(periodStart.year()) : periodStart.format('YYYY 年 M 月'),
      totalWeeks,
      cells,
      monthLabels,
    };
  };

  const mobileHeatmapViews = useMemo(
    () => mobileHeatmapMonths.map((month) => ({
      ...month,
      heatmap: buildCalendarHeatmap(month.key, 'month'),
    })),
    [mobileHeatmapMonths, heatmapMax, heatmapValueMap],
  );

  const desktopHeatmapViews = useMemo(
    () => desktopHeatmapYears.map((year) => buildCalendarHeatmap(String(year), 'year')),
    [desktopHeatmapYears, heatmapMax, heatmapValueMap],
  );

  const renderCalendarHeatmap = (heatmap, compact = false) => {
    if (!heatmap) return null;

    const cellSize = compact ? 32 : 20;
    const gap = compact ? 4 : 3;
    const monthFontSize = compact ? 13 : 12;
    const weekLabelWidth = compact ? 22 : 38;
    const showMonthLabels = heatmap.monthLabels.length > 1;
    const gridWidth = heatmap.totalWeeks * cellSize + Math.max(heatmap.totalWeeks - 1, 0) * gap;

    return (
      <div
        style={{
          width: '100%',
          overflowX: compact ? 'hidden' : 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div style={{ textAlign: 'center', fontSize: compact ? 15 : 18, fontWeight: 600, marginBottom: compact ? 10 : 16 }}>
          {heatmap.label}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            gap: compact ? 8 : 12,
            width: compact ? 'fit-content' : '100%',
            margin: '0 auto',
            padding: 0,
            borderRadius: 0,
            background: 'transparent',
          }}
        >
          <div style={{ width: weekLabelWidth, flex: `0 0 ${weekLabelWidth}px`, marginTop: showMonthLabels ? (compact ? 26 : 28) : 0 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateRows: `repeat(7, ${cellSize}px)`,
                rowGap: gap,
                color: '#64748b',
                fontSize: compact ? 12 : 12,
              }}
            >
              {WEEKDAY_TEXT.slice(1).concat(WEEKDAY_TEXT.slice(0, 1)).map((label) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: compact ? 'center' : 'flex-end' }}>
                  {compact ? label.replace('周', '') : label}
                </div>
              ))}
            </div>
          </div>
          <div style={{ width: compact ? gridWidth : 'max-content', minWidth: compact ? gridWidth : gridWidth }}>
            {showMonthLabels ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${heatmap.totalWeeks}, ${cellSize}px)`,
                  columnGap: gap,
                  marginBottom: compact ? 6 : 8,
                  color: '#64748b',
                  fontSize: monthFontSize,
                }}
              >
                {heatmap.monthLabels.map((month) => (
                  <div key={month.key} style={{ gridColumn: `${month.weekIndex + 1} / span 4`, whiteSpace: 'nowrap' }}>
                    {month.label}
                  </div>
                ))}
              </div>
            ) : null}
            <div
              style={{
                display: 'grid',
                gridAutoFlow: 'column',
                gridTemplateRows: `repeat(7, ${cellSize}px)`,
                gridAutoColumns: `${cellSize}px`,
                gap,
                background: '#ffffff',
                padding: 0,
                borderRadius: 4,
              }}
            >
              {heatmap.cells.map((cell) => (
                <div
                  key={cell.key}
                  title={cell.inRange ? `${cell.key}：${cell.value || 0} 次预约` : ''}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    borderRadius: compact ? 2 : 1,
                    border: 'none',
                    background: cell.inRange ? cell.color : 'transparent',
                    boxSizing: 'border-box',
                    boxShadow: cell.inRange ? 'inset 0 0 0 1px rgba(15, 23, 42, 0.03)' : 'none',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const venueColumns = [
    { title: '场地', dataIndex: 'venueName', key: 'venueName' },
    { title: '预约单数', dataIndex: 'reservationCount', key: 'reservationCount', width: 100 },
    { title: '预约小时', dataIndex: 'reservedHours', key: 'reservedHours', width: 100 },
    { title: '实际小时', dataIndex: 'actualHours', key: 'actualHours', width: 100 },
    { title: '利用率', dataIndex: 'utilizationRate', key: 'utilizationRate', width: 120, render: (value) => `${value}%` },
  ];

  const getStatusTag = (status) => {
    if (Number(status) === 2) return <Tag color='processing'>使用中</Tag>;
    if (Number(status) === 1) return <Tag color='success'>开放</Tag>;
    return <Tag color='error'>维护中</Tag>;
  };

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}><Card><Statistic title='场地总数' value={stats.total} prefix={<ShopOutlined />} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title='当前开放' value={stats.open} prefix={<ThunderboltOutlined />} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title='正在使用' value={stats.inUse} prefix={<UsergroupAddOutlined />} valueStyle={{ color: '#1677ff' }} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title='维护中' value={stats.maintenance} prefix={<ToolOutlined />} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
      </Row>

      <Card title='周 / 月统计报表' extra={<Button icon={<ReloadOutlined />} onClick={reloadAll}>刷新数据</Button>} style={{ marginBottom: 16 }}>
        {reportLoading || !currentReport ? (
          <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>
        ) : (
          <Tabs activeKey={activeReportKey} onChange={setActiveReportKey} items={REPORT_TABS.map((tab) => ({
            key: tab.key,
            label: tab.label,
            children: (
              <div>
                <div style={{ marginBottom: 12, color: '#666' }}>统计周期：{reports[tab.key]?.period?.label}</div>
                <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                  <Col xs={12} md={4}><Card><Statistic title='预约总数' value={reports[tab.key]?.summary?.reservationCount || 0} /></Card></Col>
                  <Col xs={12} md={4}><Card><Statistic title='已签到' value={reports[tab.key]?.summary?.checkedInCount || 0} /></Card></Col>
                  <Col xs={12} md={4}><Card><Statistic title='违约次数' value={reports[tab.key]?.summary?.violationCount || 0} /></Card></Col>
                  <Col xs={12} md={4}><Card><Statistic title='预约小时' value={reports[tab.key]?.summary?.reservedHours || 0} suffix='h' /></Card></Col>
                  <Col xs={12} md={4}><Card><Statistic title='预约利用率' value={reports[tab.key]?.summary?.utilizationRate || 0} suffix='%' /></Card></Col>
                  <Col xs={12} md={4}><Card><Statistic title='实际利用率' value={reports[tab.key]?.summary?.actualUtilizationRate || 0} suffix='%' /></Card></Col>
                </Row>

                <Row gutter={[16, 16]}>
                  <Col xs={24} xl={16}>
                    <Card title='预约趋势与利用率'>
                      {reportChartOption ? <ReactECharts option={reportChartOption} style={{ height: isMobile ? 320 : 360 }} /> : <Empty description='暂无报表数据' />}
                    </Card>
                  </Col>
                  <Col xs={24} xl={8}>
                    <Card title='场地利用率排行'>
                      {(reports[tab.key]?.venueRank?.length || 0) ? (
                        <List
                          dataSource={(reports[tab.key]?.venueRank || []).slice(0, 6)}
                          renderItem={(item, index) => (
                            <List.Item>
                              <List.Item.Meta
                                title={<span>{index + 1}. {item.venueName}</span>}
                                description={<div><div>预约 {item.reservationCount} 次 / {item.reservedHours} 小时</div><Progress percent={item.utilizationRate} size='small' style={{ marginTop: 8 }} /></div>}
                              />
                            </List.Item>
                          )}
                        />
                      ) : <Empty description='暂无排行数据' />}
                    </Card>
                  </Col>
                </Row>

                <Card title='报表明细' style={{ marginTop: 16 }}>
                  {isMobile ? (
                    (reports[tab.key]?.venueRank?.length || 0) ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {(reports[tab.key]?.venueRank || []).map((item, index) => (
                          <div
                            key={item.venueId}
                            style={{
                              padding: 14,
                              border: '1px solid #f0f0f0',
                              borderRadius: 12,
                              background: '#fff',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                              <div style={{ fontSize: 16, fontWeight: 600, color: '#1f1f1f' }}>{item.venueName}</div>
                              <Tag color='blue'>#{index + 1}</Tag>
                            </div>
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                                gap: 10,
                              }}
                            >
                              <div>
                                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>预约单数</div>
                                <div style={{ fontSize: 18, fontWeight: 600 }}>{item.reservationCount}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>利用率</div>
                                <div style={{ fontSize: 18, fontWeight: 600 }}>{item.utilizationRate}%</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>预约小时</div>
                                <div style={{ fontSize: 16, fontWeight: 600 }}>{item.reservedHours}</div>
                              </div>
                              <div>
                                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>实际小时</div>
                                <div style={{ fontSize: 16, fontWeight: 600 }}>{item.actualHours}</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <Empty description='暂无明细数据' />
                  ) : (
                    <Table rowKey='venueId' size='small' dataSource={reports[tab.key]?.venueRank || []} columns={venueColumns} pagination={{ pageSize: 6, showSizeChanger: false }} scroll={{ x: 720 }} />
                  )}
                </Card>
              </div>
            ),
          }))} />
        )}
      </Card>

      <Card title='场地实时状态' style={{ marginBottom: 16 }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><Spin /></div>
        ) : venues.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {venues.map((item) => (
              isMobile ? (
                <VenueCardCompact key={item.id} name={item.name} imageUrl={item.image_url} statusTag={getStatusTag(item.status)} capacity={item.capacity} typeName={getTypeName(item.type_id)} openStart={item.open_start?.slice(0, 5)} openEnd={item.open_end?.slice(0, 5)} />
              ) : (
                <Card key={item.id} title={item.name} extra={getStatusTag(item.status)} styles={{ body: { padding: 16 } }}>
                  <div style={{ height: 140, borderRadius: 8, overflow: 'hidden', background: '#f5f5f5', marginBottom: 12 }}>
                    {item.image_url ? <img src={resolveImageUrl(item.image_url)} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>暂无图片</div>}
                  </div>
                  <div style={{ color: '#666', lineHeight: 1.9 }}>
                    <div>类型：{getTypeName(item.type_id)}</div>
                    <div>容量：{item.capacity} 人</div>
                    <div>开放时间：{item.open_start?.slice(0, 5)} - {item.open_end?.slice(0, 5)}</div>
                  </div>
                </Card>
              )
            ))}
          </div>
        ) : <Empty description='暂无场地数据' />}
      </Card>

      <Card title={isMobile ? '预约热力图' : `预约热力图（${currentYear} 年）`}>
        {heatmapData.length ? (
          isMobile ? (
            <div>
              <Swiper
                defaultIndex={currentMonthIndex}
                loop={false}
                stuckAtBoundary
                indicator={(total, current) => (
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: '#f5f7fa',
                      color: '#4b5563',
                      fontSize: 12,
                    }}
                  >
                    <span>{mobileHeatmapMonths[current]?.label}</span>
                    <span style={{ color: '#9ca3af' }}>{current + 1}/{total}</span>
                  </div>
                )}
              >
                {mobileHeatmapViews.map((month) => (
                  <Swiper.Item key={month.key}>
                    <div style={{ minHeight: 430, paddingBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {renderCalendarHeatmap(month.heatmap, true)}
                    </div>
                  </Swiper.Item>
                ))}
              </Swiper>
            </div>
          ) : (
            <div>
              {desktopHeatmapViews.length ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14, fontSize: 12, color: '#64748b' }}>
                    <span>预约次数</span>
                    {getHeatPieces(heatmapMax).map((piece) => (
                      <div key={piece.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 6,
                            border: '1px solid #d9d9d9',
                            background: piece.color,
                          }}
                        />
                        <span>{piece.label}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {desktopHeatmapViews.map((heatmap) => (
                      <div key={heatmap.label}>
                        {renderCalendarHeatmap(heatmap, false)}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <Empty description='暂无热力图数据' />
              )}
            </div>
          )
        ) : <Empty description='暂无热力图数据' />}
      </Card>
    </div>
  );
};

export default Dashboard;
