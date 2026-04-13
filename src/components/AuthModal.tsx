import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Mode = 'login' | 'register';

type Props = {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
};

const AuthModal: React.FC<Props> = ({ open, onClose, initialMode = 'login' }) => {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setEmail('');
    setPassword('');
    setLoading(false);
  }, [open, initialMode]);

  if (!open) return null;

  const submit = async () => {
    const e = email.trim();
    if (!e || !password) return alert('请输入账号和密码');
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: e, password });
        if (error) throw error;
        onClose();
        return;
      }
      const { error } = await supabase.auth.signUp({ email: e, password });
      if (error) throw error;
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end md:items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-900 border border-white/10 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="font-black text-gray-100">{mode === 'login' ? '登录' : '注册新用户'}</div>
          <button onClick={onClose} className="text-xs text-gray-400 underline">关闭</button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 text-xs font-bold px-3 py-2 rounded-xl border ${
                mode === 'login' ? 'bg-gold-500 text-black border-gold-500' : 'bg-black/30 text-gray-200 border-white/10'
              }`}
            >
              登录
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 text-xs font-bold px-3 py-2 rounded-xl border ${
                mode === 'register' ? 'bg-gold-500 text-black border-gold-500' : 'bg-black/30 text-gray-200 border-white/10'
              }`}
            >
              注册
            </button>
          </div>

          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="账号（邮箱）"
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100"
          />
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="密码"
            type="password"
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-gray-100"
          />

          <button
            disabled={loading}
            onClick={submit}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-2.5 rounded-xl"
          >
            {mode === 'login' ? '登录' : '注册'}
          </button>

          <div className="text-[10px] text-gray-500">
            注册用户：可永久查看自己的战绩记录。游客：仅展示当天战绩。
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;

