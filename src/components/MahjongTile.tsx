import React from 'react';
import { motion } from 'framer-motion';

interface MahjongTileProps {
  value: number; // 1-9
  revealed?: boolean;
  className?: string;
}

const MahjongTile: React.FC<MahjongTileProps> = ({ value, revealed = true, className = '' }) => {
  return (
    <motion.div
      initial={{ rotateY: 180 }}
      animate={{ rotateY: revealed ? 0 : 180 }}
      transition={{ duration: 0.5 }}
      className={`relative w-12 h-16 rounded-lg bg-white shadow-md border-2 border-gray-300 flex items-center justify-center ${className}`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      {/* Front */}
      <div 
        className="absolute inset-0 backface-hidden flex items-center justify-center text-3xl font-bold text-green-700"
        style={{ backfaceVisibility: 'hidden' }}
      >
        {value}筒
      </div>
      
      {/* Back */}
      <div 
        className="absolute inset-0 backface-hidden bg-green-600 rounded-lg flex items-center justify-center border-2 border-white"
        style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
      >
        <div className="w-8 h-12 border-2 border-white/20 rounded-sm" />
      </div>
    </motion.div>
  );
};

export default MahjongTile;
