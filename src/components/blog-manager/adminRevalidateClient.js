let queuedRevalidateDrainTimers = [];

const REVALIDATE_BATCH_SIZE = 12;
const LIST_MUTATION_REFRESH_STEPS = 2;

export const BLOG_SHELL_REFRESH_COOLDOWN_MS = 30 * 60 * 1000;

function clearQueuedRevalidateDrainTimers() {
  queuedRevalidateDrainTimers.forEach((timer) => clearTimeout(timer));
  queuedRevalidateDrainTimers = [];
}

async function drainQueuedRevalidations() {
  const res = await fetch('/api/admin/revalidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'drain', limit: 30 }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) {
    console.warn('刷新队列处理未完成', data);
  }
  return data;
}

export function scheduleQueuedRevalidateDrain(delayMs = 30_000) {
  if (typeof window === 'undefined') return;
  const safeDelay = Math.max(1000, Number(delayMs) || 30_000);
  clearQueuedRevalidateDrainTimers();

  // 一次入队后做多次轻量消费兜底：
  // 1) 到期消费；2) 网络/标签页节流补偿；3) Notion 索引延迟补偿。
  const delays = [safeDelay, safeDelay + 30_000, safeDelay + 90_000];

  queuedRevalidateDrainTimers = delays.map((delay) =>
    window.setTimeout(async () => {
      try {
        const data = await drainQueuedRevalidations();
        if (data?.pending > 0 || data?.drained >= 30) {
          scheduleQueuedRevalidateDrain(12_000);
        }
      } catch (e) {
        console.warn('刷新队列处理失败', e);
      }
    }, delay)
  );
}

export async function triggerContentRevalidation(payload = {}) {
  try {
    const res = await fetch('/api/admin/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data?.queued) {
      scheduleQueuedRevalidateDrain(data.drainAfterMs);
    }
    return {
      ok: res.ok && data.success !== false,
      status: res.status,
      data,
      queued: Boolean(data.queued),
      succeeded: typeof data.succeeded === 'number' ? data.succeeded : null,
      failed: typeof data.failed === 'number' ? data.failed : null,
      total: typeof data.total === 'number' ? data.total : null,
    };
  } catch (e) {
    console.warn('页面增量刷新请求失败', e);
    return { ok: false, data: null, succeeded: 0, failed: 0, total: 0 };
  }
}

/** 与右上角「刷新BLOG」相同：壳层列表 + 首页预热 */
export function triggerShellBlogRefresh(extra = {}) {
  return triggerContentRevalidation({
    scope: 'shell',
    clearCaches: true,
    freshTheme: true,
    warmPaths: true,
    ...extra,
  });
}

/** 列表变更（移入回收站 / 恢复 / 彻底删除）后：文章处理 + 刷新列表 + 刷新前台 */
export async function executeListMutationWithProgress({
  phase,
  itemCount,
  mutateItems,
  afterRefresh,
  shellRefreshOptions = {},
  setLoading,
  setSavePhase,
  setSaveProgress,
  fetchPostsFn,
}) {
  const total = itemCount + LIST_MUTATION_REFRESH_STEPS;
  setLoading(true);
  setSavePhase(phase);
  setSaveProgress({ done: 0, total });

  const report = (done, hint) => setSaveProgress({ done, total, hint });

  try {
    await mutateItems(report);
    report(itemCount, '正在刷新列表…');
    await fetchPostsFn({ silent: true });
    report(itemCount + 1, '正在刷新前台缓存…');
    const rev = await triggerShellBlogRefresh(shellRefreshOptions);
    if (afterRefresh) await afterRefresh(rev);
    report(total, '完成');
    return rev;
  } finally {
    setLoading(false);
    setSavePhase('');
    setSaveProgress(null);
  }
}

export function showRevalidateFeedback(result, showAdminToastFn) {
  if (!result || !showAdminToastFn) return;
  const { ok, succeeded, failed, total } = result;
  if (result.queued || result.data?.queued) {
    const sec = Math.max(
      1,
      Math.ceil((result.data?.drainAfterMs || 30_000) / 1000)
    );
    showAdminToastFn(`前台刷新已排队，约 ${sec} 秒内自动生效`);
    return;
  }
  if (ok && (failed === 0 || failed === null)) {
    showAdminToastFn(
      total != null && succeeded != null
        ? `前台已更新 ${succeeded} 个页面`
        : '前台页面已更新'
    );
    return;
  }
  if (succeeded != null && failed != null && failed > 0) {
    showAdminToastFn(`部分页面更新失败（${failed}/${total ?? succeeded + failed}）`);
    return;
  }
  if (!ok) {
    showAdminToastFn('前台更新未完成，请稍后重试');
  }
}

/** 分批按需刷新，避免单次 Serverless 超时并降低峰值 CPU */
export async function runBatchedRevalidation(options = {}) {
  const {
    freshTheme = false,
    warmPaths = false,
    contentChange = false,
    onProgress,
    progressLabels = {},
  } = options;
  const {
    listing = '正在统计需要更新的页面…',
    running = '',
    doneOk = '更新完成',
    donePartial = '部分页面需稍后自动更新',
    hintPartial = '个页面未能更新，可点右上角按钮重试',
    hintOk = '前台页面已全部更新',
  } = progressLabels;

  if (onProgress) {
    onProgress({
      step: 2,
      totalSteps: 3,
      label: listing,
      done: 0,
      total: 0,
      hint: '正在读取站点页面列表',
    });
  }

  const listRes = await fetch('/api/admin/revalidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope: 'list', listScope: options.listScope || 'shell' }),
  });
  const listData = await listRes.json();
  if (!listRes.ok || !listData.success) {
    throw new Error(listData.error || '无法获取页面列表');
  }

  const paths = listData.paths || [];
  const total = paths.length;
  let done = 0;
  let failedCount = 0;

  if (onProgress) {
    onProgress({
      step: 2,
      totalSteps: 3,
      label: running,
      done: 0,
      total,
      hint: '',
    });
  }

  for (let i = 0; i < paths.length; i += REVALIDATE_BATCH_SIZE) {
    const batch = paths.slice(i, i + REVALIDATE_BATCH_SIZE);
    const isLastBatch = i + REVALIDATE_BATCH_SIZE >= paths.length;
    const batchRes = await fetch('/api/admin/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scope: 'batch',
        paths: batch,
        clearCaches: i === 0,
        freshTheme,
        warmPaths: warmPaths && isLastBatch,
        contentChange,
      }),
    });
    const batchData = await batchRes.json();
    const batchOk = batchRes.ok && batchData.success !== false;
    const batchSucceeded =
      typeof batchData.succeeded === 'number'
        ? batchData.succeeded
        : batchOk
          ? batch.length
          : 0;
    const batchFailed =
      typeof batchData.failed === 'number'
        ? batchData.failed
        : batchOk
          ? 0
          : batch.length;

    failedCount += batchFailed;
    done += batchSucceeded;

    if (onProgress) {
      onProgress({
        step: 2,
        totalSteps: 3,
        label: running,
        done,
        total,
        hint: '',
      });
    }
  }

  if (warmPaths && paths.includes('/')) {
    try {
      await fetch('/api/admin/revalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'batch',
          paths: ['/'],
          clearCaches: false,
          warmPaths: true,
          contentChange,
        }),
      });
    } catch (e) {
      console.warn('首页预热失败', e);
    }
  }

  if (onProgress) {
    onProgress({
      step: 3,
      totalSteps: 3,
      label: failedCount > 0 ? donePartial : doneOk,
      done: total,
      total,
      hint: failedCount > 0 ? `${failedCount} ${hintPartial}` : hintOk,
    });
  }

  return { total, failed: failedCount, succeeded: done };
}

/** 主题切换：与右上角刷新按钮相同（壳层 + 预热）；内页后台异步更新 */
export async function runThemeRevalidation(onProgress, expectedTheme) {
  if (onProgress) {
    onProgress({
      step: 2,
      totalSteps: 3,
      label: '正在更新首页与列表页…',
      done: 0,
      total: 7,
      hint: '与手动刷新相同流程',
    });
  }

  const shellResult = await triggerContentRevalidation({
    scope: 'shell',
    clearCaches: true,
    freshTheme: true,
    warmPaths: true,
    expectedTheme: expectedTheme || null,
  });

  void runBatchedRevalidation({
    freshTheme: true,
    listScope: 'theme-posts',
    progressLabels: {
      listing: '',
      running: '',
      doneOk: '',
      donePartial: '',
      hintOk: '',
      hintPartial: '',
    },
  }).catch((e) => console.warn('[runThemeRevalidation] theme-posts async failed', e));

  const shellFailed = shellResult.ok ? 0 : 1;
  const shellSucceeded = shellResult.ok ? (shellResult.succeeded ?? 7) : 0;

  if (onProgress) {
    onProgress({
      step: 3,
      totalSteps: 3,
      label: shellFailed > 0 ? '主题已保存，部分列表页需稍后更新' : '主题切换完成',
      done: 7,
      total: 7,
      hint: shellFailed > 0 ? '可点右上角刷新重试' : '最新文章内页将在后台逐步更新',
    });
  }

  return {
    total: shellSucceeded,
    failed: shellFailed,
    succeeded: shellSucceeded,
    shellOk: shellResult.ok,
  };
}
