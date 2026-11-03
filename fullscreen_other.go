//go:build !windows

package main

import "github.com/wailsapp/wails/v3/pkg/application"

// En Linux/macOS el fullscreen nativo ya cubre el panel y el z-order lo
// gestiona el window manager.
func setWindowTopmost(_ uintptr, _ bool) {}

func setWindowFullscreenTopmost(window *application.WebviewWindow) {
	window.Fullscreen()
}
