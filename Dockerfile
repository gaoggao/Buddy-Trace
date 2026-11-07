# LBASE — 打破 AI Agent 记忆局限
#
# 多阶段构建：第一阶段生成单文件可执行程序，第二阶段只保留运行所需。
# 运行镜像不含 Node、不含源码，只有一个可执行文件。

# ── 阶段一：构建 ──
FROM oven/bun:1 AS builder

WORKDIR /build

# 无第三方依赖，不需要 npm install
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts

# 内嵌界面资源 + 编译成单文件
RUN bun scripts/embed-ui.js \
 && bun build src/index.js --compile --target=bun-linux-x64 --outfile=/build/lbase

# ── 阶段二：运行 ──
FROM debian:bookworm-slim

# bun 编译产物需要 glibc；HTTPS 需要 ca-certificates；curl 用于健康检查
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /build/lbase /usr/local/bin/lbase
RUN chmod +x /usr/local/bin/lbase

# 数据目录（挂卷持久化）
VOLUME ["/data"]

EXPOSE 41729 41730 41731

# 容器里没有浏览器，用 --no-open
ENTRYPOINT ["/usr/local/bin/lbase"]
CMD ["--data", "/data", "--no-open", "--port", "41729"]

# 健康检查（用 curl，不依赖 node）
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:41729/api/health || exit 1
