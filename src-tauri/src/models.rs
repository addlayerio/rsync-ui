use serde::{Deserialize, Serialize};

fn default_true() -> bool {
    true
}

/// Every rsync flag/option we expose through the UI.
/// `#[serde(rename_all = "camelCase")]` keeps the wire format aligned with the
/// TypeScript interfaces used by the Angular frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RsyncOptions {
    // Archive mode & granular attributes.
    #[serde(default = "default_true")]
    pub archive: bool, // -a  (expands to -rlptgoD)
    #[serde(default)]
    pub recursive: bool, // -r
    #[serde(default)]
    pub links: bool, // -l
    #[serde(default)]
    pub perms: bool, // -p
    #[serde(default)]
    pub times: bool, // -t
    #[serde(default)]
    pub group: bool, // -g
    #[serde(default)]
    pub owner: bool, // -o
    #[serde(default)]
    pub devices: bool, // -D

    // Transfer behaviour.
    #[serde(default)]
    pub compress: bool, // -z
    #[serde(default)]
    pub checksum: bool, // -c
    #[serde(default)]
    pub update: bool, // -u
    #[serde(default)]
    pub existing: bool, // --existing
    #[serde(default)]
    pub ignore_existing: bool, // --ignore-existing
    #[serde(default)]
    pub inplace: bool, // --inplace
    #[serde(default = "default_true")]
    pub partial: bool, // --partial
    #[serde(default = "default_true")]
    pub progress: bool, // --progress
    #[serde(default = "default_true")]
    pub human_readable: bool, // -h
    #[serde(default = "default_true")]
    pub verbose: bool, // -v
    #[serde(default)]
    pub itemize_changes: bool, // -i
    #[serde(default)]
    pub numeric_ids: bool, // --numeric-ids
    #[serde(default)]
    pub hard_links: bool, // -H
    #[serde(default)]
    pub one_file_system: bool, // -x
    #[serde(default)]
    pub prune_empty_dirs: bool, // -m

    // Deletion & backup.
    #[serde(default)]
    pub delete: bool, // --delete
    #[serde(default)]
    pub delete_excluded: bool, // --delete-excluded
    #[serde(default)]
    pub backup: bool, // -b
    #[serde(default)]
    pub backup_dir: Option<String>, // --backup-dir=DIR

    // Size / bandwidth tuning.
    #[serde(default)]
    pub bwlimit: Option<String>, // --bwlimit=RATE
    #[serde(default)]
    pub max_size: Option<String>, // --max-size=SIZE
    #[serde(default)]
    pub min_size: Option<String>, // --min-size=SIZE

    // Filtering.
    #[serde(default)]
    pub includes: Vec<String>, // --include=PATTERN
    #[serde(default)]
    pub excludes: Vec<String>, // --exclude=PATTERN
    #[serde(default)]
    pub exclude_from: Option<String>, // --exclude-from=FILE

    // Remote transport (ssh).
    #[serde(default)]
    pub ssh_port: Option<u16>,
    #[serde(default)]
    pub ssh_identity: Option<String>, // -i KEY
    #[serde(default)]
    pub ssh_extra: Option<String>, // extra raw ssh flags

    // Anything we don't model explicitly.
    #[serde(default)]
    pub extra_args: Vec<String>,
}

impl Default for RsyncOptions {
    fn default() -> Self {
        RsyncOptions {
            archive: true,
            recursive: false,
            links: false,
            perms: false,
            times: false,
            group: false,
            owner: false,
            devices: false,
            compress: false,
            checksum: false,
            update: false,
            existing: false,
            ignore_existing: false,
            inplace: false,
            partial: true,
            progress: true,
            human_readable: true,
            verbose: true,
            itemize_changes: false,
            numeric_ids: false,
            hard_links: false,
            one_file_system: false,
            prune_empty_dirs: false,
            delete: false,
            delete_excluded: false,
            backup: false,
            backup_dir: None,
            bwlimit: None,
            max_size: None,
            min_size: None,
            includes: Vec::new(),
            excludes: Vec::new(),
            exclude_from: None,
            ssh_port: None,
            ssh_identity: None,
            ssh_extra: None,
            extra_args: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    #[serde(default)]
    pub enabled: bool,
    /// Standard 5-field cron expression ("min hour dom month dow").
    #[serde(default)]
    pub cron: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RsyncTask {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub destination: String,
    #[serde(default)]
    pub options: RsyncOptions,
    #[serde(default)]
    pub schedule: Schedule,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRecord {
    pub id: String,
    pub task_id: String,
    pub task_name: String,
    pub started_at: String,
    #[serde(default)]
    pub finished_at: Option<String>,
    /// running | success | failed | cancelled | interrupted
    pub status: String,
    #[serde(default)]
    pub exit_code: Option<i32>,
    /// manual | scheduled
    pub trigger: String,
    #[serde(default)]
    pub dry_run: bool,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default = "default_true")]
    pub notifications: bool,
    #[serde(default = "default_true")]
    pub close_to_tray: bool,
    #[serde(default = "default_true")]
    pub autostart: bool,
    #[serde(default)]
    pub start_minimized: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            notifications: true,
            close_to_tray: true,
            autostart: true,
            start_minimized: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Store {
    #[serde(default)]
    pub tasks: Vec<RsyncTask>,
    #[serde(default)]
    pub runs: Vec<RunRecord>,
    #[serde(default)]
    pub settings: Settings,
}

/// Result of probing the local rsync binary.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RsyncInfo {
    pub available: bool,
    pub version: String,
}

/// Payload streamed to the frontend for every line of rsync output.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputEvent {
    pub run_id: String,
    pub task_id: String,
    pub stream: String, // stdout | stderr
    pub line: String,
}
