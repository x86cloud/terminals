package core

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

// OpenFileDialog 弹出单个文件选择框
func OpenFileDialog(title string) (string, error) {
	app := application.Get()
	if app == nil {
		return "", nil
	}
	return app.Dialog.OpenFile().SetTitle(title).PromptForSingleSelection()
}

// OpenMultipleFilesDialog 弹出多文件选择框
func OpenMultipleFilesDialog(title string) ([]string, error) {
	app := application.Get()
	if app == nil {
		return []string{}, nil
	}
	return app.Dialog.OpenFile().SetTitle(title).CanChooseFiles(true).PromptForMultipleSelection()
}

// OpenDirectoryDialog 弹出目录选择框
func OpenDirectoryDialog(title string) (string, error) {
	app := application.Get()
	if app == nil {
		return "", nil
	}
	return app.Dialog.OpenFile().SetTitle(title).CanChooseDirectories(true).CanChooseFiles(false).PromptForSingleSelection()
}

// SaveFileDialog 弹出文件保存框
func SaveFileDialog(title string, defaultFilename string) (string, error) {
	app := application.Get()
	if app == nil {
		return "", nil
	}
	return app.Dialog.SaveFile().SetFilename(defaultFilename).PromptForSingleSelection()
}

