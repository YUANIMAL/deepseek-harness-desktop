# DSH Desktop —— macOS 代码签名与公证（Notarization）接入指南

本文档说明如何为 DSH Desktop 的 macOS 分发包（DMG）配置 **Apple 代码签名 + 公证**，
以及如何在 GitHub Actions 中自动完成。全程只需要一次性的证书/凭据准备，之后 CI 每次发版都会自动签名并公证。

涉及的文件：

| 文件 | 作用 |
|---|---|
| `build/entitlements.mac.plist` | hardened runtime 权限声明（签名时打进 .app） |
| `package.json` → `build.mac` | electron-builder 的签名/公证配置 |
| `build/signing-steps.md` | 可插入 release workflow 的 YAML 片段（供 `.github/workflows/release.yml` 合并使用） |

---

## 0. 签名和公证是什么？为什么需要？

- **代码签名（Code Signing）**：用你的 **Developer ID Application** 证书对 .app 进行数字签名，证明"这个应用确实来自你、且未被篡改"。macOS 会校验签名与你的开发者身份。
- **公证（Notarization）**：把签好名的 .app 上传到 Apple 的 Notary Service 做恶意软件扫描；通过后 Apple 签发 **notarization ticket**，electron-builder 会把它 staple（订）进应用。
- **为什么必须做**：自 macOS Catalina（10.15）起，Gatekeeper 会拦截**未公证**的下载应用，用户首次打开会看到"无法验证开发者 / 已损坏"的警告，只能去 系统设置 → 隐私与安全性 手动放行。签名 + 公证通过后，用户下载打开即可正常使用，体验与 App Store 应用无异。
- **公证的硬性要求**：必须开启 **hardened runtime**（`hardenedRuntime: true`）+ 提供 **entitlements**，并使用 Developer ID 证书。这三样本项目已全部配好。

---

## 1. 前置条件

- 一个 **Apple 开发者账号**（付费，$99/年，个人或组织均可；Apple Developer Program 成员）。
  - 注册/续费：<https://developer.apple.com/programs/>
- 一台 macOS 电脑（生成证书、导出 .p12、本地验证时用；CI 用的是 GitHub 的 `macos-latest` runner，不需要你的电脑）。
- 本项目已完成配置：`package.json` 的 `build.mac` 已包含 `hardenedRuntime: true`、`entitlements: "build/entitlements.mac.plist"`、`gatekeeperAssess: false`、`notarize: true`。

---

## 2. 第一步：申请 Developer ID Application 证书

> 只需做一次。之后所有发版（本地或 CI）都用这把证书签名。

1. **生成证书签名请求（CSR）**
   - 打开 钥匙串访问（Keychain Access）→ 菜单栏 **钥匙串访问 → 证书助理 → 从证书颁发机构请求证书…**
   - 填写你的电子邮件和名字（Common Name 随意，建议用你的姓名或公司名），勾选 **存储到磁盘**，点继续，保存 `.certSigningRequest` 文件。

2. **在 Apple Developer 网站创建证书**
   - 登录 <https://developer.apple.com/account> → **Certificates, Identifiers & Profiles**（证书、标识符和描述文件）。
   - 点 **Certificates** → **+**（创建证书）→ 在 **Software** 分组下选择 **Developer ID Application**（注意：不是 "Apple Development"，也不是 "Mac App Distribution"）→ 继续。
   - 上传上一步的 `.certSigningRequest`，下载生成的 `.cer` 证书文件。

3. **安装证书到本机钥匙串**
   - 双击下载的 `.cer`，确认导入到 **登录** 钥匙串（login keychain）。
   - 在 钥匙串访问 → **我的证书** 里应能看到 **“Developer ID Application: <你的名字> (<10 位 Team ID>)”**。

---

## 3. 第二步：导出 .p12 并转为 base64

> CI 不能直接用你电脑上的钥匙串，所以要把证书导出成一个带密码的 `.p12` 文件，base64 编码后作为 GitHub secret 传给 CI。

1. **导出 .p12**
   - 钥匙串访问 → 我的证书 → 右键 **“Developer ID Application: …”** → **导出 “Developer ID Application: …”**。
   - 格式选 **个人信息交换 (.p12)**，保存到安全位置（例如 `~/dsh-desktop-dev-id.p12`）。
   - **设置一个强密码**并记牢——这就是 `APPLE_CERTIFICATE_PASSWORD`。⚠️ `.p12` 包含你的私钥，等同你的签名身份，务必妥善保管、不要提交进仓库、不要发给别人。

2. **转成 base64（单行）**
   ```bash
   base64 -i ~/dsh-desktop-dev-id.p12 | pbcopy   # 已复制到剪贴板，直接粘贴到 GitHub secret
   # 或保存到文件方便查看：
   base64 -w0 -i ~/dsh-desktop-dev-id.p12 > ~/dsh-desktop-dev-id.p12.b64
   ```

---

## 4. 第三步：生成 App 专用密码，并找到 Team ID

**App 专用密码（App-Specific Password）**——公证时要用你的 Apple ID 登录 Apple 的 Notary Service，但**不能用账号主密码**（出于安全，Apple 要求用专用密码）：

1. 登录 <https://appleid.apple.com> → **登录与安全（Sign-In & Security）** → **App 专用密码（App-Specific Passwords）**。
2. 点 **生成 App 专用密码…**，起个名字（如 `dsh-desktop-ci`），得到形如 `xxxx-xxxx-xxxx-xxxx` 的 16 位密码。
   - ⚠️ 密码只显示一次，立刻复制保存到 GitHub secret（`APPLE_APP_SPECIFIC_PASSWORD`）。
   - 之后想轮换/吊销，回到同一页面删除即可。

**Team ID（团队 ID）**：

- 登录 <https://developer.apple.com/account> → **Membership（会员资格）** 页面，**Team ID** 是 10 位字母数字（也显示在证书名称末尾的括号里）。

---

## 5. 第四步：在 GitHub 配置 Secrets

打开仓库 **Settings → Secrets and variables → Actions → New repository secret**，逐个创建：

| Secret 名称 | 值 | 用途 |
|---|---|---|
| `APPLE_CERTIFICATE_BASE64` | 第 3 步得到的 `.p12` base64（单行） | CI 里解码回 .p12 并导入 keychain，供 `codesign` 签名 |
| `APPLE_CERTIFICATE_PASSWORD` | 导出 .p12 时设置的密码 | `security import` 时解开 .p12 |
| `APPLE_ID` | 你的 Apple ID 邮箱（开发者账号） | 公证时 notarytool 用它登录 |
| `APPLE_APP_SPECIFIC_PASSWORD` | 第 4 步生成的 App 专用密码 | 公证时替代账号主密码 |
| `APPLE_TEAM_ID` | Membership 页的 10 位 Team ID | 公证时指定账号所属团队 |

> Secrets 一旦创建无法查看原值，只能覆盖更新；请务必先在自己电脑上留好备份（.p12 + 密码）。

---

## 6. 第五步：接入 CI（自动签名 + 公证）

把 `build/signing-steps.md` 里的 YAML 片段合并进 `.github/workflows/release.yml`（该 workflow 由另一个任务负责编写），核心逻辑：

1. 用 `APPLE_CERTIFICATE_BASE64` 解码出 .p12；
2. `security import` 导入 keychain + `security set-key-partition-list` 授权 codesign 免弹窗访问私钥；
3. 导出 `CSC_LINK` / `CSC_KEY_PASSWORD`（签名证书）和 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`（公证凭据）；
4. 运行 `electron-builder --mac dmg` —— 此时会自动签名 + 公证 + staple ticket。

**关键点：签名构建时不要设置 `CSC_IDENTITY_AUTO_DISCOVERY=false`**（旧配置用它强制跳过签名）。electron-builder 默认会自动发现证书。

---

## 7. 两种公证凭据方式对比

`package.json` 里 `build.mac.notarize: true` 开启公证后，electron-builder（v26）会从环境变量读取凭据，**三种方式任选其一**（优先级按以下顺序）：

**方式 A —— Apple ID + App 专用密码（推荐给个人开发者，最简单）**

```
APPLE_ID=<你的 Apple ID 邮箱>
APPLE_APP_SPECIFIC_PASSWORD=<App 专用密码>
APPLE_TEAM_ID=<Team ID>
```

**方式 B —— App Store Connect API Key（推荐给团队/CI 更严格的安全要求）**

```
APPLE_API_KEY=<API Key 文件（.p8）的 base64>
APPLE_API_KEY_ID=<Key ID，形如 2X9R4HXF34>
APPLE_API_ISSUER=<Issuer ID，UUID>
```

- 创建：<https://appstoreconnect.apple.com> → 用户和访问（Users and Access）→ 集成（Integrations）→ 团队密钥（Team Keys）→ 生成 API 密钥（勾选 Developer ID Application / Developer ID Installer 权限）。
- 官方在 electron-builder 源码注释里**推荐方式 B**（API Key 不暴露账号密码、可单独吊销）；但创建和管理门槛更高，个人项目用方式 A 足够。

**方式 C —— keychain profile**

```
APPLE_KEYCHAIN=<keychain 路径>
APPLE_KEYCHAIN_PROFILE=<notarytool profile 名>
```

- 需要先用 `xcrun notarytool store-credentials` 在 CI 里预存凭据，较少用，这里不展开。

> 本地没有上述环境变量时，`notarize: true` 只会打一条警告并**跳过公证**（不会报错），方便无凭据环境下调试打包。

---

## 8. 本地手动签名 + 公证（可选，用于验证配置）

如果你在自己的 Mac 上已安装 Developer ID 证书，可以本地完整验证一遍：

```bash
# 1) 导出凭据（一行一个，替换成真实值）
export CSC_LINK=/path/to/your.p12            # 或直接给 base64 字符串
export CSC_KEY_PASSWORD='你的 p12 密码'
export APPLE_ID='you@example.com'
export APPLE_APP_SPECIFIC_PASSWORD='xxxx-xxxx-xxxx-xxxx'
export APPLE_TEAM_ID='XXXXXXXXXX'

# 2) 打包（自动签名 + 公证 + staple）
npm run dist

# 3) 验证
codesign --verify --deep --strict --verbose=2 "dist/mac-arm64/DSH Desktop.app"   # 签名有效
codesign -d --entitlements :- "dist/mac-arm64/DSH Desktop.app"                    # 查看 entitlements（XML）
xcrun stapler validate "dist/mac-arm64/DSH Desktop.app"                           # 公证 ticket 已 stapled
spctl --assess --type execute --verbose=4 "dist/mac-arm64/DSH Desktop.app"        # Gatekeeper: accepted
```

> 注意：arm64 机器的输出目录是 `dist/mac-arm64`，x64 是 `dist/mac-x64`（也可能叫 `dist/mac`，以实际为准）。

---

## 9. 常见问题（FAQ）

- **公证失败 / `Invalid credentials`**：检查 App 专用密码是否复制完整（含 `-`）、Team ID 是否 10 位、Apple ID 是否启用了双重认证（App 专用密码要求账号开启双重认证）。
- **`unable to find utility "codesign"`**：CI 上确保 job 用 `macos-latest` runner，且安装了 Xcode 命令行工具（macos runner 自带）。
- **构建时提示找不到证书 / 跳过签名**：确认 `CSC_LINK`/`CSC_KEY_PASSWORD` 已导出、`APPLE_CERTIFICATE_BASE64` 解码出的 .p12 有效；且**没有**设置 `CSC_IDENTITY_AUTO_DISCOVERY=false`。
- **签名后应用启动崩溃**：多半是 hardened runtime 缺 entitlements。本项目已提供 `build/entitlements.mac.plist`（含 `allow-jit` 等），保持 `hardenedRuntime: true` 与它配套即可。
- **为什么 `gatekeeperAssess: false`**：`@electron/osx-sign` 在签名时会用 `spctl` 做本地 Gatekeeper 评估，CI 环境不稳定时容易误报失败；签名/公证由 Apple 服务端把关，本地评估可以关闭。
- **需要 `com.apple.security.cs.disable-library-validation` 吗？** 默认**不需要**（它会削弱 hardened runtime）。只有当应用加载**未签名**的第三方动态库时才需要，纯 Electron 应用不要加。
