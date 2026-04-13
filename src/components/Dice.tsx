import React from 'react';
import { motion } from 'framer-motion';

interface DiceProps {
  value: number;
  isRolling?: boolean;
}

const Dice: React.FC<DiceProps> = ({ value, isRolling = false }) => {
  return (
    <motion.div
      animate={isRolling ? { 
        rotate: [0, 90, 180, 270, 360],
        x: [0, 10, -10, 5, 0],
        y: [0, -5, 5, -10, 0],
      } : { rotate: 0 }}
      transition={isRolling ? { 
        duration: 0.5, 
        repeat: Infinity, 
        ease: "linear" 
      } : { duration: 0.5 }}
      className="w-12 h-12 bg-white rounded-lg shadow-lg border-2 border-gray-300 flex items-center justify-center relative"
    >
      <div className="grid grid-cols-3 grid-rows-3 gap-1 w-8 h-8">
        {/* Render dots based on value */}
        {value === 1 && <div className="col-start-2 row-start-2 w-2 h-2 bg-red-600 rounded-full" />}
        {value === 2 && (
          <>
            <div className="col-start-1 row-start-1 w-2 h-2 bg-black rounded-full" />
            <div className="col-start-3 row-start-3 w-2 h-2 bg-black rounded-full" />
          </>
        )}
        {value === 3 && (
          <>
            <div className="col-start-1 row-start-1 w-2 h-2 bg-black rounded-full" />
            <div className="col-start-2 row-start-2 w-2 h-2 bg-black rounded-full" />
            <div className="col-start-3 row-start-3 w-2 h-2 bg-black rounded-full" />
          </>
        )}
        {value === 4 && (
          <>
            <div className="col-start-1 row-start-1 w-2 h-2 bg-red-600 rounded-full" />
            <div className="col-start-1 row-start-3 w-2 h-2 bg-red-600 rounded-full" />
            <div className="col-start-3 row-start-1 w-2 h-2 bg-red-600 rounded-full" />
            <div className="col-start-3 row-start-3 w-2 h-2 bg-red-600 rounded-full" />
          </>
        )}
        {value === 5 && (
          <>
            <div className="col-start-1 row-start-1 w-2 h-2 bg-black rounded-full" />
            <div className="col-start-1 row-start-3 w-2 h-2 bg-black rounded-full" />
            <div className="col-start-2 row-start-2 w-2 h-2 bg-black rounded-full" />
            <div className="col-start-3 row-start-1 w-2 h-2 bg-black rounded-full" />
            <div className="col-start-3 row-start-3 w-2 h-2 bg-black rounded-full" />
          </>
        )}
        {value === 6 && (
          <>
            <div className="col-start-1 row-start-1 w-2 h-2 bg-black rounded-full" />
            <div className="col-start-1 row-start-2 w-2 h-2 bg-black rounded-full" />
            <div className="col-start-1 row-start-3 w-2 h-2 bg-black rounded-full" />
            <div className="col-start-3 row-start-1 w-2 h-2 bg-black rounded-full" />
            <div className="col-start-3 row-start-2 w-2 h-2 bg-black rounded-full" />
            <div className="col-start-3 row-start-3 w-2 h-2 bg-black rounded-full" />
          </>
        )}
      </div>
    </motion.div>
  );
};

export default Dice;
