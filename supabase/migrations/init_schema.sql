-- Enable RLS
-- Drop existing tables if they exist (for clean start)
DROP TABLE IF EXISTS bets;
DROP TABLE IF EXISTS card_distribution;
DROP TABLE IF EXISTS game_records;
DROP TABLE IF EXISTS rounds;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS rooms;

-- 1. Rooms Table
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  join_code VARCHAR(6) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  max_bet INTEGER NOT NULL DEFAULT 1000,
  banker_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Players Table
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID, -- Link to Supabase Auth if needed
  name VARCHAR(50) NOT NULL,
  role VARCHAR(10) NOT NULL CHECK (role IN ('banker', 'player')),
  position VARCHAR(10) CHECK (position IN ('banker', 'chumen', 'zhongmen', 'momen')),
  is_ready BOOLEAN DEFAULT false,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add reference back to rooms for banker_id
ALTER TABLE rooms ADD CONSTRAINT fk_banker FOREIGN KEY (banker_id) REFERENCES players(id);

-- 3. Rounds Table
CREATE TABLE rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  dice_points JSONB,
  card_distribution JSONB, -- Initial shuffle or per round
  winner_result JSONB,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- 4. Bets Table
CREATE TABLE bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  bet_type VARCHAR(20) NOT NULL CHECK (bet_type IN ('touzi', 'liangdao', 'sandao', 'cha', 'duizi')),
  position VARCHAR(10) NOT NULL CHECK (position IN ('banker', 'chumen', 'zhongmen', 'momen')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  cross_positions JSONB, -- For 'cha' bets, e.g., ['chumen', 'zhongmen']
  profit_loss INTEGER DEFAULT 0,
  placed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Card Distribution Table (for detailed history)
CREATE TABLE card_distribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  position VARCHAR(10) NOT NULL CHECK (position IN ('banker', 'chumen', 'zhongmen', 'momen')),
  cards JSONB NOT NULL, -- Array of integers [1-9, 1-9]
  point_sum INTEGER,
  is_pair BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Game Records Table (for historical analysis)
CREATE TABLE game_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  dice_result JSONB NOT NULL,
  card_distribution JSONB NOT NULL,
  comparison_result JSONB NOT NULL,
  profit_loss JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices
CREATE INDEX idx_rooms_join_code ON rooms(join_code);
CREATE INDEX idx_rooms_status ON rooms(status);
CREATE INDEX idx_players_room_id ON players(room_id);
CREATE INDEX idx_players_position ON players(position);
CREATE INDEX idx_rounds_room_id ON rounds(room_id);
CREATE INDEX idx_rounds_round_number ON rounds(room_id, round_number);
CREATE INDEX idx_bets_round_id ON bets(round_id);
CREATE INDEX idx_bets_player_id ON bets(player_id);
CREATE INDEX idx_game_records_room_id ON game_records(room_id);
CREATE INDEX idx_game_records_player_id ON game_records(player_id);

-- RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_distribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Read Access" ON rooms FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON players FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON rounds FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON bets FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON card_distribution FOR SELECT USING (true);
CREATE POLICY "Public Read Access" ON game_records FOR SELECT USING (true);

-- Allow insertions (simplified for now, ideally would use authenticated user)
CREATE POLICY "Allow Insert Access" ON rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow Insert Access" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow Insert Access" ON rounds FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow Insert Access" ON bets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow Insert Access" ON card_distribution FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow Insert Access" ON game_records FOR INSERT WITH CHECK (true);
