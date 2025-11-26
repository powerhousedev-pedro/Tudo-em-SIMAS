import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'icon' | 'ghost';
  isLoading?: boolean;
  icon?: string;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  isLoading, 
  icon,
  className = '', 
  ...props 
}) => {
  // Fully rounded design (rounded-full)
  const baseStyle = "transition-all duration-300 font-bold text-xs uppercase tracking-wide rounded-full flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-opacity-30 disabled:opacity-60 disabled:cursor-not-allowed transform active:scale-95";
  
  const variants = {
    // Primary: Gradient Cyan -> Blue
    primary: "bg-gradient-to-r from-simas-cyan to-simas-blue text-white shadow-lg shadow-simas-blue/30 hover:shadow-xl hover:shadow-simas-blue/40 border-none px-8 py-3 focus:ring-simas-cyan",
    // Secondary: White with border
    secondary: "bg-white border-2 border-gray-100 text-simas-dark hover:border-simas-cyan hover:text-simas-cyan px-6 py-2.5 focus:ring-gray-200",
    // Danger: Red text
    danger: "bg-red-50 text-red-600 hover:bg-red-100 px-6 py-2.5 focus:ring-red-200",
    // Ghost: Transparent
    ghost: "bg-transparent text-gray-500 hover:text-simas-dark hover:bg-gray-100 px-5 py-2",
    // Icon: Circle
    icon: "p-2.5 text-gray-400 hover:text-simas-cyan hover:bg-white bg-transparent rounded-full hover:shadow-md aspect-square"
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <i className="fas fa-circle-notch fa-spin"></i>
      ) : (
        icon && <i className={icon}></i>
      )}
      {children}
    </button>
  );
};