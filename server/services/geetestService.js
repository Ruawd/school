const crypto = require('crypto');

const VERIFY_URL = 'https://gcaptcha4.geetest.com/validate';

const getGeeTestConfig = () => ({
  captchaId: process.env.GEETEST_CAPTCHA_ID,
  captchaKey: process.env.GEETEST_CAPTCHA_KEY,
});

const isGeeTestEnabled = () => {
  const { captchaId, captchaKey } = getGeeTestConfig();
  return Boolean(captchaId && captchaKey);
};

const pickValidatePayload = (payload = {}) => payload.geetestValidate || payload.captcha || payload;

const verifyGeeTest = async (payload = {}) => {
  if (!isGeeTestEnabled()) {
    return { success: true, skipped: true };
  }

  const { captchaId, captchaKey } = getGeeTestConfig();
  const validate = pickValidatePayload(payload);
  const {
    lot_number: lotNumber,
    captcha_output: captchaOutput,
    pass_token: passToken,
    gen_time: genTime,
  } = validate || {};

  if (!lotNumber || !captchaOutput || !passToken || !genTime) {
    return { success: false, message: '请先完成人机验证' };
  }

  const signToken = crypto
    .createHmac('sha256', captchaKey)
    .update(lotNumber)
    .digest('hex');

  const formData = new URLSearchParams();
  formData.append('lot_number', lotNumber);
  formData.append('captcha_output', captchaOutput);
  formData.append('pass_token', passToken);
  formData.append('gen_time', genTime);
  formData.append('sign_token', signToken);

  try {
    const response = await fetch(`${VERIFY_URL}?captcha_id=${encodeURIComponent(captchaId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });

    if (!response.ok) {
      return { success: false, message: '人机验证服务暂时不可用，请稍后重试' };
    }

    const result = await response.json();
    if (result.result !== 'success') {
      return { success: false, message: '人机验证失败，请重新验证', detail: result };
    }

    return { success: true, detail: result };
  } catch (_) {
    return { success: false, message: '人机验证服务暂时不可用，请稍后重试' };
  }
};

module.exports = {
  isGeeTestEnabled,
  verifyGeeTest,
};
