use crate::models::{RsyncOptions, RsyncTask};

fn nonempty(opt: &Option<String>) -> Option<&str> {
    opt.as_deref().map(str::trim).filter(|s| !s.is_empty())
}

/// Build the `-e "ssh ..."` transport string when any ssh option is set.
fn build_ssh(o: &RsyncOptions) -> Option<String> {
    let has_port = o.ssh_port.is_some();
    let has_identity = nonempty(&o.ssh_identity).is_some();
    let has_extra = nonempty(&o.ssh_extra).is_some();
    if !has_port && !has_identity && !has_extra {
        return None;
    }
    let mut parts = vec![String::from("ssh")];
    if let Some(p) = o.ssh_port {
        parts.push(format!("-p {p}"));
    }
    if let Some(key) = nonempty(&o.ssh_identity) {
        parts.push(format!("-i {key}"));
    }
    if let Some(extra) = nonempty(&o.ssh_extra) {
        parts.push(extra.to_string());
    }
    Some(parts.join(" "))
}

/// Translate a task + its options into the ordered list of rsync arguments
/// (everything after the `rsync` program name, ending with source + dest).
pub fn build_args(task: &RsyncTask, dry_run: bool) -> Vec<String> {
    let o = &task.options;
    let mut a: Vec<String> = Vec::new();

    if o.archive {
        a.push("-a".into());
    } else {
        if o.recursive {
            a.push("-r".into());
        }
        if o.links {
            a.push("-l".into());
        }
        if o.perms {
            a.push("-p".into());
        }
        if o.times {
            a.push("-t".into());
        }
        if o.group {
            a.push("-g".into());
        }
        if o.owner {
            a.push("-o".into());
        }
        if o.devices {
            a.push("-D".into());
        }
    }

    if o.verbose {
        a.push("-v".into());
    }
    if o.itemize_changes {
        a.push("-i".into());
    }
    if o.compress {
        a.push("-z".into());
    }
    if o.checksum {
        a.push("-c".into());
    }
    if o.update {
        a.push("-u".into());
    }
    if o.existing {
        a.push("--existing".into());
    }
    if o.ignore_existing {
        a.push("--ignore-existing".into());
    }
    if o.inplace {
        a.push("--inplace".into());
    }
    if o.partial {
        a.push("--partial".into());
    }
    if o.progress {
        a.push("--progress".into());
    }
    if o.human_readable {
        a.push("-h".into());
    }
    if o.numeric_ids {
        a.push("--numeric-ids".into());
    }
    if o.hard_links {
        a.push("-H".into());
    }
    if o.one_file_system {
        a.push("-x".into());
    }
    if o.prune_empty_dirs {
        a.push("-m".into());
    }

    if o.delete {
        a.push("--delete".into());
    }
    if o.delete_excluded {
        a.push("--delete-excluded".into());
    }
    if o.backup {
        a.push("-b".into());
    }
    if let Some(dir) = nonempty(&o.backup_dir) {
        a.push(format!("--backup-dir={dir}"));
    }

    if let Some(rate) = nonempty(&o.bwlimit) {
        a.push(format!("--bwlimit={rate}"));
    }
    if let Some(size) = nonempty(&o.max_size) {
        a.push(format!("--max-size={size}"));
    }
    if let Some(size) = nonempty(&o.min_size) {
        a.push(format!("--min-size={size}"));
    }

    // Include rules must precede exclude rules to take effect.
    for inc in &o.includes {
        let inc = inc.trim();
        if !inc.is_empty() {
            a.push(format!("--include={inc}"));
        }
    }
    for exc in &o.excludes {
        let exc = exc.trim();
        if !exc.is_empty() {
            a.push(format!("--exclude={exc}"));
        }
    }
    if let Some(file) = nonempty(&o.exclude_from) {
        a.push(format!("--exclude-from={file}"));
    }

    if let Some(ssh) = build_ssh(o) {
        a.push("-e".into());
        a.push(ssh);
    }

    if dry_run {
        a.push("-n".into());
    }

    for extra in &o.extra_args {
        let extra = extra.trim();
        if !extra.is_empty() {
            a.push(extra.to_string());
        }
    }

    // Force line-buffered output so the UI receives lines promptly.
    a.push("--outbuf=L".into());

    // Expand brace patterns in the source (e.g. "/p/{a,b,c}") into multiple
    // source arguments, like the shell would — rsync itself is run without a
    // shell, so it can't do this on its own.
    for src in expand_braces(&task.source) {
        a.push(src);
    }
    a.push(task.destination.clone());
    a
}

/// Expand a single level of brace patterns ("a{1,2}b" -> ["a1b", "a2b"]),
/// mirroring shell brace expansion. Only expands braces that contain a comma;
/// anything else (including paths with literal braces) is returned unchanged.
/// Handles multiple brace groups via recursion on the suffix.
pub fn expand_braces(s: &str) -> Vec<String> {
    if let Some(open) = s.find('{') {
        if let Some(close_rel) = s[open + 1..].find('}') {
            let close = open + 1 + close_rel;
            let inner = &s[open + 1..close];
            if inner.contains(',') {
                let prefix = &s[..open];
                let suffix = &s[close + 1..];
                let mut out = Vec::new();
                for part in inner.split(',') {
                    for tail in expand_braces(suffix) {
                        out.push(format!("{prefix}{part}{tail}"));
                    }
                }
                return out;
            }
        }
    }
    vec![s.to_string()]
}

/// POSIX-ish shell quoting for building a copy/paste-able preview string.
fn shell_quote(s: &str) -> String {
    if s.is_empty() {
        return "''".into();
    }
    let safe = s
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || "-_./=:@%+,".contains(c));
    if safe {
        s.to_string()
    } else {
        format!("'{}'", s.replace('\'', "'\\''"))
    }
}

/// Human-readable, copy/paste-able command line.
pub fn preview(program: &str, args: &[String]) -> String {
    let mut parts = vec![program.to_string()];
    parts.extend(args.iter().map(|a| shell_quote(a)));
    parts.join(" ")
}

/// True when running inside a Flatpak sandbox.
pub fn in_flatpak() -> bool {
    std::path::Path::new("/.flatpak-info").exists()
}

/// Resolve the program + full argument list to actually execute an rsync run.
/// Inside a Flatpak sandbox we route through `flatpak-spawn --host` so the
/// host's rsync, ssh keys/agent and full filesystem are used; otherwise we run
/// `rsync` directly. The `preview` string always shows the logical `rsync ...`.
pub fn exec_command(args: &[String]) -> (String, Vec<String>) {
    if in_flatpak() {
        let mut full = vec!["--host".to_string(), "rsync".to_string()];
        full.extend_from_slice(args);
        ("flatpak-spawn".to_string(), full)
    } else {
        ("rsync".to_string(), args.to_vec())
    }
}

// ---------------------------------------------------------------------------
// Import: parse a raw rsync command line back into a task.
// ---------------------------------------------------------------------------

/// Split a command line into tokens, honouring single/double quotes,
/// backslash escapes and backslash-newline line continuations.
fn tokenize(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut cur = String::new();
    let mut has_token = false;
    let mut in_single = false;
    let mut in_double = false;
    let mut chars = input.chars().peekable();

    while let Some(c) = chars.next() {
        if in_single {
            if c == '\'' {
                in_single = false;
            } else {
                cur.push(c);
            }
        } else if in_double {
            match c {
                '"' => in_double = false,
                '\\' => match chars.peek() {
                    Some(&n) if n == '"' || n == '\\' || n == '$' || n == '`' => {
                        cur.push(n);
                        chars.next();
                    }
                    _ => cur.push('\\'),
                },
                _ => cur.push(c),
            }
        } else {
            match c {
                '\'' => {
                    in_single = true;
                    has_token = true;
                }
                '"' => {
                    in_double = true;
                    has_token = true;
                }
                '\\' => match chars.next() {
                    Some('\n') => {} // line continuation
                    Some(n) => {
                        cur.push(n);
                        has_token = true;
                    }
                    None => {}
                },
                _ if c.is_whitespace() => {
                    if has_token {
                        tokens.push(std::mem::take(&mut cur));
                        has_token = false;
                    }
                }
                _ => {
                    cur.push(c);
                    has_token = true;
                }
            }
        }
    }
    if has_token {
        tokens.push(cur);
    }
    tokens
}

/// Resolve the value of a flag: either its inline `=value` or the next token.
fn value_for(inline: Option<String>, tokens: &[String], i: &mut usize) -> Option<String> {
    if inline.is_some() {
        return inline;
    }
    if *i + 1 < tokens.len() {
        *i += 1;
        return Some(tokens[*i].clone());
    }
    None
}

/// Apply a single short flag character. Returns false for unknown flags.
fn apply_short(c: char, o: &mut RsyncOptions) -> bool {
    match c {
        'a' => o.archive = true,
        'v' => o.verbose = true,
        'h' => o.human_readable = true,
        'z' => o.compress = true,
        'c' => o.checksum = true,
        'u' => o.update = true,
        'r' => o.recursive = true,
        'l' => o.links = true,
        'p' => o.perms = true,
        't' => o.times = true,
        'g' => o.group = true,
        'o' => o.owner = true,
        'D' => o.devices = true,
        'H' => o.hard_links = true,
        'x' => o.one_file_system = true,
        'm' => o.prune_empty_dirs = true,
        'i' => o.itemize_changes = true,
        'b' => o.backup = true,
        'n' => {} // dry-run is a per-run choice, not stored
        'P' => {
            o.partial = true;
            o.progress = true;
        }
        _ => return false,
    }
    true
}

fn parse_ssh(value: &str, o: &mut RsyncOptions) {
    let toks = tokenize(value);
    let mut extra: Vec<String> = Vec::new();
    let mut i = 0;
    while i < toks.len() {
        let t = toks[i].as_str();
        if i == 0 && t == "ssh" {
            i += 1;
            continue;
        }
        match t {
            "-p" => {
                if i + 1 < toks.len() {
                    if let Ok(p) = toks[i + 1].parse::<u16>() {
                        o.ssh_port = Some(p);
                    }
                    i += 1;
                }
            }
            "-i" => {
                if i + 1 < toks.len() {
                    o.ssh_identity = Some(toks[i + 1].clone());
                    i += 1;
                }
            }
            other => extra.push(other.to_string()),
        }
        i += 1;
    }
    if !extra.is_empty() {
        o.ssh_extra = Some(extra.join(" "));
    }
}

/// Parse a raw `rsync ...` command line into a task. Best-effort: unknown flags
/// are preserved in `extra_args`. Options start all-off so the result reflects
/// exactly what the command specified.
pub fn parse_command(input: &str) -> RsyncTask {
    let tokens = tokenize(input);

    let mut o = RsyncOptions::default();
    // Turn off the on-by-default flags; only what the command lists is kept.
    o.archive = false;
    o.partial = false;
    o.progress = false;
    o.verbose = false;
    o.human_readable = false;

    let mut positionals: Vec<String> = Vec::new();
    let mut i = 0;
    while i < tokens.len() {
        let tok = tokens[i].clone();

        if i == 0 && (tok == "rsync" || tok.ends_with("/rsync")) {
            i += 1;
            continue;
        }

        if let Some(rest) = tok.strip_prefix("--") {
            let (name, inline) = match rest.split_once('=') {
                Some((n, v)) => (n.to_string(), Some(v.to_string())),
                None => (rest.to_string(), None),
            };
            match name.as_str() {
                "archive" => o.archive = true,
                "verbose" => o.verbose = true,
                "compress" => o.compress = true,
                "checksum" => o.checksum = true,
                "update" => o.update = true,
                "recursive" => o.recursive = true,
                "links" => o.links = true,
                "perms" => o.perms = true,
                "times" => o.times = true,
                "group" => o.group = true,
                "owner" => o.owner = true,
                "devices" | "specials" => o.devices = true,
                "human-readable" => o.human_readable = true,
                "hard-links" => o.hard_links = true,
                "one-file-system" => o.one_file_system = true,
                "prune-empty-dirs" => o.prune_empty_dirs = true,
                "itemize-changes" => o.itemize_changes = true,
                "numeric-ids" => o.numeric_ids = true,
                "delete" => o.delete = true,
                "delete-excluded" => o.delete_excluded = true,
                "existing" => o.existing = true,
                "ignore-existing" => o.ignore_existing = true,
                "inplace" => o.inplace = true,
                "partial" => o.partial = true,
                "progress" => o.progress = true,
                "backup" => o.backup = true,
                "dry-run" => {} // per-run choice
                "exclude" => {
                    if let Some(v) = value_for(inline, &tokens, &mut i) {
                        o.excludes.push(v);
                    }
                }
                "include" => {
                    if let Some(v) = value_for(inline, &tokens, &mut i) {
                        o.includes.push(v);
                    }
                }
                "exclude-from" => o.exclude_from = value_for(inline, &tokens, &mut i),
                "bwlimit" => o.bwlimit = value_for(inline, &tokens, &mut i),
                "max-size" => o.max_size = value_for(inline, &tokens, &mut i),
                "min-size" => o.min_size = value_for(inline, &tokens, &mut i),
                "backup-dir" => o.backup_dir = value_for(inline, &tokens, &mut i),
                "rsh" => {
                    if let Some(v) = value_for(inline, &tokens, &mut i) {
                        parse_ssh(&v, &mut o);
                    }
                }
                _ => o.extra_args.push(tok.clone()),
            }
        } else if tok == "-e" {
            if let Some(v) = value_for(None, &tokens, &mut i) {
                parse_ssh(&v, &mut o);
            }
        } else if tok.len() > 1 && tok.starts_with('-') {
            for c in tok[1..].chars() {
                if !apply_short(c, &mut o) {
                    o.extra_args.push(format!("-{c}"));
                }
            }
        } else {
            positionals.push(tok);
        }

        i += 1;
    }

    let (source, destination) = match positionals.len() {
        0 => (String::new(), String::new()),
        1 => (positionals[0].clone(), String::new()),
        _ => {
            let dest = positionals.last().cloned().unwrap_or_default();
            let src = positionals[..positionals.len() - 1].join(" ");
            (src, dest)
        }
    };

    RsyncTask {
        id: String::new(),
        name: String::new(),
        source,
        destination,
        options: o,
        schedule: Default::default(),
        created_at: String::new(),
        updated_at: String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::RsyncTask;

    fn task() -> RsyncTask {
        RsyncTask {
            id: "1".into(),
            name: "t".into(),
            source: "/src/".into(),
            destination: "/dst/".into(),
            options: RsyncOptions::default(),
            schedule: Default::default(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn archive_expands_to_single_flag() {
        let args = build_args(&task(), false);
        assert!(args.contains(&"-a".to_string()));
        // Granular flags must not appear while archive is on.
        assert!(!args.contains(&"-r".to_string()));
        assert_eq!(args[args.len() - 2], "/src/");
        assert_eq!(args[args.len() - 1], "/dst/");
    }

    #[test]
    fn granular_flags_when_archive_off() {
        let mut t = task();
        t.options.archive = false;
        t.options.recursive = true;
        t.options.perms = true;
        let args = build_args(&t, false);
        assert!(args.contains(&"-r".to_string()));
        assert!(args.contains(&"-p".to_string()));
        assert!(!args.contains(&"-a".to_string()));
    }

    #[test]
    fn dry_run_adds_flag_and_filters_ordering() {
        let mut t = task();
        t.options.includes = vec!["*.jpg".into()];
        t.options.excludes = vec!["*".into()];
        let args = build_args(&t, true);
        assert!(args.contains(&"-n".to_string()));
        let inc = args.iter().position(|a| a == "--include=*.jpg").unwrap();
        let exc = args.iter().position(|a| a == "--exclude=*").unwrap();
        assert!(inc < exc, "includes must precede excludes");
    }

    #[test]
    fn ssh_transport_is_built() {
        let mut t = task();
        t.options.ssh_port = Some(2222);
        t.options.ssh_identity = Some("/key".into());
        let args = build_args(&t, false);
        let e = args.iter().position(|a| a == "-e").unwrap();
        assert_eq!(args[e + 1], "ssh -p 2222 -i /key");
    }

    #[test]
    fn preview_quotes_spaces() {
        let q = preview("rsync", &["-a".into(), "/my dir/".into()]);
        assert_eq!(q, "rsync -a '/my dir/'");
    }

    #[test]
    fn parse_users_example() {
        let cmd = "rsync -avh --delete --progress \
            mpanichella@192.168.1.34:/home/mpanichella/{TeamProjects,.claude,.kube,.ssh,.thunderbird} \
            /var/home/mpanichella/";
        let t = parse_command(cmd);
        assert!(t.options.archive);
        assert!(t.options.verbose);
        assert!(t.options.human_readable);
        assert!(t.options.delete);
        assert!(t.options.progress);
        assert!(!t.options.compress);
        assert_eq!(
            t.source,
            "mpanichella@192.168.1.34:/home/mpanichella/{TeamProjects,.claude,.kube,.ssh,.thunderbird}"
        );
        assert_eq!(t.destination, "/var/home/mpanichella/");
    }

    #[test]
    fn parse_ssh_and_excludes() {
        let cmd = "rsync -az -e \"ssh -p 2222 -i ~/.ssh/id_ed25519\" \
            --exclude=node_modules --exclude '*.tmp' /src/ user@host:/dst/";
        let t = parse_command(cmd);
        assert!(t.options.archive);
        assert!(t.options.compress);
        assert_eq!(t.options.ssh_port, Some(2222));
        assert_eq!(t.options.ssh_identity.as_deref(), Some("~/.ssh/id_ed25519"));
        assert_eq!(t.options.excludes, vec!["node_modules", "*.tmp"]);
        assert_eq!(t.source, "/src/");
        assert_eq!(t.destination, "user@host:/dst/");
    }

    #[test]
    fn parse_unknown_flags_go_to_extra() {
        let t = parse_command("rsync -a --chmod=D755,F644 /a/ /b/");
        assert!(t.options.archive);
        assert_eq!(t.options.extra_args, vec!["--chmod=D755,F644"]);
    }

    #[test]
    fn braces_expand_like_the_shell() {
        assert_eq!(expand_braces("/p/a"), vec!["/p/a"]);
        // No comma -> left as-is (literal path with braces is preserved).
        assert_eq!(expand_braces("/p/{a}"), vec!["/p/{a}"]);
        assert_eq!(
            expand_braces("user@host:/home/me/{TeamProjects,.claude,.ssh}"),
            vec![
                "user@host:/home/me/TeamProjects",
                "user@host:/home/me/.claude",
                "user@host:/home/me/.ssh",
            ]
        );
    }

    #[test]
    fn build_args_expands_source_braces() {
        let mut t = task();
        t.source = "host:/home/me/{a,b,c}".into();
        let args = build_args(&t, false);
        // Destination is last; the three sources precede it.
        assert_eq!(args[args.len() - 1], "/dst/");
        assert!(args.contains(&"host:/home/me/a".to_string()));
        assert!(args.contains(&"host:/home/me/b".to_string()));
        assert!(args.contains(&"host:/home/me/c".to_string()));
        assert!(!args.iter().any(|x| x.contains('{')));
    }
}
