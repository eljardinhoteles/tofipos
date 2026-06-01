use axum::{
    extract::{Path, State},
    http::{HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use tower_http::cors::{Any, CorsLayer};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    net::SocketAddr,
    path::{Path as FsPath, PathBuf},
    process::Command,
    sync::Arc,
};
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    inner: Arc<Mutex<Store>>,
    store_path: PathBuf,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct PrinterConfig {
    name: String,
    target: String,
    paper_width: u16,
    active: bool,
}

#[derive(Serialize, Deserialize, Clone)]
struct PrintJob {
    id: Uuid,
    kind: String,
    title: String,
    payload: serde_json::Value,
    raw_text: String,
    status: String,
    attempts: u32,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    last_error: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct Store {
    printer: Option<PrinterConfig>,
    queue: Vec<PrintJob>,
}

#[derive(Deserialize)]
struct EnqueueRequest {
    kind: String,
    title: String,
    payload: serde_json::Value,
    raw_text: Option<String>,
}

#[derive(Deserialize)]
struct ConfigRequest {
    name: String,
    target: String,
    paper_width: Option<u16>,
    active: Option<bool>,
}

#[tokio::main]
async fn main() {
    let store_path = state_path();
    let store = load_store(&store_path).unwrap_or_default();
    let state = AppState {
        inner: Arc::new(Mutex::new(store)),
        store_path,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health))
        .route("/config", get(get_config).post(set_config))
        .route("/jobs", post(enqueue_job))
        .route("/jobs/{id}/reprint", post(reprint_job))
        .route("/jobs/flush", post(flush_queue))
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 18181));
    println!("print server listening on {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health(State(state): State<AppState>) -> impl IntoResponse {
    let store = state.inner.lock().await;
    Json(serde_json::json!({
        "ok": true,
        "queue": store.queue.len(),
        "printerConfigured": store.printer.is_some(),
        "active": store.printer.as_ref().map(|p| p.active).unwrap_or(false)
    }))
}

async fn get_config(State(state): State<AppState>) -> impl IntoResponse {
    let store = state.inner.lock().await;
    Json(serde_json::json!({ "printer": store.printer }))
}

async fn set_config(
    State(state): State<AppState>,
    Json(req): Json<ConfigRequest>,
) -> impl IntoResponse {
    let mut store = state.inner.lock().await;
    store.printer = Some(PrinterConfig {
        name: req.name,
        target: req.target,
        paper_width: req.paper_width.unwrap_or(48),
        active: req.active.unwrap_or(true),
    });
    if let Err(err) = save_store(&state.store_path, &store) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "ok": false, "error": err.to_string() })));
    }
    (StatusCode::OK, Json(serde_json::json!({ "ok": true, "printer": store.printer })))
}

async fn enqueue_job(
    State(state): State<AppState>,
    Json(req): Json<EnqueueRequest>,
) -> impl IntoResponse {
    let mut store = state.inner.lock().await;
    let now = Utc::now();
    let job = PrintJob {
        id: Uuid::new_v4(),
        kind: req.kind,
        title: req.title,
        payload: req.payload,
        raw_text: req.raw_text.unwrap_or_default(),
        status: "queued".to_string(),
        attempts: 0,
        created_at: now,
        updated_at: now,
        last_error: None,
    };
    store.queue.push(job.clone());
    if let Err(err) = save_store(&state.store_path, &store) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "ok": false, "error": err.to_string() })));
    }
    drop(store);

    match process_queue(state.clone()).await {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "ok": true, "job": job }))),
        Err(err) => (StatusCode::ACCEPTED, Json(serde_json::json!({ "ok": true, "queued": true, "warning": err }))),
    }
}

async fn reprint_job(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let mut store = state.inner.lock().await;
    if let Some(existing) = store.queue.iter().find(|job| job.id == id).cloned() {
        let mut job = existing;
        job.status = "queued".to_string();
        job.updated_at = Utc::now();
        store.queue.push(job.clone());
        if let Err(err) = save_store(&state.store_path, &store) {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(serde_json::json!({ "ok": false, "error": err.to_string() })));
        }
        drop(store);
        let _ = process_queue(state.clone()).await;
        return (StatusCode::OK, Json(serde_json::json!({ "ok": true, "job": job })));
    }
    (StatusCode::NOT_FOUND, Json(serde_json::json!({ "ok": false, "error": "job not found" })))
}

async fn flush_queue(State(state): State<AppState>) -> impl IntoResponse {
    match process_queue(state.clone()).await {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "ok": true }))),
        Err(err) => (StatusCode::BAD_REQUEST, Json(serde_json::json!({ "ok": false, "error": err }))),
    }
}

async fn process_queue(state: AppState) -> Result<(), String> {
    let printer = {
        let store = state.inner.lock().await;
        match store.printer.clone() {
            Some(printer) if printer.active => printer,
            _ => return Err("printer not configured".into()),
        }
    };

    loop {
        let job_opt = {
            let mut store = state.inner.lock().await;
            let pos = store.queue.iter().position(|job| job.status != "done");
            if let Some(idx) = pos {
                store.queue[idx].status = "printing".to_string();
                store.queue[idx].attempts += 1;
                store.queue[idx].updated_at = Utc::now();
                let _ = save_store(&state.store_path, &store);
                Some(store.queue[idx].clone())
            } else {
                None
            }
        };

        let Some(job) = job_opt else {
            break;
        };

        match deliver_job(&printer, &job) {
            Ok(_) => {
                let mut store = state.inner.lock().await;
                if let Some(found) = store.queue.iter_mut().find(|j| j.id == job.id) {
                    found.status = "done".to_string();
                    found.last_error = None;
                    found.updated_at = Utc::now();
                }
                store.queue.retain(|j| j.status != "done");
                let _ = save_store(&state.store_path, &store);
            }
            Err(err) => {
                let mut store = state.inner.lock().await;
                if let Some(found) = store.queue.iter_mut().find(|j| j.id == job.id) {
                    found.status = "failed".to_string();
                    found.last_error = Some(err.clone());
                    found.updated_at = Utc::now();
                }
                let _ = save_store(&state.store_path, &store);
                return Err(err);
            }
        }
    }

    Ok(())
}

fn deliver_job(printer: &PrinterConfig, job: &PrintJob) -> Result<(), String> {
    let content = if job.raw_text.trim().is_empty() {
        serde_json::to_string_pretty(&job.payload).map_err(|e| e.to_string())?
    } else {
        job.raw_text.clone()
    };

    if printer.target.starts_with("cmd:") {
        let shell_cmd = printer.target.trim_start_matches("cmd:").trim();

        let temp_path = std::env::temp_dir().join("pos_print_job.txt");
        fs::write(&temp_path, content.as_bytes()).map_err(|e| e.to_string())?;
        let temp_str = temp_path.to_string_lossy();
        let cmd_final = shell_cmd.replace("{file}", &temp_str);

        let out = if cfg!(target_os = "windows") {
            Command::new("cmd").args(["/C", &cmd_final]).output()
        } else {
            Command::new("sh").args(["-c", &cmd_final]).output()
        }
        .map_err(|e| e.to_string())?;

        return if out.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&out.stderr).to_string())
        };
    }

    let target = FsPath::new(&printer.target);
    if target.exists() {
        fs::write(target, content.as_bytes()).map_err(|e| e.to_string())?;
        return Ok(());
    }

    Err("unsupported printer target; use a device path or cmd: command".into())
}

fn state_path() -> PathBuf {
    let base = std::env::var_os("POS_PRINT_SERVER_DATA_DIR")
        .map(PathBuf::from)
        .or_else(dirs_fallback)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("print-server-state.json")
}

fn dirs_fallback() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA").map(PathBuf::from).map(|p| p.join("pos-print-server"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var_os("HOME").map(PathBuf::from).map(|p| p.join(".pos-print-server"))
    }
}

fn load_store(path: &PathBuf) -> Result<Store, std::io::Error> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    if !path.exists() {
        return Ok(Store::default());
    }
    let data = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&data).unwrap_or_default())
}

fn save_store(path: &PathBuf, store: &Store) -> Result<(), std::io::Error> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let data = serde_json::to_string_pretty(store).unwrap();
    fs::write(path, data)
}
