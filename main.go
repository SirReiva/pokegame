package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
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
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "NewPoke",
		Width:            1280,
		Height:           720,
		MinWidth:         960,
		MinHeight:        540,
		BackgroundColour: application.NewRGB(11, 18, 27),
		URL:              "/",
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
