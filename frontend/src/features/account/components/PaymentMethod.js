import React from 'react';
import { CreditCardIcon, DollarIcon, CheckCircleIcon } from '../../../shared/components/ui/SvgIcons';

const PaymentMethod = () => {
  return (
    <div className="tab-container">
      {/* Header */}
      <div className="tab-header">
        <div className="tab-header-content">
          <div className="tab-header-icon">
            <CreditCardIcon size={24} />
          </div>
          <div className="tab-header-text">
            <h1 className="tab-title">Payment Methods</h1>
            <p className="tab-subtitle">Manage your payment options and preferences</p>
          </div>
        </div>
      </div>

      {/* Payment Methods Grid */}
      <div className="payment-methods-grid">
        {/* Bank Card (Stripe) */}
        <div className="payment-method-card">
          <div className="payment-method-header">
            <div className="payment-method-icon card">
              <CreditCardIcon size={24} />
            </div>
            <div className="payment-method-info">
              <h3 className="payment-method-title">Bank Card</h3>
              <p className="payment-method-description">Secure card payments powered by Stripe</p>
            </div>
            <div className="payment-method-status">
              <span className="status-badge available">Available</span>
            </div>
          </div>
        </div>

        {/* E-Wallet (PayMongo) */}
        <div className="payment-method-card">
          <div className="payment-method-header">
            <div className="payment-method-icon ewallet">
              <DollarIcon size={24} />
            </div>
            <div className="payment-method-info">
              <h3 className="payment-method-title">E-Wallet</h3>
              <p className="payment-method-description">GCash, Maya, GrabPay and bank transfer via PayMongo</p>
            </div>
            <div className="payment-method-status">
              <span className="status-badge available">Available</span>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Information */}
      <div className="payment-info-section">
        <div className="section-header">
          <div className="section-title-wrapper">
            <div className="section-icon">
              <CheckCircleIcon size={20} />
            </div>
            <h2 className="section-title">Payment Information</h2>
          </div>
        </div>
        <div className="info-grid">
          <div className="info-card">
            <h4>Bank Card (Stripe)</h4>
            <ul>
              <li>Secure payment processing via Stripe</li>
              <li>Supports major credit/debit cards</li>
              <li>Instant payment confirmation</li>
              <li>PCI DSS compliant for maximum security</li>
            </ul>
          </div>
          <div className="info-card">
            <h4>E-Wallet (PayMongo)</h4>
            <ul>
              <li>Supports popular PH wallets and bank transfer options</li>
              <li>Fast payment confirmation after successful checkout</li>
              <li>Uses provider checkout links (tokens may expire if reopened)</li>
              <li>Best for GCash/Maya/GrabPay and online transfer flows</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentMethod;
