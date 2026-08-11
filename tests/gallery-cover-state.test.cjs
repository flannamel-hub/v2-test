const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { test } = require('node:test')
const babel = require('@babel/core')

const repoRoot = path.resolve(__dirname, '..')
const coverSettingsPath = path.join(repoRoot, 'src/lib/admin/coverSettings.js')
const editorCoverPath = path.join(repoRoot, 'src/lib/admin/editorCover.js')
const originalJsLoader = require.extensions['.js']
const originalLoad = Module._load
const originalResolveFilename = Module._resolveFilename

Module._resolveFilename = function resolveProjectAlias(request, parent, isMain, options) {
  const resolvedRequest = request.startsWith('@/')
    ? path.join(repoRoot, request.slice(2))
    : request
  return originalResolveFilename.call(this, resolvedRequest, parent, isMain, options)
}

Module._load = function loadWithCoverDependencies(request, parent, isMain) {
  if (request === '@/blog.config') {
    return { __esModule: true, default: { DEFAULT_POST_COVER: 'https://example.com/default.jpg' } }
  }
  if (request === '@/src/lib/gallery/postCover') {
    return { isDefaultPostCover: (url) => url === 'https://example.com/default.jpg' }
  }
  return originalLoad.call(this, request, parent, isMain)
}

require.extensions['.js'] = function transpileCoverModules(module, filename) {
  if (filename !== coverSettingsPath && filename !== editorCoverPath) {
    return originalJsLoader(module, filename)
  }
  const source = fs.readFileSync(filename, 'utf8')
  const result = babel.transformSync(source, {
    babelrc: false,
    configFile: false,
    filename,
    presets: [
      [
        require.resolve('@babel/preset-env'),
        { targets: { node: 'current' }, modules: 'commonjs' },
      ],
    ],
  })
  return module._compile(result.code, filename)
}

const {
  COVER_MODE_GALLERY,
  applyGalleryCoverSelection,
  resolveEditorGalleryCoverIndex,
  resolveNotionCoverForSave,
  restoreEditorCoverState,
} = require('../src/lib/admin/coverSettings.js')

Module._load = originalLoad
Module._resolveFilename = originalResolveFilename
require.extensions['.js'] = originalJsLoader

function galleryItems() {
  return [1, 2, 3].map((number) => ({
    id: `image-${number}`,
    status: 'remote',
    url: `https://img.vlogs.cc/gallery/${number}.jpg`,
    isCover: false,
  }))
}

test('二次打开后可以改选图库封面并再次正确恢复', () => {
  const opened = restoreEditorCoverState({
    savedCoverUrl: 'https://img.vlogs.cc/gallery/2.jpg',
    galleryItems: galleryItems(),
  })
  assert.equal(opened.coverSettings.mode, COVER_MODE_GALLERY)
  assert.equal(
    resolveEditorGalleryCoverIndex(opened.galleryItems, opened.coverSettings.mode),
    1
  )

  const changed = applyGalleryCoverSelection(opened.galleryItems, 2)
  const savedCoverUrl = resolveNotionCoverForSave({
    coverMode: changed.coverSettings.mode,
    galleryItems: changed.galleryItems,
  })
  assert.equal(savedCoverUrl, 'https://img.vlogs.cc/gallery/3.jpg')

  const reopened = restoreEditorCoverState({
    savedCoverUrl,
    galleryItems: galleryItems(),
  })
  assert.equal(reopened.coverSettings.mode, COVER_MODE_GALLERY)
  assert.equal(
    resolveEditorGalleryCoverIndex(reopened.galleryItems, reopened.coverSettings.mode),
    2
  )
})
