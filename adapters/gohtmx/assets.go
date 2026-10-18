package gohtmx

import (
	"io"
	"io/fs"
	"net/http"
	"sort"

	ui "github.com/mrchypark/elysdui/ui/gohtmx"
)

// Files combines standalone UI resources and the SDUI browser bridge. Embedded
// paths stay relative to templates/ and assets/ for exports and preview readers.
// WASM builds omit browser assets; the host supplies those assets to previews.
var Files assetFiles

type assetFiles struct{}

func (assets assetFiles) Open(name string) (fs.File, error) {
	file, err := bridgeFiles.Open(name)
	if err != nil {
		file, err = ui.Files.Open(name)
	}
	if err != nil {
		return nil, err
	}
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, err
	}
	if !info.IsDir() {
		return file, nil
	}
	entries, err := assets.ReadDir(name)
	if err != nil {
		file.Close()
		return nil, err
	}
	return &assetDirectory{File: file, entries: entries}, nil
}

type assetDirectory struct {
	fs.File
	entries []fs.DirEntry
	offset  int
}

func (directory *assetDirectory) ReadDir(n int) ([]fs.DirEntry, error) {
	if n > 0 && directory.offset >= len(directory.entries) {
		return nil, io.EOF
	}
	end := len(directory.entries)
	if n > 0 && n < end-directory.offset {
		end = directory.offset + n
	}
	entries := directory.entries[directory.offset:end]
	directory.offset = end
	return entries, nil
}

func (assetFiles) ReadFile(name string) ([]byte, error) {
	if b, err := bridgeFiles.ReadFile(name); err == nil {
		return b, nil
	}
	return ui.Files.ReadFile(name)
}
func (assetFiles) ReadDir(name string) ([]fs.DirEntry, error) {
	base, baseErr := ui.Files.ReadDir(name)
	bridge, bridgeErr := bridgeFiles.ReadDir(name)
	if baseErr != nil && bridgeErr != nil {
		return nil, baseErr
	}
	entries := make(map[string]fs.DirEntry, len(base)+len(bridge))
	for _, entry := range base {
		entries[entry.Name()] = entry
	}
	for _, entry := range bridge {
		entries[entry.Name()] = entry
	}
	out := make([]fs.DirEntry, 0, len(entries))
	for _, entry := range entries {
		out = append(out, entry)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name() < out[j].Name() })
	return out, nil
}

// BindAssets registers both the standalone UI assets and the SDUI browser bridge.
// Call it once instead of ui.BindAssets when a host uses this adapter.
func BindAssets(mux *http.ServeMux) error {
	return BindAssetsWithOptions(mux, nil)
}

// BindAssetsWithOptions configures both UI resources and the SDUI bridge.
func BindAssetsWithOptions(mux *http.ServeMux, options *ui.CompressionOptions) error {
	if err := ui.BindAssetsWithOptions(mux, options); err != nil {
		return err
	}
	assets, err := fs.Sub(bridgeFiles, "assets")
	if err != nil {
		return err
	}
	return ui.BindAssetFS(mux, assets, options)
}
