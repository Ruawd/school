const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const isTurnstileEnabled = () => Boolean(process.env.TURNSTILE_SECRET_KEY);

const verifyTurnstileToken = async ({ token, remoteIp } = {}) => {
  if (!isTurnstileEnabled()) {
    return { success: true, skipped: true };
  }

  if (!token) {
    return { success: false, message: '请完成人机验证' };
  }

  const formData = new URLSearchParams();
  formData.append('secret', process.env.TURNSTILE_SECRET_KEY);
  formData.append('response', token);
  if (remoteIp) formData.append('remoteip', remoteIp);

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });

    if (!response.ok) {
      return { success: false, message: '人机验证服务暂时不可用，请稍后重试' };
    }

    const result = await response.json();
    if (!result.success) {
      return {
        success: false,
        message: '人机验证失败，请重新验证',
        errors: result['error-codes'] || [],
      };
    }
  } catch (_) {
    return { success: false, message: '人机验证服务暂时不可用，请稍后重试' };
  }

  return { success: true };
};

module.exports = {
  isTurnstileEnabled,
  verifyTurnstileToken,
};
