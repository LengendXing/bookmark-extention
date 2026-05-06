#!/bin/bash

echo "请选择要启动的工具："
echo "1) Claude"
echo "2) Codex"
read -p "输入选项 (1/2): " choice

# export http_proxy=http://127.0.0.1:7897
# export https_proxy=http://127.0.0.1:7897
export OPENAI_API_KEY=sk-sNHNDHTZN6jxv4SIyNFj45x11JiYYL9awbnLRKf5sG6dUTRE
export OPENAI_BASE_URL=https://api.zhenhaoji.qzz.io/
export ANTHROPIC_AUTH_TOKEN=sk-FIw29F3pBI3DqLu8p8cvyoZnoQoks9iSDmzkxAxyJvcCKKue
export ANTHROPIC_BASE_URL=https://api.zhenhaoji.qzz.io/

case $choice in
  1)
    unset ANTHROPIC_API_KEY
    export ANTHROPIC_MODEL=claude-opus-4-7
    echo "启动 Claude..."
    claude --dangerously-skip-permissions
    ;;
  2)
    export OPENAI_MODEL=claude-opus-4-7
    echo "启动 Codex..."
    codex --full-auto
    ;;
  *)
    echo "无效选项，请输入 1 或 2"
    exit 1
    ;;
esac