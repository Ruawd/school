# 校园场地智能预约与管理系统

本仓库包含校园场地智能预约与管理系统的前端和后端程序。

- `client/`：React + Vite 前端项目，包含管理端和移动端页面。
- `server/`：Node.js + Express 后端项目，包含认证、场地、预约、候补、签到、通知、统计等接口。

## 运行说明

1. 分别进入 `client` 和 `server` 安装依赖：

```bash
npm install
```

2. 复制环境变量示例文件并按本地数据库配置修改：

```bash
copy server\.env.example server\.env
copy client\.env.example client\.env
```

3. 启动开发环境：

```bash
dev.bat
```

停止服务：

```bash
stop.bat
```
