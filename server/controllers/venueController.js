const { Op } = require('sequelize');
const Venue = require('../models/Venue');
const Reservation = require('../models/Reservation');
const { success, error } = require('../utils/response');
const { ensureVenueCheckinToken, sanitizeVenueForRole } = require('../services/venueCheckinService');

const normalizePayload = (payload = {}) => {
  const data = { ...payload };

  if (data.capacity !== undefined && data.capacity !== null && data.capacity !== '') {
    data.capacity = Number(data.capacity);
  }
  if (data.type_id !== undefined && data.type_id !== null && data.type_id !== '') {
    data.type_id = Number(data.type_id);
  }
  if (data.status !== undefined && data.status !== null && data.status !== '') {
    data.status = Number(data.status) === 2 ? 1 : Number(data.status);
  }
  if (data.map_x !== undefined && data.map_x !== null && data.map_x !== '') {
    data.map_x = Number(data.map_x);
  }
  if (data.map_y !== undefined && data.map_y !== null && data.map_y !== '') {
    data.map_y = Number(data.map_y);
  }

  return data;
};

const isNumberInRange = (value, min, max) => Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;

const validateVenue = (payload) => {
  if (!payload.name) return '请填写场地名称';
  if (payload.type_id === undefined || payload.type_id === null || payload.type_id === '') return '请选择场地类型';
  if (payload.capacity !== undefined && (!Number.isFinite(Number(payload.capacity)) || Number(payload.capacity) < 1)) return '容纳人数必须大于 0';
  if (payload.status !== undefined && ![0, 1, 2].includes(Number(payload.status))) return '场地状态不合法';
  if (!payload.open_start || !payload.open_end) return '请填写开放时段';
  if (payload.open_start >= payload.open_end) return '开放结束时间必须晚于开始时间';
  if (payload.map_x === undefined || payload.map_x === null || payload.map_x === '') return '请设置地图经度坐标';
  if (payload.map_y === undefined || payload.map_y === null || payload.map_y === '') return '请设置地图纬度坐标';
  if (!isNumberInRange(payload.map_x, 73, 136)) return '经度超出中国大陆范围，请重新选择';
  if (!isNumberInRange(payload.map_y, 3, 54)) return '纬度超出中国大陆范围，请重新选择';
  return null;
};

const buildDisplayVenueStatus = (venue, busyVenueIds) => {
  if (busyVenueIds.has(Number(venue.id))) return 2;
  return Number(venue.status) === 0 ? 0 : 1;
};

const getBusyVenueIds = async (venueIds = null) => {
  const now = new Date();
  const where = {
    status: { [Op.in]: [1, 2] },
    start_time: { [Op.lte]: now },
    end_time: { [Op.gt]: now },
  };
  if (Array.isArray(venueIds) && venueIds.length) {
    where.venue_id = { [Op.in]: venueIds };
  }

  const activeReservations = await Reservation.findAll({
    where,
    attributes: ['venue_id'],
    raw: true,
  });

  return new Set(activeReservations.map((item) => Number(item.venue_id)));
};

exports.getVenues = async (req, res) => {
  try {
    const { type, capacity, status } = req.query;
    const where = {};

    if (type) where.type_id = Number(type);
    if (capacity) where.capacity = { [Op.gte]: Number(capacity) };

    let venues = await Venue.findAll({
      where,
      order: [['create_time', 'DESC']],
      raw: true,
    });

    const busyVenueIds = await getBusyVenueIds(venues.map((item) => item.id));
    venues = venues.map((item) => ({
      ...item,
      status: buildDisplayVenueStatus(item, busyVenueIds),
    }));

    if (status !== undefined && status !== '') {
      venues = venues.filter((item) => Number(item.status) === Number(status));
    }

    success(res, venues.map((item) => sanitizeVenueForRole(item, req.user)));
  } catch (err) {
    console.error(err);
    error(res, 500, '获取场地列表失败');
  }
};

exports.getVenueById = async (req, res) => {
  try {
    const venue = await Venue.findByPk(req.params.id);
    if (!venue) {
      return error(res, 404, '场地不存在');
    }

    await ensureVenueCheckinToken(venue);
    const plain = venue.toJSON();
    const busyVenueIds = await getBusyVenueIds([plain.id]);
    success(res, sanitizeVenueForRole({
      ...plain,
      status: buildDisplayVenueStatus(plain, busyVenueIds),
    }, req.user));
  } catch (err) {
    console.error(err);
    error(res, 500, '获取场地详情失败');
  }
};

exports.createVenue = async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    const message = validateVenue(payload);
    if (message) {
      return error(res, 400, message);
    }

    const venue = await Venue.create(payload);
    await ensureVenueCheckinToken(venue);
    success(res, sanitizeVenueForRole(venue, req.user), '场地创建成功');
  } catch (err) {
    console.error(err);
    error(res, 500, '场地创建失败');
  }
};

exports.updateVenue = async (req, res) => {
  try {
    const venue = await Venue.findByPk(req.params.id);
    if (!venue) {
      return error(res, 404, '场地不存在');
    }

    const payload = normalizePayload(req.body);
    const message = validateVenue({ ...venue.toJSON(), ...payload });
    if (message) {
      return error(res, 400, message);
    }

    await venue.update(payload);
    await ensureVenueCheckinToken(venue);
    success(res, sanitizeVenueForRole(venue, req.user), '场地更新成功');
  } catch (err) {
    console.error(err);
    error(res, 500, '场地更新失败');
  }
};

exports.deleteVenue = async (req, res) => {
  try {
    const venue = await Venue.findByPk(req.params.id);
    if (!venue) {
      return error(res, 404, '场地不存在');
    }

    const activeReservationCount = await Reservation.count({
      where: {
        venue_id: venue.id,
        status: { [Op.in]: [0, 1, 2] },
      },
    });

    if (activeReservationCount > 0) {
      return error(res, 400, '该场地存在未结束预约，暂时不能删除');
    }

    await venue.destroy();
    success(res, null, '场地删除成功');
  } catch (err) {
    console.error(err);
    error(res, 500, '场地删除失败');
  }
};
