package sduicatalogue

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
)

// EqualGzip compares generated content without depending on Go's DEFLATE version.
func EqualGzip(a, b []byte) (bool, error) {
	decode := func(data []byte) ([]byte, error) {
		reader, err := gzip.NewReader(bytes.NewReader(data))
		if err != nil {
			return nil, err
		}
		defer reader.Close()
		const maxSize = 32 << 20
		content, err := io.ReadAll(io.LimitReader(reader, maxSize+1))
		if err != nil {
			return nil, err
		}
		if len(content) > maxSize {
			return nil, fmt.Errorf("catalogue exceeds %d bytes", maxSize)
		}
		return content, nil
	}
	left, err := decode(a)
	if err != nil {
		return false, err
	}
	right, err := decode(b)
	if err != nil {
		return false, err
	}
	return bytes.Equal(left, right), nil
}
