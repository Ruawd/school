export const resolveImageUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;

    // 如果是带 http 的绝对路径，直接返回
    if (url.startsWith('http')) return url;

    // 提取并拼接后端绝对地址 (开发环境下最稳妥的方法)
    const match = url.replace(/\\/g, '/').match(/\/uploads\/.*$/);
    if (match) {
        const { protocol, hostname } = window.location;
        return `${protocol}//${hostname}:3788${match[0]}`;
    }

    return url;
};
