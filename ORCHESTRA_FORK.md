# Virtuoso Fork 维护说明

本目录是 Virtuoso 的独立产品仓库，产品职责与权限见 [产品说明](ORCHESTRA_PRODUCT.md)。源码、Git 对象、分支、依赖、版本、上游同步和后续发布分别维护，可以独立于另一产品工作。上游来源由本仓库的 Git 对象、基线标签和来源记录保存。

## 来源与历史

[来源记录](ORCHESTRA_UPSTREAM.json)保存本仓库引入的真实上游提交、源码 tree、版本及提交历史状态。`orchestra-upstream/2026-10-19` 标签固定首次上游基线，`main` 保存本产品的独立提交。基线源码 tree 与原始上游 Git 对象已按哈希核验；该次引入没有改动上游源码、包名、锁文件、许可和第三方声明。

本仓库通过独立 Git 克隆取得基线，拥有独立的本地对象文件，没有借用另一仓库的对象目录或源码软链接。`upstream/master` 可达的提交历史已补齐，当前不是浅仓库；此次未导入上游历史标签，首次基线标签保持原值。

`upstream` 抓取地址指向 DeepSeek 官方仓库，推送地址为 `DISABLED`；产品 `origin` 指向 GitHub 私有仓库 `OrchestraCorp/Virtuoso`。本地 Git 配置不随源码文件传播；迁移时从产品 `origin` 克隆，并重新配置官方 `upstream` 及其禁用的推送地址。

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

上游提交历史已补齐。后续同步执行：

```sh
git fetch --no-tags upstream master
```

从本产品干净的 `main` 创建同步分支，审阅上游差异后独立合并、检查、更新来源记录并创建新的基线标签；首次基线标签保持原值。同步时不要求另一产品一同升级；通用修复可经审阅按需移植，各自记录来源和验证结果。

产品实现使用本仓库内的插件、profile、bundle 和配置扩展。现有 CI 是上游配置，首次上传期间产品 GitHub Actions 保持禁用，待分别适配工作流、制品名称和发布权限后启用。依赖安装、构建和运行验证遵循本仓库的 [开发说明](docs/development.zh.md)；当前仅完成 fork、提交历史补齐与 Git 校验。

本产品来源记录保留真实 Git 对象 ID；上游 `verify-repository-references` 会拒绝其中的提交 ID，并将既有 `python/sdk/uv.lock` 中的 Pillow wheel 文件大小数值误识别为短提交号。此检查待适配，完整 `doc-sync` 尚未验收；首次私有仓库迁移不代表应用构建或 CI 通过。
