# Oracle Cloud Always Free 部署指南（Flask + SQLite）

## 0. 何时需要验证码
你在 Oracle 注册和登录控制台时会触发邮箱/手机验证码。
你完成验证码后，继续下面步骤即可。

## 1. 在 Oracle Cloud 创建 VM
1. 进入 Oracle Cloud 控制台，选择 `Compute` -> `Instances` -> `Create instance`。
2. 镜像选 `Ubuntu 22.04`（或 Ubuntu 24.04）。
3. Shape 选 Always Free 可用规格（推荐 Arm A1.Flex，按免费额度配置）。
4. 生成并下载 SSH 私钥（`.key` 文件），保存到本机，比如 `~/.ssh/oracle_vm.key`。
5. 在网络安全规则里放行端口：`22`（SSH）和 `80`（HTTP）。

## 2. 本机执行一键部署
在本项目目录运行：

```bash
cd /Users/chalamet/Desktop/citation-analysis-platform
chmod +x scripts/oracle/*.sh
./scripts/oracle/deploy_to_vm.sh ubuntu@<VM_PUBLIC_IP> ~/.ssh/oracle_vm.key
```

脚本会自动完成：
- 上传项目到 VM
- 安装 Python/nginx
- 建立虚拟环境并安装依赖
- 配置 `gunicorn + systemd`
- 配置 nginx 反向代理

> 如果你把数据库拆成了多个分片（放在 `db_shards/*.db` 或项目根目录的 `citations_shard_*.db`），脚本会自动启用 `CITATIONS_DB_FILES` 分片模式。

## 2.1 可选：先把数据库拆成多个 <100MB 文件
```bash
cd /Users/chalamet/Desktop/citation-analysis-platform
./split_db_shards.py --input citations.db --output-dir db_shards --max-size-mb 95
```

完成后会生成 `db_shards/manifest.txt`，包含分片文件列表与启动环境变量示例。

## 3. 验证服务
```bash
curl -I http://<VM_PUBLIC_IP>
```
返回 `HTTP/1.1 200 OK` 或 `302` 即表示已上线。

## 4. 常用运维命令（在 VM 上）
```bash
sudo systemctl status citation-platform
sudo journalctl -u citation-platform -n 200 --no-pager
sudo systemctl restart citation-platform
sudo nginx -t
```

## 5. 可选：绑定域名 + HTTPS
域名解析到 VM 公网 IP 后可用 `certbot` 配置证书：
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 6. 文件与配置位置
- 项目目录：`/opt/citation-analysis-platform`
- systemd 服务：`/etc/systemd/system/citation-platform.service`
- nginx 配置：`/etc/nginx/sites-available/citation-platform`
- 运行端口（内网）：`127.0.0.1:8000`
