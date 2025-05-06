/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { RefObject } from 'react';

interface HairSelectionProps {
  handleScrollUp: () => void;
  buttonRefs: RefObject<(HTMLButtonElement | null)[]>;
  scrollContainerRef: RefObject<null>;
  hairColorList: any[];
  filterHair: any;
  onChangeSelectHair: (color: any) => void;
  handleScrollDown: () => void;
}

const HairSelection: React.FC<HairSelectionProps> = ({
  handleScrollUp,
  buttonRefs,
  scrollContainerRef,
  hairColorList,
  filterHair,
  onChangeSelectHair,
  handleScrollDown
}) => {
  return (
    <div className="md:w-2/12 bg-white p-4 md:p-6 rounded-xl shadow-md flex flex-col max-h-[calc(100vh-128px)] overflow-hidden">
    <button
      onClick={handleScrollUp}
      ref={(el) => {
        buttonRefs.current[0] = el;
      }}
      className="mt-2 text-[50px] cursor-pointer text-[#db2777] flex items-center min-h-[120px] justify-center gap-4 border-4 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-300 ease-in-out"
    >↑</button>
    <div
      ref={scrollContainerRef}
      className="hide-scrollbar flex flex-col my-1 gap-6 flex-1 max-w-full overflow-y-auto flex-nowrap mb-1 pb-1"
    >
      {hairColorList.map((color: any, index: any) => (
      <button
          key={color.name + (filterHair === color.key ? 1 : 0)}
          className={`flex cursor-pointer items-center border-4 min-h-[120px] justify-center gap-4 rounded-lg shadow-sm hover:shadow-md transition-shadow
            ${filterHair === color.key ? "border-[#db2777]" : ""}
          `}
          ref={(el) => {
            buttonRefs.current[index + 2] = el;
          }}
          onClick={() => onChangeSelectHair(color)}
      >
          <div
          className="w-8 h-8 rounded-full"
          style={{
              backgroundColor: `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`,
          }}
          ></div>
          <span className="text-gray-700 font-medium">{color.name}</span>
      </button>
      ))}
    </div>
    <button
      onClick={handleScrollDown}
      ref={(el) => {
        buttonRefs.current[1] = el;
      }}
      className="text-[50px] cursor-pointer text-[#db2777] flex items-center min-h-[120px] justify-center gap-4 border-4 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-300 ease-in-out"
    >↓</button>
  </div>
  );
  
};

export default React.memo(HairSelection,
(prevProps, nextProps) => {
  return (
    prevProps.filterHair === nextProps.filterHair
  );
});