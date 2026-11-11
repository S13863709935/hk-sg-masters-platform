# Render部署准备：本地预检完成（2026-11-11）

## 范围与状态

- 独立分支：`deploy/render-demo`，基于完整本地版本`178b744`；未推送、未创建云服务、未获得公网网址。
- 保留14校、873条目录、865条默认可浏览记录及原有资料质量标记；858条部分官方资料不等于完整要求或独立复核。
- 普通本地启动仍绑定127.0.0.1；显式`npm run start:hosted`读取Render提供的端口及HTTPS域名，监听0.0.0.0。
- 托管演示强制使用内存数据库，从源码重新载入目录；禁用管理导入。浏览器收藏和背景的保存规则不变。
- 固定Node24.22.1；无第三方运行依赖。构建命令为`node scripts/check-data.mjs`。

## 已验证

`node --test tests/hosted-demo.test.mjs tests/app.test.mjs tests/startup-launcher.test.mjs tests/startup-environment.test.mjs`：35项通过、0失败。

覆盖配置的公开域名、HTTPS来源检查、拒绝伪造Host／Origin及转发头、后台导入禁用、匹配请求、完整目录、托管入口连续两次内存冷启动，以及原本地接口和Windows启动规则。原日常数据库未用于这些检查，文件SHA256保持`ca01dcab4a2d935c2500042cd42b80d4fa014628a0056cbcff1adccba49020d0`。

实际构建命令已成功执行。源码文件名和常见凭据格式检查未发现待发布的运行数据库、私有密钥或访问令牌。`git diff --check`通过。

## 尚待进行

用户此前要求超前完整版保留本地，故完整部署分支的GitHub推送仍需确认范围。main、W4–W8及Study Week分支保持原提交，不重写周次历史。

之后由账号持有人登录Render、连接GitHub、选择Free并创建Web Service。实际云端启动、HTTPS页面、免费实例休眠后唤醒和其他设备访问尚未验收。本机模拟通过不能代替云端验收。

准确填写步骤及官方文档见[Render部署指南](../deploy-render.md)。
