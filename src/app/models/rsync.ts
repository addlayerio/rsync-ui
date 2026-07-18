export interface RsyncOptions {
  archive: boolean;
  recursive: boolean;
  links: boolean;
  perms: boolean;
  times: boolean;
  group: boolean;
  owner: boolean;
  devices: boolean;
  compress: boolean;
  checksum: boolean;
  update: boolean;
  existing: boolean;
  ignoreExisting: boolean;
  inplace: boolean;
  partial: boolean;
  progress: boolean;
  humanReadable: boolean;
  verbose: boolean;
  itemizeChanges: boolean;
  numericIds: boolean;
  hardLinks: boolean;
  oneFileSystem: boolean;
  pruneEmptyDirs: boolean;
  delete: boolean;
  deleteExcluded: boolean;
  backup: boolean;
  backupDir: string | null;
  bwlimit: string | null;
  maxSize: string | null;
  minSize: string | null;
  includes: string[];
  excludes: string[];
  excludeFrom: string | null;
  sshPort: number | null;
  sshIdentity: string | null;
  sshExtra: string | null;
  extraArgs: string[];
}

export interface Schedule {
  enabled: boolean;
  cron: string;
}

export interface RsyncTask {
  id: string;
  name: string;
  source: string;
  destination: string;
  options: RsyncOptions;
  schedule: Schedule;
  createdAt: string;
  updatedAt: string;
}

export type RunStatus =
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export interface RunRecord {
  id: string;
  taskId: string;
  taskName: string;
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  exitCode: number | null;
  trigger: 'manual' | 'scheduled';
  dryRun: boolean;
  command: string;
}

export interface Settings {
  notifications: boolean;
  closeToTray: boolean;
  autostart: boolean;
  startMinimized: boolean;
}

export interface RsyncInfo {
  available: boolean;
  version: string;
}

export interface OutputEvent {
  runId: string;
  taskId: string;
  stream: 'stdout' | 'stderr';
  line: string;
}

export function defaultOptions(): RsyncOptions {
  return {
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
    ignoreExisting: false,
    inplace: false,
    partial: true,
    progress: true,
    humanReadable: true,
    verbose: true,
    itemizeChanges: false,
    numericIds: false,
    hardLinks: false,
    oneFileSystem: false,
    pruneEmptyDirs: false,
    delete: false,
    deleteExcluded: false,
    backup: false,
    backupDir: null,
    bwlimit: null,
    maxSize: null,
    minSize: null,
    includes: [],
    excludes: [],
    excludeFrom: null,
    sshPort: null,
    sshIdentity: null,
    sshExtra: null,
    extraArgs: [],
  };
}

export function defaultTask(): RsyncTask {
  return {
    id: '',
    name: '',
    source: '',
    destination: '',
    options: defaultOptions(),
    schedule: { enabled: false, cron: '0 2 * * *' },
    createdAt: '',
    updatedAt: '',
  };
}
