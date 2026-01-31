# OpenSkills Makefile
# 用于简化常用命令

.PHONY: help install dev build test lint clean deploy-staging deploy-prod

# 默认目标
help:
	@echo "OpenSkills 可用命令:"
	@echo "  make install          - 安装依赖"
	@echo "  make dev              - 启动开发服务器"
	@echo "  make build            - 构建生产版本"
	@echo "  make test             - 运行测试"
	@echo "  make lint             - 代码检查"
	@echo "  make clean            - 清理构建产物"
	@echo "  make deploy-staging   - 部署到 Staging"
	@echo "  make deploy-prod      - 部署到 Production"

# 安装依赖
install:
	npm install

# 启动开发服务器
dev:
	npm run dev

# 构建生产版本
build:
	npm run build

# 运行测试
test:
	npm test

# 代码检查
lint:
	npm run lint -w packages/api || true
	npm run lint -w packages/web || true

# 清理构建产物
clean:
	rm -rf packages/api/dist
	rm -rf packages/web/dist
	rm -rf node_modules
	rm -rf packages/*/node_modules

# 部署到 Staging
deploy-staging:
	@echo "部署到 Staging 环境..."
	git push origin develop
	@echo "请在 GitHub Actions 中查看部署进度"

# 部署到 Production
deploy-prod:
	@echo "部署到 Production 环境..."
	@read -p "确认部署到生产环境? [y/N] " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		git push origin main; \
		echo "请在 GitHub Actions 中查看部署进度"; \
	else \
		echo "部署已取消"; \
	fi

# 创建新版本标签
release:
	@read -p "输入版本号 (例如: 1.0.0): " version; \
	git tag -a v$$version -m "Release version $$version"; \
	git push origin v$$version; \
	echo "版本 v$$version 已创建并推送"

# 数据库迁移 (预留)
migrate:
	@echo "数据库迁移功能待实现"

# 备份数据
backup:
	@mkdir -p backups
	tar -czf backups/openskills-backup-$$(date +%Y%m%d-%H%M%S).tar.gz .openskills .cursor
	@echo "备份完成"

# 恢复数据
restore:
	@ls -1 backups/*.tar.gz 2>/dev/null || (echo "没有找到备份文件" && exit 1)
	@read -p "输入备份文件名: " backup; \
	tar -xzf backups/$$backup
	@echo "恢复完成"

# 初始化项目
init:
	@echo "初始化 OpenSkills 项目..."
	npm install
	npm run build
	@echo "初始化完成"
