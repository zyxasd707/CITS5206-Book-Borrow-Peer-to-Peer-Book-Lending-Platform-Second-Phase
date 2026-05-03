# =====================
# Production (VPS)
# =====================
up: ## Start production containers (detached)
	docker compose -f compose.yaml up -d

down: ## Stop production containers
	docker compose -f compose.yaml down

build: ## Build production containers
	docker compose -f compose.yaml build

logs: ## Show logs (prod)
	docker compose -f compose.yaml logs -f nginx frontend backend

migrate: ## Run database migrations in the backend container
	docker compose -f compose.yaml exec backend alembic -c alembic.ini upgrade head

health: ## Run production health checks
	bash scripts/vps/check_health.sh

backup-db: ## Create a Docker MySQL database backup
	bash scripts/vps/backup_db.sh

backup-media: ## Create a Docker media volume backup
	bash scripts/vps/backup_media.sh

migrate-media: ## Copy current backend /app/media into the persistent media volume
	bash scripts/vps/migrate_media_volume.sh

rollback: ## Roll back to a git ref and rebuild production containers (usage: make rollback REF=<ref>)
	bash scripts/vps/rollback.sh $(REF)


# =====================
# Development (Local)
# =====================
up-dev: ## Start development containers (foreground)
	docker compose -f compose.yaml -f compose.dev.yaml up

down-dev: ## Stop development containers
	docker compose -f compose.yaml -f compose.dev.yaml down

build-dev: ## Build development containers
	docker compose -f compose.yaml -f compose.dev.yaml build

logs-dev: ## Show logs (dev)
	docker compose -f compose.yaml -f compose.dev.yaml logs -f nginx frontend backend

migrate-dev: ## Run database migrations in the dev backend container
	docker compose -f compose.yaml -f compose.dev.yaml exec backend alembic -c alembic.ini upgrade head


# =====================
# Utilities
# =====================
clean: ## Remove unused Docker data
	docker system prune -f

help: ## Show this help
	@echo ""
	@echo "Available make commands:"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  make %-12s %s\n", $$1, $$2}'
	@echo ""
