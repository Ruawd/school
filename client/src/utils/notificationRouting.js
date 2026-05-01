export const readStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
};

const REVIEW_KEYWORDS = ['待审核', '审核', '审批'];

export const isReviewNotification = (notification) => {
  const text = `${notification?.title || ''} ${notification?.content || ''}`;
  return REVIEW_KEYWORDS.some((keyword) => text.includes(keyword));
};

export const resolveNotificationTarget = (notification, user = readStoredUser()) => {
  if (Number(user?.role) === 9 && isReviewNotification(notification)) {
    return '/admin/reservations';
  }

  if (notification?.biz_type === 'reservation') {
    return '/history';
  }

  return '/notifications';
};
