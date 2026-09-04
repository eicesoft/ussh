//go:build darwin

package backend

/*
#cgo CFLAGS: -x objective-c
#cgo LDFLAGS: -framework Cocoa
#import <Cocoa/Cocoa.h>

// applyMaterialOnce 在主窗口 content 视图最底层安插/移除 NSVisualEffectView。
// 返回 NO 表示窗口尚未就绪，需要重试。
static BOOL applyMaterialOnce(NSString *material) {
	NSWindow *window = [NSApp mainWindow];
	if (window == nil) {
		for (NSWindow *w in [NSApp windows]) {
			window = w;
			break;
		}
	}
	if (window == nil) {
		return NO;
	}
	NSView *contentView = [window contentView];
	if (contentView == nil) {
		return NO;
	}

	// 幂等：先移除旧的材质层，材质为 none 时到此为止。
	for (NSView *sub in [[contentView subviews] copy]) {
		if ([sub isKindOfClass:[NSVisualEffectView class]]) {
			[sub removeFromSuperview];
		}
	}
	if (material == nil || material.length == 0 || [material isEqualToString:@"none"]) {
		return YES;
	}

	NSVisualEffectView *effect = [[NSVisualEffectView alloc] initWithFrame:[contentView bounds]];
	effect.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
	effect.blendingMode = NSVisualEffectBlendingModeBehindWindow;
	effect.state = NSVisualEffectStateActive;
	if ([material isEqualToString:@"acrylic"]) {
		effect.material = NSVisualEffectMaterialPopover;
	} else {
		// 云母：跟随窗口下方桌面色调的柔和模糊，效果最接近 Windows 的 Mica。
		effect.material = NSVisualEffectMaterialUnderWindowBackground;
	}
	// WebView 的 CSS 圆角只会裁剪前景内容；材质层本身仍覆盖整个 contentView，
	// 导致透明角落露出矩形的亚克力背景。让原生材质层使用同样的圆角并裁剪子内容。
	contentView.wantsLayer = YES;
	contentView.layer.cornerRadius = 14.0;
	contentView.layer.masksToBounds = YES;
	effect.wantsLayer = YES;
	effect.layer.cornerRadius = 14.0;
	effect.layer.masksToBounds = YES;
	[contentView addSubview:effect positioned:NSWindowBelow relativeTo:nil];
	return YES;
}

// applyMaterialWithRetry 启动早期窗口可能尚未创建，最多重试 20 次（约 10 秒）。
static void applyMaterialWithRetry(NSString *material, int attempt) {
	if (!applyMaterialOnce(material) && attempt < 20) {
		dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)),
			dispatch_get_main_queue(), ^{
				applyMaterialWithRetry(material, attempt + 1);
			});
	}
}

static void ScheduleWindowMaterial(const char *material) {
	NSString *m = [NSString stringWithUTF8String:material];
	dispatch_async(dispatch_get_main_queue(), ^{
		applyMaterialWithRetry(m, 0);
	});
}
*/
import "C"

import "unsafe"

// applyWindowMaterial 在 macOS 上为窗口应用/移除云母类背景材质（主线程异步执行）。
func applyWindowMaterial(material string) {
	cMaterial := C.CString(material)
	defer C.free(unsafe.Pointer(cMaterial))
	C.ScheduleWindowMaterial(cMaterial)
}
