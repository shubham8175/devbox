export interface GitignoreTemplate {
  id: string;
  name: string;
  group: "Languages & frameworks" | "Platforms" | "Editors";
  content: string;
}

export const GITIGNORE_TEMPLATES: GitignoreTemplate[] = [
  {
    id: "node",
    name: "Node.js",
    group: "Languages & frameworks",
    content: `# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Dependency directories
node_modules/
jspm_packages/
.pnp
.pnp.js
.yarn/cache
.yarn/unplugged
.yarn/build-state.yml
.yarn/install-state.gz

# Coverage and test output
coverage/
*.lcov
.nyc_output

# Build output
dist/
build/
out/
lib-cov

# Caches
.npm
.eslintcache
.stylelintcache
.cache/
.parcel-cache
*.tsbuildinfo

# Environment
.env
.env.*
!.env.example
!.env.sample

# Misc
.node_repl_history
*.tgz
.yarn-integrity
report.[0-9]*.[0-9]*.[0-9]*.[0-9]*.json
pids
*.pid
*.seed
*.pid.lock`,
  },
  {
    id: "nextjs",
    name: "Next.js",
    group: "Languages & frameworks",
    content: `# Next.js
.next/
out/
next-env.d.ts

# Vercel
.vercel

# Production
build/

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# TypeScript
*.tsbuildinfo

# Environment
.env*.local
.env

# Testing
coverage/`,
  },
  {
    id: "react",
    name: "React",
    group: "Languages & frameworks",
    content: `# React / CRA / Vite
build/
dist/
dist-ssr/
*.local

# Dependencies
node_modules/
/.pnp
.pnp.js

# Testing
coverage/

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Storybook
storybook-static/`,
  },
  {
    id: "react-native",
    name: "React Native",
    group: "Languages & frameworks",
    content: `# React Native
node_modules/
npm-debug.log
yarn-error.log

# Expo
.expo/
.expo-shared/
dist/
web-build/
expo-env.d.ts

# iOS
ios/Pods/
ios/build/
ios/*.xcworkspace/xcuserdata/
ios/.xcode.env.local

# Android
android/app/build/
android/build/
android/.gradle/
android/local.properties
android/app/release/
*.keystore
!debug.keystore

# Metro
.metro-health-check*

# Bundles
*.jsbundle
*.hprof

# Fastlane
**/fastlane/report.xml
**/fastlane/Preview.html
**/fastlane/screenshots
**/fastlane/test_output

# Environment
.env
.env.*`,
  },
  {
    id: "android",
    name: "Android",
    group: "Languages & frameworks",
    content: `# Gradle
.gradle/
build/
/captures
.externalNativeBuild
.cxx/
*.apk
*.aab
*.ap_
*.aar
*.dex
*.class

# Local configuration
local.properties
*.jks
*.keystore
!debug.keystore
release/
google-services.json

# Android Studio / IntelliJ
*.iml
.idea/
.navigation/
proguard/
lint/reports/
lint/generated/
lint/intermediates/
lint/outputs/
lint/tmp/

# Logs
*.log

# Kotlin
.kotlin/`,
  },
  {
    id: "ios",
    name: "iOS",
    group: "Languages & frameworks",
    content: `# Xcode build
build/
DerivedData/
*.ipa
*.dSYM.zip
*.dSYM

# CocoaPods
Pods/
*.xcworkspace/xcuserdata/

# Carthage
Carthage/Build/

# Swift Package Manager
.build/
.swiftpm/
Packages/
Package.pins
Package.resolved

# fastlane
fastlane/report.xml
fastlane/Preview.html
fastlane/screenshots/**/*.png
fastlane/test_output

# Playgrounds
timeline.xctimeline
playground.xcworkspace

# Code Injection
iOSInjectionProject/`,
  },
  {
    id: "python",
    name: "Python",
    group: "Languages & frameworks",
    content: `# Byte-compiled / optimized
__pycache__/
*.py[cod]
*$py.class
*.so

# Distribution / packaging
build/
develop-eggs/
dist/
downloads/
eggs/
.eggs/
lib/
lib64/
parts/
sdist/
var/
wheels/
share/python-wheels/
*.egg-info/
.installed.cfg
*.egg
MANIFEST

# Installer logs
pip-log.txt
pip-delete-this-directory.txt

# Unit test / coverage
htmlcov/
.tox/
.nox/
.coverage
.coverage.*
.cache
nosetests.xml
coverage.xml
*.cover
.hypothesis/
.pytest_cache/

# Environments
.env
.venv
env/
venv/
ENV/
env.bak/
venv.bak/

# Type checkers / linters
.mypy_cache/
.dmypy.json
dmypy.json
.pyre/
.pytype/
.ruff_cache/

# Jupyter
.ipynb_checkpoints

# Django / Flask
*.log
local_settings.py
db.sqlite3
db.sqlite3-journal
instance/
.webassets-cache

# Poetry / pdm / uv
poetry.toml
.pdm.toml
.pdm-python
.pdm-build/`,
  },
  {
    id: "java",
    name: "Java",
    group: "Languages & frameworks",
    content: `# Compiled class files
*.class

# Logs
*.log

# BlueJ files
*.ctxt

# Mobile Tools for Java (J2ME)
.mtj.tmp/

# Package files
*.jar
*.war
*.nar
*.ear
*.zip
*.tar.gz
*.rar

# JVM crash logs
hs_err_pid*
replay_pid*

# Maven
target/
pom.xml.tag
pom.xml.releaseBackup
pom.xml.versionsBackup
pom.xml.next
release.properties
dependency-reduced-pom.xml
buildNumber.properties
.mvn/timing.properties
.mvn/wrapper/maven-wrapper.jar

# Gradle
.gradle/
build/
!gradle/wrapper/gradle-wrapper.jar
!**/src/main/**/build/
!**/src/test/**/build/`,
  },
  {
    id: "macos",
    name: "macOS",
    group: "Platforms",
    content: `# General
.DS_Store
.AppleDouble
.LSOverride

# Icon must end with two \\r
Icon\r\r

# Thumbnails
._*

# Files that might appear in the root of a volume
.DocumentRevisions-V100
.fseventsd
.Spotlight-V100
.TemporaryItems
.Trashes
.VolumeIcon.icns
.com.apple.timemachine.donotpresent

# Directories potentially created on remote AFP share
.AppleDB
.AppleDesktop
Network Trash Folder
Temporary Items
.apdisk`,
  },
  {
    id: "windows",
    name: "Windows",
    group: "Platforms",
    content: `# Windows thumbnail cache files
Thumbs.db
Thumbs.db:encryptable
ehthumbs.db
ehthumbs_vista.db

# Dump file
*.stackdump

# Folder config file
[Dd]esktop.ini

# Recycle Bin used on file shares
$RECYCLE.BIN/

# Windows Installer files
*.cab
*.msi
*.msix
*.msm
*.msp

# Windows shortcuts
*.lnk`,
  },
  {
    id: "jetbrains",
    name: "JetBrains",
    group: "Editors",
    content: `# JetBrains IDEs (IntelliJ, WebStorm, PyCharm, Android Studio…)
.idea/
*.iws
*.iml
*.ipr
out/
cmake-build-*/

# File-based project format
*.iws

# JIRA plugin
atlassian-ide-plugin.xml

# Crashlytics plugin (Android Studio)
com_crashlytics_export_strings.xml
crashlytics.properties
crashlytics-build.properties
fabric.properties`,
  },
  {
    id: "vscode",
    name: "VS Code",
    group: "Editors",
    content: `# VS Code
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
!.vscode/*.code-snippets

# Local History for Visual Studio Code
.history/

# Built Visual Studio Code Extensions
*.vsix`,
  },
  {
    id: "xcode",
    name: "Xcode",
    group: "Editors",
    content: `# Xcode user state
xcuserdata/
*.xcuserstate
*.xcuserdatad/
*.xccheckout
*.xcscmblueprint
*.moved-aside

# Xcode build
build/
DerivedData/
*.hmap
*.ipa
*.dSYM.zip
*.dSYM

# Legacy
*.pbxuser
!default.pbxuser
*.mode1v3
!default.mode1v3
*.mode2v3
!default.mode2v3
*.perspectivev3
!default.perspectivev3`,
  },
];
