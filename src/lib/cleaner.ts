import { invoke, isTauri } from "@tauri-apps/api/core";

export interface CleanCategory {
  id: string;
  name: string;
  description: string;
  group: "system" | "developer" | "browser" | "user";
  size_bytes: number;
  item_count: number;
  paths: string[];
}

export interface CleanScanResult {
  categories: CleanCategory[];
  total_size_bytes: number;
  total_item_count: number;
  scanned_at_secs: number;
}

export interface CleanExecutionResult {
  bytes_reclaimed: number;
  items_removed: number;
  errors: string[];
}

export interface AppLeftoverItem {
  path: string;
  size_bytes: number;
  category: string;
}

export interface InstalledAppInfo {
  id: string;
  name: string;
  path: string;
  bundle_id: string;
  version: string;
  bundle_size_bytes: number;
  leftover_size_bytes: number;
  total_size_bytes: number;
  leftovers: AppLeftoverItem[];
}

export interface AppUninstallResult {
  app_name: string;
  bundle_removed: boolean;
  leftovers_removed: number;
  bytes_reclaimed: number;
  errors: string[];
}

export interface ProjectArtifactItem {
  path: string;
  project_name: string;
  artifact_type: string;
  size_bytes: number;
  file_count: number;
}

export interface ProjectPurgeScanResult {
  items: ProjectArtifactItem[];
  total_size_bytes: number;
  scanned_path: string;
}

export interface OptimizationTaskResult {
  task_id: string;
  task_name: string;
  success: boolean;
  message: string;
  duration_ms: number;
}

export interface SystemHardwareMetrics {
  cpu_usage_percent: number;
  cpu_core_count: number;
  memory_total_bytes: number;
  memory_used_bytes: number;
  memory_free_bytes: number;
  memory_used_percent: number;
  swap_total_bytes: number;
  swap_used_bytes: number;
  disk_total_bytes: number;
  disk_available_bytes: number;
  disk_used_bytes: number;
  disk_used_percent: number;
  disk_mount_point: string;
  net_bytes_received: number;
  net_bytes_transmitted: number;
  uptime_seconds: number;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, i);
  return `${val >= 100 || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

export async function scanSystemClean(): Promise<CleanScanResult> {
  if (!isTauri()) {
    return {
      categories: [
        {
          id: "user_caches",
          name: "User Application Caches",
          description: "Temporary app caches in ~/Library/Caches",
          group: "system",
          size_bytes: 412 * 1024 * 1024,
          item_count: 820,
          paths: ["/Users/mock/Library/Caches/mock-app"],
        },
        {
          id: "xcode_derived_data",
          name: "Xcode DerivedData",
          description: "Build indexes and build outputs",
          group: "developer",
          size_bytes: 2400 * 1024 * 1024,
          item_count: 1540,
          paths: ["/Users/mock/Library/Developer/Xcode/DerivedData"],
        },
      ],
      total_size_bytes: 2812 * 1024 * 1024,
      total_item_count: 2360,
      scanned_at_secs: Math.floor(Date.now() / 1000),
    };
  }
  return invoke<CleanScanResult>("cleaner_scan_system");
}

export async function executeClean(categoryIds: string[]): Promise<CleanExecutionResult> {
  if (!isTauri()) {
    return {
      bytes_reclaimed: 1500 * 1024 * 1024,
      items_removed: 920,
      errors: [],
    };
  }
  return invoke<CleanExecutionResult>("cleaner_execute_clean", { categoryIds });
}

export async function scanInstalledApps(): Promise<InstalledAppInfo[]> {
  if (!isTauri()) {
    return [
      {
        id: "com.mock.studio",
        name: "Mock Studio",
        path: "/Applications/Mock Studio.app",
        bundle_id: "com.mock.studio",
        version: "2.4.1",
        bundle_size_bytes: 350 * 1024 * 1024,
        leftover_size_bytes: 120 * 1024 * 1024,
        total_size_bytes: 470 * 1024 * 1024,
        leftovers: [
          {
            path: "/Users/mock/Library/Application Support/Mock Studio",
            size_bytes: 80 * 1024 * 1024,
            category: "Application Support",
          },
          {
            path: "/Users/mock/Library/Caches/com.mock.studio",
            size_bytes: 40 * 1024 * 1024,
            category: "Caches",
          },
        ],
      },
    ];
  }
  return invoke<InstalledAppInfo[]>("cleaner_scan_apps");
}

export async function uninstallApp(
  appPath: string,
  leftoverPaths: string[]
): Promise<AppUninstallResult> {
  if (!isTauri()) {
    return {
      app_name: "Mock App",
      bundle_removed: true,
      leftovers_removed: leftoverPaths.length,
      bytes_reclaimed: 470 * 1024 * 1024,
      errors: [],
    };
  }
  return invoke<AppUninstallResult>("cleaner_uninstall_app", {
    appPath,
    leftoverPaths,
  });
}

export async function scanProjectArtifacts(targetDir?: string): Promise<ProjectPurgeScanResult> {
  if (!isTauri()) {
    return {
      items: [
        {
          path: "/Users/mock/Projects/web/node_modules",
          project_name: "web",
          artifact_type: "node_modules",
          size_bytes: 540 * 1024 * 1024,
          file_count: 24000,
        },
        {
          path: "/Users/mock/Projects/backend/target",
          project_name: "backend",
          artifact_type: "target",
          size_bytes: 1800 * 1024 * 1024,
          file_count: 8900,
        },
      ],
      total_size_bytes: 2340 * 1024 * 1024,
      scanned_path: targetDir || "/Users/mock/Projects",
    };
  }
  return invoke<ProjectPurgeScanResult>("cleaner_scan_projects", { targetDir });
}

export async function purgeProjectArtifacts(paths: string[]): Promise<CleanExecutionResult> {
  if (!isTauri()) {
    return {
      bytes_reclaimed: 2340 * 1024 * 1024,
      items_removed: paths.length,
      errors: [],
    };
  }
  return invoke<CleanExecutionResult>("cleaner_purge_projects", { paths });
}

export async function runOptimizationTask(taskId: string): Promise<OptimizationTaskResult> {
  if (!isTauri()) {
    return {
      task_id: taskId,
      task_name: taskId,
      success: true,
      message: "Mock task completed successfully",
      duration_ms: 45,
    };
  }
  return invoke<OptimizationTaskResult>("cleaner_optimize_task", { taskId });
}

export async function getHardwareMetrics(): Promise<SystemHardwareMetrics> {
  if (!isTauri()) {
    return {
      cpu_usage_percent: 18.5,
      cpu_core_count: 8,
      memory_total_bytes: 16 * 1024 * 1024 * 1024,
      memory_used_bytes: 9.2 * 1024 * 1024 * 1024,
      memory_free_bytes: 6.8 * 1024 * 1024 * 1024,
      memory_used_percent: 57.5,
      swap_total_bytes: 2 * 1024 * 1024 * 1024,
      swap_used_bytes: 128 * 1024 * 1024,
      disk_total_bytes: 500 * 1024 * 1024 * 1024,
      disk_available_bytes: 140 * 1024 * 1024 * 1024,
      disk_used_bytes: 360 * 1024 * 1024 * 1024,
      disk_used_percent: 72.0,
      disk_mount_point: "/",
      net_bytes_received: 12048500,
      net_bytes_transmitted: 4520900,
      uptime_seconds: 48200,
    };
  }
  return invoke<SystemHardwareMetrics>("cleaner_get_hardware_metrics");
}
