require('dotenv').config();
const axios = require('axios');

const baseURL = process.env.SMOKE_TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}/api/v1`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const formatLocalDateTime = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

async function main() {
  try {
    const venuesRes = await axios.get(`${baseURL}/venues`, {
      timeout: 10000,
    });
    if (venuesRes.data.code !== 200) {
      throw new Error('场地列表接口返回异常');
    }
    const venues = venuesRes.data.data || [];

    const username = `test_${Date.now()}`;
    const password = '123456';
    await axios.post(`${baseURL}/auth/register`, {
      username,
      password,
      real_name: '测试用户',
    }, {
      timeout: 10000,
    });

    const loginRes = await axios.post(`${baseURL}/auth/login`, { username, password }, {
      timeout: 10000,
    });
    const token = loginRes.data.data?.token;
    if (!token) throw new Error('登录失败，未获取到 token');

    const client = axios.create({
      baseURL,
      timeout: 10000,
      headers: { Authorization: `Bearer ${token}` },
    });

    if (venues.length > 0) {
      const venueId = venues[0].id;
      const start = new Date(Date.now() + 24 * 3600 * 1000);
      start.setHours(10, 0, 0, 0);
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      const payload = {
        venue_id: venueId,
        start_time: formatLocalDateTime(start),
        end_time: formatLocalDateTime(end),
        purpose: '接口冒烟测试',
      };
      await client.post('/reservations', payload);
    }

    await client.get('/reservations/me');

    console.log(`Smoke test passed. baseURL=${baseURL}`);
    process.exit(0);
  } catch (err) {
    const detail = err.response?.data?.message || err.response?.data?.msg || err.message || String(err);
    console.error(`Smoke test failed: ${detail}`);
    process.exit(1);
  }
}

sleep(500).then(main);
