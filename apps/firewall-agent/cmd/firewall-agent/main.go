package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/harris1111/auto-update-IP/apps/firewall-agent/internal/agent"
	"github.com/harris1111/auto-update-IP/apps/firewall-agent/internal/config"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	log.SetOutput(os.Stdout)

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	a, err := agent.New(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize agent: %v", err)
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go a.Run()

	sig := <-sigCh
	log.Printf("Received signal %s, shutting down", sig)
}
