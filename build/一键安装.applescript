-- DeepSeek Desktop 一键安装 / One-click installer
-- Copies the app from this dmg to /Applications, clears the Gatekeeper
-- quarantine attribute, and launches it. Runs without admin privileges
-- (they are not needed for a per-user install).

set appName to "DeepSeek Desktop.app"

-- Folder containing this installer (the mounted dmg volume).
set myPath to POSIX path of (path to me)
set volFolder to do shell script "dirname " & quoted form of myPath
set srcApp to volFolder & "/" & appName
set dstApp to "/Applications/" & appName

try
	-- 1) remove the old version, 2) copy the new one
	do shell script "rm -rf " & quoted form of dstApp
	do shell script "cp -R " & quoted form of srcApp & " /Applications/"
	-- 3) clear the Gatekeeper quarantine attribute
	do shell script "xattr -cr " & quoted form of dstApp
	-- 4) launch it
	do shell script "open " & quoted form of dstApp

	display dialog "安装完成！已从「应用程序」打开。¬
	首次启动会自动解压内置组件（约 1 分钟）。¬
	¬
	Installation complete! The app has been opened from Applications.¬
	First launch extracts the bundled runtime (~1 minute)." buttons {"好的 / OK"} default button 1 with title "DeepSeek Desktop"
on error errMsg
	display dialog "安装失败：" & errMsg & "¬
	¬
	Installation failed. Please drag DeepSeek Desktop.app into Applications manually, then right-click it → Open." buttons {"好的 / OK"} default button 1 with title "DeepSeek Desktop"
end try
