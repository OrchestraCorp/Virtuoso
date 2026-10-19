# Virtuoso Fork 维护说明

本目录是 Virtuoso 的独立产品仓库，产品职责与权限见 [产品说明](ORCHESTRA_PRODUCT.md)。源码、Git 对象、分支、依赖、版本、上游同步和后续发布分别维护，可以独立于另一产品与本机 Harness 参考目录工作。

## 来源与历史

[来源记录](ORCHESTRA_UPSTREAM.json)保存本仓库引入的真实上游提交、源码 tree、版本及浅历史状态。`orchestra-upstream/2026-10-19` 标签固定首次上游基线，`main` 保存本产品的独立提交。基线源码 tree 与原始上游 Git 对象已按哈希核验；该次引入没有改动上游源码、包名、锁文件、许可和第三方声明。

本仓库通过独立 Git 克隆取得基线，拥有完整的本地对象文件，没有借用另一仓库的对象目录或源码软链接。当前为浅仓库，上游父提交未取回；跨越浅历史截点的日志、比较、同步和依赖历史标签的发布工具需要先补齐历史。

`upstream` 抓取地址指向 DeepSeek 官方仓库，推送地址为 `DISABLED`。企业 GitLab `origin` 后续单独配置。本地 Git 配置与浅历史状态不随普通源码文件复制或推送传播，迁移时需保留 `.git`，或从上游重新克隆后导入本产品提交。

## 本地检查

在本仓库根目录执行：

```sh
git status --short --branch
git log --oneline --decorate -2
git remote -v
git rev-parse --is-shallow-repository
git fsck --full
```

## 独立同步与发布

以下网络步骤尚未在当前环境完成验证。首次补齐历史时执行：

```sh
git fetch --unshallow --no-tags upstream master
```

完整历史仓库后续使用：

```sh
git fetch --no-tags upstream master
```

从本产品干净的 `main` 创建同步分支，审阅上游差异后独立合并、检查、更新来源记录并创建新的基线标签；首次基线标签保持原值。同步时不要求另一产品一同升级；通用修复可经审阅按需移植，各自记录来源和验证结果。

产品实现使用本仓库内的插件、profile、bundle 和配置扩展。现有 CI 是上游配置，企业远端 CI、制品名称和发布权限需在本产品接入 GitLab 时分别适配。依赖安装、构建和运行验证遵循本仓库的 [开发说明](docs/development.zh.md)；本次仅完成 fork 与 Git 校验。
