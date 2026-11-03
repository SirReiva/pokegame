//go:build windows

package main

import (
	"github.com/wailsapp/wails/v3/pkg/application"
	"golang.org/x/sys/windows"
)

const (
	swpNoSize      = 0x0001
	swpNoMove      = 0x0002
	swpNoActivate  = 0x0010
	hwndTopmost    = ^uintptr(0) // HWND_TOPMOST (-1)
	hwndNotTopmost = ^uintptr(1) // HWND_NOTOPMOST (-2)
)

var setWindowPos = windows.NewLazySystemDLL("user32.dll").NewProc("SetWindowPos")

// setWindowTopmost cambia el z-order sin mover ni redimensionar la ventana.
func setWindowTopmost(hwnd uintptr, topmost bool) {
	insertAfter := hwndNotTopmost
	if topmost {
		insertAfter = hwndTopmost
	}
	setWindowPos.Call(hwnd, insertAfter, 0, 0, 0, 0, swpNoMove|swpNoSize|swpNoActivate)
}

// setWindowFullscreenTopmost entra en fullscreen y sube la ventana por encima
// de la barra de tareas de Windows.
func setWindowFullscreenTopmost(window *application.WebviewWindow) {
	window.Fullscreen()
	window.SetAlwaysOnTop(true)
}
