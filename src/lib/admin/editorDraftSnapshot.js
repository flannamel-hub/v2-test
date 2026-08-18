/**
 * 编辑器本地草稿快照（Phase3）
 *
 * 纯函数工具：把后台编辑器的 blocks / form / galleryItems 序列化进 localStorage，
 * 或读取 / 删除快照。不引入任何依赖，不在模块级访问 localStorage（SSR 安全）。
 */

const EDITOR_DRAFT_SNAPSHOT_STORAGE_KEY = 'blog_admin_editor_snapshot';

function isBlobUrl(url) {
  return typeof url === 'string' && url.startsWith('blob:');
}

/**
 * 净化编辑器 blocks：
 * - pending 图片 / 视频块（pendingFile + blob: 预览）无法序列化，恢复后预览也会失效，直接丢弃；
 * - lock 块中 pending 加密图片同样无法恢复，剔除引用；
 * - 其余字段原样保留（content / url / pwd / checked / images / 格式化字段等）。
 */
export function sanitizeEditorBlocksForSnapshot(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((b) => b && typeof b === 'object')
    .filter((b) => {
      if (b.type === 'image' && (b.pendingFile || isBlobUrl(b.content))) return false;
      return true;
    })
    .map((b) => {
      const next = { ...b };
      delete next.pendingFile;
      delete next.uploading;
      if (Array.isArray(next.pendingImageFiles) && next.pendingImageFiles.length) {
        const pendingUrls = new Set(
          next.pendingImageFiles.map((p) => p && p.url).filter(Boolean)
        );
        next.images = (next.images || []).filter(
          (u) => !pendingUrls.has(u) && !isBlobUrl(u)
        );
      }
      if (Array.isArray(next.pendingImageFiles) && !next.pendingImageFiles.length) {
        delete next.pendingImageFiles;
      } else {
        next.pendingImageFiles = [];
      }
      return next;
    });
}

/**
 * 净化 galleryItems：只保留 remote 项的元数据字段（不含 File / blob 预览）。
 */
export function sanitizeGalleryItemsForSnapshot(items) {
  return (Array.isArray(items) ? items : [])
    .filter((it) => it && it.status === 'remote')
    .map((it) => ({
      id: it.id,
      status: 'remote',
      url: it.url || '',
      fileSize: it.fileSize ?? null,
      isCover: !!it.isCover,
    }));
}

/** 写入快照；返回是否成功（隐私模式 / 超容量时返回 false） */
export function saveEditorDraftSnapshot(snapshot) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(
      EDITOR_DRAFT_SNAPSHOT_STORAGE_KEY,
      JSON.stringify({ ...snapshot, version: 1 })
    );
    return true;
  } catch {
    return false;
  }
}

/** 读取快照；不存在或损坏时返回 null */
export function loadEditorDraftSnapshot() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(EDITOR_DRAFT_SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap || typeof snap !== 'object' || !Array.isArray(snap.blocks)) return null;
    return snap;
  } catch {
    return null;
  }
}

/** 删除快照（忽略失败） */
export function clearEditorDraftSnapshot() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(EDITOR_DRAFT_SNAPSHOT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
