use std::{
    collections::HashSet,
    hash::{DefaultHasher, Hash, Hasher},
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};

use ely_gpui_component::{
    buttons::{Button, ButtonVariant, IconButton, SegmentedControl},
    charts::LIMIT as CHART_LIMIT,
    data_display::Meter,
    feedback::Suspense,
    forms::{Choice, Input, Switch, TextInput, Upload, UploadList, UploadState},
    generative::{
        ABCompareView, AudioGenerationPlayer, Download, DownloadState, Embedded,
        EmbeddingVisualizer, FineTuneJobCard, GenerationGrid, GenerationQueue, InpaintCanvas, Job,
        JobState, MaskStroke, ModelCard, ModelDownloadManager, ModelState, ModelStatus, Outcome,
        PromptDiff, PromptPlayground, PromptVersion, PromptVersionHistory, Shot, TTSVoicePicker,
        TunePhase, VariationPicker, Verdict, VideoGenerationTimeline, Voice,
    },
    layout::{Card, CardHeader, h_stack, v_stack},
    media::{
        AudioPlayer, AudioSpectrum, AudioWaveform, CameraPreview, Crop, Cue, Device, DeviceKind,
        DeviceSelector, ImageAnnotator, ImageCropper, ImageThumbnail, ImageUpload, ImageViewer,
        Mark, MediaControls, MicLevelMeter, PlaybackSpeedControl, Playlist, Recording, Repeat,
        SPEEDS, ScreenRecorderControls, SubtitleEditor, Track, VideoPlayer, VideoThumbnailStrip,
        VolumeControl,
    },
    misc::{
        Captcha, CaptchaState, CsvImporter, ExportDialog, ExportFormat, Flashcards, IframeEmbed,
        ImportDialog, ImportField, LicenseViewer, Package, QrCodeScanner, Quiz, QuizQuestion,
        UnitConverter, WebSource, WebView,
    },
    motion::{
        AnimatePresence, AnimatedGradient, Blink, Confetti, Entrance, Flash, Flip, Glow, LazyLoad,
        LoadingOverlay, Marquee, ParticleBackground, Pulse, Refresh, RefreshIndicator, Reorder,
        Ripple, Shake, Shimmer, SkeletonCard, Stagger, Transition, TypingIndicator,
    },
    primitives::{Icon, IconName},
    rendering::RenderSurface,
    settings::{
        SettingsLayout, SettingsRow, SettingsSection, SyntaxThemePicker, ThemeDraft, ThemeEditor,
        ThemeImporter,
    },
    shell::{
        AboutDialog, ActivityBar, ActivityItem, ColumnShell, Connectivity, CrashReporter,
        OfflineIndicator, ShellColumn, SplashScreen, Toolbar, ToolbarGroup, ToolbarSeparator,
        UpdateBanner, UpdateDialog, UpdateState, WindowControls, WindowSwitcher, ZoomControl,
        ZoomStep,
    },
    theme::{
        ActiveTheme, ControlSize, Elevation, IconSize, Mode, Platform, Radius, TextSize,
        syntax_themes,
    },
    tooling::{A11yChecker, DesignTokenViewer, EventLogger, FpsMeter, RenderCounter},
    typography::{Caption, Label, Paragraph},
};
use gpui::{
    AnyElement, App, DevicePixels, FontStyle, HighlightStyle, Hsla, ImageSource,
    InteractiveElement, IntoElement, ParentElement, RenderImage, Resource, Rgba, SharedString,
    SharedUri, Size, Styled, StyledText, WeakEntity, Window, div, px, rgb,
};
use jiff::Timestamp;
use serde_json::{Value, json};

use crate::{
    catalogue::{
        CatalogueView, best_body, best_label, best_title, extract_choices, extract_item_objects,
        non_empty_or, prop_bool, prop_f64, prop_str, value_to_f64,
    },
    dashboard::ScreenNode,
};

fn clamp01(v: f32) -> f32 {
    if v.is_finite() {
        v.clamp(0.0, 1.0)
    } else {
        0.0
    }
}

fn norm_share(v: f64) -> f32 {
    if !v.is_finite() {
        return 0.0;
    }
    if v > 1.0 {
        clamp01((v / 100.0) as f32)
    } else {
        clamp01(v as f32)
    }
}

fn img_source(text: &str) -> ImageSource {
    if text.starts_with("http://") || text.starts_with("https://") {
        SharedUri::from(text.to_owned()).into()
    } else {
        PathBuf::from(text).into()
    }
}

fn res_source(text: &str) -> Resource {
    if text.starts_with("http://") || text.starts_with("https://") {
        Resource::Uri(SharedUri::from(text.to_owned()))
    } else {
        Resource::Path(Arc::from(std::path::Path::new(text)))
    }
}

fn parse_ratio_value(v: &Value) -> Option<f32> {
    if let Some(n) = value_to_f64(v) {
        let r = n as f32;
        if r.is_finite() && r > 0.0 {
            return Some(r);
        }
    }
    if let Some(s) = v.as_str() {
        let trimmed = s.trim();
        if let Some((w, h)) = trimmed.split_once(':')
            && let (Ok(wn), Ok(hn)) = (w.trim().parse::<f32>(), h.trim().parse::<f32>())
            && wn.is_finite()
            && hn.is_finite()
            && wn > 0.0
            && hn > 0.0
        {
            return Some(wn / hn);
        }
        if let Ok(r) = trimmed.parse::<f32>()
            && r.is_finite()
            && r > 0.0
        {
            return Some(r);
        }
    }
    None
}

fn parse_ratio(node: &ScreenNode, fallback: f32) -> f32 {
    node.props
        .get("ratio")
        .or_else(|| node.props.get("aspectRatio"))
        .and_then(parse_ratio_value)
        .filter(|r| r.is_finite() && *r > 0.0)
        .unwrap_or(fallback)
}

fn parse_duration_val(v: &Value) -> Option<Duration> {
    if let Some(n) = value_to_f64(v)
        && n.is_finite()
        && n >= 0.0
    {
        return Some(Duration::from_secs_f64(n.min(86_400.0)));
    }
    if let Some(s) = v.as_str() {
        let text = s.trim();
        if let Ok(secs) = text.parse::<f64>()
            && secs.is_finite()
            && secs >= 0.0
        {
            return Some(Duration::from_secs_f64(secs.min(86_400.0)));
        }
        let (clock, frac) = text.split_once('.').unwrap_or((text, ""));
        let parts: Option<Vec<u64>> = clock.split(':').map(|p| p.parse().ok()).collect();
        if let Some(parts) = parts {
            let secs = match parts.as_slice() {
                [m, s] => m.saturating_mul(60).saturating_add(*s),
                [h, m, s] => h
                    .saturating_mul(3600)
                    .saturating_add(m.saturating_mul(60))
                    .saturating_add(*s),
                _ => return None,
            };
            let millis = match frac.len() {
                0 => 0u64,
                1..=3 if frac.chars().all(|c| c.is_ascii_digit()) => {
                    format!("{frac:0<3}").parse().unwrap_or(0)
                }
                _ => 0,
            };
            return Some(Duration::from_millis(
                secs.saturating_mul(1000).saturating_add(millis),
            ));
        }
    }
    None
}

fn parse_peaks(node: &ScreenNode) -> Vec<f32> {
    let raw_vals: Vec<f32> = if let Some(arr) = node.props.get("samples").and_then(Value::as_array)
    {
        arr.iter()
            .filter_map(|item| {
                item.get("height")
                    .and_then(value_to_f64)
                    .or_else(|| value_to_f64(item))
                    .map(|v| v.max(0.0) as f32)
            })
            .collect()
    } else if let Some(arr) = node.props.get("peaks").and_then(Value::as_array) {
        arr.iter()
            .filter_map(|v| value_to_f64(v).map(|n| n.max(0.0) as f32))
            .collect()
    } else if let Some(s) = prop_str(node, "peaks")
        && let Ok(arr) = serde_json::from_str::<Vec<f64>>(&s)
    {
        arr.into_iter()
            .filter(|n| n.is_finite())
            .map(|n| n.max(0.0) as f32)
            .collect()
    } else {
        Vec::new()
    };
    if raw_vals.is_empty() {
        return vec![0.2, 0.5, 0.85, 0.4, 0.7, 0.55, 0.9, 0.35];
    }
    let max_val = raw_vals.iter().copied().fold(0.0_f32, f32::max);
    if max_val > 1.0 {
        let scale = max_val.max(1.0);
        raw_vals.into_iter().map(|v| clamp01(v / scale)).collect()
    } else {
        raw_vals.into_iter().map(clamp01).collect()
    }
}

fn parse_icon(name: Option<&str>, fallback: IconName) -> IconName {
    match name.unwrap_or("") {
        "folder" => IconName::Folder,
        "search" => IconName::Search,
        "git-branch" => IconName::GitBranch,
        "bug" => IconName::Bug,
        "puzzle" => IconName::Puzzle,
        "user" => IconName::User,
        "settings" => IconName::Settings,
        "palette" => IconName::Palette,
        "keyboard" => IconName::Keyboard,
        "globe" => IconName::Globe,
        "shield" => IconName::Shield,
        "bell" => IconName::Bell,
        "power" => IconName::Power,
        "hard-drive" => IconName::HardDrive,
        "wrench" => IconName::Wrench,
        "undo-2" | "undo" => IconName::Undo2,
        "redo-2" | "redo" => IconName::Redo2,
        "bold" => IconName::Bold,
        "italic" => IconName::Italic,
        "underline" => IconName::Underline,
        "align-left" => IconName::AlignLeft,
        "align-center" => IconName::AlignCenter,
        "align-right" => IconName::AlignRight,
        "share-2" | "share" => IconName::Share2,
        "panel-left" => IconName::PanelLeft,
        "panel-right" => IconName::PanelRight,
        "arrow-left" => IconName::ArrowLeft,
        "arrow-right" => IconName::ArrowRight,
        "info" => IconName::Info,
        "square-pen" => IconName::SquarePen,
        "inbox" => IconName::Inbox,
        "mic" => IconName::Mic,
        "video" => IconName::Video,
        "volume-2" => IconName::Volume2,
        "play" => IconName::Play,
        "pause" => IconName::Pause,
        "plus" => IconName::Plus,
        "sparkles" => IconName::Sparkles,
        _ => fallback,
    }
}

fn snap_speed(raw: f64) -> f32 {
    if !raw.is_finite() {
        return 1.0;
    }
    let target = raw as f32;
    SPEEDS
        .iter()
        .copied()
        .min_by(|a, b| (a - target).abs().total_cmp(&(b - target).abs()))
        .unwrap_or(1.0)
}

fn parse_hex_color(s: &str) -> Option<Hsla> {
    let hex = s.trim().strip_prefix('#')?;
    if hex.len() == 6
        && let Ok(val) = u32::from_str_radix(hex, 16)
    {
        return Some(rgb(val).into());
    }
    None
}

fn emit_event(
    view: &WeakEntity<CatalogueView>,
    key: &str,
    ntype: &str,
    event: &str,
    val: Value,
    cx: &mut App,
) {
    let _ = view.update(cx, |this, cx| {
        this.trigger_event(key, ntype, event, val, cx);
    });
}

fn parse_json_array(node: &ScreenNode, key: &str) -> Vec<Value> {
    if let Some(arr) = node.props.get(key).and_then(Value::as_array) {
        return arr.clone();
    }
    if let Some(raw) = prop_str(node, key)
        && let Ok(arr) = serde_json::from_str::<Vec<Value>>(&raw)
    {
        return arr;
    }
    Vec::new()
}

fn parse_f64_series(node: &ScreenNode, key: &str) -> Vec<f64> {
    let bound = CHART_LIMIT * 0.5;
    parse_json_array(node, key)
        .iter()
        .filter_map(value_to_f64)
        .map(|v| v.clamp(-bound, bound))
        .collect()
}

fn render_generative(
    kind: &str,
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    _view_state: &CatalogueView,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> Option<AnyElement> {
    let disabled = prop_bool(node, "disabled");
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    let sk = state_key.to_owned();

    let el: AnyElement = match kind {
        "generative/AudioGenerationPlayer" => {
            let prompt = non_empty_or(&best_label(node), "Generated audio");
            let model = prop_str(node, "artist").unwrap_or_else(|| "Model".into());
            let peaks = parse_peaks(node);
            let length_secs = prop_f64(node, "duration").unwrap_or(30.0).max(1.0);
            let length = Duration::from_secs_f64(length_secs);
            let initial_pos = prop_f64(node, "position").unwrap_or(0.0).max(0.0);
            let initial_play = prop_bool(node, "playing");
            let state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "audio-gen"),
                cx,
                |_, _| {
                    (
                        initial_play,
                        Duration::from_secs_f64(initial_pos).min(length),
                    )
                },
            );
            let (playing, played) = *state.read(cx);
            let mut player = AudioGenerationPlayer::new(
                gpui::ElementId::from(eid.clone()),
                prompt,
                model,
                peaks,
                length,
            )
            .played(played.min(length), playing);
            if let Some(m) = prop_f64(node, "making") {
                player = player.making(norm_share(m));
            }
            if !disabled {
                let st_tog = state.clone();
                let v_tog = view.clone();
                let sk_tog = sk.clone();
                let nt_tog = ntype.clone();
                player = player.on_toggle(move |play, _, cx| {
                    st_tog.update(cx, |s, cx| {
                        s.0 = play;
                        cx.notify();
                    });
                    emit_event(&v_tog, &sk_tog, &nt_tog, "change", json!(play), cx);
                });
                let st_seek = state.clone();
                let v_seek = view.clone();
                let sk_seek = sk.clone();
                let nt_seek = ntype.clone();
                player = player.on_seek(move |share, _, cx| {
                    let pos =
                        Duration::from_secs_f64(length.as_secs_f64() * f64::from(clamp01(share)));
                    st_seek.update(cx, |s, cx| {
                        s.1 = pos;
                        cx.notify();
                    });
                    emit_event(
                        &v_seek,
                        &sk_seek,
                        &nt_seek,
                        "change",
                        json!(pos.as_secs_f64()),
                        cx,
                    );
                });
                let v_regen = view.clone();
                let id_regen = nid.clone();
                let nt_regen = ntype.clone();
                player = player.on_regenerate(move |_, cx| {
                    emit_event(
                        &v_regen,
                        &id_regen,
                        &nt_regen,
                        "ely:action",
                        json!("regenerate"),
                        cx,
                    );
                });
                let v_dl = view.clone();
                let id_dl = nid.clone();
                let nt_dl = ntype.clone();
                player = player.on_download(move |_, cx| {
                    emit_event(&v_dl, &id_dl, &nt_dl, "ely:action", json!("download"), cx);
                });
            }
            player.into_any_element()
        }
        "generative/EmbeddingVisualizer" => {
            let mut seen_groups = HashSet::new();
            let mut groups: Vec<String> = node
                .props
                .get("groups")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(Value::as_str)
                        .map(ToOwned::to_owned)
                        .filter(|s| seen_groups.insert(s.clone()))
                        .collect()
                })
                .unwrap_or_default();
            if groups.is_empty() {
                groups = vec!["Group A".into(), "Group B".into()];
            }
            let g_len = groups.len();
            let mut points: Vec<Embedded> = parse_json_array(node, "points")
                .into_iter()
                .enumerate()
                .map(|(ix, item)| {
                    let key = item
                        .get("key")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("pt-{ix}"));
                    let label = item
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or(&key)
                        .to_owned();
                    let group = item
                        .get("group")
                        .and_then(Value::as_u64)
                        .map(|g| (g as usize) % g_len)
                        .unwrap_or(ix % g_len);
                    let coords = item.get("at").and_then(Value::as_array);
                    let axis = |idx: usize| -> f32 {
                        coords
                            .and_then(|c| c.get(idx))
                            .and_then(value_to_f64)
                            .map(|n| (n as f32).clamp(-1.0, 1.0))
                            .filter(|n| n.is_finite())
                            .unwrap_or(0.0)
                    };
                    Embedded {
                        key: key.into(),
                        label: label.into(),
                        group,
                        at: [axis(0), axis(1), axis(2)],
                    }
                })
                .collect();
            if points.is_empty() {
                points = vec![
                    Embedded {
                        key: "p0".into(),
                        label: "Item 1".into(),
                        group: 0,
                        at: [-0.4, 0.3, 0.1],
                    },
                    Embedded {
                        key: "p1".into(),
                        label: "Item 2".into(),
                        group: 1 % g_len,
                        at: [0.4, -0.2, -0.1],
                    },
                ];
            }
            EmbeddingVisualizer::new(gpui::ElementId::from(eid.clone()), points, groups)
                .three_dimensions(prop_bool(node, "threeDimensions"))
                .ratio(parse_ratio(node, 4.0 / 3.0))
                .into_any_element()
        }
        "generative/FineTuneJobCard" => {
            let name = non_empty_or(&best_label(node), "Fine-tune job");
            let base = prop_str(node, "value").unwrap_or_else(|| "Base model".into());
            let data = prop_str(node, "dataset").unwrap_or_else(|| "dataset.jsonl".into());
            let status = prop_str(node, "status").unwrap_or_else(|| "running".into());
            let phase = match status.to_ascii_lowercase().as_str() {
                "queued" => {
                    TunePhase::Queued(prop_f64(node, "ahead").unwrap_or(1.0).max(0.0) as usize)
                }
                "done" | "completed" => TunePhase::Done,
                "failed" => TunePhase::Failed(
                    prop_str(node, "error")
                        .unwrap_or_else(|| "Failed".into())
                        .into(),
                ),
                "canceled" | "cancelled" => TunePhase::Canceled,
                _ => {
                    let epochs = (prop_f64(node, "epochs").unwrap_or(3.0).max(1.0) as usize).max(1);
                    let epoch =
                        (prop_f64(node, "epoch").unwrap_or(1.0).max(1.0) as usize).clamp(1, epochs);
                    let share = norm_share(prop_f64(node, "progress").unwrap_or(50.0));
                    TunePhase::Running(epoch, epochs, share)
                }
            };
            let mut card =
                FineTuneJobCard::new(gpui::ElementId::from(eid.clone()), name, base, data, phase);
            let mut train = parse_f64_series(node, "trainLoss");
            let mut held = parse_f64_series(node, "heldLoss");
            let len = train.len().min(held.len());
            if len > 1 {
                train.truncate(len);
                held.truncate(len);
                card = card.loss(train, held);
            }
            if !disabled {
                let v1 = view.clone();
                let nid1 = nid.clone();
                let nt1 = ntype.clone();
                card = card.on_cancel(move |_, cx| {
                    emit_event(&v1, &nid1, &nt1, "ely:action", json!("cancel"), cx);
                });
                let v2 = view.clone();
                let nid2 = nid.clone();
                let nt2 = ntype.clone();
                card = card.on_open(move |_, cx| {
                    emit_event(&v2, &nid2, &nt2, "ely:action", json!("open"), cx);
                });
            }
            card.into_any_element()
        }
        "generative/GenerationGrid" => {
            let ratio = parse_ratio(node, 1.0);
            let mut results: Vec<Outcome> = Vec::new();
            if let Some(before) = prop_str(node, "beforeURL")
                && let Some(after) = prop_str(node, "afterURL")
            {
                results.push(Outcome::Done(before.into()));
                results.push(Outcome::Done(after.into()));
            }
            for item in extract_item_objects(node) {
                let status = item.get("status").and_then(Value::as_str).unwrap_or("done");
                match status {
                    "pending" => {
                        let p = item.get("progress").and_then(value_to_f64).map(norm_share);
                        results.push(Outcome::Pending(p));
                    }
                    "failed" => {
                        let msg = item
                            .get("content")
                            .or_else(|| item.get("error"))
                            .and_then(Value::as_str)
                            .unwrap_or("Failed");
                        results.push(Outcome::Failed(msg.to_owned().into()));
                    }
                    _ => {
                        let url = item.get("url").and_then(Value::as_str).unwrap_or("");
                        results.push(Outcome::Done(url.to_owned().into()));
                    }
                }
            }
            if results.is_empty() {
                results = vec![Outcome::Pending(Some(0.4)), Outcome::Done("".into())];
            }
            let cols = (prop_f64(node, "columns").unwrap_or(2.0).max(1.0) as u16).max(1);
            let mut grid = GenerationGrid::new(gpui::ElementId::from(eid.clone()), results, ratio)
                .columns(cols);
            if !disabled {
                let v1 = view.clone();
                let nid1 = nid.clone();
                let nt1 = ntype.clone();
                grid = grid.on_open(move |ix, _, cx| {
                    emit_event(&v1, &nid1, &nt1, "click", json!(ix), cx);
                });
                let v2 = view.clone();
                let nid2 = nid.clone();
                let nt2 = ntype.clone();
                grid = grid.on_retry(move |ix, _, cx| {
                    emit_event(&v2, &nid2, &nt2, "ely:action", json!({"retry": ix}), cx);
                });
            }
            grid.into_any_element()
        }
        "generative/GenerationQueue" => {
            let mut jobs: Vec<Job> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .map(|(ix, item)| {
                    let key = item
                        .get("value")
                        .or_else(|| item.get("id"))
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("job-{ix}"));
                    let prompt = item
                        .get("label")
                        .or_else(|| item.get("prompt"))
                        .and_then(Value::as_str)
                        .unwrap_or("Generation")
                        .to_owned();
                    let status = item
                        .get("status")
                        .and_then(Value::as_str)
                        .unwrap_or("queued");
                    let state = match status {
                        "running" => {
                            let share = norm_share(
                                item.get("progress").and_then(value_to_f64).unwrap_or(50.0),
                            );
                            JobState::Running(share, Some(Duration::from_secs(12)))
                        }
                        "done" => JobState::Done(Duration::from_secs(
                            item.get("duration")
                                .and_then(value_to_f64)
                                .unwrap_or(15.0)
                                .max(1.0) as u64,
                        )),
                        "failed" => JobState::Failed(
                            item.get("content")
                                .or_else(|| item.get("error"))
                                .and_then(Value::as_str)
                                .unwrap_or("Failed")
                                .to_owned()
                                .into(),
                        ),
                        _ => JobState::Queued(
                            item.get("ahead")
                                .and_then(value_to_f64)
                                .unwrap_or(0.0)
                                .max(0.0) as usize,
                        ),
                    };
                    let picture = item
                        .get("url")
                        .and_then(Value::as_str)
                        .filter(|u| !u.is_empty())
                        .map(|u| u.to_owned().into());
                    Job {
                        key: key.into(),
                        prompt: prompt.into(),
                        state,
                        picture,
                    }
                })
                .collect();
            if jobs.is_empty() {
                jobs.push(Job {
                    key: "job-0".into(),
                    prompt: non_empty_or(&best_label(node), "Queued generation").into(),
                    state: JobState::Queued(0),
                    picture: None,
                });
            }
            let mut queue = GenerationQueue::new(gpui::ElementId::from(eid.clone()), jobs);
            if !disabled {
                let v1 = view.clone();
                let id1 = nid.clone();
                let nt1 = ntype.clone();
                queue = queue.on_cancel(move |k, _, cx| {
                    emit_event(
                        &v1,
                        &id1,
                        &nt1,
                        "ely:action",
                        json!({"cancel": k.as_ref()}),
                        cx,
                    );
                });
                let v2 = view.clone();
                let id2 = nid.clone();
                let nt2 = ntype.clone();
                queue = queue.on_retry(move |k, _, cx| {
                    emit_event(
                        &v2,
                        &id2,
                        &nt2,
                        "ely:action",
                        json!({"retry": k.as_ref()}),
                        cx,
                    );
                });
                let v3 = view.clone();
                let id3 = nid.clone();
                let nt3 = ntype.clone();
                queue = queue.on_remove(move |k, _, cx| {
                    emit_event(
                        &v3,
                        &id3,
                        &nt3,
                        "ely:action",
                        json!({"remove": k.as_ref()}),
                        cx,
                    );
                });
            }
            queue.into_any_element()
        }
        "generative/InpaintCanvas" => {
            let url = prop_str(node, "url").unwrap_or_default();
            let ratio = parse_ratio(node, 1.5);
            let initial_strokes: Vec<MaskStroke> = parse_json_array(node, "strokes")
                .into_iter()
                .filter_map(|s| {
                    let pts: Vec<(f32, f32)> = s
                        .get("points")
                        .and_then(Value::as_array)?
                        .iter()
                        .filter_map(|pt| {
                            let pair = pt.as_array()?;
                            let x = value_to_f64(pair.first()?)? as f32;
                            let y = value_to_f64(pair.get(1)?)? as f32;
                            Some((clamp01(x), clamp01(y)))
                        })
                        .collect();
                    let radius = s.get("radius").and_then(value_to_f64).unwrap_or(0.05) as f32;
                    let radius = if radius.is_finite() {
                        radius.clamp(0.01, 0.2)
                    } else {
                        0.05
                    };
                    let erase = s.get("erase").and_then(Value::as_bool).unwrap_or(false);
                    Some(MaskStroke {
                        points: pts,
                        radius,
                        erase,
                    })
                })
                .collect();
            let initial_radius = prop_f64(node, "brushRadius")
                .or_else(|| prop_f64(node, "brushSize"))
                .unwrap_or(0.05) as f32;
            let initial_radius = if initial_radius.is_finite() {
                initial_radius.clamp(0.01, 0.2)
            } else {
                0.05
            };
            let initial_erase = prop_bool(node, "erase");
            let state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "inpaint"),
                cx,
                |_, _| (initial_strokes, initial_radius, initial_erase),
            );
            let (strokes, radius, erase) = state.read(cx).clone();
            let mut canvas =
                InpaintCanvas::new(gpui::ElementId::from(eid.clone()), url, ratio, strokes)
                    .brush(radius.clamp(0.01, 0.2), erase);
            if !disabled {
                let st1 = state.clone();
                let v1 = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                canvas = canvas.on_stroke(move |stroke, _, cx| {
                    let count = st1.update(cx, |s, cx| {
                        s.0.push(stroke);
                        cx.notify();
                        s.0.len()
                    });
                    emit_event(&v1, &sk1, &nt1, "change", json!({"strokes": count}), cx);
                });
                let st2 = state.clone();
                let v2 = view.clone();
                let sk2 = sk.clone();
                let nt2 = ntype.clone();
                canvas = canvas.on_brush(move |r, er, _, cx| {
                    st2.update(cx, |s, cx| {
                        s.1 = r.clamp(0.01, 0.2);
                        s.2 = er;
                        cx.notify();
                    });
                    emit_event(
                        &v2,
                        &sk2,
                        &nt2,
                        "change",
                        json!({"radius": r, "erase": er}),
                        cx,
                    );
                });
            }
            canvas.into_any_element()
        }
        "generative/ModelCard" => {
            let name = non_empty_or(&best_label(node), "Model");
            let maker = prop_str(node, "maker").unwrap_or_default();
            let about = best_body(node).unwrap_or_default();
            let mut card = ModelCard::new(gpui::ElementId::from(eid.clone()), name, maker, about)
                .in_use(prop_bool(node, "inUse"));
            for item in extract_item_objects(node) {
                let k = item.get("label").and_then(Value::as_str).unwrap_or("Spec");
                let v = item.get("content").and_then(Value::as_str).unwrap_or("");
                card = card.fact(k.to_owned(), v.to_owned());
            }
            if let Some(tags) = node.props.get("tags").and_then(Value::as_array) {
                for tag in tags.iter().filter_map(Value::as_str) {
                    card = card.tag(tag.to_owned());
                }
            }
            if !disabled {
                let v = view.clone();
                let nid_u = nid.clone();
                let nt_u = ntype.clone();
                let val = prop_str(node, "value").unwrap_or_else(|| nid.clone());
                card = card.on_use(move |_, cx| {
                    emit_event(&v, &nid_u, &nt_u, "ely:action", json!(val), cx);
                });
            }
            card.into_any_element()
        }
        "generative/ModelDownloadManager" => {
            let mut downloads: Vec<Download> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .map(|(ix, item)| {
                    let key = item
                        .get("value")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("dl-{ix}"));
                    let name = item
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or(&key)
                        .to_owned();
                    let bytes = item
                        .get("bytes")
                        .and_then(value_to_f64)
                        .unwrap_or(1_000_000_000.0)
                        .max(1.0) as u64;
                    let status = item
                        .get("status")
                        .and_then(Value::as_str)
                        .unwrap_or("queued");
                    let share =
                        norm_share(item.get("progress").and_then(value_to_f64).unwrap_or(0.0));
                    let rate = item
                        .get("rate")
                        .and_then(value_to_f64)
                        .unwrap_or(0.0)
                        .max(0.0) as u64;
                    let state = match status {
                        "fetching" | "downloading" => DownloadState::Fetching(share, rate),
                        "paused" => DownloadState::Paused(share),
                        "done" => DownloadState::Done,
                        "failed" => DownloadState::Failed(
                            item.get("error")
                                .or_else(|| item.get("content"))
                                .and_then(Value::as_str)
                                .unwrap_or("Failed")
                                .to_owned()
                                .into(),
                        ),
                        _ => DownloadState::Queued,
                    };
                    Download {
                        key: key.into(),
                        name: name.into(),
                        bytes,
                        state,
                    }
                })
                .collect();
            if downloads.is_empty() {
                downloads.push(Download {
                    key: "model".into(),
                    name: non_empty_or(&best_label(node), "Model").into(),
                    bytes: 1_000_000_000,
                    state: DownloadState::Queued,
                });
            }
            let mut mgr = ModelDownloadManager::new(gpui::ElementId::from(eid.clone()), downloads);
            if !disabled {
                let wire = |act: &'static str| {
                    let v = view.clone();
                    let id = nid.clone();
                    let nt = ntype.clone();
                    move |k: &SharedString, _: &mut Window, cx: &mut App| {
                        emit_event(&v, &id, &nt, "ely:action", json!({act: k.as_ref()}), cx);
                    }
                };
                mgr = mgr
                    .on_pause(wire("pause"))
                    .on_resume(wire("resume"))
                    .on_cancel(wire("cancel"))
                    .on_retry(wire("retry"))
                    .on_delete(wire("delete"));
            }
            mgr.into_any_element()
        }
        "generative/ModelStatus" => {
            let items = extract_item_objects(node);
            let mut col = v_stack().gap_3();
            if items.is_empty() {
                let name = non_empty_or(&best_label(node), "Model");
                let ms =
                    ModelStatus::new(gpui::ElementId::from(eid.clone()), name, ModelState::Ready);
                col = col.child(ms);
            } else {
                for (ix, item) in items.iter().enumerate() {
                    let name = item
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or("Model")
                        .to_owned();
                    let status = item.get("status").and_then(Value::as_str).unwrap_or("idle");
                    let state = match status {
                        "ready" => ModelState::Ready,
                        "loading" => {
                            let s = norm_share(
                                item.get("progress").and_then(value_to_f64).unwrap_or(50.0),
                            );
                            ModelState::Loading(s)
                        }
                        "failed" => ModelState::Failed(
                            item.get("content")
                                .and_then(Value::as_str)
                                .unwrap_or("Failed")
                                .to_owned()
                                .into(),
                        ),
                        _ => ModelState::Idle,
                    };
                    let mut ms =
                        ModelStatus::new(SharedString::from(format!("{eid}-ms-{ix}")), name, state);
                    if let (Some(used), Some(total)) = (
                        item.get("memoryUsed").and_then(value_to_f64),
                        item.get("memoryTotal").and_then(value_to_f64),
                    ) && total > 0.0
                        && used >= 0.0
                    {
                        ms = ms.memory(used as u64, (total as u64).max(1));
                    }
                    col = col.child(ms);
                }
            }
            if let Some(readings) = node.props.get("readings").and_then(Value::as_array) {
                for (ix, r) in readings.iter().enumerate() {
                    let lbl = r.get("label").and_then(Value::as_str).unwrap_or("Metric");
                    let detail = r.get("content").and_then(Value::as_str).unwrap_or("");
                    let share = norm_share(r.get("progress").and_then(value_to_f64).unwrap_or(0.0));
                    col = col.child(
                        Meter::new(
                            SharedString::from(format!("{eid}-rd-{ix}")),
                            lbl.to_owned(),
                            share,
                        )
                        .detail(detail.to_owned()),
                    );
                }
            }
            col.into_any_element()
        }
        "generative/PromptDiff" => {
            let items = extract_item_objects(node);
            if items.is_empty() {
                let old = prop_str(node, "old").unwrap_or_else(|| "Draft prompt".into());
                let new = prop_str(node, "new")
                    .or_else(|| best_body(node))
                    .unwrap_or_else(|| "Updated prompt".into());
                PromptDiff::new(old, new).into_any_element()
            } else {
                let versions: Vec<PromptVersion> = items
                    .into_iter()
                    .enumerate()
                    .map(|(ix, item)| PromptVersion {
                        key: item
                            .get("value")
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned)
                            .unwrap_or_else(|| format!("v{ix}"))
                            .into(),
                        text: item
                            .get("content")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_owned()
                            .into(),
                        author: item
                            .get("author")
                            .and_then(Value::as_str)
                            .unwrap_or("Author")
                            .to_owned()
                            .into(),
                        at: Timestamp::now(),
                        note: item
                            .get("note")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_owned()
                            .into(),
                    })
                    .collect();
                let initial_chosen = prop_f64(node, "chosen").unwrap_or(0.0).max(0.0) as usize;
                let chosen_state = window.use_keyed_state(
                    (gpui::ElementId::from(eid.clone()), "chosen"),
                    cx,
                    |_, _| initial_chosen,
                );
                let chosen = (*chosen_state.read(cx)).min(versions.len().saturating_sub(1));
                let mut hist =
                    PromptVersionHistory::new(gpui::ElementId::from(eid.clone()), versions, chosen);
                if !disabled {
                    let st = chosen_state.clone();
                    let v1 = view.clone();
                    let sk1 = sk.clone();
                    let nt1 = ntype.clone();
                    hist = hist.on_choose(move |ix, _, cx| {
                        st.update(cx, |c, cx| {
                            *c = ix;
                            cx.notify();
                        });
                        emit_event(&v1, &sk1, &nt1, "change", json!(ix), cx);
                    });
                    let v2 = view.clone();
                    let id2 = nid.clone();
                    let nt2 = ntype.clone();
                    hist = hist.on_restore(move |ix, _, cx| {
                        emit_event(&v2, &id2, &nt2, "ely:action", json!({"restore": ix}), cx);
                    });
                }
                hist.into_any_element()
            }
        }
        "generative/PromptPlayground" => {
            let initial =
                prop_str(node, "value").unwrap_or_else(|| "Write notes on {topic}.".into());
            let template = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "template"),
                cx,
                |window, cx| {
                    let mut ti = TextInput::new(window, cx).placeholder("Prompt template");
                    ti.set_text(initial, cx);
                    ti
                },
            );
            let mut pg = PromptPlayground::new(gpui::ElementId::from(eid.clone()), &template)
                .running(prop_bool(node, "running"));
            if let Some(out) = prop_str(node, "output")
                && !out.is_empty()
            {
                pg = pg.output(out, 64, Duration::from_millis(420));
            }
            if !disabled {
                let v = view.clone();
                let id = nid.clone();
                let nt = ntype.clone();
                pg = pg.on_run(move |prompt, _, cx| {
                    emit_event(&v, &id, &nt, "ely:action", json!(prompt), cx);
                });
            }
            pg.into_any_element()
        }
        "generative/TTSVoicePicker" => {
            let mut voices: Vec<Voice> = Vec::new();
            let mut default_sel = prop_str(node, "selected");
            for (ix, item) in extract_item_objects(node).into_iter().enumerate() {
                let key = item
                    .get("value")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .unwrap_or_else(|| format!("voice-{ix}"));
                if default_sel.is_none()
                    && item.get("selected").and_then(Value::as_bool) == Some(true)
                {
                    default_sel = Some(key.clone());
                }
                let tags = item
                    .get("tagItems")
                    .and_then(Value::as_array)
                    .map(|arr| {
                        arr.iter()
                            .filter_map(Value::as_str)
                            .map(|s| SharedString::from(s.to_owned()))
                            .collect()
                    })
                    .unwrap_or_default();
                voices.push(Voice {
                    key: key.into(),
                    name: item
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or("Voice")
                        .to_owned()
                        .into(),
                    about: item
                        .get("content")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_owned()
                        .into(),
                    tags,
                });
            }
            let state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "voices"),
                cx,
                |_, _| (default_sel, prop_str(node, "playing")),
            );
            let (sel, playing) = state.read(cx).clone();
            let mut picker = TTSVoicePicker::new(gpui::ElementId::from(eid.clone()), voices);
            if let Some(s) = sel {
                picker = picker.selected(s);
            }
            if let Some(p) = playing {
                picker = picker.playing(p);
            }
            if !disabled {
                let st1 = state.clone();
                let v1 = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                picker = picker.on_select(move |key, _, cx| {
                    st1.update(cx, |s, cx| {
                        s.0 = Some(key.to_string());
                        cx.notify();
                    });
                    emit_event(&v1, &sk1, &nt1, "change", json!(key.as_ref()), cx);
                });
                let st2 = state.clone();
                let v2 = view.clone();
                let id2 = nid.clone();
                let nt2 = ntype.clone();
                picker = picker.on_play(move |key, _, cx| {
                    let next = key.as_ref().map(|k| k.to_string());
                    st2.update(cx, |s, cx| {
                        s.1 = next.clone();
                        cx.notify();
                    });
                    emit_event(&v2, &id2, &nt2, "ely:action", json!({"play": next}), cx);
                });
            }
            picker.into_any_element()
        }
        "generative/VariationPicker" => {
            if let Some(sides_arr) = node.props.get("sides").and_then(Value::as_array) {
                let verdict_state = window.use_keyed_state(
                    (gpui::ElementId::from(eid.clone()), "verdict"),
                    cx,
                    |_, _| None::<Verdict>,
                );
                let mut ab = ABCompareView::new(eid.clone());
                if prop_bool(node, "blind") {
                    ab = ab.blind();
                }
                let mut count = 0usize;
                for (ix, s) in sides_arr.iter().take(4).enumerate() {
                    let lbl = s.get("label").and_then(Value::as_str).unwrap_or("Model");
                    let body = s.get("content").and_then(Value::as_str).unwrap_or("");
                    ab = ab.side(lbl.to_owned(), Paragraph::new(body.to_owned()));
                    count = ix + 1;
                }
                while count < 2 {
                    ab = ab.side(format!("Side {}", count + 1), Paragraph::new(""));
                    count += 1;
                }
                if let Some(v) = *verdict_state.read(cx) {
                    ab = ab.verdict(v);
                }
                if !disabled {
                    let st = verdict_state.clone();
                    let v = view.clone();
                    let sk1 = sk.clone();
                    let nt1 = ntype.clone();
                    ab = ab.on_verdict(move |verdict, _, cx| {
                        st.update(cx, |cur, cx| {
                            *cur = Some(verdict);
                            cx.notify();
                        });
                        let val = match verdict {
                            Verdict::Side(i) => json!(i),
                            Verdict::Tie => json!("tie"),
                        };
                        emit_event(&v, &sk1, &nt1, "change", val, cx);
                    });
                }
                ab.into_any_element()
            } else {
                let mut pics: Vec<String> = Vec::new();
                let mut initial_ix = 0usize;
                if let Some(opts) = node.props.get("options").and_then(Value::as_array) {
                    for (ix, opt) in opts.iter().enumerate() {
                        if let Some(u) = opt.get("url").and_then(Value::as_str) {
                            if opt.get("selected").and_then(Value::as_bool) == Some(true) {
                                initial_ix = ix;
                            }
                            pics.push(u.to_owned());
                        }
                    }
                }
                if pics.is_empty() {
                    pics.push(prop_str(node, "url").unwrap_or_default());
                }
                let chosen_state = window.use_keyed_state(
                    (gpui::ElementId::from(eid.clone()), "chosen"),
                    cx,
                    |_, _| initial_ix,
                );
                let chosen = (*chosen_state.read(cx)).min(pics.len().saturating_sub(1));
                let mut vp = VariationPicker::new(
                    gpui::ElementId::from(eid.clone()),
                    pics,
                    parse_ratio(node, 1.5),
                    chosen,
                );
                if !disabled {
                    let st = chosen_state.clone();
                    let v1 = view.clone();
                    let sk1 = sk.clone();
                    let nt1 = ntype.clone();
                    vp = vp.on_choose(move |ix, _, cx| {
                        st.update(cx, |c, cx| {
                            *c = ix;
                            cx.notify();
                        });
                        emit_event(&v1, &sk1, &nt1, "change", json!(ix), cx);
                    });
                    let v2 = view.clone();
                    let id2 = nid.clone();
                    let nt2 = ntype.clone();
                    vp = vp.on_vary(move |strong, _, cx| {
                        emit_event(
                            &v2,
                            &id2,
                            &nt2,
                            "ely:action",
                            json!(if strong { "vary-strong" } else { "vary-subtle" }),
                            cx,
                        );
                    });
                    let v3 = view.clone();
                    let id3 = nid.clone();
                    let nt3 = ntype.clone();
                    vp = vp.on_upscale(move |_, cx| {
                        emit_event(&v3, &id3, &nt3, "ely:action", json!("upscale"), cx);
                    });
                }
                vp.into_any_element()
            }
        }
        "generative/VideoGenerationTimeline" => {
            let mut default_sel = prop_str(node, "selected");
            let mut shots: Vec<Shot> = parse_json_array(node, "frames")
                .into_iter()
                .enumerate()
                .map(|(ix, f)| {
                    let key = f
                        .get("value")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("s{ix}"));
                    if default_sel.is_none()
                        && f.get("selected").and_then(Value::as_bool) == Some(true)
                    {
                        default_sel = Some(key.clone());
                    }
                    let secs = f
                        .get("duration")
                        .and_then(value_to_f64)
                        .unwrap_or(4.0)
                        .max(0.5);
                    let status = f.get("status").and_then(Value::as_str).unwrap_or("done");
                    let outcome = match status {
                        "pending" => Outcome::Pending(
                            f.get("progress").and_then(value_to_f64).map(norm_share),
                        ),
                        "failed" => Outcome::Failed(
                            f.get("content")
                                .and_then(Value::as_str)
                                .unwrap_or("Failed")
                                .to_owned()
                                .into(),
                        ),
                        _ => Outcome::Done(
                            f.get("url")
                                .and_then(Value::as_str)
                                .unwrap_or("")
                                .to_owned()
                                .into(),
                        ),
                    };
                    Shot {
                        key: key.into(),
                        prompt: f
                            .get("label")
                            .and_then(Value::as_str)
                            .unwrap_or("Shot")
                            .to_owned()
                            .into(),
                        length: Duration::from_secs_f64(secs),
                        outcome,
                    }
                })
                .collect();
            if shots.is_empty() {
                shots.push(Shot {
                    key: "s0".into(),
                    prompt: "Shot 1".into(),
                    length: Duration::from_secs(4),
                    outcome: Outcome::Pending(Some(0.5)),
                });
            }
            let sel_state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "selected"),
                cx,
                |_, _| default_sel,
            );
            let at = Duration::from_secs_f64(prop_f64(node, "position").unwrap_or(0.0).max(0.0));
            let mut tl =
                VideoGenerationTimeline::new(gpui::ElementId::from(eid.clone()), shots, at);
            if let Some(sel) = sel_state.read(cx).clone() {
                tl = tl.selected(sel);
            }
            if !disabled {
                let st = sel_state.clone();
                let v1 = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                tl = tl.on_select(move |key, _, cx| {
                    st.update(cx, |s, cx| {
                        *s = Some(key.to_string());
                        cx.notify();
                    });
                    emit_event(&v1, &sk1, &nt1, "change", json!(key.as_ref()), cx);
                });
                let v2 = view.clone();
                let id2 = nid.clone();
                let nt2 = ntype.clone();
                tl = tl.on_extend(move |_, cx| {
                    emit_event(&v2, &id2, &nt2, "ely:action", json!("extend"), cx);
                });
            }
            tl.into_any_element()
        }
        _ => return None,
    };
    Some(el)
}

fn render_media(
    kind: &str,
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> Option<AnyElement> {
    let disabled = prop_bool(node, "disabled");
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    let sk = state_key.to_owned();

    let el: AnyElement = match kind {
        "media/AudioPlayer" => {
            let title = non_empty_or(&best_title(node), "Audio");
            let artist = prop_str(node, "artist").unwrap_or_else(|| "Artist".into());
            let length =
                Duration::from_secs_f64(prop_f64(node, "duration").unwrap_or(180.0).max(1.0));
            let init_at =
                Duration::from_secs_f64(prop_f64(node, "position").unwrap_or(0.0).max(0.0))
                    .min(length);
            let init_play = prop_bool(node, "playing");
            let init_shuffle = prop_bool(node, "shuffle");
            let init_repeat = match prop_str(node, "repeat").as_deref() {
                Some("all") => Repeat::All,
                Some("one") => Repeat::One,
                _ => Repeat::Off,
            };
            let init_vol = clamp01(prop_f64(node, "volume").unwrap_or(0.7) as f32);
            let init_muted = prop_bool(node, "muted");
            let state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "audio-player"),
                cx,
                |_, _| {
                    (
                        init_at,
                        init_play,
                        init_shuffle,
                        init_repeat,
                        init_vol,
                        init_muted,
                    )
                },
            );
            let (at, playing, shuffle, repeat, vol, muted) = *state.read(cx);
            let mut controls =
                MediaControls::new(SharedString::from(format!("{eid}-ctrl")), playing);
            let mut volume =
                VolumeControl::new(SharedString::from(format!("{eid}-vol")), vol, muted);
            if !disabled {
                let st_p = state.clone();
                let v_p = view.clone();
                let sk_p = sk.clone();
                let nt_p = ntype.clone();
                controls = controls.on_play(move |p, _, cx| {
                    st_p.update(cx, |s, cx| {
                        s.1 = p;
                        cx.notify();
                    });
                    emit_event(&v_p, &sk_p, &nt_p, "change", json!({"playing": p}), cx);
                });
                let v_b = view.clone();
                let id_b = nid.clone();
                let nt_b = ntype.clone();
                controls = controls.on_back(move |_, cx| {
                    emit_event(&v_b, &id_b, &nt_b, "ely:action", json!("back"), cx);
                });
                let v_f = view.clone();
                let id_f = nid.clone();
                let nt_f = ntype.clone();
                controls = controls.on_forward(move |_, cx| {
                    emit_event(&v_f, &id_f, &nt_f, "ely:action", json!("forward"), cx);
                });
                let st_sh = state.clone();
                controls = controls.shuffle(shuffle, move |sh, _, cx| {
                    st_sh.update(cx, |s, cx| {
                        s.2 = sh;
                        cx.notify();
                    });
                });
                let st_rp = state.clone();
                controls = controls.repeat(repeat, move |rp, _, cx| {
                    st_rp.update(cx, |s, cx| {
                        s.3 = rp;
                        cx.notify();
                    });
                });
                let st_v = state.clone();
                volume = volume.on_level(move |lvl, _, cx| {
                    st_v.update(cx, |s, cx| {
                        s.4 = clamp01(lvl as f32);
                        cx.notify();
                    });
                });
                let st_m = state.clone();
                volume = volume.on_mute(move |m, _, cx| {
                    st_m.update(cx, |s, cx| {
                        s.5 = m;
                        cx.notify();
                    });
                });
            }
            let mut player = AudioPlayer::new(
                gpui::ElementId::from(eid.clone()),
                title,
                artist,
                length,
                at.min(length),
            )
            .controls(controls)
            .volume(volume);
            if let Some(cover) = prop_str(node, "coverURL")
                && !cover.is_empty()
            {
                player = player.artwork(img_source(&cover));
            }
            if !disabled {
                let st_s = state.clone();
                let v_s = view.clone();
                let sk_s = sk.clone();
                let nt_s = ntype.clone();
                player = player.on_seek(move |t, _, cx| {
                    st_s.update(cx, |s, cx| {
                        s.0 = t;
                        cx.notify();
                    });
                    emit_event(
                        &v_s,
                        &sk_s,
                        &nt_s,
                        "change",
                        json!({"position": t.as_secs_f64()}),
                        cx,
                    );
                });
            }
            player.into_any_element()
        }
        "media/AudioSpectrum" => AudioSpectrum::new(parse_peaks(node)).into_any_element(),
        "media/AudioWaveform" => {
            let peaks = parse_peaks(node);
            let length =
                Duration::from_secs_f64(prop_f64(node, "duration").unwrap_or(180.0).max(1.0));
            let init_at =
                Duration::from_secs_f64(prop_f64(node, "position").unwrap_or(0.0).max(0.0))
                    .min(length);
            let at_state =
                window.use_keyed_state((gpui::ElementId::from(eid.clone()), "at"), cx, |_, _| {
                    init_at
                });
            let at = (*at_state.read(cx)).min(length);
            let mut wave =
                AudioWaveform::new(gpui::ElementId::from(eid.clone()), peaks, length, at);
            if !disabled {
                let st = at_state.clone();
                let v = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                wave = wave.on_seek(move |t, _, cx| {
                    st.update(cx, |cur, cx| {
                        *cur = t;
                        cx.notify();
                    });
                    emit_event(&v, &sk1, &nt1, "change", json!(t.as_secs_f64()), cx);
                });
            }
            wave.into_any_element()
        }
        "media/CameraPreview" => {
            let mut cam =
                CameraPreview::new(gpui::ElementId::from(eid.clone()), parse_ratio(node, 1.5));
            if let Some(url) = prop_str(node, "url")
                && !url.is_empty()
            {
                cam = cam.frame(img_source(&url));
            }
            if let Some(name) = prop_str(node, "cameraName")
                .or_else(|| prop_str(node, "label"))
                .filter(|s| !s.is_empty())
            {
                cam = cam.name(name);
            }
            cam.into_any_element()
        }
        "media/DeviceSelector" => {
            let items = extract_item_objects(node);
            if items.is_empty() {
                let choices = extract_choices(node);
                let mut seen = HashSet::new();
                let devices: Vec<Device> = choices
                    .into_iter()
                    .filter(|c| seen.insert(c.value.to_string()))
                    .map(|c| Device {
                        key: c.value,
                        name: c.label,
                    })
                    .collect();
                let sel_state = window.use_keyed_state(
                    (gpui::ElementId::from(eid.clone()), "dev"),
                    cx,
                    |_, _| prop_str(node, "value"),
                );
                let mut ds = DeviceSelector::new(
                    gpui::ElementId::from(eid.clone()),
                    DeviceKind::Microphone,
                    devices,
                );
                if let Some(k) = sel_state.read(cx).clone() {
                    ds = ds.chosen(k);
                }
                if !disabled {
                    let st = sel_state.clone();
                    let v = view.clone();
                    let sk1 = sk.clone();
                    let nt1 = ntype.clone();
                    ds = ds.on_change(move |k, _, cx| {
                        st.update(cx, |s, cx| {
                            *s = Some(k.to_string());
                            cx.notify();
                        });
                        emit_event(&v, &sk1, &nt1, "change", json!(k.as_ref()), cx);
                    });
                }
                ds.into_any_element()
            } else {
                let mut col = v_stack().gap_3();
                for (ix, item) in items.iter().enumerate() {
                    let kind = match item.get("value").and_then(Value::as_str) {
                        Some("camera") => DeviceKind::Camera,
                        Some("speaker") => DeviceKind::Speaker,
                        _ => DeviceKind::Microphone,
                    };
                    let mut seen = HashSet::new();
                    let mut devices = Vec::new();
                    let mut def_chosen = item
                        .get("chosen")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned);
                    if let Some(opts) = item.get("options").and_then(Value::as_array) {
                        for (oix, opt) in opts.iter().enumerate() {
                            let key = opt
                                .get("value")
                                .and_then(Value::as_str)
                                .map(ToOwned::to_owned)
                                .unwrap_or_else(|| format!("dev-{ix}-{oix}"));
                            if !seen.insert(key.clone()) {
                                continue;
                            }
                            if def_chosen.is_none()
                                && opt.get("selected").and_then(Value::as_bool) == Some(true)
                            {
                                def_chosen = Some(key.clone());
                            }
                            let name = opt
                                .get("label")
                                .and_then(Value::as_str)
                                .unwrap_or(&key)
                                .to_owned();
                            devices.push(Device {
                                key: key.into(),
                                name: name.into(),
                            });
                        }
                    }
                    let sub_id = SharedString::from(format!("{eid}-ds-{ix}"));
                    let sel_state = window.use_keyed_state(
                        (gpui::ElementId::from(sub_id.clone()), "chosen"),
                        cx,
                        |_, _| def_chosen,
                    );
                    let mut ds = DeviceSelector::new(sub_id, kind, devices);
                    if let Some(ch) = sel_state.read(cx).clone() {
                        ds = ds.chosen(ch);
                    }
                    if !disabled && item.get("disabled").and_then(Value::as_bool) != Some(true) {
                        let st = sel_state.clone();
                        let v = view.clone();
                        let sk1 = sk.clone();
                        let nt1 = ntype.clone();
                        ds = ds.on_change(move |k, _, cx| {
                            st.update(cx, |s, cx| {
                                *s = Some(k.to_string());
                                cx.notify();
                            });
                            emit_event(&v, &sk1, &nt1, "change", json!(k.as_ref()), cx);
                        });
                    }
                    let lbl = item.get("label").and_then(Value::as_str).unwrap_or("");
                    if lbl.is_empty() {
                        col = col.child(ds);
                    } else {
                        col = col.child(
                            v_stack()
                                .gap_1()
                                .child(Label::new(lbl.to_owned()))
                                .child(ds),
                        );
                    }
                }
                col.into_any_element()
            }
        }
        "media/ImageAnnotator" => {
            let url = prop_str(node, "url").unwrap_or_default();
            let ratio = match (prop_f64(node, "width"), prop_f64(node, "height")) {
                (Some(w), Some(h)) if w > 0.0 && h > 0.0 => (w / h) as f32,
                _ => parse_ratio(node, 1.5),
            };
            let pair = |v: Option<&Value>, def: (f32, f32)| -> (f32, f32) {
                if let Some(arr) = v.and_then(Value::as_array)
                    && let (Some(x), Some(y)) = (
                        arr.first().and_then(value_to_f64),
                        arr.get(1).and_then(value_to_f64),
                    )
                {
                    return (clamp01(x as f32), clamp01(y as f32));
                }
                def
            };
            let init_marks: Vec<Mark> = parse_json_array(node, "marks")
                .into_iter()
                .filter_map(|m| {
                    let tool = m.get("tool").and_then(Value::as_str).unwrap_or("box");
                    let color = (m.get("color").and_then(Value::as_u64).unwrap_or(0) as usize) % 4;
                    match tool {
                        "arrow" => Some(Mark::Arrow {
                            from: pair(m.get("from"), (0.2, 0.2)),
                            to: pair(m.get("to"), (0.6, 0.6)),
                            color,
                        }),
                        "pin" => Some(Mark::Pin {
                            at: pair(m.get("at"), (0.5, 0.5)),
                            color,
                        }),
                        "pen" => {
                            let points = m
                                .get("points")
                                .and_then(Value::as_array)
                                .map(|arr| {
                                    arr.iter()
                                        .map(|p| pair(Some(p), (0.5, 0.5)))
                                        .collect::<Vec<_>>()
                                })
                                .unwrap_or_default();
                            Some(Mark::Pen { points, color })
                        }
                        _ => Some(Mark::Box {
                            from: pair(m.get("from"), (0.1, 0.1)),
                            to: pair(m.get("to"), (0.8, 0.8)),
                            color,
                        }),
                    }
                })
                .collect();
            let marks_state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "marks"),
                cx,
                |_, _| init_marks,
            );
            let mut ann = ImageAnnotator::new(
                gpui::ElementId::from(eid.clone()),
                img_source(&url),
                ratio,
                marks_state.read(cx).clone(),
            );
            if !disabled {
                let st = marks_state.clone();
                let v = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                ann = ann.on_change(move |marks, _, cx| {
                    let len = marks.len();
                    st.update(cx, |m, cx| {
                        *m = marks.to_vec();
                        cx.notify();
                    });
                    emit_event(&v, &sk1, &nt1, "change", json!({"marks": len}), cx);
                });
            }
            ann.into_any_element()
        }
        "media/ImageCropper" => {
            let url = prop_str(node, "url").unwrap_or_default();
            let ratio = parse_ratio(node, 1.5);
            let parsed_crop = prop_str(node, "crop")
                .and_then(|s| serde_json::from_str::<Value>(&s).ok())
                .or_else(|| node.props.get("crop").cloned())
                .map(|c| {
                    let x =
                        clamp01(c.get("x").and_then(value_to_f64).unwrap_or(0.0) as f32).min(0.95);
                    let y =
                        clamp01(c.get("y").and_then(value_to_f64).unwrap_or(0.0) as f32).min(0.95);
                    let raw_w = c
                        .get("w")
                        .or_else(|| c.get("width"))
                        .and_then(value_to_f64)
                        .unwrap_or(1.0) as f32;
                    let raw_h = c
                        .get("h")
                        .or_else(|| c.get("height"))
                        .and_then(value_to_f64)
                        .unwrap_or(1.0) as f32;
                    let w = if raw_w.is_finite() {
                        raw_w.clamp(0.05, 1.0 - x)
                    } else {
                        1.0 - x
                    };
                    let h = if raw_h.is_finite() {
                        raw_h.clamp(0.05, 1.0 - y)
                    } else {
                        1.0 - y
                    };
                    Crop { x, y, w, h }
                })
                .unwrap_or(Crop::WHOLE);
            let crop_state =
                window.use_keyed_state((gpui::ElementId::from(eid.clone()), "crop"), cx, |_, _| {
                    parsed_crop
                });
            let aspect = node
                .props
                .get("aspectRatio")
                .and_then(parse_ratio_value)
                .filter(|a| a.is_finite() && *a > 0.0);
            let mut cropper = ImageCropper::new(
                gpui::ElementId::from(eid.clone()),
                img_source(&url),
                ratio,
                *crop_state.read(cx),
            )
            .aspect(aspect);
            if !disabled {
                let st = crop_state.clone();
                let v = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                cropper = cropper.on_change(move |c, _, cx| {
                    st.update(cx, |cur, cx| {
                        *cur = c;
                        cx.notify();
                    });
                    emit_event(
                        &v,
                        &sk1,
                        &nt1,
                        "change",
                        json!({"x": c.x, "y": c.y, "w": c.w, "h": c.h}),
                        cx,
                    );
                });
            }
            cropper.into_any_element()
        }
        "media/ImageThumbnail" => {
            let items = extract_item_objects(node);
            if items.is_empty() {
                let url = prop_str(node, "url").unwrap_or_default();
                let ratio = parse_ratio(node, 1.5);
                let mut thumb = ImageThumbnail::new(
                    gpui::ElementId::from(eid.clone()),
                    img_source(&url),
                    ratio,
                )
                .selected(prop_bool(node, "selected"));
                if let Some(lbl) = prop_str(node, "label").filter(|s| !s.is_empty()) {
                    thumb = thumb.label(lbl);
                }
                if !disabled {
                    let v = view.clone();
                    let id = nid.clone();
                    let nt = ntype.clone();
                    thumb = thumb.on_click(move |_, cx| {
                        emit_event(&v, &id, &nt, "click", json!("open"), cx);
                    });
                }
                thumb.into_any_element()
            } else {
                let sel_state = window.use_keyed_state(
                    (gpui::ElementId::from(eid.clone()), "sel"),
                    cx,
                    |_, _| {
                        items.iter().position(|it| {
                            it.get("selected").and_then(Value::as_bool) == Some(true)
                        })
                    },
                );
                let sel = *sel_state.read(cx);
                let mut row = h_stack().flex_wrap().gap_3();
                for (ix, item) in items.iter().enumerate() {
                    let url = item.get("url").and_then(Value::as_str).unwrap_or("");
                    let ratio = item.get("ratio").and_then(parse_ratio_value).unwrap_or(1.5);
                    let mut thumb = ImageThumbnail::new(
                        SharedString::from(format!("{eid}-th-{ix}")),
                        img_source(url),
                        ratio,
                    )
                    .selected(sel == Some(ix));
                    if let Some(lbl) = item
                        .get("content")
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                    {
                        thumb = thumb.label(lbl.to_owned());
                    }
                    if !disabled {
                        let st = sel_state.clone();
                        let v = view.clone();
                        let id = nid.clone();
                        let nt = ntype.clone();
                        let val = item
                            .get("value")
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned)
                            .unwrap_or_else(|| ix.to_string());
                        thumb = thumb.on_click(move |_, cx| {
                            st.update(cx, |s, cx| {
                                *s = Some(ix);
                                cx.notify();
                            });
                            emit_event(&v, &id, &nt, "click", json!(val), cx);
                        });
                    }
                    row = row.child(div().w(px(140.)).child(thumb));
                }
                row.into_any_element()
            }
        }
        "media/ImageUpload" => {
            let init_path = prop_str(node, "url")
                .filter(|u| !u.is_empty() && std::path::Path::new(u).exists())
                .map(PathBuf::from);
            let aspect = node
                .props
                .get("aspectRatio")
                .and_then(parse_ratio_value)
                .filter(|a| a.is_finite() && *a > 0.0);
            let state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "upload"),
                cx,
                |_, _| (init_path, None::<Crop>),
            );
            let (picked, crop) = state.read(cx).clone();
            let mut up =
                ImageUpload::new(gpui::ElementId::from(eid.clone()), picked, crop).aspect(aspect);
            if !disabled {
                let st1 = state.clone();
                let v1 = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                up = up.on_pick(move |path, _, cx| {
                    let s = path.to_string_lossy().into_owned();
                    st1.update(cx, |st, cx| {
                        st.0 = Some(path);
                        st.1 = None;
                        cx.notify();
                    });
                    emit_event(&v1, &sk1, &nt1, "change", json!({"path": s}), cx);
                });
                let st2 = state.clone();
                up = up.on_crop(move |c, _, cx| {
                    st2.update(cx, |st, cx| {
                        st.1 = Some(c);
                        cx.notify();
                    });
                });
                let st3 = state.clone();
                let v3 = view.clone();
                let id3 = nid.clone();
                let nt3 = ntype.clone();
                up = up.on_remove(move |_, cx| {
                    st3.update(cx, |st, cx| {
                        *st = (None, None);
                        cx.notify();
                    });
                    emit_event(&v3, &id3, &nt3, "ely:action", json!("remove"), cx);
                });
            }
            up.into_any_element()
        }
        "media/ImageViewer" => {
            let url = prop_str(node, "url").unwrap_or_default();
            div()
                .w_full()
                .h(px(260.))
                .child(ImageViewer::new(
                    gpui::ElementId::from(eid.clone()),
                    res_source(&url),
                ))
                .into_any_element()
        }
        "media/MediaControls" => {
            let init_play = prop_bool(node, "playing");
            let init_shuffle = prop_bool(node, "shuffle");
            let init_repeat = match prop_str(node, "repeat").as_deref() {
                Some("all") => Repeat::All,
                Some("one") => Repeat::One,
                _ => Repeat::Off,
            };
            let state =
                window.use_keyed_state((gpui::ElementId::from(eid.clone()), "mc"), cx, |_, _| {
                    (init_play, init_shuffle, init_repeat)
                });
            let (playing, shuffle, repeat) = *state.read(cx);
            let mut mc = MediaControls::new(gpui::ElementId::from(eid.clone()), playing);
            if !disabled {
                let st1 = state.clone();
                let v1 = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                mc = mc.on_play(move |p, _, cx| {
                    st1.update(cx, |s, cx| {
                        s.0 = p;
                        cx.notify();
                    });
                    emit_event(&v1, &sk1, &nt1, "change", json!({"playing": p}), cx);
                });
                let v2 = view.clone();
                let id2 = nid.clone();
                let nt2 = ntype.clone();
                mc = mc.on_back(move |_, cx| {
                    emit_event(&v2, &id2, &nt2, "ely:action", json!("back"), cx);
                });
                let v3 = view.clone();
                let id3 = nid.clone();
                let nt3 = ntype.clone();
                mc = mc.on_forward(move |_, cx| {
                    emit_event(&v3, &id3, &nt3, "ely:action", json!("forward"), cx);
                });
                let st2 = state.clone();
                mc = mc.shuffle(shuffle, move |sh, _, cx| {
                    st2.update(cx, |s, cx| {
                        s.1 = sh;
                        cx.notify();
                    });
                });
                let st3 = state.clone();
                mc = mc.repeat(repeat, move |rp, _, cx| {
                    st3.update(cx, |s, cx| {
                        s.2 = rp;
                        cx.notify();
                    });
                });
            }
            mc.into_any_element()
        }
        "media/MicLevelMeter" => {
            let items = extract_item_objects(node);
            if items.is_empty() {
                let lvl = clamp01(
                    prop_f64(node, "progress")
                        .or_else(|| prop_f64(node, "value"))
                        .unwrap_or(0.5) as f32,
                );
                MicLevelMeter::new(lvl).into_any_element()
            } else {
                let mut col = v_stack().gap_2();
                for item in items {
                    let lbl = item.get("label").and_then(Value::as_str).unwrap_or("Input");
                    let lvl =
                        clamp01(item.get("progress").and_then(value_to_f64).unwrap_or(0.5) as f32);
                    col = col.child(
                        v_stack()
                            .gap_1()
                            .child(Caption::new(lbl.to_owned()))
                            .child(MicLevelMeter::new(lvl)),
                    );
                }
                col.into_any_element()
            }
        }
        "media/PlaybackSpeedControl" => {
            let init_speed = snap_speed(prop_f64(node, "speed").unwrap_or(1.0));
            let speed_state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "speed"),
                cx,
                |_, _| init_speed,
            );
            let speed = snap_speed(f64::from(*speed_state.read(cx)));
            let mut ctrl = PlaybackSpeedControl::new(gpui::ElementId::from(eid.clone()), speed);
            if !disabled {
                let st = speed_state.clone();
                let v = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                ctrl = ctrl.on_change(move |s, _, cx| {
                    st.update(cx, |cur, cx| {
                        *cur = s;
                        cx.notify();
                    });
                    emit_event(&v, &sk1, &nt1, "change", json!(s), cx);
                });
            }
            ctrl.into_any_element()
        }
        "media/Playlist" => {
            let mut seen = HashSet::new();
            let mut def_cur = None;
            let mut actions = Vec::new();
            let default_action = prop_str(node, "playAction")
                .filter(|action| !action.is_empty())
                .unwrap_or_else(|| "play-track".to_owned());
            let tracks: Vec<Track> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .filter_map(|(ix, item)| {
                    let key = item
                        .get("value")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("track-{ix}"));
                    if !seen.insert(key.clone()) {
                        return None;
                    }
                    actions.push((
                        key.clone(),
                        item.get("action")
                            .and_then(Value::as_str)
                            .filter(|action| !action.is_empty())
                            .unwrap_or(&default_action)
                            .to_owned(),
                    ));
                    if def_cur.is_none()
                        && item.get("selected").and_then(Value::as_bool) == Some(true)
                    {
                        def_cur = Some(key.clone());
                    }
                    let len = item
                        .get("content")
                        .and_then(parse_duration_val)
                        .unwrap_or(Duration::from_secs(180));
                    Some(Track {
                        key: key.into(),
                        title: item
                            .get("label")
                            .and_then(Value::as_str)
                            .unwrap_or("Track")
                            .to_owned()
                            .into(),
                        artist: item
                            .get("artist")
                            .and_then(Value::as_str)
                            .unwrap_or("Artist")
                            .to_owned()
                            .into(),
                        length: len,
                    })
                })
                .collect();
            let playlist_id = gpui::ElementId::from(eid.clone());
            let generation = view_state.screen_generation();
            let initial = (def_cur, prop_bool(node, "playing"));
            let state = window.use_keyed_state((playlist_id.clone(), "state"), cx, |_, _| {
                (generation, initial.clone())
            });
            let (stored_generation, mut current) = state.read(cx).clone();
            if stored_generation != generation {
                current = initial.clone();
                state.update(cx, |state, cx| {
                    *state = (generation, initial);
                    cx.notify();
                });
            }
            let (cur, playing) = current;
            let mut pl = Playlist::new(playlist_id, tracks);
            if let Some(c) = cur {
                pl = pl.current(c, playing);
            }
            if !disabled {
                let st = state.clone();
                let v = view.clone();
                let sk1 = sk.clone();
                let id1 = nid.clone();
                let nt1 = ntype.clone();
                pl = pl.on_play(move |k, _, cx| {
                    st.update(cx, |s, cx| {
                        s.1 = (Some(k.to_string()), true);
                        cx.notify();
                    });
                    emit_event(&v, &sk1, &nt1, "change", json!(k.as_ref()), cx);
                    emit_event(
                        &v,
                        &id1,
                        &nt1,
                        "ely:change",
                        json!({"selection": k.as_ref(), "playing": true}),
                        cx,
                    );
                    if let Some((_, action)) = actions.iter().find(|(key, _)| key == k.as_ref()) {
                        emit_event(
                            &v,
                            &id1,
                            &nt1,
                            "ely:action",
                            json!({"action": action, "key": k.as_ref()}),
                            cx,
                        );
                    }
                });
            }
            div()
                .debug_selector(move || format!("playlist-playing-{playing}"))
                .child(pl)
                .into_any_element()
        }
        "media/ScreenRecorderControls" => {
            let init_rec = match prop_str(node, "recording").as_deref() {
                Some("running") => Recording::Running {
                    since: Instant::now(),
                },
                Some("paused") => {
                    let now = Instant::now();
                    Recording::Paused {
                        since: now,
                        at: now,
                    }
                }
                _ => Recording::Idle,
            };
            let init_mic = node
                .props
                .get("microphone")
                .and_then(Value::as_bool)
                .unwrap_or(true);
            let init_cam = prop_bool(node, "camera");
            let state =
                window.use_keyed_state((gpui::ElementId::from(eid.clone()), "rec"), cx, |_, _| {
                    (init_rec, init_mic, init_cam)
                });
            let (rec, mic, cam) = *state.read(cx);
            let mut ctrl = ScreenRecorderControls::new(gpui::ElementId::from(eid.clone()), rec);
            if !disabled {
                let st_r = state.clone();
                let v_r = view.clone();
                let id_r = nid.clone();
                let nt_r = ntype.clone();
                ctrl = ctrl.on_record(move |_, cx| {
                    st_r.update(cx, |s, cx| {
                        s.0 = Recording::Running {
                            since: Instant::now(),
                        };
                        cx.notify();
                    });
                    emit_event(&v_r, &id_r, &nt_r, "ely:action", json!("record"), cx);
                });
                let st_p = state.clone();
                let v_p = view.clone();
                let id_p = nid.clone();
                let nt_p = ntype.clone();
                ctrl = ctrl.on_pause(move |_, cx| {
                    st_p.update(cx, |s, cx| {
                        if let Recording::Running { since } = s.0 {
                            s.0 = Recording::Paused {
                                since,
                                at: Instant::now(),
                            };
                            cx.notify();
                        }
                    });
                    emit_event(&v_p, &id_p, &nt_p, "ely:action", json!("pause"), cx);
                });
                let st_res = state.clone();
                let v_res = view.clone();
                let id_res = nid.clone();
                let nt_res = ntype.clone();
                ctrl = ctrl.on_resume(move |_, cx| {
                    st_res.update(cx, |s, cx| {
                        if let Recording::Paused { since, at } = s.0 {
                            let paused_for = Instant::now().saturating_duration_since(at);
                            s.0 = Recording::Running {
                                since: since + paused_for,
                            };
                            cx.notify();
                        }
                    });
                    emit_event(&v_res, &id_res, &nt_res, "ely:action", json!("resume"), cx);
                });
                let st_st = state.clone();
                let v_st = view.clone();
                let id_st = nid.clone();
                let nt_st = ntype.clone();
                ctrl = ctrl.on_stop(move |_, cx| {
                    st_st.update(cx, |s, cx| {
                        s.0 = Recording::Idle;
                        cx.notify();
                    });
                    emit_event(&v_st, &id_st, &nt_st, "ely:action", json!("stop"), cx);
                });
                let st_m = state.clone();
                ctrl = ctrl.mic(mic, move |on, _, cx| {
                    st_m.update(cx, |s, cx| {
                        s.1 = on;
                        cx.notify();
                    });
                });
                let st_c = state.clone();
                ctrl = ctrl.camera(cam, move |on, _, cx| {
                    st_c.update(cx, |s, cx| {
                        s.2 = on;
                        cx.notify();
                    });
                });
            }
            ctrl.into_any_element()
        }
        "media/SubtitleEditor" => {
            let mut seen = HashSet::new();
            let mut cues: Vec<Cue> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .filter_map(|(ix, item)| {
                    let key = item
                        .get("value")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("cue-{ix}"));
                    if !seen.insert(key.clone()) {
                        return None;
                    }
                    let start = item
                        .get("start")
                        .and_then(parse_duration_val)
                        .unwrap_or(Duration::from_secs(ix as u64 * 3));
                    let raw_end = item
                        .get("end")
                        .and_then(parse_duration_val)
                        .unwrap_or(start + Duration::from_secs(2));
                    let end = raw_end.max(start + Duration::from_millis(100));
                    Some(Cue {
                        key: key.into(),
                        start,
                        end,
                        text: item
                            .get("content")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_owned()
                            .into(),
                    })
                })
                .collect();
            cues.sort_by_key(|c| c.start);
            let init_at = node
                .props
                .get("position")
                .and_then(parse_duration_val)
                .unwrap_or(Duration::ZERO);
            let state =
                window.use_keyed_state((gpui::ElementId::from(eid.clone()), "subs"), cx, |_, _| {
                    (cues, init_at)
                });
            let (cur_cues, cur_at) = state.read(cx).clone();
            let mut ed = SubtitleEditor::new(gpui::ElementId::from(eid.clone()), cur_cues, cur_at);
            if !disabled {
                let st1 = state.clone();
                let v1 = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                ed = ed.on_change(move |next, _, cx| {
                    let len = next.len();
                    st1.update(cx, |s, cx| {
                        s.0 = next.to_vec();
                        cx.notify();
                    });
                    emit_event(&v1, &sk1, &nt1, "change", json!({"cues": len}), cx);
                });
                let st2 = state.clone();
                ed = ed.on_seek(move |t, _, cx| {
                    st2.update(cx, |s, cx| {
                        s.1 = t;
                        cx.notify();
                    });
                });
            }
            ed.into_any_element()
        }
        "media/VideoPlayer" => {
            let ratio = parse_ratio(node, 16.0 / 9.0);
            let length =
                Duration::from_secs_f64(prop_f64(node, "duration").unwrap_or(90.0).max(1.0));
            let init_at =
                Duration::from_secs_f64(prop_f64(node, "position").unwrap_or(0.0).max(0.0))
                    .min(length);
            let loaded = Duration::from_secs_f64(prop_f64(node, "loaded").unwrap_or(0.0).max(0.0))
                .min(length);
            let init_play = prop_bool(node, "playing");
            let init_speed = snap_speed(prop_f64(node, "speed").unwrap_or(1.0));
            let init_caps = prop_bool(node, "captions");
            let caption_text = parse_json_array(node, "captionTrack")
                .into_iter()
                .find_map(|c| {
                    let start = c.get("start").and_then(value_to_f64).unwrap_or(0.0);
                    let end = c.get("end").and_then(value_to_f64).unwrap_or(0.0);
                    let pos = init_at.as_secs_f64();
                    if pos >= start && pos <= end {
                        c.get("text").and_then(Value::as_str).map(ToOwned::to_owned)
                    } else {
                        None
                    }
                });
            let state =
                window.use_keyed_state((gpui::ElementId::from(eid.clone()), "vp"), cx, |_, _| {
                    (init_at, init_play, init_speed, init_caps)
                });
            let (at, playing, speed, caps) = *state.read(cx);
            let frame = prop_str(node, "frameURL")
                .or_else(|| prop_str(node, "url"))
                .filter(|u| !u.is_empty())
                .map(|u| img_source(&u));
            let mut vp = VideoPlayer::new(
                gpui::ElementId::from(eid.clone()),
                frame,
                ratio,
                length,
                at.min(length),
            )
            .loaded(loaded)
            .playing(playing)
            .speed(snap_speed(f64::from(speed)))
            .captions(caps, caption_text.map(Into::into));
            if !disabled {
                let st1 = state.clone();
                let v1 = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                vp = vp.on_play(move |p, _, cx| {
                    st1.update(cx, |s, cx| {
                        s.1 = p;
                        cx.notify();
                    });
                    emit_event(&v1, &sk1, &nt1, "change", json!({"playing": p}), cx);
                });
                let st2 = state.clone();
                vp = vp.on_seek(move |t, _, cx| {
                    st2.update(cx, |s, cx| {
                        s.0 = t;
                        cx.notify();
                    });
                });
                let st3 = state.clone();
                vp = vp.on_speed(move |sp, _, cx| {
                    st3.update(cx, |s, cx| {
                        s.2 = sp;
                        cx.notify();
                    });
                });
                let st4 = state.clone();
                vp = vp.on_captions(move |on, _, cx| {
                    st4.update(cx, |s, cx| {
                        s.3 = on;
                        cx.notify();
                    });
                });
                let v5 = view.clone();
                let id5 = nid.clone();
                let nt5 = ntype.clone();
                vp = vp.on_picture(move |_, cx| {
                    emit_event(
                        &v5,
                        &id5,
                        &nt5,
                        "ely:action",
                        json!("picture-in-picture"),
                        cx,
                    );
                });
                let v6 = view.clone();
                let id6 = nid.clone();
                let nt6 = ntype.clone();
                vp = vp.on_fullscreen(move |_, cx| {
                    emit_event(&v6, &id6, &nt6, "ely:action", json!("fullscreen"), cx);
                });
            }
            vp.into_any_element()
        }
        "media/VideoThumbnailStrip" => {
            let mut frames: Vec<ImageSource> = parse_json_array(node, "frames")
                .into_iter()
                .filter_map(|f| {
                    f.get("url")
                        .and_then(Value::as_str)
                        .or_else(|| f.as_str())
                        .map(img_source)
                })
                .collect();
            if frames.is_empty() {
                frames.push(img_source(""));
            }
            let length =
                Duration::from_secs_f64(prop_f64(node, "duration").unwrap_or(90.0).max(2.0));
            let init_at =
                Duration::from_secs_f64(prop_f64(node, "position").unwrap_or(0.0).max(0.0))
                    .min(length);
            let init_trim = match (prop_f64(node, "trimStart"), prop_f64(node, "trimEnd")) {
                (Some(s), Some(e)) if s >= 0.0 && e <= length.as_secs_f64() && s + 1.0 <= e => {
                    Some((Duration::from_secs_f64(s), Duration::from_secs_f64(e)))
                }
                _ => None,
            };
            let state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "strip"),
                cx,
                |_, _| (init_at, init_trim),
            );
            let (at, trim) = *state.read(cx);
            let mut strip = VideoThumbnailStrip::new(
                gpui::ElementId::from(eid.clone()),
                frames,
                length,
                at.min(length),
            );
            if let Some((s, e)) = trim
                && s + Duration::from_secs(1) <= e
            {
                strip = strip.trim(s, e);
            }
            if !disabled {
                let st1 = state.clone();
                let v1 = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                strip = strip.on_seek(move |t, _, cx| {
                    st1.update(cx, |s, cx| {
                        s.0 = t;
                        cx.notify();
                    });
                    emit_event(
                        &v1,
                        &sk1,
                        &nt1,
                        "change",
                        json!({"position": t.as_secs_f64()}),
                        cx,
                    );
                });
                let st2 = state.clone();
                let v2 = view.clone();
                let sk2 = sk.clone();
                let nt2 = ntype.clone();
                strip = strip.on_trim(move |(a, b), _, cx| {
                    st2.update(cx, |s, cx| {
                        s.1 = Some((a, b));
                        cx.notify();
                    });
                    emit_event(
                        &v2,
                        &sk2,
                        &nt2,
                        "change",
                        json!({"trimStart": a.as_secs_f64(), "trimEnd": b.as_secs_f64()}),
                        cx,
                    );
                });
            }
            strip.into_any_element()
        }
        "media/VolumeControl" => {
            let init_vol = clamp01(prop_f64(node, "volume").unwrap_or(0.7) as f32);
            let init_muted = prop_bool(node, "muted");
            let state =
                window.use_keyed_state((gpui::ElementId::from(eid.clone()), "vol"), cx, |_, _| {
                    (init_vol, init_muted)
                });
            let (vol, muted) = *state.read(cx);
            let mut vc =
                VolumeControl::new(gpui::ElementId::from(eid.clone()), clamp01(vol), muted);
            if !disabled {
                let st1 = state.clone();
                let v1 = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                vc = vc.on_level(move |lvl, _, cx| {
                    st1.update(cx, |s, cx| {
                        s.0 = clamp01(lvl as f32);
                        cx.notify();
                    });
                    emit_event(&v1, &sk1, &nt1, "change", json!(lvl), cx);
                });
                let st2 = state.clone();
                let v2 = view.clone();
                let sk2 = sk.clone();
                let nt2 = ntype.clone();
                vc = vc.on_mute(move |m, _, cx| {
                    st2.update(cx, |s, cx| {
                        s.1 = m;
                        cx.notify();
                    });
                    emit_event(&v2, &sk2, &nt2, "change", json!({"muted": m}), cx);
                });
            }
            vc.into_any_element()
        }
        _ => return None,
    };
    Some(el)
}

fn render_misc(
    kind: &str,
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    _view_state: &CatalogueView,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> Option<AnyElement> {
    let disabled = prop_bool(node, "disabled");
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    let sk = state_key.to_owned();

    let el: AnyElement = match kind {
        "misc/Captcha" => {
            let url = prop_str(node, "url").unwrap_or_default();
            let ratio = parse_ratio(node, 3.0);
            let init_state = match prop_str(node, "state").as_deref() {
                Some("checking") => CaptchaState::Checking,
                Some("wrong") => CaptchaState::Wrong,
                Some("passed") => CaptchaState::Passed,
                _ => CaptchaState::Asking,
            };
            let cap_state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "captcha"),
                cx,
                |_, _| init_state,
            );
            let v = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let st1 = cap_state.clone();
            let mut cap = Captcha::new(
                gpui::ElementId::from(eid.clone()),
                img_source(&url),
                ratio,
                move |ans, _, cx| {
                    st1.update(cx, |s, cx| {
                        *s = CaptchaState::Checking;
                        cx.notify();
                    });
                    emit_event(&v, &sk1, &nt1, "change", json!(ans.as_ref()), cx);
                },
            )
            .state(*cap_state.read(cx));
            if !disabled {
                let v2 = view.clone();
                let id2 = nid.clone();
                let nt2 = ntype.clone();
                let st2 = cap_state.clone();
                cap = cap.on_refresh(move |_, cx| {
                    st2.update(cx, |s, cx| {
                        *s = CaptchaState::Asking;
                        cx.notify();
                    });
                    emit_event(&v2, &id2, &nt2, "ely:action", json!("refresh"), cx);
                });
            }
            cap.into_any_element()
        }
        "misc/ExportDialog" => {
            let open_state =
                window.use_keyed_state((gpui::ElementId::from(eid.clone()), "open"), cx, |_, _| {
                    prop_bool(node, "open")
                });
            let is_open = *open_state.read(cx);
            let title = non_empty_or(&best_title(node), &ntype);
            let btn_label = prop_str(node, "actionLabel").unwrap_or_else(|| match ntype.as_str() {
                "misc/CSVImporter" | "misc/ImportDialog" => "Import".into(),
                _ => "Export".into(),
            });
            let st_open = open_state.clone();
            let trigger = Button::new(SharedString::from(format!("{eid}-open")), btn_label)
                .variant(ButtonVariant::Secondary)
                .size(ControlSize::Sm)
                .disabled(disabled)
                .on_click(move |_, _, cx| {
                    st_open.update(cx, |o, cx| {
                        *o = true;
                        cx.notify();
                    });
                });
            if !is_open {
                trigger.into_any_element()
            } else if ntype == "misc/CSVImporter" || ntype == "misc/ImportDialog" {
                let mut fields: Vec<ImportField> = parse_json_array(node, "fields")
                    .into_iter()
                    .map(|f| {
                        let name = f.get("label").and_then(Value::as_str).unwrap_or("Field");
                        let req = f.get("required").and_then(Value::as_bool).unwrap_or(false);
                        let field = ImportField::new(name.to_owned());
                        if req { field.required() } else { field }
                    })
                    .collect();
                if fields.is_empty() {
                    fields.push(ImportField::new("Name").required());
                }
                let st_ok = open_state.clone();
                let st_cancel = open_state.clone();
                let v1 = view.clone();
                let id1 = nid.clone();
                let nt1 = ntype.clone();
                let v2 = view.clone();
                let id2 = nid.clone();
                let nt2 = ntype.clone();
                if ntype == "misc/CSVImporter" {
                    let csv =
                        prop_str(node, "csv").unwrap_or_else(|| "Name,Team\nAda,Engines\n".into());
                    v_stack()
                        .gap_2()
                        .child(trigger)
                        .child(CsvImporter::new(
                            gpui::ElementId::from(eid.clone()),
                            title,
                            csv,
                            fields,
                            move |rows, _, cx| {
                                st_ok.update(cx, |o, cx| {
                                    *o = false;
                                    cx.notify();
                                });
                                emit_event(
                                    &v1,
                                    &id1,
                                    &nt1,
                                    "ely:action",
                                    json!({"imported": rows.len()}),
                                    cx,
                                );
                            },
                            move |_, cx| {
                                st_cancel.update(cx, |o, cx| {
                                    *o = false;
                                    cx.notify();
                                });
                                emit_event(&v2, &id2, &nt2, "ely:action", json!("cancel"), cx);
                            },
                        ))
                        .into_any_element()
                } else {
                    let mut cols: Vec<String> = parse_json_array(node, "headers")
                        .into_iter()
                        .filter_map(|v| v.as_str().map(ToOwned::to_owned))
                        .collect();
                    if cols.is_empty() {
                        cols = vec!["Name".into(), "Team".into()];
                    }
                    v_stack()
                        .gap_2()
                        .child(trigger)
                        .child(ImportDialog::new(
                            gpui::ElementId::from(eid.clone()),
                            title,
                            cols,
                            fields,
                            move |map, _, cx| {
                                st_ok.update(cx, |o, cx| {
                                    *o = false;
                                    cx.notify();
                                });
                                emit_event(
                                    &v1,
                                    &id1,
                                    &nt1,
                                    "ely:action",
                                    json!({"mapped": map.len()}),
                                    cx,
                                );
                            },
                            move |_, cx| {
                                st_cancel.update(cx, |o, cx| {
                                    *o = false;
                                    cx.notify();
                                });
                                emit_event(&v2, &id2, &nt2, "ely:action", json!("cancel"), cx);
                            },
                        ))
                        .into_any_element()
                }
            } else {
                let mut formats: Vec<ExportFormat> = parse_json_array(node, "options")
                    .into_iter()
                    .filter_map(|opt| match opt.get("value").and_then(Value::as_str) {
                        Some("pdf") => Some(ExportFormat::Pdf),
                        Some("png") => Some(ExportFormat::Png),
                        Some("csv") => Some(ExportFormat::Csv),
                        Some("json") => Some(ExportFormat::Json),
                        _ => None,
                    })
                    .collect();
                if formats.is_empty() {
                    formats = vec![
                        ExportFormat::Pdf,
                        ExportFormat::Png,
                        ExportFormat::Csv,
                        ExportFormat::Json,
                    ];
                }
                let st_ok = open_state.clone();
                let st_cancel = open_state.clone();
                let v1 = view.clone();
                let id1 = nid.clone();
                let nt1 = ntype.clone();
                let v2 = view.clone();
                let id2 = nid.clone();
                let nt2 = ntype.clone();
                v_stack()
                    .gap_2()
                    .child(trigger)
                    .child(ExportDialog::new(
                        gpui::ElementId::from(eid.clone()),
                        title,
                        formats,
                        move |fmt, _, cx| {
                            st_ok.update(cx, |o, cx| {
                                *o = false;
                                cx.notify();
                            });
                            emit_event(&v1, &id1, &nt1, "ely:action", json!(fmt.extension()), cx);
                        },
                        move |_, cx| {
                            st_cancel.update(cx, |o, cx| {
                                *o = false;
                                cx.notify();
                            });
                            emit_event(&v2, &id2, &nt2, "ely:action", json!("cancel"), cx);
                        },
                    ))
                    .into_any_element()
            }
        }
        "misc/IframeEmbed" => {
            let url = prop_str(node, "url")
                .filter(|u| !u.is_empty())
                .unwrap_or_else(|| "https://example.com".into());
            IframeEmbed::new(
                gpui::ElementId::from(eid.clone()),
                url,
                parse_ratio(node, 16.0 / 9.0),
            )
            .into_any_element()
        }
        "misc/LicenseViewer" => {
            let mut packages: Vec<Package> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .map(|(ix, item)| {
                    Package::new(
                        item.get("label")
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned)
                            .unwrap_or_else(|| format!("package-{ix}")),
                        item.get("version")
                            .and_then(Value::as_str)
                            .unwrap_or("1.0.0")
                            .to_owned(),
                        item.get("license")
                            .and_then(Value::as_str)
                            .unwrap_or("MIT")
                            .to_owned(),
                        item.get("content")
                            .and_then(Value::as_str)
                            .unwrap_or("MIT License")
                            .to_owned(),
                    )
                })
                .collect();
            if packages.is_empty() {
                packages.push(Package::new(
                    "ely-gpui-component",
                    "0.1.0",
                    "MIT",
                    "MIT License",
                ));
            }
            LicenseViewer::new(gpui::ElementId::from(eid.clone()), packages).into_any_element()
        }
        "misc/QRCodeScanner" => {
            let ratio = parse_ratio(node, 4.0 / 3.0);
            let v = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let scanner = QrCodeScanner::new(
                gpui::ElementId::from(eid.clone()),
                ratio,
                move |code, _, cx| {
                    emit_event(&v, &sk1, &nt1, "change", json!(code.as_ref()), cx);
                },
            );
            if let Some(res) = prop_str(node, "result").or_else(|| prop_str(node, "value"))
                && !res.is_empty()
            {
                v_stack()
                    .gap_2()
                    .child(scanner)
                    .child(Caption::new(res))
                    .into_any_element()
            } else {
                scanner.into_any_element()
            }
        }
        "misc/Quiz" => {
            if prop_str(node, "mode").as_deref() == Some("flashcards") {
                let mut cards: Vec<(String, String)> = extract_item_objects(node)
                    .into_iter()
                    .map(|item| {
                        (
                            item.get("label")
                                .and_then(Value::as_str)
                                .unwrap_or("Front")
                                .to_owned(),
                            item.get("content")
                                .and_then(Value::as_str)
                                .unwrap_or("Back")
                                .to_owned(),
                        )
                    })
                    .collect();
                if cards.is_empty() {
                    cards.push(("Question".into(), "Answer".into()));
                }
                Flashcards::new(gpui::ElementId::from(eid.clone()), cards).into_any_element()
            } else {
                let mut questions: Vec<QuizQuestion> = parse_json_array(node, "questions")
                    .into_iter()
                    .map(|q| {
                        let prompt = q
                            .get("label")
                            .or_else(|| q.get("prompt"))
                            .and_then(Value::as_str)
                            .unwrap_or("Question")
                            .to_owned();
                        let opts_arr = q.get("options").and_then(Value::as_array);
                        let mut options: Vec<String> = Vec::new();
                        let mut vals: Vec<String> = Vec::new();
                        if let Some(arr) = opts_arr {
                            for (ix, o) in arr.iter().enumerate() {
                                if let Some(s) = o.as_str() {
                                    options.push(s.to_owned());
                                    vals.push(ix.to_string());
                                } else if let Some(obj) = o.as_object() {
                                    let lbl = obj
                                        .get("label")
                                        .and_then(Value::as_str)
                                        .unwrap_or("Option");
                                    let val = obj
                                        .get("value")
                                        .and_then(Value::as_str)
                                        .map(ToOwned::to_owned)
                                        .unwrap_or_else(|| ix.to_string());
                                    options.push(lbl.to_owned());
                                    vals.push(val);
                                }
                            }
                        }
                        while options.len() < 2 {
                            let ix = options.len();
                            options.push(format!("Option {}", ix + 1));
                            vals.push(ix.to_string());
                        }
                        let right = q
                            .get("correctValue")
                            .and_then(Value::as_str)
                            .and_then(|cv| {
                                vals.iter()
                                    .position(|v| v == cv)
                                    .or_else(|| cv.parse::<usize>().ok())
                            })
                            .unwrap_or(0)
                            .min(options.len() - 1);
                        QuizQuestion::new(prompt, options, right)
                    })
                    .collect();
                if questions.is_empty() {
                    questions.push(QuizQuestion::new(
                        non_empty_or(&best_label(node), "Question"),
                        ["Yes", "No"],
                        0,
                    ));
                }
                let v = view.clone();
                let id = nid.clone();
                let nt = ntype.clone();
                Quiz::new(gpui::ElementId::from(eid.clone()), questions)
                    .on_score(move |right, total, _, cx| {
                        emit_event(
                            &v,
                            &id,
                            &nt,
                            "change",
                            json!({"right": right, "total": total}),
                            cx,
                        );
                    })
                    .into_any_element()
            }
        }
        "misc/UnitConverter" => UnitConverter::new(eid.clone()).into_any_element(),
        "misc/WebView" => {
            let src = if let Some(url) = prop_str(node, "url").filter(|u| !u.is_empty()) {
                WebSource::Url(url.into())
            } else {
                let html = prop_str(node, "html")
                    .or_else(|| best_body(node))
                    .unwrap_or_else(|| "<html><body><p>Preview</p></body></html>".into());
                WebSource::Html(html.into())
            };
            div()
                .w_full()
                .h(px(220.))
                .child(WebView::new(gpui::ElementId::from(eid.clone()), src))
                .into_any_element()
        }
        _ => return None,
    };
    Some(el)
}

fn render_motion(
    kind: &str,
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    _view_state: &CatalogueView,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> Option<AnyElement> {
    let disabled = prop_bool(node, "disabled");
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    let sk = state_key.to_owned();

    let el: AnyElement = match kind {
        "motion/AnimatePresence" => {
            let init_rows: Vec<(String, String, bool)> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .map(|(ix, item)| {
                    let key = item
                        .get("value")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("row-{ix}"));
                    let label = item
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or(&key)
                        .to_owned();
                    (key, label, true)
                })
                .collect();
            let state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "presence"),
                cx,
                |_, _| {
                    if init_rows.is_empty() {
                        vec![("item-0".into(), "Item".into(), true)]
                    } else {
                        init_rows
                    }
                },
            );
            let add_pool: Vec<(String, String)> = parse_json_array(node, "addItems")
                .into_iter()
                .enumerate()
                .map(|(ix, item)| {
                    let key = item
                        .get("value")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("add-{ix}"));
                    let label = item
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or(&key)
                        .to_owned();
                    (key, label)
                })
                .collect();
            let list = state.read(cx).clone();
            let st_gone = state.clone();
            let mut ap = AnimatePresence::new(eid.clone()).on_gone(move |gone_key, _, cx| {
                st_gone.update(cx, |rows, cx| {
                    rows.retain(|(k, _, _)| k != gone_key.as_ref());
                    cx.notify();
                });
            });
            let colors = cx.theme().colors.clone();
            let radius = cx.theme().radius(Radius::Md);
            for (k, lbl, shown) in list {
                let st_rm = state.clone();
                let v_rm = view.clone();
                let sk_rm = sk.clone();
                let nt_rm = ntype.clone();
                let k_rm = k.clone();
                let row = h_stack()
                    .justify_between()
                    .px_3()
                    .py_2()
                    .rounded(radius)
                    .border_1()
                    .border_color(colors.border)
                    .bg(colors.surface)
                    .child(Label::new(lbl))
                    .child(
                        IconButton::new(SharedString::from(format!("{eid}-rm-{k}")), IconName::X)
                            .variant(ButtonVariant::Ghost)
                            .size(ControlSize::Sm)
                            .disabled(disabled)
                            .on_click(move |_, _, cx| {
                                st_rm.update(cx, |rows, cx| {
                                    for row in rows.iter_mut() {
                                        if row.0 == k_rm {
                                            row.2 = false;
                                        }
                                    }
                                    cx.notify();
                                });
                                emit_event(
                                    &v_rm,
                                    &sk_rm,
                                    &nt_rm,
                                    "change",
                                    json!({"remove": k_rm}),
                                    cx,
                                );
                            }),
                    );
                ap = ap.row(k, shown, row);
            }
            let add_lbl = prop_str(node, "addLabel").unwrap_or_else(|| "Add".into());
            let st_add = state.clone();
            let v_add = view.clone();
            let id_add = nid.clone();
            let nt_add = ntype.clone();
            v_stack()
                .gap_2()
                .child(ap)
                .child(
                    Button::new(SharedString::from(format!("{eid}-add")), add_lbl)
                        .variant(ButtonVariant::Secondary)
                        .size(ControlSize::Sm)
                        .disabled(disabled)
                        .on_click(move |_, _, cx| {
                            st_add.update(cx, |rows, cx| {
                                let ix = rows.len();
                                let (k, lbl) = add_pool
                                    .get(ix % add_pool.len().max(1))
                                    .cloned()
                                    .unwrap_or_else(|| (format!("tag-{ix}"), format!("Item {ix}")));
                                rows.push((format!("{k}-{ix}"), lbl, true));
                                cx.notify();
                            });
                            emit_event(&v_add, &id_add, &nt_add, "click", json!("add"), cx);
                        }),
                )
                .into_any_element()
        }
        "motion/Blink" => {
            let turn =
                window.use_keyed_state((gpui::ElementId::from(eid.clone()), "turn"), cx, |_, _| {
                    0usize
                });
            let cur = *turn.read(cx);
            let text = best_body(node)
                .or_else(|| prop_str(node, "label"))
                .unwrap_or_else(|| "Cue".into());
            let inner = match ntype.as_str() {
                "motion/Flash" => Flash::new(gpui::ElementId::from(eid.clone()), cur)
                    .px_3()
                    .py_2()
                    .rounded(cx.theme().radius(Radius::Md))
                    .child(Label::new(text))
                    .into_any_element(),
                "motion/Shake" => Shake::new(gpui::ElementId::from(eid.clone()), cur)
                    .px_3()
                    .py_2()
                    .child(Label::new(text))
                    .into_any_element(),
                _ => Blink::new(eid.clone())
                    .px_3()
                    .py_2()
                    .child(Label::new(text))
                    .into_any_element(),
            };
            if let Some(act) = prop_str(node, "actionLabel").filter(|s| !s.is_empty()) {
                let st = turn.clone();
                let v = view.clone();
                let id = nid.clone();
                let nt = ntype.clone();
                h_stack()
                    .gap_2()
                    .child(inner)
                    .child(
                        Button::new(SharedString::from(format!("{eid}-cue")), act)
                            .variant(ButtonVariant::Secondary)
                            .size(ControlSize::Sm)
                            .disabled(disabled)
                            .on_click(move |_, _, cx| {
                                st.update(cx, |n, cx| {
                                    *n += 1;
                                    cx.notify();
                                });
                                emit_event(&v, &id, &nt, "click", json!("trigger"), cx);
                            }),
                    )
                    .into_any_element()
            } else {
                inner
            }
        }
        "motion/Flip" => {
            let init_items: Vec<(String, String)> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .map(|(ix, item)| {
                    let k = item
                        .get("value")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("f-{ix}"));
                    let l = item
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or(&k)
                        .to_owned();
                    (k, l)
                })
                .collect();
            let state =
                window.use_keyed_state((gpui::ElementId::from(eid.clone()), "flip"), cx, |_, _| {
                    if init_items.is_empty() {
                        vec![("a".into(), "First".into()), ("b".into(), "Second".into())]
                    } else {
                        init_items
                    }
                });
            let colors = cx.theme().colors.clone();
            let mut flip = Flip::new(eid.clone());
            for (k, lbl) in state.read(cx).iter() {
                flip = flip.row(
                    k.clone(),
                    div()
                        .px_3()
                        .py_2()
                        .border_b_1()
                        .border_color(colors.border)
                        .bg(colors.surface)
                        .child(Label::new(lbl.clone())),
                );
            }
            let st = state.clone();
            let v = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            v_stack()
                .gap_2()
                .child(flip)
                .child(
                    Button::new(SharedString::from(format!("{eid}-shuf")), "Shuffle")
                        .variant(ButtonVariant::Secondary)
                        .size(ControlSize::Sm)
                        .disabled(disabled)
                        .on_click(move |_, _, cx| {
                            st.update(cx, |rows, cx| {
                                if rows.len() > 1 {
                                    rows.rotate_left(1);
                                }
                                cx.notify();
                            });
                            emit_event(&v, &sk1, &nt1, "change", json!("shuffle"), cx);
                        }),
                )
                .into_any_element()
        }
        "motion/Glow" => {
            let label = non_empty_or(&best_body(node).unwrap_or_else(|| best_label(node)), "Glow");
            let theme = cx.theme();
            let pill = div()
                .px_3()
                .py_2()
                .rounded(theme.radius(Radius::Md))
                .border_1()
                .border_color(theme.colors.border)
                .bg(theme.colors.surface)
                .child(Label::new(label));
            if ntype == "motion/Pulse" {
                Pulse::new(eid.clone()).child(pill).into_any_element()
            } else {
                Glow::new(eid.clone())
                    .rounded(theme.radius(Radius::Md))
                    .child(pill)
                    .into_any_element()
            }
        }
        "motion/LazyLoad" => {
            let label = non_empty_or(&best_label(node), "Lazy loaded content");
            let colors = cx.theme().colors.clone();
            let radius = cx.theme().radius(Radius::Md);
            LazyLoad::new(gpui::ElementId::from(eid.clone()), px(72.), move |_, _| {
                div()
                    .p_3()
                    .rounded(radius)
                    .border_1()
                    .border_color(colors.border)
                    .bg(colors.surface)
                    .child(Label::new(label))
            })
            .into_any_element()
        }
        "motion/LoadingOverlay" => {
            let loading_state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "loading"),
                cx,
                |_, _| prop_bool(node, "loading"),
            );
            let loading = *loading_state.read(cx);
            let mut list = v_stack().gap_1().p_3();
            let items = extract_item_objects(node);
            if items.is_empty() {
                list = list.child(Label::new(non_empty_or(
                    &best_body(node).unwrap_or_default(),
                    "Content",
                )));
            } else {
                for item in items {
                    let lbl = item.get("label").and_then(Value::as_str).unwrap_or("Item");
                    list = list.child(Label::new(lbl.to_owned()));
                }
            }
            let mut overlay = LoadingOverlay::new(gpui::ElementId::from(eid.clone()), loading)
                .rounded(cx.theme().radius(Radius::Md))
                .border_1()
                .border_color(cx.theme().colors.border)
                .child(list);
            if let Some(lbl) = prop_str(node, "loadingLabel").filter(|s| !s.is_empty()) {
                overlay = overlay.label(lbl);
            }
            let act_lbl = prop_str(node, "actionLabel").unwrap_or_else(|| "Toggle loading".into());
            let st = loading_state.clone();
            let v = view.clone();
            let id = nid.clone();
            let nt = ntype.clone();
            v_stack()
                .gap_2()
                .child(overlay)
                .child(
                    Button::new(SharedString::from(format!("{eid}-tog")), act_lbl)
                        .variant(ButtonVariant::Secondary)
                        .size(ControlSize::Sm)
                        .disabled(disabled)
                        .on_click(move |_, _, cx| {
                            let next = st.update(cx, |b, cx| {
                                *b = !*b;
                                cx.notify();
                                *b
                            });
                            emit_event(&v, &id, &nt, "change", json!(next), cx);
                        }),
                )
                .into_any_element()
        }
        "motion/Marquee" => {
            let mut labels: Vec<String> = extract_item_objects(node)
                .into_iter()
                .filter_map(|it| {
                    it.get("label")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                })
                .collect();
            if labels.is_empty() {
                labels.push(non_empty_or(
                    &best_body(node).unwrap_or_else(|| best_label(node)),
                    "Marquee",
                ));
            }
            let joined = labels.join("   ·   ");
            Marquee::new(gpui::ElementId::from(eid.clone()), move || {
                div().px_4().py_2().child(Label::new(joined.clone()))
            })
            .w_full()
            .into_any_element()
        }
        "motion/ParticleBackground" => {
            let text = non_empty_or(
                &best_body(node).unwrap_or_else(|| best_label(node)),
                "Background",
            );
            let theme = cx.theme();
            let r = theme.radius(Radius::Lg);
            if ntype == "motion/AnimatedGradient" {
                AnimatedGradient::new(eid.clone())
                    .w_full()
                    .min_h(px(88.))
                    .rounded(r)
                    .p_4()
                    .child(Label::new(text))
                    .into_any_element()
            } else {
                ParticleBackground::new(eid.clone())
                    .w_full()
                    .min_h(px(88.))
                    .rounded(r)
                    .border_1()
                    .border_color(theme.colors.border)
                    .p_4()
                    .child(Label::new(text))
                    .into_any_element()
            }
        }
        "motion/RefreshIndicator" => {
            if ntype == "motion/TypingIndicator" {
                let who = node
                    .props
                    .get("typing")
                    .and_then(Value::as_array)
                    .and_then(|a| a.first())
                    .and_then(|v| v.get("who"))
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned);
                let mut ti = TypingIndicator::new(eid.clone());
                if let Some(w) = prop_str(node, "who").or(who).filter(|s| !s.is_empty()) {
                    ti = ti.who(w);
                }
                ti.into_any_element()
            } else {
                let phase_state = window.use_keyed_state(
                    (gpui::ElementId::from(eid.clone()), "refresh"),
                    cx,
                    |_, _| 0u8,
                );
                let phase = match *phase_state.read(cx) % 4 {
                    0 => Refresh::Pulling(0.75),
                    1 => Refresh::Refreshing,
                    2 => Refresh::Done,
                    _ => Refresh::Idle,
                };
                let st = phase_state.clone();
                let v = view.clone();
                let id = nid.clone();
                let nt = ntype.clone();
                let act = prop_str(node, "actionLabel").unwrap_or_else(|| "Refresh".into());
                h_stack()
                    .gap_3()
                    .child(RefreshIndicator::new(
                        gpui::ElementId::from(eid.clone()),
                        phase,
                    ))
                    .child(
                        Button::new(SharedString::from(format!("{eid}-act")), act)
                            .variant(ButtonVariant::Secondary)
                            .size(ControlSize::Sm)
                            .disabled(disabled)
                            .on_click(move |_, _, cx| {
                                st.update(cx, |p, cx| {
                                    *p = (*p + 1) % 4;
                                    cx.notify();
                                });
                                emit_event(&v, &id, &nt, "ely:action", json!("refresh"), cx);
                            }),
                    )
                    .into_any_element()
            }
        }
        "motion/Reorder" => {
            let init_rows: Vec<(String, String)> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .map(|(ix, item)| {
                    let k = item
                        .get("value")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("r-{ix}"));
                    let l = item
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or(&k)
                        .to_owned();
                    (k, l)
                })
                .collect();
            let state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "reorder"),
                cx,
                |_, _| {
                    if init_rows.is_empty() {
                        vec![("0".into(), "First".into()), ("1".into(), "Second".into())]
                    } else {
                        init_rows
                    }
                },
            );
            let colors = cx.theme().colors.clone();
            let mut reorder = Reorder::new(eid.clone());
            for (k, lbl) in state.read(cx).iter() {
                reorder = reorder.row(
                    k.clone(),
                    h_stack()
                        .justify_between()
                        .px_3()
                        .py_2()
                        .border_b_1()
                        .border_color(colors.border)
                        .bg(colors.surface)
                        .child(Label::new(lbl.clone()))
                        .child(
                            Icon::new(IconName::GripVertical)
                                .size(IconSize::Sm)
                                .color(colors.fg_subtle),
                        ),
                );
            }
            if !disabled {
                let st = state.clone();
                let v = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                reorder = reorder.on_reorder(move |from, to, _, cx| {
                    st.update(cx, |rows, cx| {
                        if from < rows.len() && to < rows.len() {
                            let item = rows.remove(from);
                            rows.insert(to, item);
                            cx.notify();
                        }
                    });
                    emit_event(
                        &v,
                        &sk1,
                        &nt1,
                        "change",
                        json!({"from": from, "to": to}),
                        cx,
                    );
                });
            }
            reorder.into_any_element()
        }
        "motion/Ripple" => {
            let bursts_state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "bursts"),
                cx,
                |_, _| 0usize,
            );
            let bursts = *bursts_state.read(cx);
            let label = non_empty_or(&best_label(node), "Press anywhere");
            let theme = cx.theme();
            let ripple = Ripple::new(eid.clone())
                .w_full()
                .min_h(px(72.))
                .rounded(theme.radius(Radius::Lg))
                .border_1()
                .border_color(theme.colors.border)
                .bg(theme.colors.surface)
                .flex()
                .items_center()
                .justify_center()
                .child(Label::new(label));
            if ntype == "motion/Confetti" || prop_bool(node, "confetti") {
                let st = bursts_state.clone();
                let v = view.clone();
                let id = nid.clone();
                let nt = ntype.clone();
                div()
                    .relative()
                    .w_full()
                    .child(ripple)
                    .child(Confetti::new(
                        SharedString::from(format!("{eid}-confetti")),
                        bursts,
                    ))
                    .child(
                        div().pt_2().child(
                            Button::new(SharedString::from(format!("{eid}-cel")), "Celebrate")
                                .variant(ButtonVariant::Secondary)
                                .size(ControlSize::Sm)
                                .disabled(disabled)
                                .on_click(move |_, _, cx| {
                                    st.update(cx, |b, cx| {
                                        *b += 1;
                                        cx.notify();
                                    });
                                    emit_event(&v, &id, &nt, "click", json!("celebrate"), cx);
                                }),
                        ),
                    )
                    .into_any_element()
            } else {
                ripple.into_any_element()
            }
        }
        "motion/Shimmer" => {
            let loaded_state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "loaded"),
                cx,
                |_, _| false,
            );
            let loaded = *loaded_state.read(cx);
            let content_box = if loaded {
                Card::new()
                    .header(CardHeader::new(non_empty_or(
                        &prop_str(node, "contentTitle").unwrap_or_default(),
                        "Loaded",
                    )))
                    .child(Paragraph::new(best_body(node).unwrap_or_default()))
                    .into_any_element()
            } else {
                Shimmer::new(eid.clone())
                    .w_full()
                    .rounded(cx.theme().radius(Radius::Lg))
                    .child(SkeletonCard::new(SharedString::from(format!("{eid}-skel"))))
                    .into_any_element()
            };
            let act = prop_str(node, "actionLabel").unwrap_or_else(|| "Load".into());
            let st = loaded_state.clone();
            let v = view.clone();
            let id = nid.clone();
            let nt = ntype.clone();
            v_stack()
                .gap_2()
                .child(content_box)
                .child(
                    Button::new(SharedString::from(format!("{eid}-load")), act)
                        .variant(ButtonVariant::Secondary)
                        .size(ControlSize::Sm)
                        .disabled(disabled)
                        .on_click(move |_, _, cx| {
                            let next = st.update(cx, |b, cx| {
                                *b = !*b;
                                cx.notify();
                                *b
                            });
                            emit_event(&v, &id, &nt, "click", json!(next), cx);
                        }),
                )
                .into_any_element()
        }
        "motion/Stagger" => {
            let step_ms = prop_f64(node, "step").unwrap_or(60.0).max(0.0) as u64;
            let mut stagger = Stagger::new(eid.clone()).step(Duration::from_millis(step_ms));
            let items = extract_item_objects(node);
            if items.is_empty() {
                stagger = stagger.child(Label::new(non_empty_or(&best_label(node), "Item")));
            } else {
                let theme = cx.theme();
                for item in items {
                    let lbl = item.get("label").and_then(Value::as_str).unwrap_or("Item");
                    stagger = stagger.child(
                        div()
                            .px_3()
                            .py_2()
                            .border_b_1()
                            .border_color(theme.colors.border)
                            .child(Label::new(lbl.to_owned())),
                    );
                }
            }
            stagger.into_any_element()
        }
        "motion/Suspense" => {
            let loading_state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "suspense"),
                cx,
                |_, _| false,
            );
            let loading = *loading_state.read(cx);
            let body_text = non_empty_or(&best_body(node).unwrap_or_default(), "Loaded content");
            let mut susp = if loading {
                Suspense::new::<AnyElement>(gpui::ElementId::from(eid.clone()), None)
            } else {
                Suspense::new(
                    gpui::ElementId::from(eid.clone()),
                    Some(Ok(div()
                        .p_3()
                        .child(Paragraph::new(body_text))
                        .into_any_element())),
                )
            };
            let st = loading_state.clone();
            let v = view.clone();
            let id = nid.clone();
            let nt = ntype.clone();
            if !disabled {
                susp = susp.on_retry(move |_, cx| {
                    st.update(cx, |b, cx| {
                        *b = false;
                        cx.notify();
                    });
                    emit_event(&v, &id, &nt, "ely:action", json!("retry"), cx);
                });
            }
            susp.into_any_element()
        }
        "motion/Transition" => {
            let shown_state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "shown"),
                cx,
                |_, _| true,
            );
            let shown = *shown_state.read(cx);
            let entrance = match prop_str(node, "entrance").as_deref() {
                Some("rise") => Entrance::Rise,
                Some("slide") => Entrance::Slide,
                _ => Entrance::Fade,
            };
            let body = non_empty_or(
                &best_body(node).unwrap_or_else(|| best_label(node)),
                "Content",
            );
            let theme = cx.theme();
            let tr = Transition::new(gpui::ElementId::from(eid.clone()), shown)
                .entrance(entrance)
                .child(
                    div()
                        .px_4()
                        .py_3()
                        .rounded(theme.radius(Radius::Md))
                        .border_1()
                        .border_color(theme.colors.border)
                        .bg(theme.colors.surface)
                        .child(Label::new(body)),
                );
            let st = shown_state.clone();
            let v = view.clone();
            let id = nid.clone();
            let nt = ntype.clone();
            v_stack()
                .gap_2()
                .child(tr)
                .child(
                    Button::new(
                        SharedString::from(format!("{eid}-tog")),
                        if shown { "Hide" } else { "Show" },
                    )
                    .variant(ButtonVariant::Secondary)
                    .size(ControlSize::Sm)
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        let next = st.update(cx, |b, cx| {
                            *b = !*b;
                            cx.notify();
                            *b
                        });
                        emit_event(&v, &id, &nt, "change", json!(next), cx);
                    }),
                )
                .into_any_element()
        }
        "motion/UploadList" => {
            let init_uploads: Vec<Upload> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .map(|(ix, item)| {
                    let name = item
                        .get("label")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("file-{ix}"));
                    let status = item.get("state").and_then(Value::as_str).unwrap_or("done");
                    let prog = item.get("progress").and_then(value_to_f64).unwrap_or(50.0);
                    let state = match status {
                        "uploading" => UploadState::Uploading(norm_share(prog)),
                        "failed" => UploadState::Failed(
                            item.get("error")
                                .and_then(Value::as_str)
                                .unwrap_or("Upload failed")
                                .to_owned()
                                .into(),
                        ),
                        _ => UploadState::Done,
                    };
                    Upload {
                        name: name.into(),
                        bytes: item
                            .get("bytes")
                            .and_then(value_to_f64)
                            .unwrap_or(1_024_000.0)
                            .max(0.0) as u64,
                        state,
                    }
                })
                .collect();
            let state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "uploads"),
                cx,
                |_, _| init_uploads,
            );
            let mut ul =
                UploadList::new(gpui::ElementId::from(eid.clone()), state.read(cx).clone());
            if !disabled {
                let st1 = state.clone();
                let v1 = view.clone();
                let id1 = nid.clone();
                let nt1 = ntype.clone();
                ul = ul.on_cancel(move |ix, _, cx| {
                    st1.update(cx, |list, cx| {
                        if ix < list.len() {
                            list.remove(ix);
                            cx.notify();
                        }
                    });
                    emit_event(&v1, &id1, &nt1, "ely:action", json!({"cancel": ix}), cx);
                });
                let st2 = state.clone();
                let v2 = view.clone();
                let id2 = nid.clone();
                let nt2 = ntype.clone();
                ul = ul.on_retry(move |ix, _, cx| {
                    st2.update(cx, |list, cx| {
                        if let Some(u) = list.get_mut(ix) {
                            u.state = UploadState::Uploading(0.5);
                            cx.notify();
                        }
                    });
                    emit_event(&v2, &id2, &nt2, "ely:action", json!({"retry": ix}), cx);
                });
                let st3 = state.clone();
                let v3 = view.clone();
                let id3 = nid.clone();
                let nt3 = ntype.clone();
                ul = ul.on_remove(move |ix, _, cx| {
                    st3.update(cx, |list, cx| {
                        if ix < list.len() {
                            list.remove(ix);
                            cx.notify();
                        }
                    });
                    emit_event(&v3, &id3, &nt3, "ely:action", json!({"remove": ix}), cx);
                });
            }
            ul.into_any_element()
        }
        _ => return None,
    };
    Some(el)
}

fn render_rendering_settings(
    kind: &str,
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> Option<AnyElement> {
    let disabled = prop_bool(node, "disabled");
    let ntype = node.node_type.clone();
    let sk = state_key.to_owned();

    match kind {
        "rendering/RenderSurface" => {
            let ratio = parse_ratio(node, 2.0);
            let pos = clamp01(prop_f64(node, "position").unwrap_or(0.2) as f32);
            let rev_prop = prop_f64(node, "revision").unwrap_or(0.0).max(0.0) as u64;
            let colors = &cx.theme().colors;
            let (ground, ink) = (colors.sunken, colors.accent);
            let mut hasher = DefaultHasher::new();
            for val in [pos, ground.h, ground.s, ground.l, ink.h, ink.s, ink.l] {
                val.to_bits().hash(&mut hasher);
            }
            rev_prop.hash(&mut hasher);
            let rev = hasher.finish();
            let bg_rgba = Rgba::from(ground);
            let fg_rgba = Rgba::from(ink);
            let to_bgra = |c: Rgba| -> [u8; 4] {
                [
                    (c.b.clamp(0.0, 1.0) * 255.0).round() as u8,
                    (c.g.clamp(0.0, 1.0) * 255.0).round() as u8,
                    (c.r.clamp(0.0, 1.0) * 255.0).round() as u8,
                    255,
                ]
            };
            let bg_px = to_bgra(bg_rgba);
            let fg_px = to_bgra(fg_rgba);
            let surface = RenderSurface::new(
                gpui::ElementId::from(eid.clone()),
                ratio,
                move |size: Size<DevicePixels>, _| {
                    let w = size.width.0.max(1) as u32;
                    let h = size.height.0.max(1) as u32;
                    let cx_pos = pos * w as f32;
                    let cy_pos = h as f32 * 0.5;
                    let r_big = (h as f32 * 0.45).max(2.0);
                    let r2 = r_big * r_big;
                    let buf = image::RgbaImage::from_fn(w, h, |x, y| {
                        let dx = x as f32 - cx_pos;
                        let dy = y as f32 - cy_pos;
                        if dx * dx + dy * dy <= r2 {
                            image::Rgba(fg_px)
                        } else {
                            image::Rgba(bg_px)
                        }
                    });
                    RenderImage::new(vec![image::Frame::new(buf)])
                },
            )
            .revision(rev);
            let el = div()
                .w_full()
                .max_w(px(360.))
                .child(surface)
                .into_any_element();
            Some(el)
        }
        "settings/SettingsLayout" => {
            let raw_items = extract_item_objects(node);
            let sections_data: Vec<(
                String,
                String,
                IconName,
                Vec<serde_json::Map<String, Value>>,
            )> = if raw_items.is_empty() {
                vec![(
                    "general".into(),
                    non_empty_or(&best_title(node), "General"),
                    IconName::Settings,
                    Vec::new(),
                )]
            } else {
                raw_items
                    .into_iter()
                    .enumerate()
                    .map(|(ix, item)| {
                        let name = item
                            .get("label")
                            .and_then(Value::as_str)
                            .unwrap_or("Section")
                            .to_owned();
                        let key = item
                            .get("value")
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned)
                            .unwrap_or_else(|| format!("sec-{ix}"));
                        let icon = parse_icon(
                            item.get("icon").and_then(Value::as_str),
                            IconName::Settings,
                        );
                        let fields = item
                            .get("fields")
                            .and_then(Value::as_array)
                            .map(|a| a.iter().filter_map(|v| v.as_object().cloned()).collect())
                            .unwrap_or_default();
                        (key, name, icon, fields)
                    })
                    .collect()
            };
            let default_key = sections_data[0].0.clone();
            let sel_state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "section"),
                cx,
                |_, _| default_key,
            );
            let active_key = view_state
                .value(state_key)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| sel_state.read(cx).clone());
            let active_sec = sections_data
                .iter()
                .find(|(k, _, _, _)| *k == active_key)
                .unwrap_or(&sections_data[0]);
            let mut section_view = SettingsSection::new(active_sec.1.clone());
            for (fix, field) in active_sec.3.iter().enumerate() {
                let flabel = field
                    .get("label")
                    .and_then(Value::as_str)
                    .unwrap_or("Setting");
                let fdesc = field.get("text").and_then(Value::as_str);
                let ftype = field.get("type").and_then(Value::as_str).unwrap_or("");
                let fname = field
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("setting")
                    .to_owned();
                let ctrl: AnyElement = if ftype == "checkbox" {
                    let chk = field
                        .get("checked")
                        .and_then(Value::as_bool)
                        .unwrap_or(false);
                    let v = view.clone();
                    let nt = ntype.clone();
                    let fk = format!("{sk}:{fname}");
                    Switch::new(SharedString::from(format!("{eid}-sr-{fix}")), chk)
                        .disabled(disabled)
                        .on_change(move |on, _, cx| {
                            emit_event(&v, &fk, &nt, "change", json!(on), cx);
                        })
                        .into_any_element()
                } else if ftype == "segments"
                    && let Some(opts) = field.get("options").and_then(Value::as_array)
                {
                    let choices: Vec<Choice> = opts
                        .iter()
                        .enumerate()
                        .map(|(oix, o)| {
                            let l = o.get("label").and_then(Value::as_str).unwrap_or("Opt");
                            let val = o
                                .get("value")
                                .and_then(Value::as_str)
                                .map(ToOwned::to_owned)
                                .unwrap_or_else(|| format!("opt-{oix}"));
                            Choice::new(val, l.to_owned())
                        })
                        .collect();
                    if choices.is_empty() {
                        Caption::new("").into_any_element()
                    } else {
                        let cur = field
                            .get("value")
                            .and_then(Value::as_str)
                            .unwrap_or(choices[0].value.as_ref())
                            .to_owned();
                        let v = view.clone();
                        let nt = ntype.clone();
                        let fk = format!("{sk}:{fname}");
                        let mut seg = SegmentedControl::new(
                            SharedString::from(format!("{eid}-seg-{fix}")),
                            cur,
                        );
                        for ch in choices {
                            seg = seg.segment(ch.value, ch.label, None);
                        }
                        seg.on_change(move |val, _, cx| {
                            if disabled {
                                return;
                            }
                            emit_event(&v, &fk, &nt, "change", json!(val.as_ref()), cx);
                        })
                        .into_any_element()
                    }
                } else {
                    let val_txt = field
                        .get("value")
                        .and_then(|v| {
                            v.as_str()
                                .map(ToOwned::to_owned)
                                .or_else(|| Some(v.to_string()))
                        })
                        .unwrap_or_default();
                    Caption::new(val_txt).into_any_element()
                };
                let mut row = SettingsRow::new(flabel.to_owned()).control(ctrl);
                if let Some(d) = fdesc {
                    row = row.description(d.to_owned());
                }
                section_view = section_view.row(row);
            }
            let sec_tuples = sections_data
                .iter()
                .map(|(k, n, ic, _)| (k.clone(), n.clone(), *ic))
                .collect::<Vec<_>>();
            let st = sel_state.clone();
            let v = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let layout = SettingsLayout::new(
                gpui::ElementId::from(eid.clone()),
                sec_tuples,
                active_sec.0.clone(),
                move |k, _, cx| {
                    st.update(cx, |cur, cx| {
                        *cur = k.to_string();
                        cx.notify();
                    });
                    emit_event(&v, &sk1, &nt1, "change", json!(k.as_ref()), cx);
                },
            )
            .page(section_view);
            Some(layout.into_any_element())
        }
        _ => None,
    }
}

fn render_shell(
    kind: &str,
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> Option<AnyElement> {
    let disabled = prop_bool(node, "disabled");
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    let sk = state_key.to_owned();

    let el: AnyElement = match kind {
        "shell/AboutDialog" => {
            let name = non_empty_or(&best_label(node), "Application");
            let version = prop_str(node, "value").unwrap_or_else(|| "0.1.0".into());
            let mut about = AboutDialog::new(name, version);
            if let Some(desc) = best_body(node).filter(|s| !s.is_empty()) {
                about = about.description(desc);
            }
            if let Some(copy) = prop_str(node, "copyright").filter(|s| !s.is_empty()) {
                about = about.copyright(copy);
            }
            for item in extract_item_objects(node) {
                if let (Some(l), Some(u)) = (
                    item.get("label").and_then(Value::as_str),
                    item.get("url").and_then(Value::as_str),
                ) {
                    about = about.link(l.to_owned(), u.to_owned());
                }
            }
            let theme = cx.theme();
            div()
                .w_full()
                .rounded(theme.radius(Radius::Lg))
                .border_1()
                .border_color(theme.colors.border)
                .bg(theme.colors.surface)
                .child(about)
                .into_any_element()
        }
        "shell/ActivityBar" => {
            let items = extract_item_objects(node);
            let def_sel = prop_str(node, "selected");
            let sel_state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "activity"),
                cx,
                |_, _| def_sel,
            );
            let mut bar = ActivityBar::new(eid.clone());
            for (ix, item) in items.into_iter().enumerate() {
                let id = item
                    .get("value")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .unwrap_or_else(|| format!("act-{ix}"));
                let label = item
                    .get("label")
                    .and_then(Value::as_str)
                    .unwrap_or(&id)
                    .to_owned();
                let icon = parse_icon(item.get("icon").and_then(Value::as_str), IconName::Folder);
                let mut ai = ActivityItem::new(id, icon, label);
                if let Some(b) = item.get("badge").and_then(Value::as_u64) {
                    ai = ai.badge(b as u32);
                }
                bar = bar.item(ai);
            }
            for (ix, item) in parse_json_array(node, "footerItems")
                .into_iter()
                .enumerate()
            {
                let id = item
                    .get("value")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .unwrap_or_else(|| format!("foot-{ix}"));
                let label = item
                    .get("label")
                    .and_then(Value::as_str)
                    .unwrap_or(&id)
                    .to_owned();
                let icon = parse_icon(item.get("icon").and_then(Value::as_str), IconName::Settings);
                bar = bar.footer(ActivityItem::new(id, icon, label));
            }
            if let Some(sel) = sel_state.read(cx).clone() {
                bar = bar.selected(sel);
            }
            if !disabled {
                let st = sel_state.clone();
                let v = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                bar = bar.on_select(move |id, _, cx| {
                    st.update(cx, |s, cx| {
                        *s = Some(id.to_string());
                        cx.notify();
                    });
                    emit_event(&v, &sk1, &nt1, "change", json!(id.as_ref()), cx);
                });
            }
            div().h(px(280.)).flex().child(bar).into_any_element()
        }
        "shell/ColumnShell" => {
            let cols = parse_json_array(node, "columns");
            let mut shell = ColumnShell::new(eid.clone()).platform(cx.theme().platform);
            if cols.is_empty() {
                shell = shell.column(
                    ShellColumn::new(SharedString::from(format!("{eid}-col-0")))
                        .title(non_empty_or(&best_title(node), "Main"))
                        .child(div().p_3().child(Caption::new("Column content"))),
                );
            } else {
                for (ix, col) in cols.into_iter().enumerate() {
                    let mut sc = ShellColumn::new(SharedString::from(format!("{eid}-col-{ix}")));
                    if let Some(w) = col.get("width").and_then(value_to_f64)
                        && w > 0.0
                    {
                        sc = sc.width(px(w as f32));
                    }
                    if let Some(t) = col.get("title").and_then(Value::as_str) {
                        sc = sc.title(t.to_owned());
                    }
                    if let Some(items) = col.get("items").and_then(Value::as_array) {
                        let mut body = v_stack().gap_1().p_2();
                        for it in items {
                            if let Some(lbl) = it.get("label").and_then(Value::as_str) {
                                body = body.child(Label::new(lbl.to_owned()));
                            }
                        }
                        sc = sc.child(body);
                    }
                    shell = shell.column(sc);
                }
            }
            div()
                .w_full()
                .h(px(220.))
                .border_1()
                .border_color(cx.theme().colors.border)
                .rounded(cx.theme().radius(Radius::Lg))
                .overflow_hidden()
                .child(shell)
                .into_any_element()
        }
        "shell/CrashReporter" => {
            let name = non_empty_or(&best_label(node), "Application");
            let summary = best_body(node).unwrap_or_else(|| "An unexpected error occurred.".into());
            let report = prop_str(node, "value").unwrap_or_else(|| "Thread 0 crashed".into());
            let mut cr =
                CrashReporter::new(name, summary, report).details(prop_bool(node, "details"));
            if !disabled {
                let v1 = view.clone();
                let id1 = nid.clone();
                let nt1 = ntype.clone();
                cr = cr.on_send(move |_, cx| {
                    emit_event(&v1, &id1, &nt1, "ely:action", json!("send"), cx);
                });
                let v2 = view.clone();
                let id2 = nid.clone();
                let nt2 = ntype.clone();
                cr = cr.on_dismiss(move |_, cx| {
                    emit_event(&v2, &id2, &nt2, "ely:action", json!("dismiss"), cx);
                });
            }
            div()
                .w_full()
                .h(px(300.))
                .flex()
                .flex_col()
                .border_1()
                .border_color(cx.theme().colors.border)
                .rounded(cx.theme().radius(Radius::Lg))
                .pt_4()
                .child(cr)
                .into_any_element()
        }
        "shell/MiniWindow" => {
            let title = non_empty_or(&best_title(node), "Mini Window");
            let mut row = h_stack().flex_wrap().gap_2();
            for (ix, item) in extract_item_objects(node).into_iter().enumerate() {
                let lbl = item
                    .get("label")
                    .and_then(Value::as_str)
                    .unwrap_or("Open mini window")
                    .to_owned();
                let act = item
                    .get("action")
                    .and_then(Value::as_str)
                    .unwrap_or("open")
                    .to_owned();
                let v = view.clone();
                let id = nid.clone();
                let nt = ntype.clone();
                row = row.child(
                    Button::new(SharedString::from(format!("{eid}-mw-{ix}")), lbl)
                        .variant(ButtonVariant::Secondary)
                        .size(ControlSize::Sm)
                        .disabled(disabled)
                        .on_click(move |_, _, cx| {
                            emit_event(&v, &id, &nt, "ely:action", json!(act), cx);
                        }),
                );
            }
            Card::new()
                .header(CardHeader::new(title).description("Floating mini window launcher"))
                .child(row)
                .into_any_element()
        }
        "shell/OfflineIndicator" => {
            let init_conn = match prop_str(node, "state").as_deref() {
                Some("offline") => Connectivity::Offline,
                Some("reconnecting") => Connectivity::Reconnecting,
                _ => Connectivity::Online,
            };
            let conn_state =
                window.use_keyed_state((gpui::ElementId::from(eid.clone()), "conn"), cx, |_, _| {
                    init_conn
                });
            let cur = *conn_state.read(cx);
            let ind = OfflineIndicator::new(gpui::ElementId::from(eid.clone()), cur);
            if prop_bool(node, "showChoices") {
                let choices = vec![
                    Choice::new("online", "Online"),
                    Choice::new("reconnecting", "Reconnecting"),
                    Choice::new("offline", "Offline"),
                ];
                let sel = match cur {
                    Connectivity::Online => "online",
                    Connectivity::Reconnecting => "reconnecting",
                    Connectivity::Offline => "offline",
                };
                let st = conn_state.clone();
                let v = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                v_stack()
                    .gap_2()
                    .child({
                        let mut seg = SegmentedControl::new(
                            SharedString::from(format!("{eid}-conn-seg")),
                            sel,
                        );
                        for ch in choices {
                            seg = seg.segment(ch.value, ch.label, None);
                        }
                        seg.on_change(move |val, _, cx| {
                            if disabled {
                                return;
                            }
                            let next = match val.as_ref() {
                                "offline" => Connectivity::Offline,
                                "reconnecting" => Connectivity::Reconnecting,
                                _ => Connectivity::Online,
                            };
                            st.update(cx, |c, cx| {
                                *c = next;
                                cx.notify();
                            });
                            emit_event(&v, &sk1, &nt1, "change", json!(val.as_ref()), cx);
                        })
                    })
                    .child(ind)
                    .into_any_element()
            } else {
                ind.into_any_element()
            }
        }
        "shell/QuickLauncher" => {
            let title = non_empty_or(&best_title(node), "Quick Launcher");
            let desc = prop_str(node, "sourceNote")
                .unwrap_or_else(|| "Opens a floating quick launcher window.".into());
            let v = view.clone();
            let id = nid.clone();
            let nt = ntype.clone();
            Card::new()
                .header(CardHeader::new(title).description(desc))
                .child(
                    Button::new(
                        SharedString::from(format!("{eid}-ql")),
                        "Open Quick Launcher",
                    )
                    .variant(ButtonVariant::Secondary)
                    .size(ControlSize::Sm)
                    .icon(IconName::Search)
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        emit_event(&v, &id, &nt, "ely:action", json!("launch"), cx);
                    }),
                )
                .into_any_element()
        }
        "shell/SplashScreen" => {
            let name = non_empty_or(&best_label(node), "App");
            let mut splash = SplashScreen::new(name);
            if let Some(tag) = prop_str(node, "tagline").filter(|s| !s.is_empty()) {
                splash = splash.tagline(tag);
            }
            if let Some(status) = prop_str(node, "status").filter(|s| !s.is_empty()) {
                splash = splash.status(status);
            }
            let prog = prop_f64(node, "progress").map(norm_share);
            splash = splash.progress(prog);
            div()
                .w_full()
                .h(px(240.))
                .rounded(cx.theme().radius(Radius::Lg))
                .border_1()
                .border_color(cx.theme().colors.border)
                .bg(cx.theme().colors.bg)
                .child(splash)
                .into_any_element()
        }
        "shell/Toolbar" => {
            let mut tb = Toolbar::new();
            let groups = parse_json_array(node, "groups");
            if groups.is_empty() {
                let mut grp = ToolbarGroup::new();
                for (ix, item) in extract_item_objects(node).into_iter().enumerate() {
                    let icon = parse_icon(
                        item.get("icon").and_then(Value::as_str),
                        IconName::SquarePen,
                    );
                    let tip = item
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or("Action")
                        .to_owned();
                    let act = item
                        .get("action")
                        .and_then(Value::as_str)
                        .unwrap_or(&tip)
                        .to_owned();
                    let v = view.clone();
                    let id = nid.clone();
                    let nt = ntype.clone();
                    grp = grp.child(
                        IconButton::new(SharedString::from(format!("{eid}-tb-{ix}")), icon)
                            .variant(ButtonVariant::Ghost)
                            .size(ControlSize::Sm)
                            .tooltip(tip)
                            .disabled(disabled)
                            .on_click(move |_, _, cx| {
                                emit_event(&v, &id, &nt, "ely:action", json!(act), cx);
                            }),
                    );
                }
                tb = tb.child(grp);
            } else {
                for (gix, g) in groups.into_iter().enumerate() {
                    if gix > 0 {
                        tb = tb.child(ToolbarSeparator);
                    }
                    let mut grp = ToolbarGroup::new();
                    if let Some(arr) = g.as_array() {
                        for (ix, item) in arr.iter().enumerate() {
                            let icon = parse_icon(
                                item.get("icon").and_then(Value::as_str),
                                IconName::SquarePen,
                            );
                            let tip = item
                                .get("label")
                                .and_then(Value::as_str)
                                .unwrap_or("Action")
                                .to_owned();
                            let act = item
                                .get("action")
                                .and_then(Value::as_str)
                                .unwrap_or(&tip)
                                .to_owned();
                            let v = view.clone();
                            let id = nid.clone();
                            let nt = ntype.clone();
                            grp = grp.child(
                                IconButton::new(
                                    SharedString::from(format!("{eid}-tg-{gix}-{ix}")),
                                    icon,
                                )
                                .variant(ButtonVariant::Ghost)
                                .size(ControlSize::Sm)
                                .tooltip(tip)
                                .disabled(disabled)
                                .on_click(move |_, _, cx| {
                                    emit_event(&v, &id, &nt, "ely:action", json!(act), cx);
                                }),
                            );
                        }
                    }
                    tb = tb.child(grp);
                }
            }
            tb.into_any_element()
        }
        "shell/TrayIcon" => {
            let last_state =
                window.use_keyed_state((gpui::ElementId::from(eid.clone()), "tray"), cx, |_, _| {
                    prop_str(node, "lastPick").unwrap_or_else(|| "nothing yet".into())
                });
            let mut list = v_stack().gap_1();
            for (ix, item) in extract_item_objects(node).into_iter().enumerate() {
                if item.get("separator").and_then(Value::as_bool) == Some(true) {
                    continue;
                }
                let lbl = item
                    .get("label")
                    .and_then(Value::as_str)
                    .unwrap_or("Action")
                    .to_owned();
                let val = item
                    .get("value")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .unwrap_or_else(|| ix.to_string());
                let st = last_state.clone();
                let v = view.clone();
                let id = nid.clone();
                let nt = ntype.clone();
                let lbl_copy = lbl.clone();
                list = list.child(
                    Button::new(SharedString::from(format!("{eid}-tray-{ix}")), lbl)
                        .variant(ButtonVariant::Ghost)
                        .size(ControlSize::Sm)
                        .disabled(disabled)
                        .on_click(move |_, _, cx| {
                            st.update(cx, |s, cx| {
                                *s = lbl_copy.clone();
                                cx.notify();
                            });
                            emit_event(&v, &id, &nt, "ely:action", json!(val), cx);
                        }),
                );
            }
            Card::new()
                .header(
                    CardHeader::new(non_empty_or(&best_title(node), "Tray menu"))
                        .description(format!("Last pick: {}", last_state.read(cx))),
                )
                .child(list)
                .into_any_element()
        }
        "shell/UpdateBanner" => {
            let parse_state = |obj: Option<&serde_json::Map<String, Value>>| -> UpdateState {
                let s = obj
                    .and_then(|m| m.get("state"))
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .or_else(|| prop_str(node, "state"))
                    .unwrap_or_else(|| "available".into());
                match s.as_str() {
                    "downloading" => {
                        let p = obj
                            .and_then(|m| m.get("progress"))
                            .and_then(value_to_f64)
                            .or_else(|| prop_f64(node, "progress"))
                            .unwrap_or(50.0);
                        UpdateState::Downloading(norm_share(p))
                    }
                    "ready" => UpdateState::Ready,
                    _ => UpdateState::Available,
                }
            };
            let banners = parse_json_array(node, "banners");
            if banners.is_empty() {
                let ver = prop_str(node, "version").unwrap_or_else(|| "0.2.0".into());
                let mut ub =
                    UpdateBanner::new(gpui::ElementId::from(eid.clone()), ver, parse_state(None));
                if !disabled {
                    let v1 = view.clone();
                    let id1 = nid.clone();
                    let nt1 = ntype.clone();
                    ub = ub.on_download(move |_, cx| {
                        emit_event(&v1, &id1, &nt1, "ely:action", json!("download"), cx);
                    });
                    let v2 = view.clone();
                    let id2 = nid.clone();
                    let nt2 = ntype.clone();
                    ub = ub.on_restart(move |_, cx| {
                        emit_event(&v2, &id2, &nt2, "ely:action", json!("restart"), cx);
                    });
                    let v3 = view.clone();
                    let id3 = nid.clone();
                    let nt3 = ntype.clone();
                    ub = ub.on_later(move |_, cx| {
                        emit_event(&v3, &id3, &nt3, "ely:action", json!("later"), cx);
                    });
                }
                ub.into_any_element()
            } else {
                let mut col = v_stack().gap_2();
                for (ix, b) in banners.iter().enumerate() {
                    let ver = b
                        .get("version")
                        .and_then(Value::as_str)
                        .unwrap_or("0.2.0")
                        .to_owned();
                    let mut ub = UpdateBanner::new(
                        SharedString::from(format!("{eid}-ub-{ix}")),
                        ver,
                        parse_state(b.as_object()),
                    );
                    if !disabled {
                        let v1 = view.clone();
                        let id1 = nid.clone();
                        let nt1 = ntype.clone();
                        ub = ub.on_download(move |_, cx| {
                            emit_event(&v1, &id1, &nt1, "ely:action", json!("download"), cx);
                        });
                        let v2 = view.clone();
                        let id2 = nid.clone();
                        let nt2 = ntype.clone();
                        ub = ub.on_restart(move |_, cx| {
                            emit_event(&v2, &id2, &nt2, "ely:action", json!("restart"), cx);
                        });
                        let v3 = view.clone();
                        let id3 = nid.clone();
                        let nt3 = ntype.clone();
                        ub = ub.on_later(move |_, cx| {
                            emit_event(&v3, &id3, &nt3, "ely:action", json!("later"), cx);
                        });
                    }
                    col = col.child(ub);
                }
                col.into_any_element()
            }
        }
        "shell/UpdateDialog" => {
            let name = non_empty_or(&best_label(node), "App");
            let cur = prop_str(node, "currentVersion").unwrap_or_else(|| "0.1.0".into());
            let ver = prop_str(node, "version").unwrap_or_else(|| "0.2.0".into());
            let st = match prop_str(node, "state").as_deref() {
                Some("downloading") => {
                    UpdateState::Downloading(norm_share(prop_f64(node, "progress").unwrap_or(50.0)))
                }
                Some("ready") => UpdateState::Ready,
                _ => UpdateState::Available,
            };
            let mut ud = UpdateDialog::new(name, cur, ver, st);
            for item in extract_item_objects(node) {
                if let Some(line) = item.get("label").and_then(Value::as_str) {
                    ud = ud.note(line.to_owned());
                }
            }
            if !disabled {
                let v1 = view.clone();
                let id1 = nid.clone();
                let nt1 = ntype.clone();
                ud = ud.on_download(move |_, cx| {
                    emit_event(&v1, &id1, &nt1, "ely:action", json!("download"), cx);
                });
                let v2 = view.clone();
                let id2 = nid.clone();
                let nt2 = ntype.clone();
                ud = ud.on_restart(move |_, cx| {
                    emit_event(&v2, &id2, &nt2, "ely:action", json!("restart"), cx);
                });
                let v3 = view.clone();
                let id3 = nid.clone();
                let nt3 = ntype.clone();
                ud = ud.on_later(move |_, cx| {
                    emit_event(&v3, &id3, &nt3, "ely:action", json!("later"), cx);
                });
            }
            div()
                .w_full()
                .h(px(300.))
                .flex()
                .flex_col()
                .rounded(cx.theme().radius(Radius::Lg))
                .border_1()
                .border_color(cx.theme().colors.border)
                .pt_4()
                .child(ud)
                .into_any_element()
        }
        "shell/WindowControls" => {
            let platform = match prop_str(node, "platform").as_deref() {
                Some("windows") => Platform::Windows,
                Some("linux") => Platform::Linux,
                _ => Platform::Mac,
            };
            let v = view.clone();
            let id = nid.clone();
            let nt = ntype.clone();
            WindowControls::new(eid.clone())
                .platform(platform)
                .on_close(move |_, cx| {
                    emit_event(&v, &id, &nt, "ely:action", json!("close"), cx);
                })
                .into_any_element()
        }
        "shell/WindowSwitcher" => {
            let open_state =
                window.use_keyed_state((gpui::ElementId::from(eid.clone()), "open"), cx, |_, _| {
                    false
                });
            let is_open = *open_state.read(cx);
            let st_open = open_state.clone();
            let mut host = v_stack().gap_2().child(
                Button::new(SharedString::from(format!("{eid}-open")), "Window Switcher")
                    .variant(ButtonVariant::Secondary)
                    .size(ControlSize::Sm)
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        st_open.update(cx, |o, cx| {
                            *o = true;
                            cx.notify();
                        });
                    }),
            );
            if is_open {
                let st_close = open_state.clone();
                let v = view.clone();
                let id = nid.clone();
                let nt = ntype.clone();
                host = host.child(WindowSwitcher::new(
                    gpui::ElementId::from(eid.clone()),
                    move |_, cx| {
                        st_close.update(cx, |o, cx| {
                            *o = false;
                            cx.notify();
                        });
                        emit_event(&v, &id, &nt, "ely:action", json!("close"), cx);
                    },
                ));
            }
            host.into_any_element()
        }
        "shell/ZoomControl" => {
            let init_pct = (prop_f64(node, "percent")
                .unwrap_or(100.0)
                .clamp(50.0, 200.0)) as u32;
            let pct_state =
                window.use_keyed_state((gpui::ElementId::from(eid.clone()), "zoom"), cx, |_, _| {
                    init_pct
                });
            let pct = view_state
                .value(state_key)
                .and_then(value_to_f64)
                .map(|v| v.clamp(50.0, 200.0) as u32)
                .unwrap_or(*pct_state.read(cx));
            let st = pct_state.clone();
            let v = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            ZoomControl::new(eid.clone())
                .owned(pct, move |step, _, cx| {
                    let next = st.update(cx, |cur, cx| {
                        *cur = match step {
                            ZoomStep::Out => (*cur).saturating_sub(10).max(50),
                            ZoomStep::In => (*cur + 10).min(200),
                            ZoomStep::Reset => 100,
                        };
                        cx.notify();
                        *cur
                    });
                    emit_event(&v, &sk1, &nt1, "change", json!(next), cx);
                })
                .into_any_element()
        }
        _ => return None,
    };
    Some(el)
}

fn render_theme_tooling(
    kind: &str,
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    _view_state: &CatalogueView,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> Option<AnyElement> {
    let disabled = prop_bool(node, "disabled");
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    let sk = state_key.to_owned();

    let el: AnyElement = match kind {
        "theme/Series" => {
            let theme = cx.theme();
            let items = extract_item_objects(node);
            let mut row = h_stack().flex_wrap().gap_2();
            if items.is_empty() {
                for (ix, &color) in theme.colors.chart.iter().enumerate() {
                    row = row.child(
                        v_stack()
                            .items_center()
                            .gap_1()
                            .child(
                                div()
                                    .size(px(36.))
                                    .rounded(theme.radius(Radius::Md))
                                    .bg(color)
                                    .border_1()
                                    .border_color(theme.colors.border),
                            )
                            .child(Caption::new(format!("{}", ix + 1))),
                    );
                }
            } else {
                for (ix, item) in items.iter().enumerate() {
                    let lbl = item
                        .get("label")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("{}", ix + 1));
                    let color = item
                        .get("color")
                        .and_then(Value::as_str)
                        .and_then(parse_hex_color)
                        .unwrap_or_else(|| theme.colors.chart[ix % theme.colors.chart.len()]);
                    row = row.child(
                        v_stack()
                            .items_center()
                            .gap_1()
                            .child(
                                div()
                                    .size(px(36.))
                                    .rounded(theme.radius(Radius::Md))
                                    .bg(color)
                                    .border_1()
                                    .border_color(theme.colors.border),
                            )
                            .child(Caption::new(lbl)),
                    );
                }
            }
            row.into_any_element()
        }
        "theme/Shape" => {
            let theme = cx.theme();
            let colors = &theme.colors;
            let radii_row = h_stack().flex_wrap().gap_3().children(
                [
                    (Radius::Sm, "Sm"),
                    (Radius::Md, "Md"),
                    (Radius::Lg, "Lg"),
                    (Radius::Xl, "Xl"),
                ]
                .map(|(r, name)| {
                    v_stack()
                        .items_center()
                        .gap_1()
                        .child(
                            div()
                                .size(px(48.))
                                .rounded(theme.radius(r))
                                .bg(colors.sunken)
                                .border_1()
                                .border_color(colors.border_strong),
                        )
                        .child(Caption::new(name))
                }),
            );
            let elev_row = h_stack().flex_wrap().gap_4().children(
                [
                    (Elevation::Raised, "Raised"),
                    (Elevation::Floating, "Floating"),
                    (Elevation::Modal, "Modal"),
                ]
                .map(|(e, name)| {
                    v_stack()
                        .items_center()
                        .gap_1()
                        .child(
                            div()
                                .w(px(88.))
                                .h(px(48.))
                                .rounded(theme.radius(Radius::Lg))
                                .bg(colors.overlay)
                                .shadow(theme.elevation(e)),
                        )
                        .child(Caption::new(name))
                }),
            );
            v_stack()
                .gap_4()
                .child(radii_row)
                .child(elev_row)
                .into_any_element()
        }
        "theme/Syntax" => {
            let theme = cx.theme();
            let syntax = &theme.colors.syntax;
            let text = "fn answer() -> u32 { let x = 42; x } // truth";
            let color = |c: Hsla| HighlightStyle {
                color: Some(c),
                ..Default::default()
            };
            let spans = [
                (0..2, color(syntax.keyword)),
                (3..9, color(syntax.function)),
                (9..11, color(syntax.punctuation)),
                (12..14, color(syntax.operator)),
                (15..18, color(syntax.type_name)),
                (19..20, color(syntax.punctuation)),
                (21..24, color(syntax.keyword)),
                (25..26, color(syntax.variable)),
                (27..28, color(syntax.operator)),
                (29..31, color(syntax.number)),
                (31..32, color(syntax.punctuation)),
                (35..36, color(syntax.punctuation)),
                (
                    37..45,
                    HighlightStyle {
                        color: Some(syntax.comment),
                        font_style: Some(FontStyle::Italic),
                        ..Default::default()
                    },
                ),
            ];
            div()
                .px_4()
                .py_3()
                .rounded(theme.radius(Radius::Lg))
                .bg(theme.colors.sunken)
                .font_family(theme.mono_family.clone())
                .text_size(theme.text_size(TextSize::Base))
                .text_color(theme.colors.fg)
                .child(StyledText::new(text).with_highlights(spans))
                .into_any_element()
        }
        "theme/ThemeEditor" => {
            let initial = ThemeDraft::of(cx.theme());
            let draft_state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "draft"),
                cx,
                |_, _| initial,
            );
            let draft = draft_state.read(cx).clone();
            let st = draft_state.clone();
            let v = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            ThemeEditor::new(
                gpui::ElementId::from(eid.clone()),
                draft,
                move |next, _, cx| {
                    st.update(cx, |d, cx| {
                        *d = next.clone();
                        cx.notify();
                    });
                    emit_event(
                        &v,
                        &sk1,
                        &nt1,
                        "change",
                        json!({"fontScale": next.font_scale, "radiusScale": next.radius_scale}),
                        cx,
                    );
                },
            )
            .into_any_element()
        }
        "theme/ThemeImporter" => {
            if ntype == "theme/SyntaxThemes" {
                let sel_state = window.use_keyed_state(
                    (gpui::ElementId::from(eid.clone()), "syn"),
                    cx,
                    |_, _| "Ely".to_owned(),
                );
                let sel = sel_state.read(cx).clone();
                let st = sel_state.clone();
                let v = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                SyntaxThemePicker::new(
                    gpui::ElementId::from(eid.clone()),
                    syntax_themes(),
                    sel,
                    move |name, _, cx| {
                        st.update(cx, |s, cx| {
                            *s = name.to_owned();
                            cx.notify();
                        });
                        emit_event(&v, &sk1, &nt1, "change", json!(name), cx);
                    },
                )
                .into_any_element()
            } else {
                let v = view.clone();
                let id = nid.clone();
                let nt = ntype.clone();
                ThemeImporter::new(gpui::ElementId::from(eid.clone()), move |theme, _, cx| {
                    emit_event(
                        &v,
                        &id,
                        &nt,
                        "ely:action",
                        json!({"name": theme.name, "dark": theme.mode == Mode::Dark}),
                        cx,
                    );
                })
                .into_any_element()
            }
        }
        "tooling/A11yChecker" => A11yChecker::new().into_any_element(),
        "tooling/DesignTokenViewer" => DesignTokenViewer::new().into_any_element(),
        "tooling/EventLogger" => {
            let input = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "ev-in"),
                cx,
                TextInput::new,
            );
            let theme = cx.theme();
            EventLogger::new(eid.clone())
                .child(
                    div()
                        .p_3()
                        .rounded(theme.radius(Radius::Md))
                        .border_1()
                        .border_color(theme.colors.border)
                        .bg(theme.colors.surface)
                        .flex()
                        .flex_col()
                        .gap_2()
                        .child(Caption::new("Move, press, or type here"))
                        .child(Input::new(&input)),
                )
                .into_any_element()
        }
        "tooling/FPSMeter" => {
            let measuring = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "fps-on"),
                cx,
                |_, _| prop_bool(node, "measuring"),
            );
            let on = *measuring.read(cx);
            let st = measuring.clone();
            let v = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let mut row = h_stack().flex_wrap().gap_3().child(
                Switch::new(SharedString::from(format!("{eid}-sw")), on)
                    .label(non_empty_or(&best_label(node), "Measure"))
                    .disabled(disabled)
                    .on_change(move |next, _, cx| {
                        st.update(cx, |m, cx| {
                            *m = next;
                            cx.notify();
                        });
                        emit_event(&v, &sk1, &nt1, "change", json!(next), cx);
                    }),
            );
            if on {
                row = row.child(FpsMeter::new(eid.clone()));
            }
            row.into_any_element()
        }
        "tooling/RenderCounter" => {
            let items = extract_item_objects(node);
            if items.is_empty() {
                let lbl = non_empty_or(&best_label(node), "Renders");
                RenderCounter::new(gpui::ElementId::from(eid.clone()), lbl).into_any_element()
            } else {
                let mut row = h_stack().flex_wrap().gap_3();
                for (ix, item) in items.iter().enumerate() {
                    let lbl = item.get("label").and_then(Value::as_str).unwrap_or("View");
                    row = row.child(RenderCounter::new(
                        SharedString::from(format!("{eid}-rc-{ix}")),
                        lbl.to_owned(),
                    ));
                }
                row.into_any_element()
            }
        }
        _ => return None,
    };
    Some(el)
}

pub(crate) fn render(
    kind: &str,
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> Option<AnyElement> {
    render_generative(kind, node, eid, state_key, view_state, window, cx, view)
        .or_else(|| render_media(kind, node, eid, state_key, view_state, window, cx, view))
        .or_else(|| render_misc(kind, node, eid, state_key, view_state, window, cx, view))
        .or_else(|| render_motion(kind, node, eid, state_key, view_state, window, cx, view))
        .or_else(|| {
            render_rendering_settings(kind, node, eid, state_key, view_state, window, cx, view)
        })
        .or_else(|| render_shell(kind, node, eid, state_key, view_state, window, cx, view))
        .or_else(|| render_theme_tooling(kind, node, eid, state_key, view_state, window, cx, view))
}
