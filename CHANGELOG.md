# v0.1 (2026-11-03)

本地版首个可发布版本。基于上游 `eb7afc9`（v1.3.x）改造。

### 运行方式

* 免登录：`LOCAL_MODE=true` + 固定 token，去掉 Logto 依赖
* 免安装数据库：PostgreSQL 16 / Redis 5 便携版，`start-earthworm.bat` 一键拉起 4 个服务（5433 / 6379 / 3001 / 3000），全程无窗口
* 放开 `127.0.0.1` 的 CORS，`localhost` 与 `127.0.0.1` 都能访问

### 发音

* 有道 `dictvoice`（单词录音拼接、长句直接 500）→ 微软 Edge 神经语音，默认 `en-US-JennyNeural`
* 常驻 Python worker（`tools/tts-worker/worker.py`），按 `音色|语速|文本` 哈希缓存到 `storage/tts/`
* 全库 4762 个去重句预生成为静态文件，命中约 76ms，未命中 0.6~1.3s
* 自动补齐：导入课程包后、服务启动 15 秒后各跑一轮；预生成独立限流，交互请求不排队
* 设置里新增「答题时先读英文」「答对后再读一遍」两个开关，答对后走独立音轨，翻页不会掐断
* 三级兜底：神经语音 → 有道 → 浏览器 `speechSynthesis`

### 课程

* CSV 导入器 + 预览接口（只解析不写库）
* 新建课程包（重名自动加序号）
* 分批导入：可指定并入已有包、可勾选单节课导入，指定目标包时强制不覆盖已有课程

### 界面

* 首页、课程列表、学习页、设置页重做；深/浅色主题、手机端适配
* 课程列表按「课」显示进度条、`已学 / 总句数`、百分比胶囊
* 学习页新增顶部进度与本次统计，页面版式改为浅蓝渐变 + 逐词拆解
* 新增收藏本、站内帮助文档（使用说明 / 课程包导入 / 部署说明）
* 首页删掉本地学习者头像栏与多年份切换按钮

### 数据

* `user_course_progress` 唯一键 `(user_id, course_pack_id)` → `(user_id, course_pack_id, course_id)`，一节课一条进度
* 「最近使用的课程包」按包去重
* 内置 55 课 / 8865 句语料，导入时按句去重

---

# [1.0.0](https://github.com/cuixueshe/earthworm/compare/v1.3.3...v1.0.0) (2024-03-13)



# [1.0.0](https://github.com/cuixueshe/earthworm/compare/v1.2.1...v1.0.0) (2024-03-02)


### Bug Fixes

* fix course 18 the ninety-first field is incorrect ([4dc39ac](https://github.com/cuixueshe/earthworm/commit/4dc39ac5a269d4b4a99646010f1499fb7d615326))
* fix course 18 the ninety-first field is incorrect ([4436706](https://github.com/cuixueshe/earthworm/commit/4436706adce89739bec8ddcea1a6e64a9b1f8a30))
* fix course issue, closes [#118](https://github.com/cuixueshe/earthworm/issues/118) ([7408c2c](https://github.com/cuixueshe/earthworm/commit/7408c2c0364f7a597519c97d81d258bbcac81f89))
* fix course-18 ([008e43c](https://github.com/cuixueshe/earthworm/commit/008e43c6e9af16c8b07168ea8a11eab76a835d3a))
* fix course-34 statement is incorrect ([7cfa8a1](https://github.com/cuixueshe/earthworm/commit/7cfa8a1f67d90901ab697cdfdbfb4825e694e833))
* fix-course-18 ([cd49ed7](https://github.com/cuixueshe/earthworm/commit/cd49ed7a12a816e316cf207df1c929a0a55278ad))
* Keep word width consistent ([#181](https://github.com/cuixueshe/earthworm/issues/181)) ([24ac0d6](https://github.com/cuixueshe/earthworm/commit/24ac0d6d6180808f112de464ab5153dba49e3afa))
* Prevents adding Spaces after the last word ([d3a7847](https://github.com/cuixueshe/earthworm/commit/d3a78479479487e3e867506297a857e8dec896a5))
* remove the horrible emoji lol ([0adf30b](https://github.com/cuixueshe/earthworm/commit/0adf30b567791eccd6123fc32d8e10de6cf85366))
* **setting:** update cmd key display in the shortcut settings ([7a9f049](https://github.com/cuixueshe/earthworm/commit/7a9f04906298437b2741bd2b172f1c75ab938b5a))
* tests problems ([28d78b6](https://github.com/cuixueshe/earthworm/commit/28d78b69680c975fea25572ce64816ec2862e530))
* the env variable cannot be read, causing the db:init command to fail. ([82b092b](https://github.com/cuixueshe/earthworm/commit/82b092bce3d744597764126b3a79489a76839a4a))
* update course 12-74 ([604e00d](https://github.com/cuixueshe/earthworm/commit/604e00d04915efc642d28aa2899c5b01d8d52f27))
* update course 15.5-28 ([6ad0552](https://github.com/cuixueshe/earthworm/commit/6ad0552178490fe0f50a6a881d5fa608652e5faf))


### Features

* add e2e test by cypress ([c32ba6b](https://github.com/cuixueshe/earthworm/commit/c32ba6bbdbded166ab194aeda8d1e5979d091ba8))
* add mobile tips ([#144](https://github.com/cuixueshe/earthworm/issues/144)) ([097e26e](https://github.com/cuixueshe/earthworm/commit/097e26e63011e4fb459424a8be04258fefcd85b6))
* add scheduled task module and weekly reset ranking function ([#176](https://github.com/cuixueshe/earthworm/issues/176)) ([8164f64](https://github.com/cuixueshe/earthworm/commit/8164f64fda7b115f1b5a128b22867e5f7f56fcc6))
* added interaction to resolve wrong words ([6dcf68e](https://github.com/cuixueshe/earthworm/commit/6dcf68e2dc12b8c1969fd7a9e9ce568fb9a2d261))
* long sentence modification error ([ad29d5e](https://github.com/cuixueshe/earthworm/commit/ad29d5e01b99deeac2448b017af7f201e16caa3b))
* perfect use introduction ([#161](https://github.com/cuixueshe/earthworm/issues/161)) ([de735f6](https://github.com/cuixueshe/earthworm/commit/de735f67ea3d925922cfc76100ba8a4d2a667cb9))
* read one sentence per day aloud ([#171](https://github.com/cuixueshe/earthworm/issues/171)) ([baa5918](https://github.com/cuixueshe/earthworm/commit/baa59181c0bb16f1a755d47695d57485dec1d40b))
* shortcut key settings for submit operations ([fbbb96c](https://github.com/cuixueshe/earthworm/commit/fbbb96c13dd3ac949718f8295c47a5fe530e0e4b))
* submit with space ([72b9c9b](https://github.com/cuixueshe/earthworm/commit/72b9c9b60c3bce379d4b80416c45cafbc7beff2a))
* support to delete back to the previous incorrect word ([f989354](https://github.com/cuixueshe/earthworm/commit/f989354e200347d6887e0c08ff3d7945c3fcc4b2))
* the word is suggested by the width of the input box ([#149](https://github.com/cuixueshe/earthworm/issues/149)) ([faa35f7](https://github.com/cuixueshe/earthworm/commit/faa35f7410dabaec1ac696d02257d0383482d9f9))



