# macOS 签名 + 公证 —— 可插入 GitHub Actions 的 YAML 片段

> 本文件**不是完整 workflow**，而是给 `.github/workflows/release.yml`（由另一个任务编写）
> 合并用的独立片段。合并方式：把下面 `steps:` 列表整体贴进 release job，
> 放在 `npm ci`（安装依赖）**之后**、`electron-builder --mac dmg`（打包）**之前**。
> 完整说明见根目录 `SIGNING.md`。

## 前置要求

- job 运行在 **`macos-latest`**（签名必须在 macOS 上执行）。
- 仓库已配置 secrets（见 SIGNING.md 第 5 节）：
  `APPLE_CERTIFICATE_BASE64`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`。
- ⚠️ **移除/不要设置 `CSC_IDENTITY_AUTO_DISCOVERY=false`**——旧的无签名构建靠它跳过签名，现在要签名，必须去掉。

## 片段

```yaml
steps:
  # ---------------------------------------------------------------------------
  # ① 解码签名证书（.p12）
  #    把 secrets.APPLE_CERTIFICATE_BASE64（.p12 的 base64）还原成证书文件。
  #    文件放到 /tmp，runner 销毁时自动清理，不落盘到仓库工作区。
  # ---------------------------------------------------------------------------
  - name: Decode signing certificate (.p12)
    shell: bash
    env:
      APPLE_CERTIFICATE_BASE64: ${{ secrets.APPLE_CERTIFICATE_BASE64 }}
    run: |
      echo "$APPLE_CERTIFICATE_BASE64" | base64 --decode > /tmp/dsh-desktop.p12

  # ---------------------------------------------------------------------------
  # ② 导入证书到 keychain，并授权 codesign 无弹窗访问私钥
  #    - 创建独立 build.keychain 并设为默认 keychain
  #    - security import 把 .p12 导入该 keychain（密码用 APPLE_CERTIFICATE_PASSWORD）
  #    - set-key-partition-list 是关键：CI 无人值守，没有它 codesign 会因
  #      无法弹出"允许访问钥匙串"对话框而签名失败
  #    - 文件 /tmp/dsh-desktop.p12 保留，供下面 CSC_LINK 引用（不要删）
  # ---------------------------------------------------------------------------
  - name: Import signing certificate into keychain
    shell: bash
    env:
      APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
    run: |
      # 用 RUNNER_TEMP（每次 job 唯一的临时路径）作为 keychain 密码，随机且随 runner 销毁
      KEYCHAIN_PASSWORD="$RUNNER_TEMP"
      security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
      security default-keychain -s build.keychain
      security unlock-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
      security import /tmp/dsh-desktop.p12 \
        -k build.keychain \
        -P "$APPLE_CERTIFICATE_PASSWORD" \
        -T /usr/bin/codesign \
        -T /usr/bin/productsign
      # 允许 apple-tool / codesign 访问私钥，免 UI 授权
      security set-key-partition-list \
        -S apple-tool:,apple: \
        -s -k "$KEYCHAIN_PASSWORD" build.keychain
      # 关闭 keychain 自动锁定（默认 5 分钟），避免长构建中途私钥失效
      security set-keychain-settings -lut 21600 build.keychain

  # ---------------------------------------------------------------------------
  # ③ 导出签名 + 公证所需的环境变量（写入 GITHUB_ENV，后续步骤继承）
  #    - CSC_LINK / CSC_KEY_PASSWORD ：electron-builder 用它们读取签名证书
  #      （CSC_LINK 支持 .p12 文件路径或 base64；这里给路径）
  #    - APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID ：
  #      package.json 里 mac.notarize: true 时 electron-builder 用这三项做公证
  #      （Apple ID + App 专用密码方式，个人开发者推荐；备选 API Key 方式见 SIGNING.md §7）
  # ---------------------------------------------------------------------------
  - name: Export signing & notarization environment variables
    shell: bash
    env:
      APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
      APPLE_ID: ${{ secrets.APPLE_ID }}
      APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
      APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
    run: |
      # --- 签名证书 ---
      echo "CSC_LINK=/tmp/dsh-desktop.p12" >> "$GITHUB_ENV"
      echo "CSC_KEY_PASSWORD=$APPLE_CERTIFICATE_PASSWORD" >> "$GITHUB_ENV"
      # --- 公证凭据 ---
      echo "APPLE_ID=$APPLE_ID" >> "$GITHUB_ENV"
      echo "APPLE_APP_SPECIFIC_PASSWORD=$APPLE_APP_SPECIFIC_PASSWORD" >> "$GITHUB_ENV"
      echo "APPLE_TEAM_ID=$APPLE_TEAM_ID" >> "$GITHUB_ENV"

  # ---------------------------------------------------------------------------
  # ④ 打包（自动完成：签名 → 公证 → staple ticket）
  #    等价于 npx electron-builder --mac dmg（package.json 的 dist 脚本）。
  #    若之后要出 pkg/zip 等其他 mac 产物，改这里的 target 即可，签名逻辑不变。
  # ---------------------------------------------------------------------------
  - name: Build signed & notarized DMG
    shell: bash
    run: npm run dist
```

## 合并注意事项（给 release.yml 编写者）

1. 以上 `steps` 与 release job 里已有的步骤（checkout、setup-node、`npm ci`、上传 artifact 等）按顺序合并，本片段整体插在 `npm ci` 与 `electron-builder --mac dmg` 之间。
2. 若你的 workflow 之前有类似 `env: CSC_IDENTITY_AUTO_DISCOVERY: 'false'` 的配置（无签名构建用），**必须删除**，否则本片段不会生效。
3. 公证是网络操作，Apple 处理通常需要 1~5 分钟；建议给该 job 设置足够长的超时（如 `timeout-minutes: 60`）。
4. 产物（`dist/*.dmg`）上传到 GitHub Release 即可，无需额外处理——公证 ticket 已 staple 进 .app。
