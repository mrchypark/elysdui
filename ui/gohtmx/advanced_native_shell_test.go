package ui

import (
	"bytes"
	"strings"
	"testing"
)

func TestNativeShellCallerContracts(t *testing.T) {
	tpl := nativeTemplates(t)
	cases := []struct {
		name  string
		props map[string]any
		want  []string
	}{
		{"TitleBar", map[string]any{"Label": "Caller window", "Platform": "windows", "Maximized": true, "CloseAction": "caller-close", "Actions": []map[string]any{{"Label": "Caller search", "Action": "caller-search", "Icon": "search"}}}, []string{`data-platform="windows"`, `Caller window`, `data-ely-action="caller-close"`, `aria-label="Restore"`, `data-ely-action="caller-search"`}},
		{"WindowControls", map[string]any{"Platform": "linux", "CanMinimize": true, "CanMaximize": true, "Active": false}, []string{`data-active="false"`, `aria-label="Minimize"`, `aria-label="Maximize"`, `aria-label="Close"`}},
		{"ColumnShell", map[string]any{"Width": 777, "Height": 333, "Columns": []map[string]any{{"Width": 181, "Title": "Caller header", "Content": "Caller body"}}}, []string{`data-shell-width="777"`, `data-shell-height="333"`, `data-shell-width="181"`, `Caller header`, `Caller body`}},
		{"WindowDragRegion", map[string]any{"Label": "Caller drag", "DragAction": "caller-drag", "ZoomAction": "caller-zoom", "Width": 321}, []string{`data-action="caller-drag"`, `data-zoom-action="caller-zoom"`, `data-shell-width="321"`, `Caller drag`}},
		{"WindowResizeBorder", map[string]any{"ClientDecorated": true, "Inset": 0, "Action": "caller-resize", "Content": "Caller content"}, []string{`data-shell-resize="true"`, `data-inset="0"`, `data-action="caller-resize"`, `Caller content`}},
		{"NativeMenu", map[string]any{"Menus": []map[string]any{{"Label": "Caller menu", "Items": []map[string]any{{"Label": "Caller item", "Action": "caller-command", "Value": "caller-key", "Disabled": true}}}}}, []string{`<summary>Caller menu</summary>`, `role="menuitem"`, `data-ely-action="caller-command"`, `value="caller-key" disabled`}},
		{"Toolbar", map[string]any{"Groups": [][]map[string]any{{{"Label": "Caller tool", "Action": "caller-tool", "Icon": "search"}}}}, []string{`role="group"`, `data-ely-action="caller-tool"`, `aria-label="Caller tool"`}},
		{"StatusBar", map[string]any{"Items": []map[string]any{{"Label": "Caller status"}}, "RightItems": []map[string]any{{"Label": "Caller action", "Action": "caller-right"}}}, []string{`role="status"`, `Caller status`, `data-ely-action="caller-right"`}},
		{"ActivityBar", map[string]any{"Selected": "caller-key", "Items": []map[string]any{{"Value": "caller-key", "Label": "Caller destination", "Icon": "folder", "Badge": 42}}}, []string{`data-selected="caller-key"`, `data-shell-select="caller-key"`, `<small>42</small>`}},
		{"TabBar", map[string]any{"Owned": true, "Selected": "custom", "AddAction": "caller-add", "Items": []map[string]any{{"Value": "custom", "Label": "Caller tab"}}}, []string{`data-owned="true"`, `data-add-action="caller-add"`, `data-shell-tab="custom"`, `Caller tab`}},
		{"SplashScreen", map[string]any{"Label": "Caller app", "Progress": 0, "Status": "Caller waiting"}, []string{`value="0" data-shell-progress`, `Caller waiting`, `data-shell-initial="Caller app"`}},
		{"AboutDialog", map[string]any{"Label": "Caller app", "Value": "9.1", "CopyAction": "caller-copy", "Items": []map[string]any{{"Label": "Caller link", "URL": "https://example.com/docs"}}}, []string{`data-action="caller-copy"`, `data-value="9.1"`, `href="https://example.com/docs"`}},
		{"TrayIcon", map[string]any{"Shown": true, "Symbol": "caller.symbol", "Items": []map[string]any{{"Value": "custom", "Label": "Caller tray"}}}, []string{`data-shown="true"`, `data-symbol="caller.symbol"`, `data-key="custom"`, `Caller tray`}},
		{"DockBadge", map[string]any{"Value": "0", "Badge": "99+", "Action": "caller-badge"}, []string{`data-value="0"`, `data-shell-badge="99&#43;"`, `data-action="caller-badge"`, `The Dock shows “0”.`}},
		{"SystemNotification", map[string]any{"Label": "Caller title", "Content": "Caller body", "Action": "caller-notify"}, []string{`data-action="caller-notify"`, `data-title="Caller title"`, `data-body="Caller body"`}},
		{"MultiWindow Manager", map[string]any{"Items": []map[string]any{{"Value": "window-17", "Label": "Caller document"}}}, []string{`data-shell-window="window-17"`, `Caller document`}},
		{"WindowSwitcher", map[string]any{"Items": []map[string]any{{"Value": "window-18", "Label": "Caller document"}}}, []string{`data-shell-switcher`, `data-shell-window="window-18"`}},
		{"QuickLauncher", map[string]any{"Items": []map[string]any{{"Value": "file-5", "Label": "Caller file", "Action": "caller-open"}}}, []string{`data-shell-filter`, `data-shell-launch="file-5"`, `data-action="caller-open"`}},
		{"MiniWindow", map[string]any{"Label": "Caller mini", "Content": "Caller content", "Value": "12:34", "Width": 280, "Height": 88, "CloseAction": "caller-close"}, []string{`data-shell-width="280"`, `data-shell-height="88"`, `Caller content`, `<output>12:34</output>`, `data-ely-action="caller-close"`}},
		{"UpdateBanner", map[string]any{"Version": "9.0", "State": "downloading", "Progress": 0, "DownloadAction": "caller-download", "RestartAction": "caller-restart"}, []string{`Downloading 9.0… 0%`, `value="0"`, `data-shell-download data-ely-action="caller-download" hidden`, `data-shell-restart data-ely-action="caller-restart" hidden`}},
		{"UpdateDialog", map[string]any{"Label": "Caller app", "Version": "9.0", "CurrentVersion": "8.0", "Items": []map[string]any{{"Label": "Caller note"}}, "DownloadAction": "caller-download"}, []string{`Caller app 9.0 is available.`, `You have 8.0.`, `Caller note`, `data-ely-action="caller-download"`}},
		{"CrashReporter", map[string]any{"Label": "Caller crash", "Value": "<caller-report>", "Details": true, "CopyAction": "caller-copy", "Action": "caller-send"}, []string{`<details open>`, `&lt;caller-report&gt;`, `data-action="caller-copy"`, `data-action="caller-send"`}},
		{"OfflineIndicator", map[string]any{"State": "offline"}, []string{`data-state="offline"`, `Offline · changes stay on this device`}},
		{"ZoomControl", map[string]any{"Percent": 83.125, "Owned": true, "Action": "caller-zoom"}, []string{`data-percent="83.125"`, `data-owned="true"`, `data-action="caller-zoom"`, `83.125%`}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var b bytes.Buffer
			if err := RenderComponent(tpl, &b, Component{Chapter: "shell", Name: tc.name, ID: "caller-shell", Props: tc.props}); err != nil {
				t.Fatal(err)
			}
			for _, want := range tc.want {
				if !strings.Contains(b.String(), want) {
					t.Fatalf("missing caller contract %q in %s", want, b.String())
				}
			}
		})
	}
}

func TestNativeShellOptionalHostActions(t *testing.T) {
	tpl := nativeTemplates(t)
	for _, name := range []string{"UpdateBanner", "UpdateDialog"} {
		var b bytes.Buffer
		if err := RenderComponent(tpl, &b, Component{Chapter: "shell", Name: name, ID: "hostless", Props: map[string]any{"Version": "1", "State": "available"}}); err != nil {
			t.Fatal(err)
		}
		if strings.Contains(b.String(), `data-shell-download`) || strings.Contains(b.String(), `data-shell-restart`) {
			t.Fatalf("%s invented an absent host handler", name)
		}
	}
	var b bytes.Buffer
	if err := RenderComponent(tpl, &b, Component{Chapter: "shell", Name: "SplashScreen", ID: "indeterminate", Props: map[string]any{"Label": "Caller"}}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(b.String(), `<progress max="100" data-shell-progress>`) {
		t.Fatal("missing progress must remain indeterminate")
	}
}

func TestNativeShellLegacyActionProps(t *testing.T) {
	tpl := nativeTemplates(t)
	for _, name := range []string{"TitleBar", "WindowControls", "Toolbar", "StatusBar"} {
		var out bytes.Buffer
		if err := RenderComponent(tpl, &out, Component{Chapter: "shell", Name: name, ID: "legacy", Props: map[string]any{"Label": "Caller label", "Action": "caller-legacy", "Items": []map[string]any{{"Label": "Caller item", "Value": "caller-key", "Icon": "search"}}}}); err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(out.String(), `data-ely-action="caller-legacy"`) {
			t.Fatalf("%s lost existing top-level Action fallback", name)
		}
	}
}
