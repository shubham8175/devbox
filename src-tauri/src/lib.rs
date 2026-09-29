//! Tauri desktop shell for DevBox.
//!
//! The frontend is the unchanged Next.js static export in `../out`; this
//! crate only creates the window and fills the three gaps a bare webview has
//! compared with a browser tab:
//!
//! 1. **Downloads.** Tools save results through `<a download>` links pointing
//!    at blob: URLs. WKWebView (macOS) cancels those unless a download handler
//!    exists, and WebView2 (Windows) shows no UI of its own, so `on_download`
//!    writes the file to the user's Downloads folder and emits
//!    `devbox://download-finished` for the frontend toast.
//! 2. **External links.** `target="_blank"` links and navigations away from
//!    the app (the LinkedIn link, "open this URL" buttons, custom-scheme deep
//!    links from the Deep Link tool) open in the system browser / handler
//!    instead of replacing the app inside its own window.
//! 3. **Navigation lock.** The webview may only navigate within the app's own
//!    origin, so nothing can turn the window into a browser for other sites.
//! 4. **Swipe back / forward (macOS).** WKWebView ships with the two-finger
//!    history gesture disabled and Tauri does not expose the switch, so it is
//!    flipped on the raw view. Keyboard back / forward (⌘[ ⌘] and Alt+←/→) is
//!    handled by the frontend in `AppShell`.

use std::{collections::HashMap, path::PathBuf, sync::Mutex};

use serde::Serialize;
use tauri::{
  webview::{DownloadEvent, NewWindowResponse},
  Emitter, Manager, Url, WebviewWindowBuilder,
};

#[derive(Clone, Serialize)]
struct DownloadFinished {
  name: String,
  path: String,
  success: bool,
}

/// True for the app's own pages: the bundled asset protocol in production
/// (`tauri://localhost` on macOS, `http://tauri.localhost` on Windows) and the
/// Next.js dev server during `tauri dev`.
fn is_app_url(url: &Url) -> bool {
  match url.scheme() {
    "tauri" => true,
    "http" | "https" => matches!(url.host_str(), Some("tauri.localhost" | "localhost" | "127.0.0.1")),
    "blob" | "data" | "about" => true,
    _ => false,
  }
}

fn open_externally(url: &Url) {
  if let Err(err) = open::that_detached(url.as_str()) {
    log::warn!("could not open {url} externally: {err}");
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Download destinations by URL, so `Finished` (whose path is empty on
      // macOS) can still report where the file went.
      let pending: Mutex<HashMap<String, PathBuf>> = Mutex::new(HashMap::new());
      let download_dir = app.path().download_dir().ok();

      // The window is declared in tauri.conf.json with `create: false` so it
      // can be built here with the handlers attached.
      let config = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .expect("tauri.conf.json must declare the main window");

      let window = WebviewWindowBuilder::from_config(app.handle(), &config)?
        .on_navigation(|url| {
          if is_app_url(url) {
            return true;
          }
          open_externally(url);
          false
        })
        .on_new_window(|url, _features| {
          open_externally(&url);
          NewWindowResponse::Deny
        })
        .on_download(move |webview, event| {
          match event {
            DownloadEvent::Requested { url, destination } => {
              // The webview proposes a file name (already de-duplicated on
              // macOS, absolute on Windows); pin it to the Downloads folder.
              if let Some(dir) = &download_dir {
                let name = destination
                  .file_name()
                  .map(|n| n.to_os_string())
                  .unwrap_or_else(|| "download".into());
                let mut target = dir.join(&name);
                let stem = PathBuf::from(&name);
                let (base, ext) = (
                  stem.file_stem().and_then(|s| s.to_str()).unwrap_or("download").to_string(),
                  stem.extension().and_then(|e| e.to_str()).map(|e| format!(".{e}")).unwrap_or_default(),
                );
                let mut n = 1;
                while target.exists() {
                  target = dir.join(format!("{base} ({n}){ext}"));
                  n += 1;
                }
                *destination = target;
              }
              pending.lock().unwrap().insert(url.to_string(), destination.clone());
              true
            }
            DownloadEvent::Finished { url, path, success } => {
              let planned = pending.lock().unwrap().remove(&url.to_string());
              let final_path = path.or(planned).unwrap_or_default();
              let name = final_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("file")
                .to_string();
              let _ = webview.emit(
                "devbox://download-finished",
                DownloadFinished { name, path: final_path.to_string_lossy().into_owned(), success },
              );
              true
            }
            // DownloadEvent is #[non_exhaustive]; let any future variant through.
            _ => true,
          }
        })
        .build()?;

      #[cfg(target_os = "macos")]
      window.with_webview(|webview| {
        use objc2_web_kit::WKWebView;
        // SAFETY: `inner()` is the live WKWebView owned by wry, and Tauri runs
        // this closure on the main thread, which is where WebKit expects calls.
        unsafe {
          let view: &WKWebView = &*webview.inner().cast::<WKWebView>();
          view.setAllowsBackForwardNavigationGestures(true);
        }
      })?;
      #[cfg(not(target_os = "macos"))]
      let _ = window;

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
