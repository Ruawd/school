process.env.TZ = process.env.APP_TIMEZONE || 'Asia/Shanghai';

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config({ quiet: true });

const sequelize = require('./config/db');
const VenueType = require('./models/VenueType');
const { seedAdminUser } = require('./scripts/seed_admin');
const { backfillVenueCheckinTokens } = require('./services/venueCheckinService');
require('./services/schedulerService');

const app = express();

app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/v1', require('./routes'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// In production, let the Node service serve the built front-end files as well.
// This keeps deployment simple: Nginx only needs to proxy the whole domain to this service.
const clientDistPath = path.resolve(__dirname, '../client/dist');
const clientIndexPath = path.join(clientDistPath, 'index.html');

if (require('fs').existsSync(clientIndexPath)) {
  app.use(express.static(clientDistPath));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    return res.sendFile(clientIndexPath);
  });
}

app.use(require('./middlewares/error'));

const PORT = Number(process.env.PORT || 3788);

const DEFAULT_VENUE_TYPES = [
  '教室',
  '礼堂',
  '排练厅',
  '体育馆',
  '实验室',
  '会议室',
];

const seedVenueTypes = async () => {
  const count = await VenueType.count();
  if (count > 0) return false;

  await VenueType.bulkCreate(
    DEFAULT_VENUE_TYPES.map((name) => ({ name })),
  );

  return true;
};

async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    await sequelize.sync({ alter: true });

    const [typeCreated, adminResult] = await Promise.all([
      seedVenueTypes(),
      seedAdminUser(),
    ]);
    const tokenBackfillCount = await backfillVenueCheckinTokens();

    if (typeCreated) {
      console.log('默认场地类型已初始化');
    }
    if (adminResult.created) {
      console.log(`默认管理员已初始化：${adminResult.username} / ${adminResult.password}`);
    }

    if (tokenBackfillCount > 0) {
      console.log(`已为 ${tokenBackfillCount} 个场地补齐签到令牌`);
    }

    app.listen(PORT, () => {
      console.log(`服务已启动，监听端口 ${PORT}`);
    });
  } catch (err) {
    console.error('服务启动失败:', err);
    process.exit(1);
  }
}

startServer();

module.exports = app;
