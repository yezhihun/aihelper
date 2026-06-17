/// 问得好 PC 伴侣 — 托盘 + 全局热键 + 剪贴板
use tauri::Manager;
use tauri::WindowEvent;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const ENHANCE_ID: &str = "enhance";
const SHOW_ID: &str = "show";
const QUIT_ID: &str = "quit";

fn trigger_enhance(app: &tauri::AppHandle) {
    let text = app
        .clipboard()
        .read_text()
        .ok()
        .flatten()
        .unwrap_or_default();

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let _ = window.emit("enhance-request", text);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        trigger_enhance(app);
                    }
                })
                .build(),
        )
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let enhance = tauri::menu::MenuItem::with_id(
                app,
                ENHANCE_ID,
                "优化剪贴板问题",
                true,
                None::<&str>,
            )?;
            let show = tauri::menu::MenuItem::with_id(app, SHOW_ID, "显示窗口", true, None::<&str>)?;
            let quit = tauri::menu::MenuItem::with_id(app, QUIT_ID, "退出", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&enhance, &show, &quit])?;

            let icon = app.default_window_icon().cloned().expect("tray icon");

            tauri::tray::TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("问得好 PC 伴侣")
                .on_menu_event(|app, event| match event.id().0.as_str() {
                    ENHANCE_ID => trigger_enhance(app),
                    SHOW_ID => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    QUIT_ID => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::DoubleClick { .. } = event {
                        trigger_enhance(tray.app_handle());
                    }
                })
                .build(app)?;

            app.global_shortcut()
                .register("CommandOrControl+Shift+KeyW")?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
