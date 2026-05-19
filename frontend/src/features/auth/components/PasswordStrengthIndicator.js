import { validatePassword, getPasswordStrengthColor } from '../../../shared/utils/validation/passwordValidation';

const PasswordStrengthIndicator = ({ password, showRequirements = false }) => {
  if (!password) return null;

  const validation = validatePassword(password);
  const strengthColor = getPasswordStrengthColor(validation.strength);

  return (
    <div className="password-strength-indicator-compact">
      {/* Compact Password Strength Meter */}
      <div className="strength-meter-container-compact">
        <div className="strength-label-compact">
          <span>Strength:</span>
          <span className="strength-text-compact" style={{ color: strengthColor }}>
            {validation.strengthLabel}
          </span>
        </div>
        <div className="strength-bars-compact">
          {[1, 2, 3, 4, 5].map((level) => (
            <div
              key={level}
              className={`strength-bar-compact ${level <= validation.strength ? 'filled' : ''}`}
              style={{
                backgroundColor: level <= validation.strength ? strengthColor : '#e5e7eb'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default PasswordStrengthIndicator;
