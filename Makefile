.DEFAULT_GOAL := help
IMAGE := halkeye/gitter-slack-bridge
IRSLACKD_PORT := 6667

build: ## Build docker image
	docker build -t $(IMAGE):latest .

push: ## push to docker hub
	docker push $(IMAGE):latest

run:
	docker run -it --rm --name irslackd -p $(IRSLACKD_PORT):$(IRSLACKD_PORT) $(IMAGE):latest

.PHONY: help
help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'
