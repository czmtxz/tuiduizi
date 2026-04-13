import { createClient } from '@supabase/supabase-js';

declare const __SUPABASE_URL__: string | undefined;
declare const __SUPABASE_ANON_KEY__: string | undefined;

const injectedUrl = typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : undefined;
const injectedKey = typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? __SUPABASE_ANON_KEY__ : undefined;

const viteUrl = import.meta.env?.VITE_SUPABASE_URL;
const viteKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

const supabaseUrl = injectedUrl || viteUrl;
const supabaseAnonKey = injectedKey || viteKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const base64UrlDecode = (input: string) => {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  return decodeURIComponent(
    Array.from(atob(base64))
      .map(c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
      .join('')
  );
};

const extractRefFromAnonKey = (key: string) => {
  try {
    const parts = key.split('.');
    if (parts.length < 2) return null;
    const payloadRaw = base64UrlDecode(parts[1]);
    const payload = JSON.parse(payloadRaw) as { ref?: string };
    return payload.ref || null;
  } catch {
    return null;
  }
};

const extractRefFromUrl = (url: string) => {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m?.[1] || null;
  } catch {
    return null;
  }
};

const refFromKey = extractRefFromAnonKey(supabaseAnonKey);
const refFromUrl = extractRefFromUrl(supabaseUrl);
if (refFromKey && refFromUrl && refFromKey !== refFromUrl) {
  throw new Error(`Supabase 配置不一致：URL ref=${refFromUrl}，ANON_KEY ref=${refFromKey}`);
}

export const SUPABASE_URL = supabaseUrl;

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      rooms: {
        Row: {
          id: string;
          join_code: string;
          status: 'waiting' | 'playing' | 'finished';
          max_bet: number;
          bet_step: number;
          touzi_min_bet: number;
          touzi_max_bet: number;
          cha_min_bet: number;
          cha_max_bet: number;
          allow_hong: boolean;
          hong_min_bet: number;
          hong_max_bet: number;
          ai_enabled: boolean;
          banker_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          join_code: string;
          status?: 'waiting' | 'playing' | 'finished';
          max_bet?: number;
          bet_step?: number;
          touzi_min_bet?: number;
          touzi_max_bet?: number;
          cha_min_bet?: number;
          cha_max_bet?: number;
          allow_hong?: boolean;
          hong_min_bet?: number;
          hong_max_bet?: number;
          ai_enabled?: boolean;
          banker_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          join_code?: string;
          status?: 'waiting' | 'playing' | 'finished';
          max_bet?: number;
          bet_step?: number;
          touzi_min_bet?: number;
          touzi_max_bet?: number;
          cha_min_bet?: number;
          cha_max_bet?: number;
          allow_hong?: boolean;
          hong_min_bet?: number;
          hong_max_bet?: number;
          ai_enabled?: boolean;
          banker_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      players: {
        Row: {
          id: string;
          room_id: string;
          user_id: string | null;
          name: string;
          role: 'banker' | 'player';
          position: 'banker' | 'chumen' | 'zhongmen' | 'momen' | null;
          is_ready: boolean;
          is_active: boolean;
          left_at: string | null;
          joined_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id?: string | null;
          name: string;
          role: 'banker' | 'player';
          position?: 'banker' | 'chumen' | 'zhongmen' | 'momen' | null;
          is_ready?: boolean;
          is_active?: boolean;
          left_at?: string | null;
          joined_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string | null;
          name?: string;
          role?: 'banker' | 'player';
          position?: 'banker' | 'chumen' | 'zhongmen' | 'momen' | null;
          is_ready?: boolean;
          is_active?: boolean;
          left_at?: string | null;
          joined_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      room_messages: {
        Row: {
          id: string;
          room_id: string;
          player_id: string | null;
          sender_name: string;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          player_id?: string | null;
          sender_name: string;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          player_id?: string | null;
          sender_name?: string;
          content?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      rounds: {
        Row: {
          id: string;
          room_id: string;
          round_number: number;
          dice_points: Json | null;
          card_distribution: Json | null;
          winner_result: Json | null;
          status: 'active' | 'completed' | 'cancelled';
          phase: 'betting' | 'dice_done' | 'dealing' | 'wait_reveal' | 'revealing' | 'settling' | 'settled';
          dealer_player_id: string | null;
          reveal_mode: 'single' | 'batch' | null;
          all_revealed: boolean;
          bet_done_chumen: boolean;
          bet_done_zhongmen: boolean;
          bet_done_momen: boolean;
          bet_closed_at: string | null;
          bet_closed_by: string | null;
          created_at: string;
          dealt_at: string | null;
          reveal_started_at: string | null;
          settled_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          room_id: string;
          round_number: number;
          dice_points?: Json | null;
          card_distribution?: Json | null;
          winner_result?: Json | null;
          status?: 'active' | 'completed' | 'cancelled';
          phase?: 'betting' | 'dice_done' | 'dealing' | 'wait_reveal' | 'revealing' | 'settling' | 'settled';
          dealer_player_id?: string | null;
          reveal_mode?: 'single' | 'batch' | null;
          all_revealed?: boolean;
          bet_done_chumen?: boolean;
          bet_done_zhongmen?: boolean;
          bet_done_momen?: boolean;
          bet_closed_at?: string | null;
          bet_closed_by?: string | null;
          created_at?: string;
          dealt_at?: string | null;
          reveal_started_at?: string | null;
          settled_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          room_id?: string;
          round_number?: number;
          dice_points?: Json | null;
          card_distribution?: Json | null;
          winner_result?: Json | null;
          status?: 'active' | 'completed' | 'cancelled';
          phase?: 'betting' | 'dice_done' | 'dealing' | 'wait_reveal' | 'revealing' | 'settling' | 'settled';
          dealer_player_id?: string | null;
          reveal_mode?: 'single' | 'batch' | null;
          all_revealed?: boolean;
          bet_done_chumen?: boolean;
          bet_done_zhongmen?: boolean;
          bet_done_momen?: boolean;
          bet_closed_at?: string | null;
          bet_closed_by?: string | null;
          created_at?: string;
          dealt_at?: string | null;
          reveal_started_at?: string | null;
          settled_at?: string | null;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      round_hands: {
        Row: {
          id: string;
          room_id: string;
          round_id: string;
          position: 'banker' | 'chumen' | 'zhongmen' | 'momen';
          owner_player_id: string | null;
          encrypted_hand: string;
          encrypted_iv: string;
          encrypted_tag: string;
          public_hand: Json | null;
          is_revealed: boolean;
          revealed_at: string | null;
          revealed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          round_id: string;
          position: 'banker' | 'chumen' | 'zhongmen' | 'momen';
          owner_player_id?: string | null;
          encrypted_hand: string;
          encrypted_iv: string;
          encrypted_tag: string;
          public_hand?: Json | null;
          is_revealed?: boolean;
          revealed_at?: string | null;
          revealed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          round_id?: string;
          position?: 'banker' | 'chumen' | 'zhongmen' | 'momen';
          owner_player_id?: string | null;
          encrypted_hand?: string;
          encrypted_iv?: string;
          encrypted_tag?: string;
          public_hand?: Json | null;
          is_revealed?: boolean;
          revealed_at?: string | null;
          revealed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      round_operation_logs: {
        Row: {
          id: string;
          room_id: string;
          round_id: string;
          operator_player_id: string | null;
          action_type:
            | 'dice_done'
            | 'deal_start'
            | 'deal_finish'
            | 'reveal_single'
            | 'reveal_batch'
            | 'reveal_self'
            | 'settle_start'
            | 'settle_finish';
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          round_id: string;
          operator_player_id?: string | null;
          action_type:
            | 'dice_done'
            | 'deal_start'
            | 'deal_finish'
            | 'reveal_single'
            | 'reveal_batch'
            | 'reveal_self'
            | 'settle_start'
            | 'settle_finish';
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          round_id?: string;
          operator_player_id?: string | null;
          action_type?:
            | 'dice_done'
            | 'deal_start'
            | 'deal_finish'
            | 'reveal_single'
            | 'reveal_batch'
            | 'reveal_self'
            | 'settle_start'
            | 'settle_finish';
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      audio_event_logs: {
        Row: {
          id: string;
          room_id: string;
          round_id: string | null;
          event_type: 'bet_sfx';
          bet_type: 'touzi' | 'liangdao' | 'sandao' | 'cha' | 'duizi' | 'hong';
          amount: number;
          locale: string;
          scheduled_at: string;
          created_by: string | null;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          round_id?: string | null;
          event_type?: 'bet_sfx';
          bet_type: 'touzi' | 'liangdao' | 'sandao' | 'cha' | 'duizi' | 'hong';
          amount: number;
          locale?: string;
          scheduled_at?: string;
          created_by?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          round_id?: string | null;
          event_type?: 'bet_sfx';
          bet_type?: 'touzi' | 'liangdao' | 'sandao' | 'cha' | 'duizi' | 'hong';
          amount?: number;
          locale?: string;
          scheduled_at?: string;
          created_by?: string | null;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      rtc_sessions: {
        Row: {
          id: string;
          room_id: string;
          player_id: string;
          rtc_room_id: string;
          status: 'off' | 'connecting' | 'on';
          muted: boolean;
          mic_permission: 'unknown' | 'granted' | 'denied';
          joined_at: string | null;
          left_at: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          player_id: string;
          rtc_room_id: string;
          status: 'off' | 'connecting' | 'on';
          muted?: boolean;
          mic_permission?: 'unknown' | 'granted' | 'denied';
          joined_at?: string | null;
          left_at?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          player_id?: string;
          rtc_room_id?: string;
          status?: 'off' | 'connecting' | 'on';
          muted?: boolean;
          mic_permission?: 'unknown' | 'granted' | 'denied';
          joined_at?: string | null;
          left_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      voice_reports: {
        Row: {
          id: string;
          room_id: string;
          reporter_player_id: string;
          target_player_id: string;
          rtc_session_id: string | null;
          reason: string;
          status: 'open' | 'reviewed' | 'resolved' | 'rejected';
          admin_note: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          reporter_player_id: string;
          target_player_id: string;
          rtc_session_id?: string | null;
          reason: string;
          status?: 'open' | 'reviewed' | 'resolved' | 'rejected';
          admin_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          reporter_player_id?: string;
          target_player_id?: string;
          rtc_session_id?: string | null;
          reason?: string;
          status?: 'open' | 'reviewed' | 'resolved' | 'rejected';
          admin_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      voice_penalties: {
        Row: {
          id: string;
          room_id: string;
          target_player_id: string;
          report_id: string | null;
          action_type: 'mute';
          reason: string;
          created_by: string | null;
          expires_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          target_player_id: string;
          report_id?: string | null;
          action_type?: 'mute';
          reason: string;
          created_by?: string | null;
          expires_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          target_player_id?: string;
          report_id?: string | null;
          action_type?: 'mute';
          reason?: string;
          created_by?: string | null;
          expires_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          id: number;
          allow_guest: boolean;
          voice_provider: 'auto' | 'agora' | 'livekit' | 'browser';
          updated_at: string;
        };
        Insert: {
          id?: number;
          allow_guest?: boolean;
          voice_provider?: 'auto' | 'agora' | 'livekit' | 'browser';
          updated_at?: string;
        };
        Update: {
          id?: number;
          allow_guest?: boolean;
          voice_provider?: 'auto' | 'agora' | 'livekit' | 'browser';
          updated_at?: string;
        };
        Relationships: [];
      };
      voice_event_logs: {
        Row: {
          id: string;
          room_id: string;
          round_id: string | null;
          event_key: string;
          text: string;
          locale: string;
          scheduled_at: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          round_id?: string | null;
          event_key: string;
          text: string;
          locale?: string;
          scheduled_at?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          round_id?: string | null;
          event_key?: string;
          text?: string;
          locale?: string;
          scheduled_at?: string;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      bets: {
        Row: {
          id: string;
          round_id: string;
          player_id: string;
          bet_type: 'touzi' | 'liangdao' | 'sandao' | 'cha' | 'duizi' | 'hong';
          position: 'banker' | 'chumen' | 'zhongmen' | 'momen';
          amount: number;
          cross_positions: Json | null;
          profit_loss: number;
          placed_at: string;
        };
        Insert: {
          id?: string;
          round_id: string;
          player_id: string;
          bet_type: 'touzi' | 'liangdao' | 'sandao' | 'cha' | 'duizi' | 'hong';
          position: 'banker' | 'chumen' | 'zhongmen' | 'momen';
          amount: number;
          cross_positions?: Json | null;
          profit_loss?: number;
          placed_at?: string;
        };
        Update: {
          id?: string;
          round_id?: string;
          player_id?: string;
          bet_type?: 'touzi' | 'liangdao' | 'sandao' | 'cha' | 'duizi' | 'hong';
          position?: 'banker' | 'chumen' | 'zhongmen' | 'momen';
          amount?: number;
          cross_positions?: Json | null;
          profit_loss?: number;
          placed_at?: string;
        };
        Relationships: [];
      };
      game_records: {
        Row: {
          id: string;
          room_id: string;
          player_id: string;
          user_id: string | null;
          dice_result: Json;
          card_distribution: Json;
          comparison_result: Json;
          profit_loss: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          player_id: string;
          user_id?: string | null;
          dice_result: Json;
          card_distribution: Json;
          comparison_result: Json;
          profit_loss: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          player_id?: string;
          user_id?: string | null;
          dice_result?: Json;
          card_distribution?: Json;
          comparison_result?: Json;
          profit_loss?: Json;
          created_at?: string;
        };
        Relationships: [];
      };

      admin_users: {
        Row: {
          user_id: string;
        };
        Insert: {
          user_id: string;
        };
        Update: {
          user_id?: string;
        };
        Relationships: [];
      };

      admin_emails: {
        Row: {
          email: string;
          created_at: string;
        };
        Insert: {
          email: string;
          created_at?: string;
        };
        Update: {
          email?: string;
          created_at?: string;
        };
        Relationships: [];
      };

      room_invites: {
        Row: {
          id: string;
          room_id: string;
          join_code: string;
          status: string;
          inviter_player_id: string | null;
          max_bet: number | null;
          bet_step: number | null;
          touzi_min_bet: number | null;
          touzi_max_bet: number | null;
          cha_min_bet: number | null;
          cha_max_bet: number | null;
          allow_hong: boolean | null;
          hong_min_bet: number | null;
          hong_max_bet: number | null;
          created_at: string;
          accepted_at: string | null;
        };
        Insert: {
          id?: string;
          room_id: string;
          join_code: string;
          status?: string;
          inviter_player_id?: string | null;
          max_bet?: number | null;
          bet_step?: number | null;
          touzi_min_bet?: number | null;
          touzi_max_bet?: number | null;
          cha_min_bet?: number | null;
          cha_max_bet?: number | null;
          allow_hong?: boolean | null;
          hong_min_bet?: number | null;
          hong_max_bet?: number | null;
          created_at?: string;
          accepted_at?: string | null;
        };
        Update: {
          id?: string;
          room_id?: string;
          join_code?: string;
          status?: string;
          inviter_player_id?: string | null;
          max_bet?: number | null;
          bet_step?: number | null;
          touzi_min_bet?: number | null;
          touzi_max_bet?: number | null;
          cha_min_bet?: number | null;
          cha_max_bet?: number | null;
          allow_hong?: boolean | null;
          hong_min_bet?: number | null;
          hong_max_bet?: number | null;
          created_at?: string;
          accepted_at?: string | null;
        };
        Relationships: [];
      };
      card_distribution: {
        Row: {
          id: string;
          round_id: string;
          position: 'banker' | 'chumen' | 'zhongmen' | 'momen';
          cards: Json;
          point_sum: number | null;
          is_pair: boolean | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          round_id: string;
          position: 'banker' | 'chumen' | 'zhongmen' | 'momen';
          cards: Json;
          point_sum?: number | null;
          is_pair?: boolean | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          round_id?: string;
          position?: 'banker' | 'chumen' | 'zhongmen' | 'momen';
          cards?: Json;
          point_sum?: number | null;
          is_pair?: boolean | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      vw_round_hands_public: {
        Row: {
          room_id: string | null;
          round_id: string | null;
          position: 'banker' | 'chumen' | 'zhongmen' | 'momen' | null;
          is_revealed: boolean | null;
          public_hand: Json | null;
          revealed_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      fn_get_round_hands_public: {
        Args: {
          p_round_id: string;
        };
        Returns: {
          room_id: string;
          round_id: string;
          position: string;
          is_revealed: boolean;
          public_hand: Json | null;
          revealed_at: string | null;
        }[];
      };
      fn_get_my_round_hand: {
        Args: {
          p_round_id: string;
        };
        Returns: {
          room_id: string;
          round_id: string;
          position: string;
          owner_player_id: string | null;
          encrypted_hand: string;
          encrypted_iv: string;
          encrypted_tag: string;
          public_hand: Json | null;
          is_revealed: boolean;
          revealed_at: string | null;
        }[];
      };
      rpc_round_deal_finish: {
        Args: {
          p_round_id: string;
        };
        Returns: {
          ok: boolean;
          phase: string;
        }[];
      };
      rpc_round_deal_start: {
        Args: {
          p_room_id: string;
          p_round_id: string;
          p_hands: Json;
        };
        Returns: {
          ok: boolean;
          phase: string;
        }[];
      };
      rpc_round_reveal_single: {
        Args: {
          p_round_id: string;
          p_position: string;
        };
        Returns: {
          ok: boolean;
          phase: string;
          all_revealed: boolean;
          revealed_position: string;
        }[];
      };
      rpc_round_reveal_batch: {
        Args: {
          p_round_id: string;
          p_positions: string[];
        };
        Returns: {
          ok: boolean;
          phase: string;
          all_revealed: boolean;
          revealed_positions: string[];
        }[];
      };
      rpc_round_reveal_self: {
        Args: {
          p_round_id: string;
        };
        Returns: {
          ok: boolean;
          phase: string;
          all_revealed: boolean;
          revealed_position: string;
        }[];
      };
      rpc_round_reveal_mine: {
        Args: {
          p_round_id: string;
        };
        Returns: {
          ok: boolean;
          phase: string;
          all_revealed: boolean;
          revealed_position: string;
        }[];
      };
      rpc_round_bet_done: {
        Args: {
          p_round_id: string;
        };
        Returns: {
          ok: boolean;
          seat_pos: string;
        }[];
      };
      rpc_round_bet_close: {
        Args: {
          p_round_id: string;
        };
        Returns: {
          ok: boolean;
        }[];
      };
      rpc_log_voice_event: {
        Args: {
          p_round_id: string;
          p_event_key: string;
          p_text: string;
          p_locale?: string;
        };
        Returns: {
          ok: boolean;
          event_id: string;
          scheduled_at: string;
        }[];
      };
      rpc_round_settle: {
        Args: {
          p_round_id: string;
          p_winner_result: Json;
        };
        Returns: Json;
      };
      rpc_log_bet_audio_event: {
        Args: {
          p_round_id: string;
          p_bet_type: string;
          p_amount: number;
          p_locale?: string;
        };
        Returns: {
          ok: boolean;
          event_id: string;
          scheduled_at: string;
        }[];
      };
      rpc_upsert_voice_session: {
        Args: {
          p_room_id: string;
          p_enabled: boolean;
          p_muted?: boolean;
          p_mic_permission?: string;
        };
        Returns: {
          ok: boolean;
          status: string;
          muted: boolean;
          rtc_room_id: string;
        }[];
      };
      rpc_leave_voice_session: {
        Args: {
          p_room_id: string;
        };
        Returns: {
          ok: boolean;
          status: string;
        }[];
      };
      rpc_submit_voice_report: {
        Args: {
          p_room_id: string;
          p_target_player_id: string;
          p_reason: string;
        };
        Returns: {
          ok: boolean;
          report_id: string;
          status: string;
        }[];
      };
      rpc_review_voice_report: {
        Args: {
          p_report_id: string;
          p_status: string;
          p_admin_note?: string | null;
        };
        Returns: {
          ok: boolean;
          status: string;
        }[];
      };
      rpc_issue_voice_penalty: {
        Args: {
          p_room_id: string;
          p_target_player_id: string;
          p_report_id?: string | null;
          p_reason?: string;
          p_duration_minutes?: number;
        };
        Returns: {
          ok: boolean;
          penalty_id: string;
          expires_at: string;
        }[];
      };
      rpc_revoke_voice_penalty: {
        Args: {
          p_penalty_id: string;
        };
        Returns: {
          ok: boolean;
          revoked_at: string;
        }[];
      };
      cleanup_inactive_rooms: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
