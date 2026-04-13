import { supabase, type Database } from './supabase';

export type RoundPhase = Database['public']['Tables']['rounds']['Row']['phase'];
export type RevealPosition = Database['public']['Tables']['round_hands']['Row']['position'];
export type RevealMode = NonNullable<Database['public']['Tables']['rounds']['Row']['reveal_mode']>;
export type RoundHandPublicRow = Database['public']['Views']['vw_round_hands_public']['Row'];
export type RoundHandPrivateRow = Database['public']['Functions']['fn_get_my_round_hand']['Returns'][number];

export type RevealActionResponse = {
  ok: boolean;
  phase: RoundPhase;
  allRevealed?: boolean;
  revealedPosition?: RevealPosition;
  revealedPositions?: RevealPosition[];
};

export async function getRoundHandsPublic(roundId: string) {
  return supabase.rpc('fn_get_round_hands_public', { p_round_id: roundId });
}

export async function getMyRoundHand(roundId: string) {
  const { data, error } = await supabase.rpc('fn_get_my_round_hand', { p_round_id: roundId });
  return {
    data: data?.[0] ?? null,
    error,
  };
}

export async function startDeal() {
  throw new Error('startDeal requires hands payload');
}

export async function startDealWithHands(
  roomId: string,
  roundId: string,
  hands: Array<{
    position: RevealPosition;
    owner_player_id: string | null;
    encrypted_hand: string;
    encrypted_iv?: string;
    encrypted_tag?: string;
  }>
) {
  const { data, error } = await supabase.rpc('rpc_round_deal_start', {
    p_room_id: roomId,
    p_round_id: roundId,
    p_hands: hands,
  });
  return { data: data?.[0] ?? null, error };
}

export async function finishDeal(roundId: string) {
  const { data, error } = await supabase.rpc('rpc_round_deal_finish', { p_round_id: roundId });
  return { data: data?.[0] ?? null, error };
}

export async function revealSingle(roomId: string, roundId: string, position: RevealPosition) {
  const { data, error } = await supabase.rpc('rpc_round_reveal_single', {
    p_round_id: roundId,
    p_position: position,
  });
  return { data: data?.[0] ?? null, error };
}

export async function revealBatch(roomId: string, roundId: string, positions: RevealPosition[]) {
  const { data, error } = await supabase.rpc('rpc_round_reveal_batch', {
    p_round_id: roundId,
    p_positions: positions,
  });
  return { data: data?.[0] ?? null, error };
}

export async function revealSelf(roomId: string, roundId: string) {
  const { data, error } = await supabase.rpc('rpc_round_reveal_self', {
    p_round_id: roundId,
  });
  return { data: data?.[0] ?? null, error };
}

export async function revealMine(roundId: string) {
  const { data, error } = await supabase.rpc('rpc_round_reveal_mine', {
    p_round_id: roundId,
  });
  return { data: data?.[0] ?? null, error };
}

export async function settleRound(roundId: string, winnerResult: Database['public']['Tables']['rounds']['Row']['winner_result']) {
  return supabase.rpc('rpc_round_settle', { p_round_id: roundId, p_winner_result: winnerResult });
}
