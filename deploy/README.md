# 部署说明

当前线上地址：**https://kaoyan.hi55555.cn**

- 访问使用应用内账号登录；两个账号的记录相互独立。
- 未登录用户只能通过登录页的「游客进入 1v1」参与一次性比赛。
- 应用目录：`/srv/yantu/app`
- 运行用户：`yantu`
- 数据目录：`/srv/yantu/app/data`（SQLite `app.db` + `uploads/`）
- 环境变量：`/etc/yantu.env`（仅 root/yantu 可读）
- systemd：`yantu.service`，监听 `127.0.0.1:3000`
- Nginx 反向代理 + HTTPS + API 限流（登录在应用内）
- 证书：Let's Encrypt，`certbot.timer` 自动续期

## 常用命令

```bash
systemctl status yantu
systemctl restart yantu
journalctl -u yantu -f
tail -f /var/log/nginx/yantu.error.log

# 备份数据库（SQLite 使用 WAL，需连同 wal/shm 一起备份；最稳妥是先停服务）
systemctl stop yantu
tar czf /root/yantu-backup-$(date +%F).tgz -C /srv/yantu/app data/app.db data/app.db-wal data/app.db-shm data/uploads
systemctl start yantu

# 修改账号密码（在服务器上以 yantu 身份执行）
su -s /bin/bash yantu -c "cd /srv/yantu/app && APP_DB_PATH=/srv/yantu/app/data/app.db /usr/local/bin/node scripts/set-password.mjs hifive '新密码' Hifive"
# 修改显示名/新增账号同理；环境变量只在首次建库时种入用户，之后请用此脚本。
```

## 更新代码

```bash
bash scripts/deploy-remote.sh
```

脚本先在本地执行 `npm run build`，再把源码和构建产物上传到服务器；服务器只安装生产依赖并重启，不在 1.7G 小机器上跑 Next 构建（避免 OOM/502）。

## 首次部署要点

1. `useradd --system --home-dir /srv/yantu --shell /usr/sbin/nologin yantu`
2. 安装 Node 20+（服务器当前是 `/usr/local/bin/node` v24.12）
3. 写入 `/etc/yantu.env`（含 `YANTU_USER1_*`、`YANTU_USER2_*`），然后 `chown root:yantu`、`chmod 640`
4. `npm ci && npm run build`
5. 安装 `deploy/yantu.service`，`systemctl daemon-reload && systemctl enable --now yantu`
6. 安装 Nginx 配置、申请证书；登录由应用处理，不需要 Basic Auth
