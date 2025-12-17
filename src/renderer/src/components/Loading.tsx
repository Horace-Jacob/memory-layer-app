import React from 'react';

interface OverlayProps {
  IsOpen: boolean;
}

export const Loading: React.FC<OverlayProps> = ({ IsOpen }) => {
  React.useEffect(() => {
    if (IsOpen) {
      document.body.classList.add('overflow-y-hidden');
    } else {
      document.body.classList.remove('overflow-y-hidden');
    }
  }, [IsOpen]);

  return (
    <div
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      className={`fixed ${
        IsOpen ? '' : 'hidden'
      } w-full h-full top-0 left-0 right-0 bottom-0 flex items-center justify-center z-20 cursor-pointer`}
    >
      <span className="loader"></span>
    </div>
  );
};
