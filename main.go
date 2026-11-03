package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// El build de Vite escribe en `dist/`. La tarea `build:frontend` de
// Taskfile.yml lo genera antes de compilar Go, así que el binario lleva
// dentro el HTML, los sprites, los mapas y el resto de `public/`.
//
//go:embed all:dist
var assets embed.FS

func main() {
	app := application.New(application.Options{
		Name:        "NewPoke",
		Description: "Demo técnica de sprites, cámara y multijugador local",
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		// WebView2 usa la GPU por defecto. `--ignore-gpu-blocklist` fuerza la
		// aceleración incluso si el adaptador está en la blocklist. Si una
		// máquina concreta falla, quita este flag.
		Windows: application.WindowsOptions{
			AdditionalBrowserArgs: []string{"--ignore-gpu-blocklist"},
			// WM_ACTIVATEAPP: al activar la app la ventana pasa a topmost para
			// cubrir la barra de tareas; al desactivarla se libera el z-order.
			WndProcInterceptor: func(hwnd uintptr, msg uint32, wparam, _ uintptr) (uintptr, bool) {
				const wmActivateApp = 0x001C
				if msg == wmActivateApp {
					setWindowTopmost(hwnd, wparam != 0)
				}
				return 0, false
			},
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "NewPoke",
		Width:            1280,
		Height:           720,
		MinWidth:         960,
		MinHeight:        540,
		BackgroundColour: application.NewRGB(11, 18, 27),
		URL:              "/",
		Linux: application.LinuxWindow{
			// WebKitGTK: aceleración por hardware siempre activa.
			WebviewGpuPolicy: application.WebviewGpuPolicyAlways,
		},
	})

	// Wails aplica StartState antes de centrar/posicionar la ventana, lo que
	// deja el fullscreen desplazado. Esperamos a que la ventana se muestre y
	// programamos el fullscreen para después del posicionamiento inicial.
	enterFullscreen := func(*application.WindowEvent) {
		application.InvokeAsync(func() {
			setWindowFullscreenTopmost(window)
		})
	}
	window.OnWindowEvent(events.Windows.WindowShow, enterFullscreen)
	window.OnWindowEvent(events.Common.WindowShow, enterFullscreen)

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
