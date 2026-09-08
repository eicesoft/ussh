//go:build darwin

package backend

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>
#include <stdlib.h>
#include <string.h>

// pickPanel 弹出可显示隐藏文件（.env 等）的原生多选文件对话框。
// 仅 setShowsHiddenFiles 在 macOS 上经常失效（wails 的 sheet 对话框同样受影响，
// 见 wails #2454），这里同时写入 NSOpenPanelShowHiddenFiles 用户默认值并改用
// runModal 应用级模态，确保点文件一定可见。返回 JSON 数组字符串，取消时返回 NULL。
static char* pickPanel(const char *title, int allowMultiple) {
	NSAutoreleasePool *pool = [[NSAutoreleasePool alloc] init];
	__block NSMutableArray *selectedPaths = [[NSMutableArray alloc] init];

	void (^run)(void) = ^{
		[[NSUserDefaults standardUserDefaults] setBool:YES forKey:@"NSOpenPanelShowHiddenFiles"];
		NSOpenPanel *panel = [NSOpenPanel openPanel];
		[panel setCanChooseFiles:YES];
		[panel setCanChooseDirectories:NO];
		[panel setAllowsMultipleSelection:allowMultiple ? YES : NO];
		[panel setShowsHiddenFiles:YES];
		if (title != NULL && title[0] != '\0') {
			[panel setTitle:[NSString stringWithUTF8String:title]];
		}
		if ([panel runModal] == NSModalResponseOK) {
			for (NSURL *url in [panel URLs]) {
				[selectedPaths addObject:[url path]];
			}
		}
		[[NSUserDefaults standardUserDefaults] setBool:NO forKey:@"NSOpenPanelShowHiddenFiles"];
	};

	if ([NSThread isMainThread]) {
		run();
	} else {
		dispatch_sync(dispatch_get_main_queue(), run);
	}

	if ([selectedPaths count] == 0) {
		[selectedPaths release];
		[pool drain];
		return NULL;
	}

	NSError *error = nil;
	NSData *data = [NSJSONSerialization dataWithJSONObject:selectedPaths options:0 error:&error];
	NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
	char *result = strdup([json UTF8String]);
	[json release];
	[selectedPaths release];
	[pool drain];
	return result;
}
*/
import "C"

import (
	"context"
	"encoding/json"
	"fmt"
	"unsafe"
)

// pickUploadFilesPaths 在 macOS 上用自有 NSOpenPanel（显示 .env 等点文件），
// 其他平台走 Wails 原生对话框。
func pickUploadFilesPaths(ctx context.Context, title string) ([]string, error) {
	cTitle := C.CString(title)
	defer C.free(unsafe.Pointer(cTitle))

	cResult := C.pickPanel(cTitle, 1)
	if cResult == nil {
		// 用户取消
		return []string{}, nil
	}
	defer C.free(unsafe.Pointer(cResult))

	var paths []string
	if err := json.Unmarshal([]byte(C.GoString(cResult)), &paths); err != nil {
		return nil, fmt.Errorf("解析所选文件失败：%w", err)
	}
	return paths, nil
}