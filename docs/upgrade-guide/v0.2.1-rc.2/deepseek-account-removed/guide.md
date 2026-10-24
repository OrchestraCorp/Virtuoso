---
kind: upgrade-guide
description: "Product profiles remove DeepSeek account login and use API-key model connections."
---

# DeepSeek account login removed from product profiles

English | [中文](guide.zh.md)

## Change

Maestro and Virtuoso no longer mount the DeepSeek account provider, account-token model route, account Remote controller, or account settings UI in their product profiles. Desktop opens the workspace directly; the native login and Platform balance/recharge views are removed. Settings opens through the ordinary settings button. Automatic provider credential onboarding is off by default.

API-key credentials and MaaS model connections remain available. Existing account grants and Session data are not deleted, and saved model selections are not silently redirected to another provider.

## Migration

1. Open **Settings → Model connections**, enter the service BaseURL, API key, and models, then save and choose a default. The existing **Models** page also accepts API keys.
2. If a saved selection names `deepseek-account`, explicitly select a configured API-key model for new work and for any Session that still selects that route.
3. Remove private profile rows that explicitly add `deepseek-account`, `llm-deepseek-account`, `account-controller`, or `ui-settings-account` if those overlays were copied from the previous defaults.
4. Confirm startup shows the workspace and Settings without DeepSeek login, balance, or recharge, and verify a chosen connection through its explicit model test.
