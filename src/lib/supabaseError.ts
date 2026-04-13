type MaybeSupabaseError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
} | null | undefined;

const isSchemaMissingMessage = (message: string) =>
  /Could not find the table .* in the schema cache|Could not find the function .* in the schema cache|column .* of relation .* does not exist|function .* does not exist|relation .* does not exist/i.test(message);

export const getSupabaseErrorMessage = (
  error: unknown,
  fallback = '操作失败'
) => {
  if (error instanceof Error) {
    return isSchemaMissingMessage(error.message)
      ? '数据库尚未执行最新迁移，请先运行 npm run migrate:apply'
      : error.message || fallback;
  }

  const maybe = error as MaybeSupabaseError;
  const code = typeof maybe?.code === 'string' ? maybe.code : '';
  const message = maybe?.message || maybe?.details || maybe?.hint || '';
  if (!message) return fallback;
  if (isSchemaMissingMessage(message)) {
    if (/Could not find the function .* in the schema cache/i.test(message)) {
      return `${code ? `[${code}] ` : ''}数据库端尚未同步最新 RPC，请先运行 npm run migrate:apply，然后运行 npm run supabase:reload`;
    }
    return `${code ? `[${code}] ` : ''}数据库尚未执行最新迁移，请先运行 npm run migrate:apply`;
  }
  if (message === 'invalid round phase') {
    return '当前牌局阶段不允许执行该操作，请刷新房间后重试';
  }
  if (message === 'permission denied') {
    return '当前没有执行该操作的权限，请确认你仍然是本房间庄家';
  }
  if (message === 'round not found') {
    return '当前牌局不存在，请刷新房间后重试';
  }
  return `${code ? `[${code}] ` : ''}${message}`;
};

export const toSupabaseError = (error: unknown, fallback = '操作失败') =>
  new Error(getSupabaseErrorMessage(error, fallback));

