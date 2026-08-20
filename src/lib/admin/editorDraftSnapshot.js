/**
 * 编辑器本地草稿快照（Phase3 单份 → Phase4 草稿箱多份）
 *
 * 纯函数工具：把后台编辑器的 blocks / form / galleryItems / coverSettings
 * 序列化进 localStorage 的快照数组，或读取 / 删除指定快照。
 * 不引入任何依赖，不在模块级访问 localStorage（SSR 安全）。
 *
 * Phase4 存储结构：
 * - key：`blog_admin_draft_snapshots`，值为数组；
 * - 条目：{ id, version:2, kind:'manual'|'failed', title, postId, slug, createdAt, blocks, form, galleryItems, coverSettings, droppedMediaCount }；
 * - droppedMediaCount：保存时被净化丢弃的未上传媒体数（pending 图片块 + 非 remote 图库项），旧快照无此字段按 0 处理；
 * - 读取时自动迁移 Phase3 旧单份 key（`blog_admin_editor_snapshot`，version 1）并删除旧 key。
 */

const EDITOR_DRAFT_SNAPSHOTS_STORAGE_KEY = 'blog_admin_draft_snapshots';
const LEGACY_EDITOR_DRAFT_SNAPSHOT_STORAGE_KEY = 'blog_admin_editor_snapshot';

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

function createSnapshotId() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 读取快照数组；兼容迁移 Phase3 单份旧 key；任何异常都安全返回 [] */
function readSnapshotArray() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const raw = window.localStorage.getItem(EDITOR_DRAFT_SNAPSHOTS_STORAGE_KEY);
    if (!raw) {
      // 兼容迁移：旧 key 存在（Phase3 单份对象）→ 转成数组并删除旧 key
      const legacyRaw = window.localStorage.getItem(
        LEGACY_EDITOR_DRAFT_SNAPSHOT_STORAGE_KEY
      );
      if (!legacyRaw) return [];
      window.localStorage.removeItem(LEGACY_EDITOR_DRAFT_SNAPSHOT_STORAGE_KEY);
      try {
        const legacy = JSON.parse(legacyRaw);
        if (legacy && typeof legacy === 'object' && Array.isArray(legacy.blocks)) {
          return [
            {
              id: createSnapshotId(),
              version: 2,
              kind: 'manual',
              title: (legacy.form?.title || '').trim(),
              postId: legacy.postId || null,
              slug: legacy.slug || '',
              createdAt: legacy.updatedAt || new Date().toISOString(),
              blocks: legacy.blocks,
              form: legacy.form && typeof legacy.form === 'object' ? legacy.form : {},
              galleryItems: Array.isArray(legacy.galleryItems)
                ? legacy.galleryItems
                : [],
              coverSettings:
                legacy.coverSettings && typeof legacy.coverSettings === 'object'
                  ? legacy.coverSettings
                  : {},
            },
          ];
        }
      } catch {
        // 旧快照损坏：丢弃即可
      }
      return [];
    }
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.filter((e) => e && typeof e === 'object' && Array.isArray(e.blocks))
      : [];
  } catch {
    return [];
  }
}

function writeSnapshotArray(list) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(
      EDITOR_DRAFT_SNAPSHOTS_STORAGE_KEY,
      JSON.stringify(list)
    );
    return true;
  } catch {
    return false;
  }
}

/** 草稿箱 meta 列表（不含 blocks/form 等大字段），按 createdAt 倒序 */
export function listEditorDraftSnapshots() {
  return readSnapshotArray()
    .map(({ id, kind, title, postId, slug, createdAt }) => ({
      id,
      kind: kind === 'failed' ? 'failed' : 'manual',
      title: title || '',
      postId: postId || null,
      slug: slug || '',
      createdAt: createdAt || '',
    }))
    .sort(
      (a, b) =>
        (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
    );
}

/**
 * 写入一份快照；blocks / galleryItems 在此统一净化（不含 File / blob 引用）。
 * 同 postId（或新文章同 slug）且 kind='manual' 的旧条目先移除；kind='failed' 每次一条不覆盖。
 * 返回新快照 id；存储不可用 / 超容量时返回 null。
 */
export function saveEditorDraftSnapshot(snapshot, meta = {}) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const form =
      snapshot && snapshot.form && typeof snapshot.form === 'object'
        ? snapshot.form
        : {};
    const kind = meta.kind === 'failed' ? 'failed' : 'manual';
    const postId = meta.postId || null;
    const slug = meta.slug || '';
    const list = readSnapshotArray();
    const deduped = list.filter((entry) => {
      if (kind !== 'manual' || entry.kind !== 'manual') return true;
      if (postId && entry.postId && entry.postId === postId) return false;
      if (!postId && slug && !entry.postId && entry.slug && entry.slug === slug) {
        return false;
      }
      return true;
    });
    // 净化前统计将被丢弃的未上传媒体数（正文 pending 图片块 + 非 remote 图库项）
    const rawBlocks =
      snapshot && Array.isArray(snapshot.blocks) ? snapshot.blocks : [];
    const rawGalleryItems =
      snapshot && Array.isArray(snapshot.galleryItems)
        ? snapshot.galleryItems
        : [];
    const droppedMediaCount =
      rawBlocks.filter(
        (b) =>
          b &&
          typeof b === 'object' &&
          b.type === 'image' &&
          (b.pendingFile ||
            (typeof b.content === 'string' && b.content.startsWith('blob:')))
      ).length +
      rawGalleryItems.filter((it) => it && it.status !== 'remote').length;
    const entry = {
      id: createSnapshotId(),
      version: 2,
      kind,
      title: ((meta.title || form.title || '')).trim() || '未命名',
      postId,
      slug,
      createdAt: new Date().toISOString(),
      blocks: sanitizeEditorBlocksForSnapshot(snapshot && snapshot.blocks),
      form,
      galleryItems: sanitizeGalleryItemsForSnapshot(
        snapshot && snapshot.galleryItems
      ),
      coverSettings:
        snapshot && snapshot.coverSettings && typeof snapshot.coverSettings === 'object'
          ? snapshot.coverSettings
          : {},
      droppedMediaCount,
    };
    deduped.push(entry);
    return writeSnapshotArray(deduped) ? entry.id : null;
  } catch {
    return null;
  }
}

/** 读取一份完整快照（含大字段）；不存在或损坏时返回 null */
export function loadEditorDraftSnapshot(id) {
  if (!id) return null;
  const found = readSnapshotArray().find((entry) => entry.id === id);
  return found || null;
}

/** 删除指定快照（忽略失败） */
export function removeEditorDraftSnapshot(id) {
  if (!id) return;
  writeSnapshotArray(readSnapshotArray().filter((entry) => entry.id !== id));
}

/** 按 postId 或 slug 清理该文章的全部快照（发布 / 存草稿成功后调用） */
export function clearEditorDraftSnapshotsForPost(postIdOrSlug) {
  const key = (postIdOrSlug || '').trim();
  if (!key) return;
  writeSnapshotArray(
    readSnapshotArray().filter(
      (entry) => entry.postId !== key && entry.slug !== key
    )
  );
}

/** 清空全部本地快照（含旧 key，供忽略 / 迁移兜底用） */
export function clearEditorDraftSnapshot() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(EDITOR_DRAFT_SNAPSHOTS_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_EDITOR_DRAFT_SNAPSHOT_STORAGE_KEY);
  } catch {
    // ignore
  }
}
