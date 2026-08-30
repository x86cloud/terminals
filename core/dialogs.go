package core

import (
	"strings"

	"github.com/wailsapp/wails/v3/pkg/application"
)

func isCancelledErr(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToLower(err.Error())
	return strings.Contains(s, "cancelled") || strings.Contains(s, "canceled") || strings.Contains(s, "cancel")
}

// OpenFileDialog 弹出单个文件选择框
func OpenFileDialog(title string) (string, error) {
	app := application.Get()
	if app == nil {
		return "", nil
	}
	res, err := app.Dialog.OpenFile().SetTitle(title).PromptForSingleSelection()
	if isCancelledErr(err) {
		return "", nil
	}
	return res, err
}

// OpenMultipleFilesDialog 弹出多文件选择框
func OpenMultipleFilesDialog(title string) ([]string, error) {
	app := application.Get()
	if app == nil {
		return []string{}, nil
	}
	res, err := app.Dialog.OpenFile().SetTitle(title).CanChooseFiles(true).PromptForMultipleSelection()
	if isCancelledErr(err) {
		return []string{}, nil
	}
	return res, err
}

// OpenDirectoryDialog 弹出目录选择框
func OpenDirectoryDialog(title string) (string, error) {
	app := application.Get()
	if app == nil {
		return "", nil
	}
	res, err := app.Dialog.OpenFile().SetTitle(title).CanChooseDirectories(true).CanChooseFiles(false).PromptForSingleSelection()
	if isCancelledErr(err) {
		return "", nil
	}
	return res, err
}

// SaveFileDialog 弹出文件保存框
func SaveFileDialog(title string, defaultFilename string) (string, error) {
	app := application.Get()
	if app == nil {
		return "", nil
	}
	res, err := app.Dialog.SaveFile().SetFilename(defaultFilename).PromptForSingleSelection()
	if isCancelledErr(err) {
		return "", nil
	}
	return res, err
}


