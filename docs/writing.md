# 写作语法

文章是放在 `src/content/posts/` 下的 Markdown 文件。除标准 Markdown 外，本主题支持 GitHub 风格扩展、数学公式，以及一套用来书写 Butterfly 标签外挂的指令语法。

本地运行 `pnpm dev`，打开示例文章《标签外挂示例》，就能对照下面的语法看到实际效果。

- [Front Matter](#front-matter)
- [基础 Markdown](#基础-markdown)
- [图片](#图片)
- [代码块](#代码块)
- [数学公式](#数学公式)
- [提示块](#提示块)
- [Note](#note)
- [Tip](#tip)
- [折叠块](#折叠块)
- [标签页](#标签页)
- [行内元素](#行内元素)
- [复选框与单选框](#复选框与单选框)
- [网站卡片](#网站卡片)
- [音乐](#音乐)

## Front Matter

```yaml
---
title: 文章标题              # 必填
date: 2024-06-01 10:00:00    # 必填；按 site.timezone 解析
updated: 2024-06-02 09:00    # 可选；缺省等于 date
abbrlink: 1a2b3c4d           # 必填；文章地址 /posts/1a2b3c4d/
tags: [Astro, 前端]          # 一个时可以只写字符串
categories: [前端, 框架]      # 数组表示层级：前端 › 框架
cover: /img/covers/2.svg     # 列表卡片封面；缺省用 site.defaultCover
top_img: /img/banner.svg     # 文章顶部横幅；缺省用 cover
description: 摘要            # 缺省截取正文开头
comments: false              # 关闭本篇评论（Hexo 的 comment 字段也认）
draft: true                  # 草稿：只在 pnpm dev 里出现
---
```

- 日期支持 Hexo 的各种写法，比如 `2023-1-9 14:18:56`。
- `pnpm new "标题" 目录` 会生成一个不重复的 8 位 `abbrlink`。
- `abbrlink` 一旦发布就不要再改，否则旧链接会失效。

## 基础 Markdown

完整支持 [GitHub 风格 Markdown](https://github.github.com/gfm/)：

- 表格、任务列表 `- [x]`、删除线 `~~文字~~`、脚注 `[^1]`、自动链接。
- `##` 到 `######` 标题会进入目录，并生成和 Hexo 规则一致的锚点。
- 外部链接自动在新标签页打开，并加上 `rel="noopener external nofollow noreferrer"`。

## 图片

```md
![这段文字会显示为图片说明](/img/photo.jpg)
```

- 所有图片都会懒加载，点击后用灯箱放大查看。
- 写了 alt 文字的图片，下方会显示居中的说明文字。像 `image.png` 这种文件名式的 alt 不会显示。
- 需要指定尺寸时直接写 HTML：`<img src="/img/a.png" alt="说明" width="300">`。

## 代码块

代码块在构建时由 [Expressive Code](https://expressive-code.com/) 渲染，不需要额外的浏览器脚本来高亮。

````md
```js title="config.js" {2} ins={3} del={4}
const a = 1;
const b = 2;   // 高亮
const c = 3;   // 新增行
const d = 4;   // 删除行
```
````

| 写法 | 效果 |
| --- | --- |
| `title="文件名"` | 标题栏显示文件名；不写则显示语言名 |
| `{2}` `{1-3,5}` | 高亮这些行 |
| `ins={3}` / `del={4}` | 标记为新增行或删除行 |
| `showLineNumbers=false` | 隐藏行号。Shell 类语言默认就不显示行号 |
| `wrap` | 自动换行，不出现横向滚动 |

- 标题栏右侧有复制和折叠两个按钮。
- 超过 360px 高的代码块会自动收起，底部有展开条。

## 数学公式

```md
行内公式 $E = mc^2$

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$
```

使用 KaTeX 在构建时渲染，浏览器里不运行任何公式脚本。

## 提示块

最常用的五种提示直接用 [GitHub Alerts](https://docs.github.com/zh/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts) 的写法。这样在 GitHub 上预览 Markdown 时也能正确显示：

```md
> [!NOTE]
> 内容

> [!TIP] 可以写一个标题
> 内容
```

| 写法 | 对应 Butterfly 的写法 | 颜色 |
| --- | --- | --- |
| `[!NOTE]` | `{% note info %}` | 蓝 |
| `[!TIP]` | `{% note success %}` | 绿 |
| `[!IMPORTANT]` | `{% note primary %}` | 紫 |
| `[!WARNING]` | `{% note warning %}` | 橙 |
| `[!CAUTION]` | `{% note danger %}` | 红 |

## Note

GitHub 写法表达不了的 Butterfly Note 变体，用 `:::note` 指令书写，类名与 Butterfly 一致：

```md
:::note{.default .flat}
默认样式
:::

:::note{.blue .flat icon="fas fa-bullhorn"}
自定义图标（Font Awesome 6 名称）
:::
```

- **类型**：`.default` `.primary` `.info` `.success` `.warning` `.danger`
- **颜色**：`.blue` `.pink` `.red` `.purple` `.orange` `.green`
- **样式**：`.flat`（不写时的默认样式）、`.modern`、`.simple`、`.disabled`
- **图标**：`icon="fas fa-xxx"`，也可以写 `far` / `fab` 前缀

## Tip

```md
:::tip{type=bolt}
内容
:::

:::tip{type=warning .faa-horizontal .animated}
图标左右晃动
:::
```

- `type` 可选：`info` `success` `warning` `error` `bolt` `ban` `home` `sync` `cogs` `key` `bell`
- 动画类名：`.faa-horizontal .animated` 一直晃动，`.faa-horizontal .animated-hover` 悬停时晃动

## 折叠块

```md
:::details[点击展开]{.green open}
折叠内容，可以包含任意 Markdown。
:::
```

- 颜色可选：`.blue` `.cyan` `.green` `.yellow` `.orange` `.red` `.purple`。
- 加 `open` 表示默认展开。
- 生成的是原生 `<details>`，不开 JS 也能用。

## 标签页

外层容器的冒号要比里面的多一个：

````md
::::tabs
:::tab[第一页]
内容
:::
:::tab[第二页]
内容
:::
::::
````

如果标签页里面还有 `:::` 容器（比如折叠块），外层再加一个冒号：`:::::tabs` / `::::tab[…]`。

## 行内元素

| 写法 | 效果 |
| --- | --- |
| `:span[文字]{.red}` | 彩色文字。颜色：`.red` `.green` `.blue` `.cyan` `.yellow` `.purple` `.gray` |
| `:span[文字]{.large}` | 字号：`.small` `.large` `.huge` `.ultra`、`.h1`…`.h5`；对齐：`.left` `.center` `.right`；`.bold` |
| `:spoiler[文字]` | 隐藏文字，悬停或用键盘聚焦时显示 |
| `:tooltip[词语]{tip="解释"}` | 气泡注释；`color="#DC143C"` 改气泡颜色 |

## 复选框与单选框

块级元素，每个单独占一行：

```md
:checkbox[已完成]{.green checked}

:radio[选项 A]{.cyan checked}
```

颜色可选：`.red` `.green` `.blue` `.cyan` `.yellow`。

## 网站卡片

```md
::site{name="站点名" url="https://example.com/" screenshot="/img/shot.png" avatar="/img/logo.png" description="一句话介绍"}
```

适合放在友链页：每张卡片一行，桌面端会自动排成多列。

## 音乐

```md
::music{id=歌单id server=netease type=playlist}
```

在文章中嵌入一个 APlayer 播放列表，数据来自 `src/config.ts` 里 `music.api` 配置的 Meting API。只有包含音乐卡片的页面才会下载 APlayer；多个播放器同时存在时，开始播放一个会暂停其他的。

---

不认识的指令会原样当作文字输出，所以正文里的 `比例 1:2` 这类冒号不会被误吞。
