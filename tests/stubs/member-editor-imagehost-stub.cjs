/** 测试专用 stub:替代 @/src/lib/media/imageHostConfig。
 * post.js handler 入口无条件 await getImageHostConfig()——真模块会走 Supabase 读取链,
 * 测试中以固定配置直返,不触发网络。 */
async function getImageHostConfig() {
  return {
    version: 1,
    uploadApiOrigin: 'https://img.example.com',
    publicAssetOrigin: 'https://img.example.com',
    legacyAssetOrigins: [],
  }
}

module.exports = {
  getImageHostConfig,
  clearImageHostConfigCache() {},
  __reset() {},
}
