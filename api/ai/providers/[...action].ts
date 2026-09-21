// Vercel Hobby 计划限 12 个 Serverless Function，模型管理的 8 个端点合并为本 catch-all。
// 实际实现位于 ../_lib/providers/（下划线目录不会被部署为独立函数），URL 路径保持不变：
//   POST/GET/PATCH /api/ai/providers/{list|create|update|delete|reorder|test|set-default|discover}
import { default as listHandler } from '../_lib/providers/list.js';
import { default as createHandler } from '../_lib/providers/create.js';
import { default as updateHandler } from '../_lib/providers/update.js';
import { default as deleteHandler } from '../_lib/providers/delete.js';
import { default as reorderHandler } from '../_lib/providers/reorder.js';
import { default as testHandler } from '../_lib/providers/test.js';
import { default as setDefaultHandler } from '../_lib/providers/set-default.js';
import { default as discoverHandler } from '../_lib/providers/discover.js';

const routes: Record<string, (req: any, res: any) => Promise<void>> = {
  list: listHandler,
  create: createHandler,
  update: updateHandler,
  delete: deleteHandler,
  reorder: reorderHandler,
  test: testHandler,
  'set-default': setDefaultHandler,
  discover: discoverHandler,
};

export default async function handler(req: any, res: any) {
  const action = Array.isArray(req.query?.action)
    ? req.query.action.join('/')
    : String(req.query?.action ?? '');
  const route = routes[action];
  if (!route) {
    return res.status(404).json({ message: '未知的模型管理操作。' });
  }
  // 方法白名单由各 handler 内 endpointKit.skeleton 自行校验
  return route(req, res);
}
