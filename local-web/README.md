# MediaFetch 产品定义与细节

## 1. 产品概述

MediaFetch 是一个网页图片提取工具。用户输入一个网页 URL 后，系统会抓取页面中的图片资源，并展示缩略图、分辨率、格式和文件体积。

当前版本的目标是快速查看网页中的图片资产信息，不是完整的网页渲染器，也不是批量下载器。

## 2. 核心能力

- 输入网页 URL
- 提取页面中的图片候选项
- 识别常见图片来源
- 拉取图片本体并解析元数据
- 在页面中展示缩略图和图片详情

## 3. 支持的图片来源

当前实现会尝试从以下位置提取图片 URL：

- `img` 标签
- `source` 标签
- `meta property="og:image"`
- `meta name="twitter:image"`
- `link rel="image_src"`
- 常见懒加载属性，例如 `data-src`、`data-original`、`data-lazy-src`
- 部分 `background-image` 样式

## 4. 页面交互

页面采用极简单输入界面：

- 标题为英文 `MediaFetch`
- 中文说明提示用户输入网页 URL
- 一个输入框用于粘贴 URL
- 一个按钮用于开始提取
- 结果区域以卡片形式显示

每个结果卡片展示：

- 缩略图
- 格式
- 分辨率
- 文件体积

界面不直接显示图片原始链接文本。

## 5. 技术实现

- 服务端使用 Node.js 内置 `http` 模块
- 首页由单文件 HTML/CSS/JavaScript 渲染
- 默认端口为 `3200`
- 支持通过环境变量 `PORT` 覆盖端口
- 提供 `start.bat`，支持双击启动并自动打开浏览器

### 元数据计算

服务端会对图片 URL 再发起一次请求，以获取图片文件内容，然后解析：

- `format`: 根据 `content-type`、扩展名或文件头判断
- `resolution`: 根据图片格式解析宽高
- `size`: 根据响应字节数或 `content-length` 计算体积

支持识别的格式包括：

- PNG
- JPEG
- GIF
- WEBP
- SVG
- BMP
- ICO
- AVIF

## 6. 输入与输出

### 输入

- 一个可访问的 `http://` 或 `https://` 网页 URL

### 输出

- 页面内图片卡片列表
- 每个卡片包含缩略图和元数据
- 后端接口返回结构化 JSON

返回字段示例：

```json
{
  "url": "https://example.com/",
  "count": 3,
  "images": [
    {
      "url": "https://example.com/image.png",
      "format": "PNG",
      "resolution": "1200 x 800",
      "size": "256 KB"
    }
  ]
}
```

## 7. 当前限制

- 不执行页面 JavaScript
- 对纯前端动态加载的网站支持有限
- 对于被站点限制访问的图片，可能无法读取元数据
- 大图片存在体积上限，避免占用过多内存
- 某些特殊图片格式可能只能识别部分信息

## 8. 运行方式

### 双击启动

直接双击 `start.bat`。

### 命令行启动

```bash
npm start
```

默认访问地址：

```text
http://localhost:3200
```

## 9. 后续可扩展方向

- 增加一键下载全部图片
- 增加图片格式和尺寸筛选
- 增加导出 JSON/CSV 清单
- 增加浏览器渲染模式，支持动态网页
- 增加历史记录或任务列表

## 10. 产品定位总结

MediaFetch 适合快速提取和查看网页图片资产信息，重点是：

- 操作简单
- 输入即用
- 结果清晰
- 不依赖复杂前端框架

