import React from 'react';
import { Card } from 'antd';
import { ShopOutlined } from '@ant-design/icons';
import { resolveImageUrl } from '../utils/image';

const VenueCardCompact = ({
    name,
    imageUrl,
    statusTag,
    capacity,
    typeName,
    openStart,
    openEnd,
    footer
}) => (
    <Card size="small" styles={{ body: { padding: 10 } }} style={{ marginBottom: 12 }} hoverable>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div
                style={{
                    width: 96,
                    height: 72,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: '#f0f0f0',
                    flex: '0 0 auto'
                }}
            >
                {imageUrl ? (
                    <img
                        src={resolveImageUrl(imageUrl)}
                        alt={name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShopOutlined style={{ fontSize: 24, color: '#ccc' }} />
                    </div>
                )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div
                        style={{
                            fontWeight: 600,
                            fontSize: 14,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}
                    >
                        {name}
                    </div>
                    {statusTag}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#666' }}>
                    容量 {capacity} 人 | {typeName}
                </div>
                <div style={{ marginTop: 3, fontSize: 12, color: '#999' }}>
                    开放 {openStart} - {openEnd}
                </div>
            </div>
        </div>
        {footer ? (
            <div style={{ marginTop: 6, borderTop: '1px solid #f0f0f0', paddingTop: 6, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                {footer}
            </div>
        ) : null}
    </Card>
);

export default VenueCardCompact;
