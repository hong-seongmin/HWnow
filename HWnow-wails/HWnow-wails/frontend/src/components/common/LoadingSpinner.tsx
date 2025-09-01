import React from 'react';
import './LoadingSpinner.css';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
  message?: string;
  overlay?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  color = 'var(--color-primary)',
  message,
  overlay = false
}) => {
  const getSizeClass = () => {
    switch (size) {
      case 'small': return 'spinner-small';
      case 'large': return 'spinner-large';
      default: return 'spinner-medium';
    }
  };

  const spinner = (
    <div className={`loading-spinner ${getSizeClass()}`}>
      <div 
        className="spinner-circle"
        style={{ borderTopColor: color, borderRightColor: color }}
      />
      {message && <div className="spinner-message">{message}</div>}
    </div>
  );

  if (overlay) {
    return (
      <div className="loading-overlay">
        {spinner}
      </div>
    );
  }

  return spinner;
};

// 진행률 표시가 있는 스피너
interface ProgressSpinnerProps {
  progress: number; // 0-100
  message?: string;
  size?: 'small' | 'medium' | 'large';
  color?: string;
  overlay?: boolean;
}

export const ProgressSpinner: React.FC<ProgressSpinnerProps> = ({
  progress,
  message,
  size = 'medium',
  color = 'var(--color-primary)',
  overlay = false
}) => {
  const getSizeValue = () => {
    switch (size) {
      case 'small': return 32;
      case 'large': return 80;
      default: return 48;
    }
  };

  const sizeValue = getSizeValue();
  const strokeWidth = Math.max(2, sizeValue / 16);
  const radius = (sizeValue - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const progressSpinner = (
    <div className="progress-spinner" style={{ width: sizeValue, height: sizeValue }}>
      <svg width={sizeValue} height={sizeValue} className="progress-svg">
        {/* Background circle */}
        <circle
          cx={sizeValue / 2}
          cy={sizeValue / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={sizeValue / 2}
          cy={sizeValue / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="progress-circle"
          style={{
            transition: 'stroke-dashoffset 0.3s ease'
          }}
        />
      </svg>
      <div className="progress-text" style={{ fontSize: `${sizeValue / 4}px` }}>
        {Math.round(progress)}%
      </div>
      {message && <div className="progress-message">{message}</div>}
    </div>
  );

  if (overlay) {
    return (
      <div className="loading-overlay">
        {progressSpinner}
      </div>
    );
  }

  return progressSpinner;
};

// 인라인 로딩 인디케이터
export const InlineLoader: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => {
  return (
    <div className="inline-loader">
      <div className="inline-spinner" />
      <span className="inline-message">{message}</span>
    </div>
  );
};

// 버튼 로딩 스피너
interface ButtonSpinnerProps {
  size?: number;
  color?: string;
}

export const ButtonSpinner: React.FC<ButtonSpinnerProps> = ({ 
  size = 16, 
  color = 'currentColor' 
}) => {
  return (
    <div 
      className="button-spinner"
      style={{ 
        width: size, 
        height: size,
        borderTopColor: color,
        borderRightColor: color
      }}
    />
  );
};