# Render免费演示部署（2026-11-11）

这是完整本地网站的独立部署分支deploy/render-demo，起点为本地178b744。它没有替换main、第八周或本地运行版。用户已于11月11日授权将完整分支推送至GitHub；推送代码后仍需在Render创建服务。本文件本身不代表服务已上线。准备与授权记录见[部署准备记录](progress/render-deployment-preparation-2026-11-11.md)。

## 一、准备GitHub来源

checkpoint/week-08保留20个直接申请试点，不是873条目录的完整版本。部署完整版本使用独立deploy/render-demo分支，保留main和各周历史；不要为使Render看到代码而覆盖原分支。

源码仓库：https://github.com/S13863709935/hk-sg-masters-platform

## 二、登录与新建

1. 打开https://dashboard.render.com，注册或登录自己的账号。GitHub登录、授权与任何条款由账号持有人亲自处理。
2. 点击New，再选Web Service。此网站需要后台接口，应选择Web Service。
3. 选择Git Provider中的GitHub，连接所需仓库并选择hk-sg-masters-platform。只授予这次所需的仓库访问范围。
4. 在创建表单中按下表填写。

| 字段 | 填写值 |
| --- | --- |
| Name | gradpath-hk-sg-demo（如重名可加自己的后缀） |
| Language / Runtime | Node |
| Branch | deploy/render-demo（须先推送） |
| Region | 默认即可，或选择适合访问者的可用地区 |
| Root Directory | 留空 |
| Build Command | node scripts/check-data.mjs |
| Start Command | npm run start:hosted |
| Instance Type | Free |
| Health Check Path | /api/health |

项目不依赖第三方运行包，构建命令直接核对源资料。仓库.node-version固定已验证的24.22.1；若页面已有NODE_VERSION覆盖值，改为24.22.1。不要添加付费数据库或持久磁盘，演示配置不需要它们。

Render会自动设置PORT、RENDER=true和RENDER_EXTERNAL_URL；无需自己输入公开网址。首次部署不要额外设置PUBLIC_ORIGIN、ADMIN_TOKEN或DB_PATH。已有部署时应清除不适用的旧覆盖值。

5. 确认实例是Free后，点击Create Web Service或Deploy Web Service。等待构建、启动及健康检查完成，显示Live。
6. 打开Render页面实际给出的https://…onrender.com链接。服务名和域名以实际返回为准，文档中的名称不是已创建网址。

## 三、上线后的验收

- 首页显示Public demonstration，目录873条，默认可浏览865条；核对总数不代表完整招生要求。
- 在另一台设备打开HTTPS网址，检查搜索、详情、背景比较、收藏及导出。不要把127.0.0.1作为分享地址。
- 收藏及主动记忆的背景只在相应设备、浏览器和域名中保留。原本本地地址的收藏不会自动转移到新域名。
- 课程数据从仓库快照载入内存。服务重启后重新载入这些版本，网页不开放后台导入；更新课程资料通过核对后的源码更新和重新部署进行。不依赖免费服务本地SQLite文件长期保存。
- 免费服务闲置15分钟会休眠，下一次打开通常需约一分钟唤醒。Render的免费额度和账户账单规则仍适用；界面方案以实际创建时为准。

## 部署准备的验证边界

本机35项预检全部通过：本地旧启动规则、公网域名和HTTPS Origin校验、拒绝伪造Host／Origin、后台导入禁用、完整目录载入，以及真实托管入口连续两次从内存冷启动。没有打开原日常SQLite文件。模拟请求不等于真实Render网络、服务健康检查或第二台设备已验收；这些必须在实际创建服务后核对。

本分支增加显式托管入口，普通start-local.cmd仍默认只绑定127.0.0.1。公网模式只接受设定的HTTPS来源，忽略转发头对信任范围的扩大，并强制使用内存课程库及关闭导入。

## 常见问题

- 日志出现Local host required或只看到20个项目：检查是否选错旧分支／启动命令。
- 服务一直启动但检测不到端口：确认Start Command为npm run start:hosted，由Render提供PORT，不手动写3102。
- 缺少HTTPS public origin：确认是Render Web Service，未删除自动变量；不要手动填本机地址。
- Node SQLite模块不可用：确认NODE_VERSION覆盖值或.node-version为24.22.1。
- Live但首次打开稍慢：先考虑免费服务唤醒；查看Logs确认健康状态。

官方说明（11月10日查阅）：

- [Web Services与创建步骤](https://render.com/docs/web-services)
- [Render自动环境变量](https://render.com/docs/environment-variables)
- [Node版本优先级](https://render.com/docs/node-version)
- [免费服务限制](https://render.com/docs/free)
