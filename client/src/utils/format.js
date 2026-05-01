import dayjs from 'dayjs';

export const formatDate = (date, format = 'YYYY-MM-DD HH:mm') => {
    return dayjs(date).format(format);
};

export const formatCurrency = (amount) => {
    return `¥${amount.toFixed(2)}`;
};
