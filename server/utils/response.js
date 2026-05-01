const success = (res, data = null, msg = '成功') => {
  res.status(200).json({
    code: 200,
    msg,
    data,
  });
};

const error = (res, code = 500, msg = '服务器错误') => {
  res.status(code).json({
    code,
    msg,
    data: null,
  });
};

module.exports = { success, error };
