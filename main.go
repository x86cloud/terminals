package main

import (
	"context"
	"embed"
	"log"

	"terminal/services"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
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
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:             "main",
		Title:            "xClient",
		Width:            1920,
		Height:           1080,
		MinWidth:         960,
		MinHeight:        600,
		Frameless:        true,
		BackgroundColour: application.NewRGB(20, 22, 25),
		URL:              "/",
	})

	container.Startup(context.Background())

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}

	container.Shutdown(context.Background())
}
