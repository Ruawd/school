const VenueType = require('../models/VenueType');
const Venue = require('../models/Venue');
const { success, error } = require('../utils/response');

exports.getAllTypes = async (req, res) => {
  try {
    const types = await VenueType.findAll({ order: [['id', 'ASC']] });
    success(res, types);
  } catch (err) {
    console.error(err);
    error(res, 500, '获取场地类型失败');
  }
};

exports.createType = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return error(res, 400, '请输入场地类型名称');
    }

    const exists = await VenueType.findOne({ where: { name } });
    if (exists) {
      return error(res, 400, '该场地类型已存在');
    }

    const type = await VenueType.create({ name });
    success(res, type, '场地类型创建成功');
  } catch (err) {
    console.error(err);
    error(res, 500, '创建场地类型失败');
  }
};

exports.deleteType = async (req, res) => {
  try {
    const { id } = req.params;
    const type = await VenueType.findByPk(id);
    if (!type) {
      return error(res, 404, '场地类型不存在');
    }

    const usedCount = await Venue.count({ where: { type_id: id } });
    if (usedCount > 0) {
      return error(res, 400, '该场地类型正在被使用，不能删除');
    }

    await type.destroy();
    success(res, null, '场地类型删除成功');
  } catch (err) {
    console.error(err);
    error(res, 500, '删除场地类型失败');
  }
};
