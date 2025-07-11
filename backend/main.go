package main

import (
	"bufio"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"monitoring-app/api"
	"monitoring-app/monitoring"
	"monitoring-app/websockets"

	psnet "github.com/shirou/gopsutil/v3/net"
)

//go:embed dist/*
var frontendFS embed.FS

func main() {
	port := "8080"
	addr := ":" + port

	// Check if port is available and handle conflicts
	addr = ensurePortIsAvailable(port)

	distFS, err := fs.Sub(frontendFS, "dist")
	if err != nil {
		log.Fatal(err)
	}

	// Create hub and channels
	hub := websockets.NewHub()
	wsChan := make(chan *monitoring.ResourceSnapshot, 100)
	dbChan := make(chan *monitoring.ResourceSnapshot, 100)

	// Start hub and monitoring
	go hub.Run(wsChan)
	go monitoring.Start(wsChan, dbChan)

	mux := http.NewServeMux()

	// API routes
	mux.HandleFunc("/api/dashboard/layout", api.GetLayoutHandler)
	mux.HandleFunc("/api/widgets", api.GetWidgetsHandler)

	// WebSocket handler
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		websockets.ServeWs(hub, w, r)
	})

	// Static files
	mux.Handle("/", http.FileServer(http.FS(distFS)))

	log.Printf("HTTP server started on %s. Access the application at http://localhost%s\n", addr, addr)
	err = http.ListenAndServe(addr, mux)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}

func ensurePortIsAvailable(initialPort string) string {
	port := initialPort
	for {
		addr := ":" + port
		listener, err := net.Listen("tcp", addr)
		if err != nil {
			if strings.Contains(err.Error(), "address already in use") || strings.Contains(err.Error(), "Only one usage of each socket address") {
				fmt.Printf("Port %s is already in use.\n", port)
				fmt.Print("Would you like to (1) kill the existing process or (2) use a different port? [1/2]: ")

				reader := bufio.NewReader(os.Stdin)
				choice, _ := reader.ReadString('\n')
				choice = strings.TrimSpace(choice)

				if choice == "1" {
					if killProcessOnPort(port) {
						fmt.Println("Process killed. Retrying on the same port...")
						time.Sleep(1 * time.Second) // Give OS time to release port
						continue
					}
					fmt.Println("Failed to kill process. Please choose another port.")
				}

				// Fall through to case 2 if killing fails or user chooses 2
				fmt.Print("Please enter a new port number: ")
				newPortStr, _ := reader.ReadString('\n')
				port = strings.TrimSpace(newPortStr)
				continue
			}
			// It's some other error
			log.Fatalf("Failed to listen on port %s: %v", port, err)
		}
		// Port is available
		listener.Close()
		return addr
	}
}

func killProcessOnPort(port string) bool {
	portUint, err := strconv.ParseUint(port, 10, 32)
	if err != nil {
		fmt.Printf("Invalid port number: %s\n", port)
		return false
	}

	conns, err := psnet.Connections("tcp")
	if err != nil {
		log.Printf("Error getting connections: %v\n", err)
		return false
	}

	pidToKill := int32(0)
	for _, conn := range conns {
		if conn.Laddr.Port == uint32(portUint) && conn.Status == "LISTEN" {
			pidToKill = conn.Pid
			break
		}
	}

	if pidToKill == 0 {
		fmt.Printf("No process found listening on port %s.\n", port)
		return true // No process to kill, so technically successful.
	}

	fmt.Printf("Attempting to kill process with PID %d...\n", pidToKill)

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("taskkill", "/F", "/PID", fmt.Sprintf("%d", pidToKill))
	} else { // linux, darwin
		cmd = exec.Command("kill", "-9", fmt.Sprintf("%d", pidToKill))
	}

	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	err = cmd.Run()
	if err != nil {
		log.Printf("Failed to kill process %d: %v\n", pidToKill, err)
		return false
	}

	fmt.Printf("Process %d killed successfully.\n", pidToKill)
	return true
}
