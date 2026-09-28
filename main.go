package main

import (
	"context"
	"embed"
	"log"

	"terminal/core"
	"terminal/logger"
	"terminal/services"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed build/appicon.png
var trayIcon []byte

func main() {
	if _, err := logger.Init(); err != nil {
		log.Printf("failed to initialize logger: %v", err)
	}
	defer logger.Close()

	logger.Info("xClient starting up...")

	container := services.GetContainer()

	systemSvc := services.NewSystemService()
	sshSvc := services.NewSshService()
	sftpSvc := services.NewSftpService()
	redisSvc := services.NewRedisService()
	mysqlSvc := services.NewMysqlService()
	postgresSvc := services.NewPostgresService()
	mongoSvc := services.NewMongoService()
	sqliteSvc := services.NewSqliteService()
	mqttSvc := services.NewMqttService()
	apiSvc := services.NewApiService()
	agentSvc := services.NewAgentService()
	dockerSvc := services.NewDockerService()
	k8sSvc := services.NewK8sService()
	wikiSvc := services.NewWikiService()

	app := application.New(application.Options{
		Name:        "xClient",
		Description: "Multi-protocol terminal and database client",
		Services: []application.Service{
			application.NewService(systemSvc),
			application.NewService(sshSvc),
			application.NewService(sftpSvc),
			application.NewService(redisSvc),
			application.NewService(mysqlSvc),
			application.NewService(postgresSvc),
			application.NewService(mongoSvc),
			application.NewService(sqliteSvc),
			application.NewService(mqttSvc),
			application.NewService(apiSvc),
			application.NewService(agentSvc),
			application.NewService(dockerSvc),
			application.NewService(k8sSvc),
			application.NewService(wikiSvc),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		SingleInstance: &application.SingleInstanceOptions{
			UniqueID: "xclient-single-instance-key",
			OnSecondInstanceLaunch: func(data application.SecondInstanceData) {
				if w, ok := application.Get().Window.GetByName("main"); ok && w != nil {
					w.UnMinimise()
					w.Show()
					w.Focus()
				}
			},
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})

	win := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            "xClient",
		Width:            1920,
		Height:           1080,
		MinWidth:         960,
		MinHeight:        600,
		Frameless:        true,
		BackgroundColour: application.NewRGB(20, 22, 25),
		URL:              "/",
		EnableFileDrop:   true,
	})

	win.OnWindowEvent(events.Common.WindowFilesDropped, func(event *application.WindowEvent) {
		files := event.Context().DroppedFiles()
		details := event.Context().DropTargetDetails()
		core.EmitEvent("files:dropped", map[string]any{
			"files":   files,
			"details": details,
		})
	})

	restoreWindow := func() {
		win.Show()
		win.UnMinimise()
		win.Focus()
	}

	// 系统托盘初始化
	tray := app.SystemTray.New()
	tray.SetIcon(trayIcon)
	tray.SetTooltip("xClient")
	tray.OnClick(restoreWindow)
	tray.OnDoubleClick(restoreWindow)

	trayMenu := app.NewMenu()
	trayMenu.Add("显示主界面").OnClick(func(ctx *application.Context) {
		restoreWindow()
	})
	trayMenu.AddSeparator()
	trayMenu.Add("退出程序").OnClick(func(ctx *application.Context) {
		core.SetAppQuitting(true)
		app.Quit()
	})
	tray.SetMenu(trayMenu)

	// 拦截关闭事件 (如 Alt+F4 / 任务栏右键关闭)
	win.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if core.IsAppQuitting() {
			return
		}
		var closeAction = "ask"
		if container.Store != nil {
			closeAction = container.Store.GetSettings().CloseAction
		}
		switch closeAction {
		case "minimize":
			event.Cancel()
			win.Hide()
		case "quit":
			core.SetAppQuitting(true)
			app.Quit()
		default: // "ask"
			event.Cancel()
			restoreWindow()
			core.EmitEvent("app:request-close", nil)
		}
	})

	container.Startup(context.Background())

	err := app.Run()
	if err != nil {
		logger.Errorf("app.Run error: %v", err)
		log.Fatal(err)
	}

	container.Shutdown(context.Background())
	logger.Info("xClient shut down cleanly")
}
