import React, { useId } from 'react';

export const Logo: React.FC<{ className?: string }> = ({ className }) => {
  const maskId = useId(); 
  return (
    <svg className={className} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <mask id={maskId}>
          <path fill="#fff" d="M0 0h200v200H0z"/>
          <circle cx="100" cy="100" r="30" fill="#000" />
        </mask>
      </defs>
      <g stroke="currentColor" strokeWidth="20" strokeLinecap="round" strokeLinejoin="round" fill="none" mask={`url(#${maskId})`}>
        <path d="m100 30 60 35v70l-60 35-60-35V65ZM40 135l60-35m60 35-60-35m0 0V30"/>
      </g>
      <circle cx="100" cy="100" r="18" fill="currentColor" />
    </svg>
  );
};