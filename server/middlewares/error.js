module.exports = (err, req, res, next) => {
    console.error(err.stack);
    const status = err.statusCode || 500;
    const msg = err.message || 'Server Error';

    res.status(status).json({
        code: status,
        msg,
        data: null
    });
};
