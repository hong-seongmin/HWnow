import React, { useState, useEffect } from 'react';
import './Onboarding.css';

interface OnboardingStep {
  id: string;
  title: string;
  content: string;
  target?: string; // CSS selector for highlighting
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Real-Time Monitor!',
    content: 'This dashboard helps you monitor your system resources in real-time. Let\'s take a quick tour.',
  },
  {
    id: 'add-widgets',
    title: 'Add Widgets',
    content: 'Click any of these buttons to add monitoring widgets to your dashboard.',
    target: '.widget-options',
    position: 'bottom',
  },
  {
    id: 'drag-drop',
    title: 'Customize Layout',
    content: 'Drag widgets by their headers to rearrange them. Resize by dragging the corners.',
    target: '.widget-wrapper',
    position: 'top',
  },
  {
    id: 'remove-widgets',
    title: 'Remove Widgets',
    content: 'Hover over a widget and click the × button to remove it.',
    target: '.remove-widget-button',
    position: 'left',
  },
  {
    id: 'theme-toggle',
    title: 'Theme Toggle',
    content: 'Switch between light and dark mode using this button.',
    target: '.theme-toggle',
    position: 'bottom',
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    content: 'Start monitoring your system resources. Your layout will be automatically saved.',
  },
];

interface OnboardingProps {
  onComplete: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const step = onboardingSteps[currentStep];

  useEffect(() => {
    if (step.target) {
      const element = document.querySelector(step.target);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.classList.add('onboarding-highlight');
      }
    }

    return () => {
      if (step.target) {
        const element = document.querySelector(step.target);
        if (element) {
          element.classList.remove('onboarding-highlight');
        }
      }
    };
  }, [step]);

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    setIsVisible(false);
    localStorage.setItem('onboardingCompleted', 'true');
    onComplete();
  };

  if (!isVisible) return null;

  return (
    <>
      <div className="onboarding-overlay" onClick={handleSkip} />
      <div className={`onboarding-modal ${step.position ? `onboarding-${step.position}` : ''}`}>
        <div className="onboarding-header">
          <h3>{step.title}</h3>
          <button className="onboarding-close" onClick={handleSkip} aria-label="Skip tutorial">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="onboarding-content">
          <p>{step.content}</p>
        </div>
        <div className="onboarding-footer">
          <div className="onboarding-progress">
            {onboardingSteps.map((_, index) => (
              <div
                key={index}
                className={`onboarding-dot ${index === currentStep ? 'active' : ''} ${
                  index < currentStep ? 'completed' : ''
                }`}
              />
            ))}
          </div>
          <div className="onboarding-actions">
            {currentStep > 0 && (
              <button className="onboarding-button secondary" onClick={handlePrevious}>
                Previous
              </button>
            )}
            <button className="onboarding-button primary" onClick={handleNext}>
              {currentStep === onboardingSteps.length - 1 ? 'Get Started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Onboarding; 