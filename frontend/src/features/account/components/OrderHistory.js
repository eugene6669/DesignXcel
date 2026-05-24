import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../../shared/contexts/CartContext';
import { productService } from '../../../features/products/services/productService';
import apiClient from '../../../shared/services/api/apiClient';
import apiConfig from '../../../shared/services/api/apiConfig';
import ConfirmationModal from '../../../shared/components/ui/ConfirmationModal';
import { 
  PackageIcon, 
  ClockIcon, 
  CheckCircleIcon, 
  XIcon,
  EyeIcon,
  TruckIcon,
  CreditCardIcon,
  MapPinIcon,
  CalendarIcon,
  ArrowRightIcon,
  ShoppingBagIcon,
  UserIcon,
  StarIcon
} from '../../../shared/components/ui/SvgIcons';
// LoadingSpinner and InlineLoader removed as requested
import { getImageUrl } from '../../../shared/utils/imageUtils';
import './account.css';

const getNotificationStorageKey = (baseKey) => {
  try {
    const raw = localStorage.getItem('userData');
    const parsed = raw ? JSON.parse(raw) : null;
    const userId = parsed?.id || parsed?.CustomerID || parsed?.email || 'guest';
    return `${baseKey}:${String(userId).toLowerCase()}`;
  } catch (e) {
    return `${baseKey}:guest`;
  }
};

const statusIcon = (status) => {
  const iconStyle = { width: '16px', height: '16px', marginRight: '8px' };
  
  if (status === 'Cancelled') return <XIcon size={16} color="#ef4444" style={iconStyle} />;
  if (status === 'Return' || status === 'Returned') return <ArrowRightIcon size={16} color="#f59e0b" style={iconStyle} />;
  if (status === 'Refunded') return <CheckCircleIcon size={16} color="#10b981" style={iconStyle} />;
  if (status === 'Declined') return <XIcon size={16} color="#ef4444" style={iconStyle} />;
  if (status === 'Pending') return <ClockIcon size={16} color="#f59e0b" style={iconStyle} />;
  if (status === 'Processing') return <PackageIcon size={16} color="#3b82f6" style={iconStyle} />;
  if (status === 'Shipping' || status === 'Delivering') return <TruckIcon size={16} color="#8b5cf6" style={iconStyle} />;
  if (status === 'Completed' || status === 'Delivered') return <CheckCircleIcon size={16} color="#10b981" style={iconStyle} />;
  if (status === 'Receive' || status === 'Received' || status === 'To Receive') return <PackageIcon size={16} color="#f59e0b" style={iconStyle} />;
  return <PackageIcon size={16} color="#6b7280" style={iconStyle} />;
};

const statusBorderColor = (status) => {
  if (status === 'Cancelled') return '#ef4444';
  if (status === 'Return' || status === 'Returned') return '#f59e0b';
  if (status === 'Refunded') return '#10b981';
  if (status === 'Declined') return '#ef4444';
  if (status === 'Pending') return '#f59e0b';
  if (status === 'Processing') return '#3b82f6';
  if (status === 'Shipping' || status === 'Delivering') return '#8b5cf6';
  if (status === 'Completed' || status === 'Delivered') return '#10b981';
  if (status === 'Receive' || status === 'Received' || status === 'To Receive') return '#f59e0b';
  return '#6b7280';
};

// Customer-facing status labels
const normalizeStatusDisplay = (status) => {
  if (status === 'Received') return 'Receive';
  if (status === 'To Receive') return 'Receive';
  if (status === 'Return') return 'Return';
  if (status === 'Returned') return 'Returned';
  if (status === 'Refunded' || status === 'Completed Returned') return 'Returned';
  return status;
};

/** Active return workflow (Return tab) — not terminal Returned */
const RETURN_TAB_STATUSES = ['Return'];

/** In-progress return workflow after approval — excludes terminal "Returned" (Completed tab) */
const RETURN_RELATED_STATUSES = [
  'Refunded',
  'Completed Returned',
  'Processing (Pickup)',
  'Awaiting Inspection',
  'Inspection Complete',
  'Pickup Received',
  'Declined',
];

const normalizeReturnWorkflowStatus = (status, order) => {
  if (status === 'Awaiting Inspection') return 'Waiting for Inspection';
  if (status === 'Pickup Received') {
    const action = String(order?.ActionType || '').toLowerCase();
    if (action === 'refund') return 'Process Refund';
    if (action === 'replacement') return 'Process Replacement';
  }
  if (status === 'Return') {
    if (String(order?.ReturnReason || '').startsWith('APPEALED:')) return 'Appealed';
    return 'Return';
  }
  if (status === 'Returned') return 'Returned';
  if (status === 'Refunded' || status === 'Completed Returned') return 'Returned';
  return status;
};

const isReturnTabOrder = (order) => {
  if (!order) return false;
  return RETURN_TAB_STATUSES.includes(order.Status) || RETURN_RELATED_STATUSES.includes(order.Status);
};

const RECEIVE_STATUSES = ['Receive', 'Received', 'To Receive'];
const PRE_RECEIVE_RETURN_PREFIX = '[PRE_RECEIVE]';

const isReceiveStatus = (status) => RECEIVE_STATUSES.includes(status);

const formatReturnReasonDisplay = (reason) => {
  if (!reason) return '';
  if (reason.startsWith('DECLINED:')) return reason.replace(/^DECLINED:\s*/, '');
  if (reason.startsWith('APPEALED:')) return reason.replace(/^APPEALED:\s*/, '');
  if (reason.startsWith(PRE_RECEIVE_RETURN_PREFIX)) {
    return reason.slice(PRE_RECEIVE_RETURN_PREFIX.length).trim();
  }
  return reason;
};

const isDeclinedReturnOrder = (order) => {
  if (!order) return false;
  return order.Status === 'Declined' || String(order.ReturnReason || '').startsWith('DECLINED:');
};

/** To Receive / Receive / Received — show Return Items and Order Received actions */
const canShowReceivePhaseActions = (order) => {
  if (!order) return false;
  const status = order.Status;
  if (['Completed', 'Delivered', 'Cancelled', 'Refunded'].includes(status)) return false;
  if (isReceiveStatus(status)) return true;
  if (isDeclinedReturnOrder(order)) return true;
  return false;
};

const canShowOrderReceivedButton = canShowReceivePhaseActions;

const orderFlow = [
  { key: 'Pending', label: 'Pending' },
  { key: 'Processing', label: 'Processing' },
  { key: 'Shipping', label: 'Shipping' },
  { key: 'Delivering', label: 'Delivering' },
  { key: 'To Receive', label: 'To Receive' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Returned', label: 'Return' },
];

/** Stripe Checkout session ids used by this app (Stripe test/live). */
const isStripeCheckoutSessionIdDisplay = (sid) => /^cs_(test_|live_)/i.test(String(sid || '').trim());

const normalizeTxnDisplay = (tid) => {
  if (tid == null || tid === '') return '';
  const s = String(tid).trim();
  if (s.includes(',')) {
    const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
    const uniq = [...new Set(parts)];
    if (uniq.length === 1) return uniq[0];
    const payPick = uniq.find((p) => /^pay_[a-zA-Z0-9]+$/i.test(p));
    return payPick || uniq[0];
  }
  const half = Math.floor(s.length / 2);
  if (half > 10 && s.slice(0, half) === s.slice(half)) return s.slice(0, half);
  return s;
};

const ConfirmModal = ({ open, onClose, onConfirm, countdown, order }) => {
  if (!open) return null;
  const pm = String(order?.PaymentMethod || '').toLowerCase();
  const sid = String(order?.StripeSessionID || '').trim();
  const tid = String(order?.TransactionID || '').trim();
  const codPlaceholder =
    (pm.includes('bank transfer') || pm === 'stripe') && !sid && !tid;
  const isCod =
    pm.includes('cash on delivery') ||
    /\bcod\b/.test(pm) ||
    codPlaceholder;
  const showRefundNotice = order && order.Status === 'Pending' && !isCod;
  return (
    <div className="cancel-order-modal-overlay" onClick={onClose}>
      <div className="cancel-order-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="cancel-order-modal-header">
          <div className="cancel-order-modal-icon">
            <XIcon size={32} />
          </div>
          <h2 className="cancel-order-modal-title">Cancel Order?</h2>
        </div>
        
        <div className="cancel-order-modal-body">
          <p className="cancel-order-modal-message">
            Are you sure you want to cancel this order? This action cannot be undone.
            {showRefundNotice ? ' Your payment will be fully refunded.' : ''}
          </p>
        </div>

        <div className="cancel-order-modal-actions">
          <button 
            className="cancel-order-modal-cancel-btn"
            onClick={onClose}
          >
            No, go back
          </button>
          <button 
            className="cancel-order-modal-confirm-btn"
            onClick={onConfirm}
            disabled={countdown > 0}
          >
            {countdown > 0 ? `Cancel Order (${countdown})` : 'Cancel Order'}
          </button>
        </div>
      </div>
    </div>
  );
};

const DetailsModal = ({ open, onClose, order }) => {
  if (!open || !order) return null;
  const { user, address, items, Status, OrderID, ReferenceNumber, OrderDate, PaymentMethod, PaymentMethodDisplay, TransactionID, StripeSessionID, TotalAmount, RefundAmount, DeliveryType, DeliveryCost, DeliveryTypeName, PickupDate, EstimatedDeliveryDate, EstimatedDeliveryDateFormatted, ActionType, ReturnType, ReturnReason } = order;
  
  // Normalize status for display
  const normalizedStatus = normalizeStatusDisplay(Status);
  // Find the current step in the flow - handle status variations
  let statusKey = Status;
  
  // Normalize status variations
  if (Status === 'Returned') {
    statusKey = 'Returned';
  } else if (Status === 'Refunded') {
    statusKey = 'Refunded';
  } else if (Status === 'Declined') {
    statusKey = 'Declined';
  } else if (Status === 'Received' || Status === 'To Receive') {
    statusKey = 'To Receive';
  } else if (Status === 'Delivered' || Status === 'Completed') {
    statusKey = 'Completed';
  } else if (Status === 'Delivering') {
    statusKey = 'Delivering';
  } else if (Status === 'Shipping') {
    statusKey = 'Shipping';
  }
  
  let statusIndex = orderFlow.findIndex(s => s.key.toLowerCase() === statusKey.toLowerCase());
  
  // Fallback: if status not found, try to find closest match
  if (statusIndex === -1) {
    const statusLower = Status ? Status.toLowerCase() : '';
    // Try to find by partial match or default to first step
    if (statusLower.includes('return')) {
      statusIndex = 6; // Returned (last step)
    } else if (statusLower.includes('pending')) {
      statusIndex = 0;
    } else if (statusLower.includes('process')) {
      statusIndex = 1;
    } else if (statusLower.includes('ship') && !statusLower.includes('deliver')) {
      statusIndex = 2;
    } else if (statusLower.includes('deliver') && !statusLower.includes('delivered')) {
      statusIndex = 3; // Delivering (but not Delivered)
    } else if (statusLower.includes('receive') || statusLower.includes('received')) {
      statusIndex = 4; // To Receive
    } else if (statusLower.includes('completed') || statusLower.includes('delivered')) {
      statusIndex = 5; // Completed
    } else {
      statusIndex = 0; // Default to first step
    }
  }
  
  // If status is Completed, Refunded, or Returned, all steps should be completed (light style)
  // For Returned, show all steps up to Completed as completed, then show Returned
  // For Refunded, show all steps as completed
  // For Declined, show all steps up to Completed as completed, then show Declined
  const isCompleted = Status === 'Completed' || Status === 'Delivered';
  const isCancelled = Status === 'Cancelled';
  const pmLower = String(PaymentMethod || '').toLowerCase();
  const sidStr = String(StripeSessionID || '').trim();
  const tidStr = String(TransactionID || '').trim();
  const isCodOrder =
    pmLower.includes('cash on delivery') ||
    /\bcod\b/.test(pmLower) ||
    ((pmLower.includes('bank transfer') || pmLower === 'stripe') && !sidStr && !tidStr);
  const displayPaymentMethod = PaymentMethodDisplay || PaymentMethod || 'Not specified';
  const isReturned = Status === 'Returned';
  const isRefunded = Status === 'Refunded';
  const isDeclined = Status === 'Declined';
  
  return (
    <div className="modal-overlay order-details-overlay" onClick={onClose}>
      <div className="modal-content order-details-modal" onClick={(e) => e.stopPropagation()}>
        {/* Minimalist Header */}
        <div className="order-details-header">
          <div className="order-details-title-section">
            <h2 className="order-details-title">Order #{ReferenceNumber || OrderID}</h2>
            <p className="order-details-subtitle">
              {new Date(OrderDate).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric'
              })}
            </p>
          </div>
          <div className="order-details-header-right">
            {/* Order Status Badge */}
            <div className="order-status-section">
              <span className="order-status-badge" style={{
                backgroundColor: statusBorderColor(Status) + '15',
                color: statusBorderColor(Status),
                border: `1px solid ${statusBorderColor(Status)}40`
              }}>
                {statusIcon(Status)}
                {normalizedStatus}
              </span>
            </div>
            <button 
              className="order-details-close-btn" 
              onClick={onClose}
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6l12 12" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        
        {/* Clean Content Layout */}
        <div className="order-details-body">

          {/* Products Section - Clean Grid */}
          <div className="order-products-section">
            <h3 className="section-title-minimal">Order Items</h3>
            <div className="order-products-grid">
              {items && items.length > 0 ? items.map((item, idx) => (
                <div key={idx} className="order-product-card">
                  <div className="order-product-image-container">
                    {item.image ? (
                      <img src={getImageUrl(item.image)} alt={item.name} className="order-product-image" />
                    ) : (
                      <div className="order-product-image-placeholder">
                        <PackageIcon size={20} color="#9ca3af" />
                      </div>
                    )}
                  </div>
                  <div className="product-info-minimal">
                    <div className="product-name-minimal">{item.name}</div>
                    <div className="product-meta-minimal">
                      {((Status === 'Returned' || Status === 'Refunded') && item.OriginalQuantity && item.OriginalQuantity !== item.quantity) ? (
                        <span>
                          Returning: <strong style={{ color: '#ef4444' }}>{item.quantity}</strong> of <strong>{item.OriginalQuantity}</strong> ordered
                        </span>
                      ) : (
                        <span>Qty: {item.quantity}</span>
                      )}
                      <span className="product-price-minimal">₱{Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              )) : (
                <div className="no-products-minimal">
                  <PackageIcon size={32} color="#9ca3af" />
                  <p>No products found</p>
                </div>
              )}
            </div>
          </div>

          {/* Information Grid - Two Columns */}
          <div className="order-info-grid">
            {/* Customer Info */}
            <div className="info-card-minimal">
              <div className="info-card-header">
                <UserIcon size={18} color="#111827" />
                <h4 className="info-card-title">Customer</h4>
              </div>
              <div className="info-card-content">
                <div className="info-row">
                  <span className="info-label">Name</span>
                  <span className="info-value">{user?.fullName || '-'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Email</span>
                  <span className="info-value">{user?.email || '-'}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Phone</span>
                  <span className="info-value">{user?.phoneNumber || '-'}</span>
                </div>
              </div>
            </div>

            {/* Shipping Address - Only show for delivery orders */}
            {(DeliveryType !== 'pickup' && DeliveryTypeName !== 'Pick up') && (
              <div className="info-card-minimal">
                <div className="info-card-header">
                  <MapPinIcon size={18} color="#111827" />
                  <h4 className="info-card-title">Shipping Address</h4>
                </div>
                <div className="info-card-content">
                  {address ? (
                    <div className="address-text-minimal">
                      {address.Label && <div className="address-label-minimal">{address.Label}</div>}
                      <p>{[address.HouseNumber, address.Street, address.Barangay, address.City, address.Province, address.Region, address.PostalCode, address.Country].filter(Boolean).join(', ')}</p>
                    </div>
                  ) : (
                    <p className="no-address-minimal">No shipping address provided</p>
                  )}
                </div>
              </div>
            )}

            {/* Payment and Delivery - Compact Vertical Stack */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {/* Payment */}
              <div className="info-card-minimal" style={{ padding: '0.625rem' }}>
                <div className="info-card-header" style={{ marginBottom: '0.375rem', paddingBottom: '0.375rem' }}>
                  <CreditCardIcon size={16} color="#111827" />
                  <h4 className="info-card-title" style={{ fontSize: '0.8125rem', margin: 0 }}>Payment</h4>
                </div>
                <div className="info-card-content">
                  <div className="info-row" style={{ marginBottom: '0.25rem' }}>
                    <span className="info-label" style={{ fontSize: '0.75rem' }}>Method</span>
                    <span className="info-value" style={{ fontSize: '0.8125rem' }}>{displayPaymentMethod}</span>
                  </div>
                  {StripeSessionID && isStripeCheckoutSessionIdDisplay(StripeSessionID) && (
                    <div className="info-row" style={{ marginBottom: 0 }}>
                      <span className="info-label" style={{ fontSize: '0.75rem' }}>Stripe Checkout Session ID</span>
                      <span className="info-value" style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#64748b', wordBreak: 'break-all' }}>{StripeSessionID}</span>
                    </div>
                  )}
                  {StripeSessionID && !isStripeCheckoutSessionIdDisplay(StripeSessionID) && (
                    <div className="info-row" style={{ marginBottom: 0 }}>
                      <span className="info-label" style={{ fontSize: '0.75rem' }}>PayMongo Checkout Session ID</span>
                      <span className="info-value" style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#64748b', wordBreak: 'break-all' }}>{StripeSessionID}</span>
                    </div>
                  )}
                  {!StripeSessionID && TransactionID && (
                    <div className="info-row" style={{ marginBottom: 0 }}>
                      <span className="info-label" style={{ fontSize: '0.75rem' }}>Transaction reference</span>
                      <span className="info-value" style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#64748b', wordBreak: 'break-all' }}>{normalizeTxnDisplay(TransactionID)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Delivery */}
              <div className="info-card-minimal" style={{ padding: '0.625rem' }}>
                <div className="info-card-header" style={{ marginBottom: '0.375rem', paddingBottom: '0.375rem' }}>
                  <TruckIcon size={16} color="#111827" />
                  <h4 className="info-card-title" style={{ fontSize: '0.8125rem', margin: 0 }}>Delivery</h4>
                </div>
                <div className="info-card-content">
                  <div className="info-row" style={{ marginBottom: '0.25rem' }}>
                    <span className="info-label" style={{ fontSize: '0.75rem' }}>Type</span>
                    <span className="info-value" style={{ fontSize: '0.8125rem' }}>
                      {(() => {
                        const serviceType = DeliveryTypeName || 'Pick up';
                        if (serviceType === 'Pick up') return serviceType;
                        if (serviceType && !serviceType.includes('Delivery') && serviceType !== 'Pick up') {
                          return serviceType + ' Delivery';
                        }
                        return serviceType;
                      })()}
                    </span>
                  </div>
                  {/* Show pickup date for pickup orders */}
                  {(DeliveryType === 'pickup' || DeliveryTypeName === 'Pick up') && PickupDate && (
                    <div className="info-row" style={{ marginBottom: '0.25rem' }}>
                      <span className="info-label" style={{ fontSize: '0.75rem' }}>Pickup Date</span>
                      <span className="info-value" style={{ fontSize: '0.75rem' }}>
                        {(() => {
                          try {
                            const date = new Date(PickupDate);
                            if (isNaN(date.getTime())) return 'Invalid date';
                            return date.toLocaleDateString('en-US', { 
                              year: 'numeric', 
                              month: 'short', 
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            });
                          } catch (e) {
                            return 'Invalid date';
                          }
                        })()}
                      </span>
                    </div>
                  )}
                  {/* Show estimated delivery date for delivery orders */}
                  {DeliveryType !== 'pickup' && DeliveryTypeName !== 'Pick up' && (EstimatedDeliveryDateFormatted || EstimatedDeliveryDate) && (
                    <div className="info-row" style={{ marginBottom: 0 }}>
                      <span className="info-label" style={{ fontSize: '0.75rem' }}>Est. Arrival</span>
                      <span className="info-value" style={{ fontSize: '0.75rem' }}>
                        {EstimatedDeliveryDateFormatted || (() => {
                          try {
                            if (EstimatedDeliveryDate) {
                              const date = new Date(EstimatedDeliveryDate);
                              if (isNaN(date.getTime())) return 'Invalid date';
                              return date.toLocaleDateString('en-US', { 
                                year: 'numeric', 
                                month: 'short', 
                                day: 'numeric'
                              });
                            }
                            return 'Not available';
                          } catch (e) {
                            return 'Not available';
                          }
                        })()}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div className="info-card-minimal order-summary-card">
              <div className="info-card-header">
                <ShoppingBagIcon size={18} color="#111827" />
                <h4 className="info-card-title">Summary</h4>
              </div>
              <div className="info-card-content">
                <div className="summary-row">
                  <span className="summary-label">Delivery Cost</span>
                  <span className="summary-value">₱{Number(DeliveryCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="summary-row total-row">
                  <span className="summary-label">
                    {(Status === 'Refunded' || Status === 'Returned') && RefundAmount 
                      ? (Status === 'Refunded' ? 'Refunded Amount' : 'Return Value')
                      : 'Total Amount'}
                  </span>
                  <span className="summary-value total-amount-minimal">
                    ₱{Number((Status === 'Refunded' || Status === 'Returned') && RefundAmount ? RefundAmount : TotalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Return Information - Show if order is returned */}
            {Status === 'Returned' && (ActionType || ReturnType || ReturnReason) && (
              <div className="info-card-minimal" style={{ 
                borderLeft: '4px solid ' + (ReturnReason && ReturnReason.startsWith('DECLINED:') ? '#ef4444' : '#f59e0b')
              }}>
                <div className="info-card-header">
                  <ArrowRightIcon size={18} color={ReturnReason && ReturnReason.startsWith('DECLINED:') ? '#ef4444' : '#f59e0b'} />
                  <h4 className="info-card-title">
                    {ReturnReason && ReturnReason.startsWith('DECLINED:') ? 'Return Request Declined' : 'Return Information'}
                  </h4>
                </div>
                <div className="info-card-content">
                  {ReturnReason && ReturnReason.startsWith('DECLINED:') && (
                    <div className="info-row" style={{ marginBottom: '0.75rem', padding: '0.75rem', background: '#fef2f2', borderRadius: '6px', border: '1px solid #fecaca' }}>
                      <span className="info-value" style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.875rem' }}>
                        ⚠️ Your return request has been declined
                      </span>
                    </div>
                  )}
                  {ActionType && !ReturnReason?.startsWith('DECLINED:') && (
                    <div className="info-row">
                      <span className="info-label">Action Type</span>
                      <span className="info-value" style={{ 
                        fontWeight: '600',
                        color: ActionType === 'refund' ? '#f59e0b' : '#10b981'
                      }}>
                        {ActionType === 'refund' ? '💰 Refund' : ActionType === 'replacement' ? '🔄 Replacement' : ActionType}
                      </span>
                    </div>
                  )}
                  {ReturnType && !ReturnReason?.startsWith('DECLINED:') && (
                    <div className="info-row">
                      <span className="info-label">Return Reason</span>
                      <span className="info-value">
                        {ReturnType === 'damage'
                          ? 'Damaged Item'
                          : ReturnType === 'mixed'
                          ? 'Mixed Reason'
                          : ReturnType === 'wrong_item'
                            ? 'Wrong Item'
                            : 'Other Reason'}
                      </span>
                    </div>
                  )}
                  {ReturnReason && (
                    <div className="info-row">
                      <span className="info-label">
                        {ReturnReason.startsWith('DECLINED:') ? 'Decline Reason' : 'Details'}
                      </span>
                      <span className="info-value" style={{ 
                        color: ReturnReason.startsWith('DECLINED:') ? '#dc2626' : 'inherit'
                      }}>
                        {formatReturnReasonDisplay(ReturnReason)}
                      </span>
                    </div>
                  )}
                  
                  {/* Return Conditions Checklist */}
                  {(order.OriginalPackaging !== undefined || order.AllParts !== undefined || order.Unused !== undefined || order.ProofOfPurchase !== undefined) && (
                    <div className="info-row" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ width: '100%' }}>
                        <span className="info-label" style={{ display: 'block', marginBottom: '0.75rem', fontWeight: '700', fontSize: '0.875rem' }}>
                          Return Conditions Checklist
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem', 
                            padding: '0.5rem', 
                            borderRadius: '6px', 
                            background: order.OriginalPackaging ? '#f0fdf4' : '#fef2f2', 
                            border: `1px solid ${order.OriginalPackaging ? '#10b981' : '#ef4444'}` 
                          }}>
                            <span style={{ fontSize: '1rem' }}>{order.OriginalPackaging ? '✅' : '❌'}</span>
                            <span style={{ 
                              flex: 1, 
                              color: order.OriginalPackaging ? '#059669' : '#dc2626', 
                              fontWeight: order.OriginalPackaging ? '500' : '600',
                              fontSize: '0.875rem'
                            }}>
                              Item is in original, undamaged packaging
                            </span>
                            {!order.OriginalPackaging && ReturnReason?.startsWith('DECLINED:') && (
                              <span style={{ fontSize: '0.75rem', color: '#dc2626', fontStyle: 'italic' }}>
                                (Not met - Packaging was damaged)
                              </span>
                            )}
                          </div>
                          
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem', 
                            padding: '0.5rem', 
                            borderRadius: '6px', 
                            background: order.AllParts ? '#f0fdf4' : '#fef2f2', 
                            border: `1px solid ${order.AllParts ? '#10b981' : '#ef4444'}` 
                          }}>
                            <span style={{ fontSize: '1rem' }}>{order.AllParts ? '✅' : '❌'}</span>
                            <span style={{ 
                              flex: 1, 
                              color: order.AllParts ? '#059669' : '#dc2626', 
                              fontWeight: order.AllParts ? '500' : '600',
                              fontSize: '0.875rem'
                            }}>
                              All parts, accessories, and documentation are included
                            </span>
                            {!order.AllParts && ReturnReason?.startsWith('DECLINED:') && (
                              <span style={{ fontSize: '0.75rem', color: '#dc2626', fontStyle: 'italic' }}>
                                (Not met)
                              </span>
                            )}
                          </div>
                          
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem', 
                            padding: '0.5rem', 
                            borderRadius: '6px', 
                            background: order.Unused ? '#f0fdf4' : '#fef2f2', 
                            border: `1px solid ${order.Unused ? '#10b981' : '#ef4444'}` 
                          }}>
                            <span style={{ fontSize: '1rem' }}>{order.Unused ? '✅' : '❌'}</span>
                            <span style={{ 
                              flex: 1, 
                              color: order.Unused ? '#059669' : '#dc2626', 
                              fontWeight: order.Unused ? '500' : '600',
                              fontSize: '0.875rem'
                            }}>
                              Item is unused and unmodified
                            </span>
                            {!order.Unused && ReturnReason?.startsWith('DECLINED:') && (
                              <span style={{ fontSize: '0.75rem', color: '#dc2626', fontStyle: 'italic' }}>
                                (Not met)
                              </span>
                            )}
                          </div>
                          
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem', 
                            padding: '0.5rem', 
                            borderRadius: '6px', 
                            background: order.ProofOfPurchase ? '#f0fdf4' : '#fef2f2', 
                            border: `1px solid ${order.ProofOfPurchase ? '#10b981' : '#ef4444'}` 
                          }}>
                            <span style={{ fontSize: '1rem' }}>{order.ProofOfPurchase ? '✅' : '❌'}</span>
                            <span style={{ 
                              flex: 1, 
                              color: order.ProofOfPurchase ? '#059669' : '#dc2626', 
                              fontWeight: order.ProofOfPurchase ? '500' : '600',
                              fontSize: '0.875rem'
                            }}>
                              I have proof of purchase (Order #{ReferenceNumber || OrderID})
                            </span>
                            {!order.ProofOfPurchase && ReturnReason?.startsWith('DECLINED:') && (
                              <span style={{ fontSize: '0.75rem', color: '#dc2626', fontStyle: 'italic' }}>
                                (Not met)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Proof of Purchase Image */}
                  {order.ProofOfPurchaseImageURL && (
                    <div className="info-row" style={{ marginTop: '0.75rem' }}>
                      <span className="info-label">Proof of Purchase Image</span>
                      <div style={{ marginTop: '0.5rem' }}>
                        <img 
                          src={order.ProofOfPurchaseImageURL} 
                          alt="Proof of Purchase" 
                          style={{ 
                            maxWidth: '100%', 
                            maxHeight: '300px', 
                            borderRadius: '8px', 
                            border: '1px solid #e5e7eb', 
                            cursor: 'pointer' 
                          }}
                          onClick={() => window.open(order.ProofOfPurchaseImageURL, '_blank')}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Status Flow - Minimalist */}
          <div className="order-status-flow-section">
            <h3 className="section-title-minimal">Order Progress</h3>
            <div className="status-flow-minimal">
              {orderFlow.map((step, idx) => {
                // For returned orders: show all steps up to Completed as completed, then Returned as current
                let isStepCompleted = false;
                let isStepCurrent = false;
                
                if (isRefunded) {
                  // For refunded orders, all steps including Completed are completed
                  isStepCompleted = idx <= 5; // All steps up to and including Completed
                  // Don't show Returned step for refunded orders, show refunded status instead
                } else if (isDeclined) {
                  // For declined orders, show all steps up to Completed as completed
                  isStepCompleted = idx <= 5; // All steps up to and including Completed
                  // Don't show Returned step for declined orders
                } else if (isReturned) {
                  isStepCompleted = true;
                  isStepCurrent = false;
                } else {
                  // Normal flow for non-returned orders
                  isStepCompleted = idx < statusIndex || (idx === statusIndex && isCompleted);
                  isStepCurrent = idx === statusIndex && !isCompleted;
                }
                
                return (
                  <React.Fragment key={step.key}>
                    <div className="status-step-minimal">
                      <div className={`status-icon-minimal ${isStepCompleted ? 'completed' : ''} ${isStepCurrent ? 'current' : ''} ${isReturned && step.key === 'Returned' ? 'returned' : ''}`}>
                        {isStepCompleted ? (
                          <CheckCircleIcon size={14} color="#10b981" />
                        ) : isStepCurrent ? (
                          isReturned && step.key === 'Returned' ? (
                            <ArrowRightIcon size={14} color="#f59e0b" />
                          ) : (
                            <ClockIcon size={14} color="#F0B21B" />
                          )
                        ) : (
                          <div className="status-dot-minimal" />
                        )}
                      </div>
                      <div className={`status-label-minimal ${isStepCompleted ? 'completed' : ''} ${isStepCurrent ? 'current' : ''} ${isReturned && step.key === 'Returned' ? 'returned' : ''}`}>
                        {step.label}
                      </div>
                    </div>
                    {idx < orderFlow.length-1 && (
                      <div className={`status-connector-minimal ${isStepCompleted || (isReturned && idx < 5) || (isRefunded && idx < 5) || (isDeclined && idx < 5) ? 'completed' : ''}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            {/* Show Refunded or Declined status after order flow */}
            {(isRefunded || isDeclined) && (
              <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', 
                background: isRefunded ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${isRefunded ? '#10b981' : '#ef4444'}`,
                textAlign: 'center' }}>
                <div style={{ 
                  color: isRefunded ? '#059669' : '#dc2626',
                  fontWeight: 600,
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}>
                  {isRefunded ? (
                    <>
                      <CheckCircleIcon size={18} color="#10b981" />
                      Order Refunded - Payment has been refunded to your original payment method
                    </>
                  ) : (
                    <>
                      <XIcon size={18} color="#ef4444" />
                      Return Request Declined
                    </>
                  )}
                </div>
              </div>
            )}
            {isCancelled && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: '#fffbeb',
                  border: '1px solid #fcd34d',
                  fontSize: '0.8125rem',
                  lineHeight: 1.45,
                  color: '#92400e',
                  textAlign: 'left'
                }}
              >
                <strong style={{ display: 'block', marginBottom: '6px', color: '#b45309' }}>Cancelled order — refund</strong>
                {isCodOrder
                  ? 'This order was cancelled before fulfillment. No online card or e-wallet payment was taken for cash on delivery orders.'
                  : 'If you paid by card or e-wallet, a full refund was sent to your original payment method. Refunds can take a few business days to show on your statement.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ReviewModal = ({ open, onClose, order, onSelectProduct }) => {
  if (!open || !order) return null;
  const { items, OrderID, ReferenceNumber } = order;
  
  return (
    <div className="modal-overlay order-details-overlay" onClick={onClose}>
      <div className="modal-content order-details-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        {/* Header */}
        <div className="order-details-header">
          <div className="order-details-title-section">
            <h2 className="order-details-title">Review Products</h2>
            <p className="order-details-subtitle">
              Select a product from Order #{ReferenceNumber || OrderID} to review
            </p>
          </div>
          <button 
            className="order-details-close-btn" 
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        
        {/* Products List */}
        <div className="order-details-body" style={{ padding: '24px' }}>
          <div className="order-products-section">
            <div className="order-products-grid" style={{ gridTemplateColumns: '1fr', gap: '12px' }}>
              {items && items.length > 0 ? items.map((item, idx) => {
                // Use ProductID (capital P, capital ID) as that's what the API returns
                const productId = item.ProductID || item.productId;
                return (
                  <div 
                    key={idx} 
                    className="order-product-card" 
                    onClick={() => {
                      if (productId) {
                        onSelectProduct(productId, OrderID);
                      }
                    }}
                    style={{
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      padding: '16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      backgroundColor: '#ffffff'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#10b981';
                      e.currentTarget.style.backgroundColor = '#f0fdf4';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.15)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.backgroundColor = '#ffffff';
                      e.currentTarget.style.boxShadow = 'none';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div className="order-product-image-container" style={{ width: '80px', height: '80px', flexShrink: 0 }}>
                      {item.image ? (
                        <img 
                          src={getImageUrl(item.image)} 
                          alt={item.name} 
                          className="order-product-image" 
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            borderRadius: '8px'
                          }}
                        />
                      ) : (
                        <div className="order-product-image-placeholder" style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: '#f3f4f6',
                          borderRadius: '8px'
                        }}>
                          <PackageIcon size={24} color="#9ca3af" />
                        </div>
                      )}
                    </div>
                    <div className="product-info-minimal" style={{ flex: 1 }}>
                      <div className="product-name-minimal" style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#111827',
                        marginBottom: '8px'
                      }}>
                        {item.name}
                      </div>
                      <div className="product-meta-minimal" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        fontSize: '14px',
                        color: '#6b7280'
                      }}>
                        <span>Qty: {item.quantity}</span>
                        <span className="product-price-minimal" style={{
                          fontWeight: '600',
                          color: '#111827'
                        }}>
                          ₱{Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      color: '#10b981'
                    }}>
                      <StarIcon size={20} color="#10b981" />
                      <ArrowRightIcon size={16} color="#10b981" style={{ marginLeft: '8px' }} />
                    </div>
                  </div>
                );
              }) : (
                <div className="no-products-minimal">
                  <PackageIcon size={32} color="#9ca3af" />
                  <p>No products found</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipping', label: 'Shipping' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'receive', label: 'Receive' },
  { key: 'completed', label: 'Completed' },
  { key: 'returned', label: 'Return' },
  { key: 'cancelled', label: 'Cancelled' },
];


const OrderHistory = () => {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState({});
  const [modal, setModal] = useState({ open: false, orderId: null });
  const [receiveConfirmModal, setReceiveConfirmModal] = useState({ open: false, orderId: null, order: null });
  const [returnSubmitConfirmModal, setReturnSubmitConfirmModal] = useState({ open: false });
  const [appealConfirmModal, setAppealConfirmModal] = useState({ open: false, orderId: null });
  const pendingReturnSubmitRef = useRef(null);
  const [countdown, setCountdown] = useState(5);
  const [activeTab, setActiveTab] = useState('all');
  const [detailsModal, setDetailsModal] = useState({ open: false, order: null });
  const [receiving, setReceiving] = useState({});
  const [buyingAgain, setBuyingAgain] = useState({});
  const [successModal, setSuccessModal] = useState({ open: false, message: '', navigateTo: null, modalType: 'buyAgain', isSuccess: false });
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [reviewModal, setReviewModal] = useState({ open: false, order: null });
  const [returnModal, setReturnModal] = useState({ open: false, orderId: null, order: null, isPreReceive: false, isAppeal: false });
  const [returning, setReturning] = useState({});
  const [returnReason, setReturnReason] = useState('');
  const [returnType, setReturnType] = useState(''); // damage | wrong_item | mixed | other
  const [actionType, setActionType] = useState(''); // 'refund' or 'replacement' - what customer wants
  const [selectedItems, setSelectedItems] = useState({}); // For partial returns: {key: {productId, variationId, maxQuantity, returnQuantity}}
  const [returnImage, setReturnImage] = useState(null);
  const [returnVideo, setReturnVideo] = useState(null);
  const [returnImagePreview, setReturnImagePreview] = useState(null);
  const [proofOfPurchaseImage, setProofOfPurchaseImage] = useState(null);
  const [proofOfPurchaseImagePreview, setProofOfPurchaseImagePreview] = useState(null);
  const [returnConditions, setReturnConditions] = useState({
    originalPackaging: false,
    allParts: false,
    unused: false,
    proofOfPurchase: false
  });
  const [returnVideoPreview, setReturnVideoPreview] = useState(null);
  const [itemsSectionExpanded, setItemsSectionExpanded] = useState(false); // For dropdown toggle - starts collapsed

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await apiClient.get('/api/customer/orders-with-items');
        if (res.success && Array.isArray(res.orders)) {
          setOrders(res.orders);
        } else {
          setOrders([]);
        }
      } catch (err) {
        console.error('[OrderHistory] Error fetching orders:', err);
        setError('Failed to load orders.');
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, []);

  // Countdown effect for modal
  useEffect(() => {
    let timer;
    if (modal.open && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [modal.open, countdown]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownOpen && !event.target.closest('.order-history-tabs-dropdown')) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const openModal = (orderId) => {
    setModal({ open: true, orderId });
    setCountdown(5);
  };

  const closeModal = () => {
    setModal({ open: false, orderId: null });
    setCountdown(5);
  };

  const confirmCancel = async () => {
    const orderId = modal.orderId;
    setCancelling((prev) => ({ ...prev, [orderId]: true }));
    closeModal();
    try {
      const res = await apiClient.put(`/api/customer/orders/${orderId}/cancel`);
      if (res.success) {
        setOrders((prev) => prev.map(order => order.OrderID === orderId ? { ...order, Status: 'Cancelled' } : order));
        
        // Store refund receipt notification if provided
        if (res.notification) {
          const notificationData = {
            orderNumber: res.notification.orderNumber,
            timestamp: res.notification.timestamp,
            dismissed: false,
            refundAmount: res.notification.refundAmount
          };
          const refundNotificationKey = getNotificationStorageKey('orderRefundNotification');
          localStorage.setItem(refundNotificationKey, JSON.stringify(notificationData));
          // Trigger storage event for other tabs/components
          window.dispatchEvent(new Event('storage'));
          // Dispatch custom event to update notification icon
          window.dispatchEvent(new CustomEvent('notificationUpdated'));
        }
      } else {
        alert(res.message || 'Failed to cancel order.');
      }
    } catch (err) {
      alert('Failed to cancel order.');
    } finally {
      setCancelling((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  const openReceiveConfirmModal = (order) => {
    if (!order?.OrderID) return;
    setReceiveConfirmModal({ open: true, orderId: order.OrderID, order });
  };

  const closeReceiveConfirmModal = () => {
    setReceiveConfirmModal({ open: false, orderId: null, order: null });
  };

  const confirmReceiveOrder = async () => {
    const orderId = receiveConfirmModal.orderId;
    if (!orderId) return;
    closeReceiveConfirmModal();
    await handleReceiveOrder(orderId);
  };

  // Add handler for receiving order
  const handleReceiveOrder = async (orderId) => {
    setReceiving((prev) => ({ ...prev, [orderId]: true }));
    try {
      const res = await apiClient.put(`/api/customer/orders/${orderId}/receive`);
      if (res.success) {
        setOrders((prev) => prev.map(order => order.OrderID === orderId ? { ...order, Status: 'Completed' } : order));
        setSuccessModal({ open: true, message: 'Order has been marked as completed. Thank you for confirming the order!', navigateTo: null, modalType: 'received' });
      } else {
        alert(res.message || 'Failed to mark order as received.');
      }
    } catch (err) {
      alert('Failed to mark order as received.');
    } finally {
      setReceiving((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  // Handle review - navigate to product detail page for review
  const handleReview = (order) => {
    if (!order.items || order.items.length === 0) {
      return;
    }
    
    // If only 1 item, navigate directly to product detail page
    if (order.items.length === 1) {
      const firstItem = order.items[0];
      // Use ProductID (capital P, capital ID) as that's what the API returns
      const productId = firstItem.ProductID || firstItem.productId;
      
      if (productId) {
        // Navigate to product detail page (route is /product/:slug, not /products/:slug)
        // ProductID can be used directly as slug - getProductById handles both numeric IDs and UUIDs
        navigate(`/product/${productId}?orderId=${order.OrderID}`);
      }
    } else {
      // Multiple items - show modal to select which product to review
      setReviewModal({ open: true, order });
    }
  };

  // Handle selecting a product to review from the modal
  const handleSelectProductForReview = (productId, orderId) => {
    setReviewModal({ open: false, order: null });
    if (productId) {
      // Navigate to product detail page (route is /product/:slug, not /products/:slug)
      // ProductID can be used directly as slug - getProductById handles both numeric IDs and UUIDs
      navigate(`/product/${productId}?orderId=${orderId}`);
    }
  };

  // Handle return order
  // Return policy configuration
  const RETURN_POLICY = {
    timeframeDays: 7,
    requireOriginalPackaging: true,
    requireAllParts: true,
    requireUnused: true
  };

  const getDaysInReceiveWindow = (order) => {
    if (!order) return 0;
    const startDate = order.ReceivedAt || order.MovedToReceiveAt || order.OrderDate;
    if (!startDate) return 0;
    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - start.getTime()) / (24 * 60 * 60 * 1000)));
  };

  const isWithinReturnWindow = (order) => getDaysInReceiveWindow(order) <= RETURN_POLICY.timeframeDays;

  const buildSelectedItemsFromOrder = (order, prefillFromReturnItems = false) => {
    const initialItems = {};
    if (!order?.items?.length) return initialItems;

    let returnItemsJson = null;
    if (prefillFromReturnItems && order.ReturnItems) {
      try {
        returnItemsJson = typeof order.ReturnItems === 'string'
          ? JSON.parse(order.ReturnItems)
          : order.ReturnItems;
      } catch (e) {
        console.error('Error parsing ReturnItems for prefill:', e);
      }
    }

    order.items.forEach((item) => {
      const itemId = item.ProductID || item.productId;
      const variationId = item.VariationID || item.variationId || null;
      const key = variationId ? `${itemId}_${variationId}` : `${itemId}_null`;
      const quantity = item.quantity || item.Quantity || 0;

      if (!itemId || quantity <= 0) return;

      let returnQuantity = 0;
      if (Array.isArray(returnItemsJson) && returnItemsJson.length > 0) {
        const match = returnItemsJson.find((ri) => {
          const returnId = ri.productId || ri.ProductID;
          const returnVariationId = ri.variationId || ri.VariationID || null;
          const productMatch = String(itemId) === String(returnId);
          const variationMatch = (variationId == null && (returnVariationId == null || returnVariationId === undefined))
            || (variationId != null && returnVariationId != null && String(variationId) === String(returnVariationId));
          return productMatch && variationMatch;
        });
        if (match) {
          returnQuantity = parseInt(match.quantity || match.Quantity, 10) || 0;
        }
      }

      initialItems[key] = {
        productId: itemId,
        variationId,
        maxQuantity: quantity,
        returnQuantity
      };
    });
    return initialItems;
  };

  const resetReturnFormFields = () => {
    setReturnReason('');
    setReturnType('');
    setActionType('');
    setItemsSectionExpanded(false);
    setReturnImage(null);
    setReturnVideo(null);
    setReturnImagePreview(null);
    setReturnVideoPreview(null);
    setProofOfPurchaseImage(null);
    setProofOfPurchaseImagePreview(null);
    setReturnConditions({
      originalPackaging: false,
      allParts: false,
      unused: false,
      proofOfPurchase: false
    });
    setSelectedItems({});
  };

  const prefillReturnFormFromOrder = (order) => {
    if (!order) return;

    if (order.ActionType) setActionType(order.ActionType);
    if (order.ReturnType) setReturnType(order.ReturnType);

    const reason = String(order.ReturnReason || '');
    if (reason.startsWith('DECLINED:')) {
      setReturnReason(reason.replace(/^DECLINED:\s*/, '').trim());
    } else if (reason.startsWith('APPEALED:')) {
      setReturnReason(reason.replace(/^APPEALED:\s*/, '').trim());
    } else {
      setReturnReason(formatReturnReasonDisplay(reason));
    }

    setReturnConditions({
      originalPackaging: Boolean(order.OriginalPackaging),
      allParts: Boolean(order.AllParts),
      unused: Boolean(order.Unused),
      proofOfPurchase: Boolean(order.ProofOfPurchase)
    });

    setSelectedItems(buildSelectedItemsFromOrder(order, true));
  };

  const handleReturnOrder = (orderId) => {
    const order = orders.find(o => o.OrderID === orderId);
    if (!order) return;

    const isPreReceive = isReceiveStatus(order.Status);
    if (!isPreReceive) {
      alert('Returns must be filed while the order is still in To Receive status. If you already marked the order as received, contact customer service at designexcellence1@gmail.com or (02) 413-6682.');
      return;
    }

    if (!isWithinReturnWindow(order)) {
      alert(`The ${RETURN_POLICY.timeframeDays}-day return window has passed. Please contact customer service at designexcellence1@gmail.com or (02) 413-6682.`);
      return;
    }

    resetReturnFormFields();
    setReturnModal({ open: true, orderId, order, isPreReceive: true, isAppeal: false });
    setSelectedItems(buildSelectedItemsFromOrder(order, false));
  };

  const openAppealConfirmModal = (orderId) => {
    setAppealConfirmModal({ open: true, orderId });
  };

  const closeAppealConfirmModal = () => {
    setAppealConfirmModal({ open: false, orderId: null });
  };

  const confirmAppealStart = () => {
    const orderId = appealConfirmModal.orderId;
    closeAppealConfirmModal();
    if (orderId) handleAppealOrder(orderId);
  };

  const handleAppealOrder = (orderId) => {
    const order = orders.find(o => o.OrderID === orderId);
    if (!order || !isDeclinedReturnOrder(order)) return;

    resetReturnFormFields();
    prefillReturnFormFromOrder(order);
    setReturnModal({ open: true, orderId, order, isPreReceive: false, isAppeal: true });
  };

  const returnOverlayClickAt = useRef(0);

  const handleReturnOverlayClick = (e) => {
    if (e.target !== e.currentTarget) return;
    const now = Date.now();
    if (returnOverlayClickAt.current && now - returnOverlayClickAt.current < 450) {
      closeReturnModal();
      returnOverlayClickAt.current = 0;
    } else {
      returnOverlayClickAt.current = now;
    }
  };

  const closeReturnModal = () => {
    returnOverlayClickAt.current = 0;
    setReturnSubmitConfirmModal({ open: false });
    pendingReturnSubmitRef.current = null;
    setReturnModal({ open: false, orderId: null, order: null, isPreReceive: false, isAppeal: false });
    setReturnReason('');
    setReturnType('');
    setActionType('');
    setSelectedItems({});
    setItemsSectionExpanded(false); // Reset to collapsed when closing
    setReturnImage(null);
    setReturnVideo(null);
    setReturnImagePreview(null);
    setReturnVideoPreview(null);
    setProofOfPurchaseImage(null);
    setProofOfPurchaseImagePreview(null);
    setReturnConditions({
      originalPackaging: false,
      allParts: false,
      unused: false,
      proofOfPurchase: false
    });
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('Image file size must be less than 10MB');
        return;
      }
      setReturnImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReturnImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVideoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        alert('Video file size must be less than 50MB');
        return;
      }
      setReturnVideo(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setReturnVideoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProofOfPurchaseImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('Image file size must be less than 10MB');
        return;
      }
      setProofOfPurchaseImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProofOfPurchaseImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleQuantityChange = (key, value) => {
    const item = selectedItems[key];
    const numValue = parseInt(value) || 0;
    
    if (numValue < 0) return;
    if (numValue > item.maxQuantity) {
      alert(`Cannot return more than ${item.maxQuantity}`);
      return;
    }
    
    setSelectedItems(prev => ({
      ...prev,
      [key]: { ...item, returnQuantity: numValue }
    }));
  };

  const validateReturnForm = () => {
    const order = returnModal.order;

    if (!actionType) {
      alert('Please select Refund or Replacement under "What would you like?"');
      return false;
    }
    if (!returnType) {
      alert('Please select a return reason.');
      return false;
    }
    if (!returnReason.trim()) {
      alert('Please provide a reason for returning the order.');
      return false;
    }

    const returnItems = Object.values(selectedItems).filter((item) => item.returnQuantity > 0);
    if (!returnItems.length) {
      alert('Please select at least one item to return and enter a quantity greater than 0.');
      return false;
    }

    if (!returnConditions.proofOfPurchase) {
      alert('Please confirm that you have proof of purchase (order receipt).');
      return false;
    }
    if (!proofOfPurchaseImage) {
      alert('Please upload proof of purchase image (order receipt).');
      return false;
    }

    const isPreReceive = returnModal.isPreReceive || isReceiveStatus(order?.Status);
    if (!returnModal.isAppeal && !isPreReceive) {
      alert('Returns must be filed while the order is still in To Receive status.');
      return false;
    }
    if (!returnImage && !returnVideo) {
      alert('Please upload at least one image or video as evidence for your return request.');
      return false;
    }

    return true;
  };

  const requestReturnSubmit = () => {
    if (!validateReturnForm()) return;

    const order = returnModal.order;
    const isPreReceive = returnModal.isPreReceive || isReceiveStatus(order?.Status);
    const returnItems = Object.values(selectedItems)
      .filter((item) => item.returnQuantity > 0)
      .map((item) => ({
        productId: item.productId,
        variationId: item.variationId,
        quantity: item.returnQuantity
      }));

    pendingReturnSubmitRef.current = {
      orderId: returnModal.orderId,
      order,
      actionType,
      returnType,
      returnReason: returnReason.trim(),
      isPreReceive,
      isAppeal: Boolean(returnModal.isAppeal),
      returnItems
    };

    setReturnSubmitConfirmModal({ open: true, actionType });
  };

  const closeReturnSubmitConfirmModal = () => {
    setReturnSubmitConfirmModal({ open: false });
    pendingReturnSubmitRef.current = null;
  };

  const confirmReturn = async () => {
    const pending = pendingReturnSubmitRef.current;
    if (!pending?.actionType) {
      alert('Please select whether you want a refund or replacement under "What would you like?"');
      return;
    }

    const {
      orderId,
      order,
      actionType: submitActionType,
      returnType: submitReturnType,
      returnReason: submitReturnReason,
      isPreReceive,
      isAppeal,
      returnItems
    } = pending;

    closeReturnSubmitConfirmModal();

    setReturning((prev) => ({ ...prev, [orderId]: true }));
    try {
      const formData = new FormData();
      formData.append('actionType', submitActionType);
      formData.append('returnType', String(submitReturnType || '').trim().toLowerCase());
      formData.append('returnReason', submitReturnReason);
      if (isAppeal) {
        formData.append('isAppeal', 'true');
      } else if (isPreReceive) {
        formData.append('returnPhase', 'pre_receive');
      }
      formData.append('originalPackaging', returnConditions.originalPackaging);
      formData.append('allParts', returnConditions.allParts);
      formData.append('unused', returnConditions.unused);
      formData.append('proofOfPurchase', returnConditions.proofOfPurchase);
      
      formData.append('returnItems', JSON.stringify(returnItems));
      
      if (returnImage) {
        formData.append('returnImage', returnImage);
      }
      if (returnVideo) {
        formData.append('returnVideo', returnVideo);
      }
      if (proofOfPurchaseImage) {
        formData.append('proofOfPurchaseImage', proofOfPurchaseImage);
      }

      // Get base URL from apiConfig
      const baseURL = apiConfig.baseURL;
      const res = await fetch(`${baseURL}/api/customer/orders/${orderId}/return`, {
        method: 'PUT',
        body: formData,
        credentials: 'include'
      });

      const data = await res.json();
      
      if (data.success) {
        setOrders((prev) => prev.map((o) => (o.OrderID === orderId
          ? {
            ...o,
            Status: 'Return',
            ActionType: submitActionType,
            ReturnType: submitReturnType,
            ReturnReason: isAppeal ? `APPEALED: ${submitReturnReason}` : submitReturnReason,
            ReturnItems: JSON.stringify(returnItems)
          }
          : o)));
        closeReturnModal();
        setSuccessModal({
          open: true,
          message: isAppeal
            ? 'Your appeal has been submitted. Our team will review your return request again.'
            : 'Return request submitted successfully. We will review your request and notify you when it is processed.',
          navigateTo: null,
          modalType: 'return',
          isSuccess: true
        });
      } else {
        alert(data.message || 'Failed to submit return request.');
      }
    } catch (err) {
      console.error('Error returning order:', err);
      alert('Failed to submit return request. Please try again.');
    } finally {
      setReturning((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  // Handle buy again - add all items from order to cart
  const handleBuyAgain = async (order) => {
    if (!order.items || order.items.length === 0) {
      setSuccessModal({ open: true, message: 'No items found in this order', navigateTo: null, modalType: 'buyAgain', isSuccess: false });
      return;
    }

    // Check if this is a bulk order (all items have quantity >= 10, which is minimum for bulk orders)
    const isBulkOrder = order.items.every(item => {
      const quantity = item.quantity || item.Quantity || 0;
      return quantity >= 10;
    });

    // If it's a bulk order, validate products and redirect to bulk order page
    if (isBulkOrder) {
      setBuyingAgain(prev => ({ ...prev, [order.OrderID]: true }));

      try {
        const validBulkOrderItems = [];
        const deletedProducts = [];
        const unavailableProducts = [];

        // Validate each product before adding to bulk order
        for (const item of order.items) {
          const productId = item.productId || item.ProductID;
          const productName = item.name || item.ProductName;
          const quantity = item.quantity || item.Quantity || 1;
          
          try {
            // Check if product exists and is active
            const productResponse = await productService.getProductById(productId);
            
            if (productResponse && productResponse.product) {
              const product = productResponse.product;
              
              // Check if product is active/available
              const isActive = product.IsActive !== false && product.isActive !== false && 
                             product.status !== 'deleted' && product.status !== 'inactive' &&
                             product.Status !== 'deleted' && product.Status !== 'inactive';
              
              if (!isActive) {
                unavailableProducts.push(productName);
                continue;
              }

              // Check if product has sufficient stock (minimum 10 for bulk orders)
              const stock = product.Stock || product.stock || product.StockQuantity || product.stockQuantity || 0;
              if (stock < 10) {
                unavailableProducts.push(productName);
                continue;
              }

              // Product is valid for bulk order
              validBulkOrderItems.push({
                productId: productId,
                quantity: quantity,
                name: product.Name || product.name || productName,
                price: product.Price || product.price || item.price || item.PriceAtPurchase,
                image: product.ImageURL || product.image || product.Image || item.image || item.ImageURL,
                sku: product.SKU || product.sku || item.sku || item.SKU,
                variationId: item.variationId || item.VariationID,
                variationName: item.variationName || item.VariationName
              });
            } else {
              deletedProducts.push(productName);
            }
          } catch (error) {
            // Product not found or error fetching
            console.error(`Product ${productId} validation error:`, error);
            if (error.message && (error.message.includes('not found') || error.message.includes('404'))) {
              deletedProducts.push(productName);
            } else {
              unavailableProducts.push(productName);
            }
          }
        }

        // Handle validation results
        if (validBulkOrderItems.length === 0) {
          // No valid products
          if (deletedProducts.length > 0 && unavailableProducts.length === 0) {
        setSuccessModal({ 
          open: true, 
          message: `Cannot create bulk order. The following products have been removed: ${deletedProducts.join(', ')}`,
          navigateTo: null,
          modalType: 'buyAgain',
          isSuccess: false
        });
          } else if (unavailableProducts.length > 0 && deletedProducts.length === 0) {
          setSuccessModal({ 
            open: true, 
            message: `Cannot create bulk order. The following products are currently unavailable or have insufficient stock: ${unavailableProducts.join(', ')}`,
            navigateTo: null,
            modalType: 'buyAgain',
            isSuccess: false
          });
          } else {
            setSuccessModal({ 
              open: true, 
              message: `Cannot create bulk order. All products from this order are no longer available or have been removed.`,
              navigateTo: null,
              modalType: 'buyAgain',
              isSuccess: false
            });
          }
          return;
        }

        // Save valid items to localStorage
        localStorage.setItem('bulkOrderItems', JSON.stringify(validBulkOrderItems));
        
        // Show message if some products were filtered out
        if (validBulkOrderItems.length < order.items.length) {
          const unavailableNames = [...deletedProducts, ...unavailableProducts];
          setSuccessModal({ 
            open: true, 
            message: `${validBulkOrderItems.length} item(s) added to bulk order. ${unavailableNames.length} item(s) could not be added: ${unavailableNames.join(', ')}`,
            navigateTo: '/bulk-order',
            modalType: 'buyAgain',
            isSuccess: true
          });
        } else {
          // All products valid - show success and navigate on confirm
          setSuccessModal({ 
            open: true, 
            message: `All ${validBulkOrderItems.length} item(s) added to bulk order successfully!`,
            navigateTo: '/bulk-order',
            modalType: 'buyAgain',
            isSuccess: true
          });
        }
        return;
      } catch (error) {
        console.error('Error preparing bulk order:', error);
        setSuccessModal({ open: true, message: 'Failed to prepare bulk order. Please try again.', navigateTo: null, modalType: 'buyAgain', isSuccess: false });
        return;
      } finally {
        setBuyingAgain(prev => ({ ...prev, [order.OrderID]: false }));
      }
    }

    setBuyingAgain(prev => ({ ...prev, [order.OrderID]: true }));

    try {
      const availableProducts = [];
      const deletedProducts = [];
      const unavailableProducts = [];

      // Validate each product before adding to cart
      for (const item of order.items) {
        const productId = item.productId || item.ProductID;
        const productName = item.name || item.ProductName;
        
        try {
          // Check if product exists and is active
          const productResponse = await productService.getProductById(productId);
          
          if (productResponse && productResponse.product) {
            const product = productResponse.product;
            
            // Check if product is active/available (handle various field name formats)
            const isActive = product.IsActive !== false && product.isActive !== false && 
                           product.status !== 'deleted' && product.status !== 'inactive' &&
                           product.Status !== 'deleted' && product.Status !== 'inactive';
            
            if (!isActive) {
              unavailableProducts.push(productName);
              continue;
            }

            // Check if product has stock
            const stock = product.Stock || product.stock || product.StockQuantity || product.stockQuantity || 0;
            if (stock <= 0) {
              unavailableProducts.push(productName);
              continue;
            }

            // Product is available - prepare for cart
            // Get image URL - handle various field name formats
            // Try to get image from product first, then fallback to item
            let imageUrl = product.ImageURL || product.image || product.Image || '';
            if (!imageUrl && product.images && product.images.length > 0) {
              imageUrl = product.images[0];
            }
            if (!imageUrl && product.thumbnails && product.thumbnails.length > 0) {
              imageUrl = product.thumbnails[0];
            }
            // Fallback to item image if product image not found
            if (!imageUrl) {
              imageUrl = item.image || item.ImageURL || '';
            }
            
            // Build images array - cart expects images array
            let imagesArray = [];
            if (product.images && Array.isArray(product.images) && product.images.length > 0) {
              imagesArray = product.images;
            } else if (product.thumbnails && Array.isArray(product.thumbnails) && product.thumbnails.length > 0) {
              imagesArray = product.thumbnails;
            } else if (imageUrl) {
              imagesArray = [imageUrl];
            }
            
            // Get variation image if exists
            const variationImageUrl = item.image || item.ImageURL || imageUrl;
            
            // Cart expects images array, not single image field
            const cartProduct = {
              id: product.ProductID || product.id || productId,
              name: product.Name || product.name || productName,
              price: product.Price || product.price || item.price || item.PriceAtPurchase,
              images: imagesArray,
              stock: stock,
              sku: product.SKU || product.sku || item.sku || item.SKU,
              variationId: item.variationId || item.VariationID,
              variationName: item.variationName || item.VariationName,
              // Include selectedVariation if variation exists
              selectedVariation: item.variationId ? {
                id: item.variationId,
                name: item.variationName || item.VariationName,
                imageUrl: variationImageUrl
              } : null
            };

            const quantity = item.quantity || item.Quantity || 1;
            availableProducts.push({ product: cartProduct, quantity, name: productName });
          } else {
            deletedProducts.push(productName);
          }
        } catch (error) {
          // Product not found or error fetching
          console.error(`Product ${productId} validation error:`, error);
          // Check if it's a 404 (not found) vs other errors
          if (error.message && (error.message.includes('not found') || error.message.includes('404'))) {
            deletedProducts.push(productName);
          } else {
            // Other errors - treat as unavailable
            unavailableProducts.push(productName);
          }
        }
      }

      // Handle results
      if (availableProducts.length === 0) {
        // No products available
        if (deletedProducts.length > 0 && unavailableProducts.length === 0) {
          setSuccessModal({ 
            open: true, 
            message: `Cannot add items to cart. The following products have been removed: ${deletedProducts.join(', ')}`,
            navigateTo: null,
            modalType: 'buyAgain',
            isSuccess: false
          });
        } else if (unavailableProducts.length > 0 && deletedProducts.length === 0) {
          setSuccessModal({ 
            open: true, 
            message: `Cannot add items to cart. The following products are currently unavailable: ${unavailableProducts.join(', ')}`,
            navigateTo: null,
            modalType: 'buyAgain',
            isSuccess: false
          });
        } else {
          setSuccessModal({ 
            open: true, 
            message: `Cannot add items to cart. All products from this order are no longer available or have been removed.`,
            navigateTo: null,
            modalType: 'buyAgain',
            isSuccess: false
          });
        }
        return;
      }

      // Add available products to cart
      let addedCount = 0;
      for (const { product, quantity } of availableProducts) {
        try {
          addToCart(product, quantity);
          addedCount++;
        } catch (error) {
          console.error(`Error adding ${product.name} to cart:`, error);
        }
      }

      // Show appropriate message based on results
      let message = '';
      if (addedCount === order.items.length) {
        // All products added successfully
        message = `All ${addedCount} item(s) added to cart successfully!`;
      } else {
        // Some products added, some unavailable
        const unavailableNames = [...deletedProducts, ...unavailableProducts];
        message = `${addedCount} item(s) added to cart. ${unavailableNames.length} item(s) could not be added: ${unavailableNames.join(', ')}`;
      }

      if (addedCount > 0) {
        // Navigate to cart only if at least one product was added
        setSuccessModal({ 
          open: true, 
          message,
          navigateTo: '/cart',
          modalType: 'buyAgain',
          isSuccess: true
        });
      } else {
        setSuccessModal({ 
          open: true, 
          message,
          navigateTo: null,
          modalType: 'buyAgain',
          isSuccess: false
        });
      }
    } catch (err) {
      console.error('Error in buy again:', err);
      setSuccessModal({ open: true, message: 'Failed to add items to cart. Please try again.', navigateTo: null, modalType: 'buyAgain', isSuccess: false });
    } finally {
      setBuyingAgain(prev => ({ ...prev, [order.OrderID]: false }));
    }
  };

  let filteredOrders = orders;
  if (activeTab === 'completed') {
    filteredOrders = orders.filter(order =>
      order.Status === 'Completed' ||
      order.Status === 'Delivered' ||
      order.Status === 'Returned' ||
      order.Status === 'Refunded' ||
      order.Status === 'Completed Returned'
    );
  } else if (activeTab === 'returned') {
    filteredOrders = orders.filter(isReturnTabOrder);
  } else if (activeTab === 'cancelled') {
    filteredOrders = orders.filter(order => order.Status === 'Cancelled');
  } else if (activeTab === 'pending') {
    filteredOrders = orders.filter(order => order.Status === 'Pending');
  } else if (activeTab === 'processing') {
    filteredOrders = orders.filter(order => order.Status === 'Processing');
  } else if (activeTab === 'shipping') {
    filteredOrders = orders.filter(order => order.Status === 'Shipping');
  } else if (activeTab === 'delivery') {
    filteredOrders = orders.filter(order => order.Status === 'Delivering' || order.Status === 'Delivery');
  } else if (activeTab === 'receive') {
    filteredOrders = orders.filter(order => order.Status === 'Receive' || order.Status === 'Received' || order.Status === 'To Receive');
  } else if (activeTab === 'all') {
    // Include all orders including cancelled orders
    filteredOrders = orders;
  }

  if (loading) return (
    <div style={{ 
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '60px 20px',
      minHeight: '400px',
      textAlign: 'center'
    }}>
      <div style={{ 
        fontSize: window.innerWidth < 768 ? '14px' : '16px', 
        color: '#6b7280', 
        marginTop: '16px',
        fontWeight: '500',
        maxWidth: '280px',
        lineHeight: '1.5'
      }}>
        Loading your orders...
      </div>
    </div>
  );
  
  if (error) return (
    <div style={{
      padding: '40px',
      textAlign: 'center',
      backgroundColor: '#fef2f2',
      borderRadius: '12px',
      border: '1px solid #fecaca',
      color: '#dc2626'
    }}>
      <XIcon size={32} color="#dc2626" style={{ marginBottom: '12px' }} />
      <div style={{ fontSize: '16px', fontWeight: '600' }}>Error Loading Orders</div>
      <div style={{ fontSize: '14px', marginTop: '4px' }}>{error}</div>
    </div>
  );
  
  if (!orders.length) return (
    <div style={{
      padding: '60px 40px',
      textAlign: 'center',
      backgroundColor: '#f9fafb',
      borderRadius: '12px',
      border: '1px solid #e5e7eb'
    }}>
      <PackageIcon size={48} color="#9ca3af" style={{ marginBottom: '16px' }} />
      <div style={{ fontSize: '18px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>No Orders Yet</div>
      <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '24px' }}>Start shopping to see your orders here</div>
      <button 
        className="btn btn-primary"
        onClick={() => window.location.href = '/products'}
        style={{
          padding: '12px 24px',
          backgroundColor: '#F0B21B',
          color: '#ffffff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: '600',
          cursor: 'pointer'
        }}
      >
        Browse Products
      </button>
    </div>
  );

  return (
    <div className="tab-container">
      <div className="tab-header">
        <div className="tab-header-content">
          <div className="tab-header-icon" style={{ color: '#F0B21B' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 11V7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5 9H19L18 21H6L5 9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="tab-header-text">
            <h1 className="tab-title">My Orders</h1>
            <p className="tab-subtitle">Track and manage your order history</p>
          </div>
        </div>
      </div>

      
      <div className="order-history-tabs-dropdown" style={{
        position: 'relative',
        marginBottom: 24,
        width: '100%',
        maxWidth: '280px'
      }}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            fontSize: '14px',
            fontWeight: 500,
            color: '#111827',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#F0B21B';
            e.currentTarget.style.boxShadow = '0 2px 4px rgba(240, 178, 27, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#e5e7eb';
            e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {activeTab === 'all' && <PackageIcon size={16} color="#6b7280" />}
            {activeTab === 'pending' && <ClockIcon size={16} color="#6b7280" />}
            {activeTab === 'processing' && <PackageIcon size={16} color="#6b7280" />}
            {activeTab === 'shipping' && <TruckIcon size={16} color="#6b7280" />}
            {activeTab === 'delivery' && <TruckIcon size={16} color="#6b7280" />}
            {activeTab === 'receive' && <PackageIcon size={16} color="#6b7280" />}
            {activeTab === 'completed' && <CheckCircleIcon size={16} color="#6b7280" />}
            {activeTab === 'returned' && <ArrowRightIcon size={16} color="#6b7280" />}
            {activeTab === 'cancelled' && <XIcon size={16} color="#6b7280" />}
            <span>{TABS.find(t => t.key === activeTab)?.label || 'All Orders'}</span>
          </div>
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2"
            style={{
              transition: 'transform 0.2s ease',
              transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              color: '#6b7280'
            }}
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {dropdownOpen && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 1000,
            overflow: 'hidden',
            animation: 'fadeInDown 0.2s ease'
          }}>
            {TABS.map((tab, index) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setDropdownOpen(false);
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  backgroundColor: activeTab === tab.key ? '#F0B21B' : 'transparent',
                  color: activeTab === tab.key ? '#ffffff' : '#6b7280',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontSize: '14px',
                  fontWeight: activeTab === tab.key ? 600 : 500,
                  textAlign: 'left',
                  borderBottom: index < TABS.length - 1 ? '1px solid #f0f0f0' : 'none'
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.key) {
                    e.currentTarget.style.backgroundColor = '#f9fafb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.key) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {tab.key === 'all' && (
                  <PackageIcon size={16} color={activeTab === tab.key ? "#ffffff" : "#6b7280"} />
                )}
                {tab.key === 'pending' && (
                  <ClockIcon size={16} color={activeTab === tab.key ? "#ffffff" : "#6b7280"} />
                )}
                {tab.key === 'processing' && (
                  <PackageIcon size={16} color={activeTab === tab.key ? "#ffffff" : "#6b7280"} />
                )}
                {tab.key === 'shipping' && (
                  <TruckIcon size={16} color={activeTab === tab.key ? "#ffffff" : "#6b7280"} />
                )}
                {tab.key === 'delivery' && (
                  <TruckIcon size={16} color={activeTab === tab.key ? "#ffffff" : "#6b7280"} />
                )}
                {tab.key === 'receive' && (
                  <PackageIcon size={16} color={activeTab === tab.key ? "#ffffff" : "#6b7280"} />
                )}
                {tab.key === 'returned' && (
                  <ArrowRightIcon size={16} color={activeTab === tab.key ? "#ffffff" : "#6b7280"} />
                )}
                {tab.key === 'completed' && (
                  <CheckCircleIcon size={16} color={activeTab === tab.key ? "#ffffff" : "#6b7280"} />
                )}
                {tab.key === 'cancelled' && (
                  <XIcon size={16} color={activeTab === tab.key ? "#ffffff" : "#6b7280"} />
                )}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="orders-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredOrders.length === 0 ? (
            <div style={{
              padding: '60px 40px',
              textAlign: 'center',
              backgroundColor: '#f9fafb',
              borderRadius: '12px',
              border: '1px solid #e5e7eb'
            }}>
              <PackageIcon size={48} color="#6b7280" style={{ marginBottom: '16px' }} />
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
                No Orders Found
              </div>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                No orders match the current filter
              </div>
            </div>
        ) : filteredOrders.map(order => (
          <div
            key={order.OrderID}
            className="order-card"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: `1px solid #e5e7eb`,
              borderLeft: `4px solid ${statusBorderColor(order.Status)}`,
              padding: '16px',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)',
              transition: 'all 0.3s ease',
              position: 'relative',
              overflow: 'hidden'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.12)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.08)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {/* Order Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '12px'
            }}>
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '6px'
                }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    backgroundColor: '#F0B21B',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <PackageIcon size={16} color="#ffffff" />
                  </div>
                  <div>
                    <div style={{
                      fontSize: '15px',
                      fontWeight: '700',
                      color: '#111827'
                    }}>
                      Order #{order.ReferenceNumber || order.OrderID}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <CalendarIcon size={12} color="#6b7280" />
                      {new Date(order.OrderDate).toLocaleDateString('en-US', { 
                        timeZone: 'Asia/Manila',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {isDeclinedReturnOrder(order) && (
                  <>
                    <button
                      type="button"
                      onClick={() => openAppealConfirmModal(order.OrderID)}
                      disabled={returning[order.OrderID]}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '16px',
                        border: 'none',
                        background: '#8b5cf6',
                        color: '#ffffff',
                        fontWeight: '600',
                        fontSize: '12px',
                        cursor: returning[order.OrderID] ? 'not-allowed' : 'pointer',
                        opacity: returning[order.OrderID] ? 0.7 : 1,
                        whiteSpace: 'nowrap'
                      }}
                      title="Submit an appeal to re-open your declined return request"
                    >
                      {returning[order.OrderID] ? 'Submitting…' : 'Appeal'}
                    </button>
                    {canShowOrderReceivedButton(order) && (
                      <button
                        type="button"
                        disabled={receiving[order.OrderID]}
                        onClick={() => openReceiveConfirmModal(order)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '16px',
                          border: 'none',
                          background: '#10b981',
                          color: '#ffffff',
                          fontWeight: '600',
                          fontSize: '12px',
                          cursor: receiving[order.OrderID] ? 'not-allowed' : 'pointer',
                          opacity: receiving[order.OrderID] ? 0.7 : 1,
                          whiteSpace: 'nowrap'
                        }}
                        title="Confirm you received the order (items correct and undamaged)"
                      >
                        {receiving[order.OrderID] ? 'Processing…' : 'Receive'}
                      </button>
                    )}
                  </>
                )}
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '6px 12px',
                  borderRadius: '16px',
                  backgroundColor: statusBorderColor(order.Status) + '15',
                  color: statusBorderColor(order.Status),
                  fontWeight: '600',
                  fontSize: '12px',
                  border: `1px solid ${statusBorderColor(order.Status)}40`
                }}>
                  {statusIcon(order.Status)}
                  {normalizeReturnWorkflowStatus(order.Status, order) || normalizeStatusDisplay(order.Status)}
                </span>
              </div>
            </div>

            {/* Order Items Preview */}
            <div style={{ marginBottom: '12px' }}>
              {(() => {
                // For returned/refunded/pickup processing orders with ReturnItems, filter to show only returned items
                let displayItems = order.items || [];
                let isPartialReturn = false;
                
                // Apply filtering for 'Returned', 'Refunded', and 'Processing (Pickup)' status orders
                // "Processing (Pickup)" status occurs after return approval but before refund completion
                const shouldFilterItems = (order.Status === 'Returned' || 
                                          order.Status === 'Refunded' || 
                                          order.Status === 'Processing (Pickup)' ||
                                          order.Status === 'Processing') && order.ReturnItems;
                
                if (shouldFilterItems) {
                  try {
                    const returnItemsJson = typeof order.ReturnItems === 'string' 
                      ? JSON.parse(order.ReturnItems) 
                      : order.ReturnItems;
                    
                    if (Array.isArray(returnItemsJson) && returnItemsJson.length > 0) {
                      isPartialReturn = returnItemsJson.length < (order.items?.length || 0);
                      
                      // Filter order items to show only those that were returned
                      displayItems = (order.items || []).filter(orderItem => {
                        const orderItemId = orderItem.ProductID || orderItem.productId;
                        const orderVariationId = orderItem.VariationID || orderItem.variationId || null;
                        
                        return returnItemsJson.some(returnItem => {
                          const returnItemId = returnItem.productId || returnItem.ProductID;
                          const returnVariationId = returnItem.variationId || returnItem.VariationID || null;
                          
                          const productMatch = String(orderItemId) === String(returnItemId);
                          const variationMatch = (orderVariationId == null && (returnVariationId == null || returnVariationId === undefined)) ||
                                                 (orderVariationId != null && returnVariationId != null && String(orderVariationId) === String(returnVariationId));
                          
                          return productMatch && variationMatch;
                        });
                      });
                      
                      // Update quantities to match returned quantities
                      displayItems = displayItems.map(orderItem => {
                        const orderItemId = orderItem.ProductID || orderItem.productId;
                        const orderVariationId = orderItem.VariationID || orderItem.variationId || null;
                        
                        const returnItem = returnItemsJson.find(ri => {
                          const returnItemId = ri.productId || ri.ProductID;
                          const returnVariationId = ri.variationId || ri.VariationID || null;
                          return orderItemId === returnItemId && 
                                 ((!orderVariationId && !returnVariationId) || (orderVariationId === returnVariationId));
                        });
                        
                        if (returnItem) {
                          const returnQty = parseInt(returnItem.quantity || returnItem.Quantity || 0);
                          const originalQty = parseInt(orderItem.quantity || orderItem.Quantity || 0);
                          return {
                            ...orderItem,
                            quantity: returnQty, // Return quantity
                            Quantity: returnQty, // Return quantity
                            OriginalQuantity: originalQty // Store original ordered quantity
                          };
                        }
                        return orderItem;
                      });
                    }
                  } catch (e) {
                    console.error('Error parsing ReturnItems:', e);
                  }
                }
                
                return (
                  <>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#111827',
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}>
                      <ShoppingBagIcon size={14} color="#111827" />
                      {isPartialReturn ? (
                        <>
                          Returned Items ({displayItems.length})
                          <span style={{ fontSize: '11px', fontWeight: '400', color: '#f59e0b', marginLeft: '4px' }}>
                            (Partial Return)
                          </span>
                        </>
                      ) : (
                        `Items (${displayItems.length})`
                      )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {displayItems && displayItems.length > 0 ? displayItems.slice(0, 3).map((item, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb'
                  }}>
                    {item.image ? (
                      <img src={getImageUrl(item.image)} alt={item.name} style={{
                        width: '35px',
                        height: '35px',
                        objectFit: 'cover',
                        borderRadius: '5px',
                        background: '#e5e7eb'
                      }} />
                    ) : (
                      <div style={{
                        width: '35px',
                        height: '35px',
                        backgroundColor: '#e5e7eb',
                        borderRadius: '5px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <PackageIcon size={14} color="#9ca3af" />
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '13px',
                        fontWeight: '600',
                        color: '#111827',
                        marginBottom: '2px',
                        lineHeight: '1.3'
                      }}>
                        {item.name}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: '#6b7280'
                      }}>
                        {order.Status === 'Returned' && order.ReturnItems && item.OriginalQuantity && item.OriginalQuantity !== item.quantity ? (
                          <span>
                            Returning: <strong style={{ color: '#ef4444' }}>{item.quantity}</strong> of <strong>{item.OriginalQuantity}</strong> ordered
                          </span>
                        ) : (
                          <span>Qty: {item.quantity}</span>
                        )}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#111827'
                    }}>
                      ₱{Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                      )) : (
                        <div style={{
                          padding: '12px',
                          textAlign: 'center',
                          color: '#9ca3af',
                          fontSize: '13px'
                        }}>
                          No products found
                        </div>
                      )}
                      {displayItems && displayItems.length > 3 && (
                        <div style={{
                          fontSize: '11px',
                          color: '#6b7280',
                          textAlign: 'center',
                          padding: '6px',
                          fontStyle: 'italic'
                        }}>
                          +{displayItems.length - 3} more items
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Order Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '12px',
              borderTop: '1px solid #e5e7eb'
            }}>
              <div style={{
                fontSize: '14px',
                fontWeight: '700',
                color: '#111827',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <CreditCardIcon size={14} color="#111827" />
                {(() => {
                  // Calculate return value for returned/refunded/pickup processing orders
                  const shouldShowReturnValue = (order.Status === 'Refunded' || 
                                                 order.Status === 'Returned' || 
                                                 order.Status === 'Processing (Pickup)') && order.ReturnItems;
                  
                  if (shouldShowReturnValue) {
                    // Use RefundAmount if available, otherwise calculate from returned items
                    let displayAmount = order.RefundAmount;
                    if (!displayAmount && order.items && order.items.length > 0) {
                      // Filter and calculate from returned items
                      try {
                        const returnItemsJson = typeof order.ReturnItems === 'string' 
                          ? JSON.parse(order.ReturnItems) 
                          : order.ReturnItems;
                        
                        if (Array.isArray(returnItemsJson) && returnItemsJson.length > 0) {
                          displayAmount = order.items
                            .filter(item => {
                              const itemId = item.ProductID || item.productId;
                              const itemVariationId = item.VariationID || item.variationId || null;
                              return returnItemsJson.some(ri => {
                                const returnId = ri.productId || ri.ProductID;
                                const returnVariationId = ri.variationId || ri.VariationID || null;
                                const productMatch = String(itemId) === String(returnId);
                                const variationMatch = (itemVariationId == null && (returnVariationId == null || returnVariationId === undefined)) ||
                                                       (itemVariationId != null && returnVariationId != null && String(itemVariationId) === String(returnVariationId));
                                return productMatch && variationMatch;
                              });
                            })
                            .reduce((sum, item) => {
                              const returnItem = returnItemsJson.find(ri => {
                                const returnId = ri.productId || ri.ProductID;
                                const itemId = item.ProductID || item.productId;
                                const returnVariationId = ri.variationId || ri.VariationID || null;
                                const itemVariationId = item.VariationID || item.variationId || null;
                                const productMatch = String(itemId) === String(returnId);
                                const variationMatch = (itemVariationId == null && (returnVariationId == null || returnVariationId === undefined)) ||
                                                       (itemVariationId != null && returnVariationId != null && String(itemVariationId) === String(returnVariationId));
                                return productMatch && variationMatch;
                              });
                              if (returnItem) {
                                const price = parseFloat(item.price) || 0;
                                const qty = parseInt(returnItem.quantity || returnItem.Quantity || 0);
                                return sum + (price * qty);
                              }
                              return sum;
                            }, 0);
                        }
                      } catch (e) {
                        console.error('Error calculating return value:', e);
                      }
                    }
                    
                    if (displayAmount) {
                      const label = order.Status === 'Refunded' ? 'Refunded' : 'Return Value';
                      return <>{label}: ₱{Number(displayAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</>;
                    }
                  }
                  
                  // Default: show original total
                  return <>Total: ₱{Number(order.TotalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</>;
                })()}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setDetailsModal({ open: true, order })}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #6b7280',
                    background: '#6b7280',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <EyeIcon size={14} color="#ffffff" />
                  View Details
                </button>
                
                {(order.Status === 'Completed' || order.Status === 'Delivered') && (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleReview(order)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#10b981',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <StarIcon size={14} color="#ffffff" />
                      Review
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleBuyAgain(order)}
                      disabled={buyingAgain[order.OrderID]}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#F0B21B',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {buyingAgain[order.OrderID] ? 'Adding...' : 'Buy Again'}
                    </button>
                  </>
                )}
                
                {order.Status !== 'Cancelled' && order.Status !== 'Completed' && order.Status !== 'Delivered' && order.Status !== 'Shipping' && order.Status !== 'Delivering' && order.Status !== 'Refunded' && order.Status !== 'Processing' && order.Status !== 'Receive' && order.Status !== 'Received' && order.Status !== 'To Receive' && (
                  <button
                    className="btn btn-primary"
                    disabled={cancelling[order.OrderID]}
                    onClick={() => openModal(order.OrderID)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      background: '#ef4444',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <XIcon size={14} color="#ffffff" style={{ marginRight: '4px' }} />
                    {cancelling[order.OrderID] ? 'Cancelling...' : 'Cancel'}
                  </button>
                )}
                
                {canShowReceivePhaseActions(order) && !isDeclinedReturnOrder(order) && (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleReturnOrder(order.OrderID)}
                      disabled={returning[order.OrderID] || isReturnTabOrder(order) || !isWithinReturnWindow(order)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: isReturnTabOrder(order) ? '#9ca3af' : '#f59e0b',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: '600',
                        cursor: isReturnTabOrder(order) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap'
                      }}
                      title={isWithinReturnWindow(order)
                        ? `Refund or replacement within ${RETURN_POLICY.timeframeDays}-day window — seller pays return shipping`
                        : `${RETURN_POLICY.timeframeDays}-day return window ended — contact customer service`}
                    >
                      {returning[order.OrderID] ? 'Processing...' : isReturnTabOrder(order) ? normalizeStatusDisplay(order.Status) : 'Return Items'}
                    </button>
                    <button
                      className="btn btn-success"
                      disabled={receiving[order.OrderID]}
                      onClick={() => openReceiveConfirmModal(order)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#10b981',
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap'
                      }}
                      title="Only confirm if items are correct and undamaged"
                    >
                      <CheckCircleIcon size={14} color="#ffffff" style={{ marginRight: '4px' }} />
                      {receiving[order.OrderID] ? 'Processing...' : 'Order Received'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      <ConfirmModal
        open={modal.open}
        onClose={closeModal}
        onConfirm={confirmCancel}
        countdown={countdown}
        order={orders.find((o) => o.OrderID === modal.orderId)}
      />
      <ConfirmationModal
        isOpen={appealConfirmModal.open}
        onClose={closeAppealConfirmModal}
        onConfirm={confirmAppealStart}
        title="Submit an appeal?"
        type="warning"
        overlayZIndex={2900}
        confirmText="Continue to appeal form"
        cancelText="Cancel"
        message={
          <div style={{ textAlign: 'left', lineHeight: 1.6, fontSize: '0.95rem', color: '#374151' }}>
            <p style={{ margin: '0 0 12px 0' }}>
              Your return request was declined. You can appeal this decision and submit an updated return request for admin review.
            </p>
            <p style={{ margin: 0 }}>
              You will complete the same return form (items, evidence, and details) as your original request.
            </p>
          </div>
        }
      />
      <ConfirmationModal
        isOpen={returnSubmitConfirmModal.open}
        onClose={closeReturnSubmitConfirmModal}
        onConfirm={confirmReturn}
        title={returnModal.isAppeal ? 'Submit appeal?' : 'Submit Return Request?'}
        type="warning"
        overlayZIndex={3000}
        confirmText={returnModal.isAppeal ? 'Yes, Submit Appeal' : 'Yes, Submit Return'}
        cancelText="Go Back"
        message={
          <div style={{ textAlign: 'left', lineHeight: 1.6, fontSize: '0.95rem', color: '#374151' }}>
            <p style={{ margin: '0 0 12px 0' }}>
              You are about to submit a <strong>{returnSubmitConfirmModal.actionType === 'replacement' ? 'replacement' : 'refund'}</strong>
              {returnModal.isAppeal ? ' appeal' : ' request'} for this order.
            </p>
            <p style={{ margin: '0 0 12px 0' }}>
              Make sure your selected items, quantities, evidence, and proof of purchase are correct. This request will be reviewed by our team.
            </p>
            {returnModal.order && (
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280' }}>
                Order #{returnModal.order.ReferenceNumber || returnModal.orderId}
              </p>
            )}
          </div>
        }
      />
      <ConfirmationModal
        isOpen={receiveConfirmModal.open}
        onClose={closeReceiveConfirmModal}
        onConfirm={confirmReceiveOrder}
        title="Confirm Order Received?"
        type="warning"
        confirmText="Yes, Order Received"
        cancelText="Go Back"
        message={
          <div style={{ textAlign: 'left', lineHeight: 1.6, fontSize: '0.95rem', color: '#374151' }}>
            <p style={{ margin: '0 0 12px 0' }}>
              Only confirm if you have inspected your items and everything is correct, undamaged, and complete.
            </p>
            <p style={{ margin: '0 0 12px 0' }}>
              <strong>Damaged or wrong item?</strong> Do not confirm. Use <strong>Return / Refund</strong> instead while this order is still in To Receive status.
            </p>
            <p style={{ margin: 0, padding: '10px 12px', background: '#fef3c7', borderRadius: '6px', fontSize: '0.875rem', color: '#92400e' }}>
              If you accidentally confirm, you cannot return the product through your account. Please contact customer service at{' '}
              <strong>designexcellence1@gmail.com</strong> or <strong>(02) 413-6682</strong>.
            </p>
            {receiveConfirmModal.order && (
              <p style={{ margin: '12px 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                Order #{receiveConfirmModal.order.ReferenceNumber || receiveConfirmModal.orderId}
              </p>
            )}
          </div>
        }
      />
      <DetailsModal
        open={detailsModal.open}
        onClose={() => setDetailsModal({ open: false, order: null })}
        order={detailsModal.order}
      />
      <ConfirmationModal
        isOpen={successModal.open}
        onClose={() => setSuccessModal({ open: false, message: '', navigateTo: null, modalType: 'buyAgain', isSuccess: false })}
        onConfirm={() => {
          setSuccessModal({ open: false, message: '', navigateTo: null, modalType: 'buyAgain', isSuccess: false });
          if (successModal.navigateTo) {
            navigate(successModal.navigateTo);
          }
        }}
        title={successModal.modalType === 'received' ? 'Received' : successModal.modalType === 'return' ? 'Return Request' : 'Buy Again'}
        message={successModal.message}
        confirmText="OK"
        type={successModal.modalType === 'received' || successModal.modalType === 'return' ? 'success' : (successModal.isSuccess ? 'success' : 'warning')}
      />
      <ReviewModal
        open={reviewModal.open}
        onClose={() => setReviewModal({ open: false, order: null })}
        order={reviewModal.order}
        onSelectProduct={handleSelectProductForReview}
      />
      {/* Return Order Modal */}
      {returnModal.open && (
        <div
          className="modal-overlay order-details-overlay"
          onClick={returnSubmitConfirmModal.open ? undefined : handleReturnOverlayClick}
          style={{
            zIndex: 2000,
            pointerEvents: returnSubmitConfirmModal.open ? 'none' : 'auto',
            opacity: returnSubmitConfirmModal.open ? 0.45 : 1
          }}
          aria-hidden={returnSubmitConfirmModal.open}
        >
          <div className="modal-content order-details-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px', width: '95vw', maxHeight: '95vh', overflowY: 'auto', overflowX: 'hidden' }}>
            <div className="order-details-header">
              <div className="order-details-title-section">
                <h2 className="order-details-title">
                  {returnModal.isAppeal ? 'Appeal Return Request' : (returnModal.isPreReceive ? 'Return Items' : 'Return Order')}
                </h2>
                <p className="order-details-subtitle">
                  Order #{returnModal.order?.ReferenceNumber || returnModal.orderId}
                  {returnModal.isPreReceive && (
                    <span style={{ display: 'block', fontSize: '0.85rem', color: '#6b7280', marginTop: '4px' }}>
                      Full refund including delivery fee — seller shoulders return shipping
                    </span>
                  )}
                </p>
              </div>
              <button 
                className="order-details-close-btn" 
                onClick={closeReturnModal}
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6l12 12" stroke="#111827" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="order-details-body" style={{ padding: '24px', overflow: 'visible', minHeight: 'auto' }}>
              {returnModal.isPreReceive && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fca5a5',
                  borderRadius: '8px',
                  fontSize: '0.875rem',
                  color: '#991b1b'
                }}>
                  <strong>7-day return window:</strong> File Return Items within {RETURN_POLICY.timeframeDays} days while the order is <strong>To Receive</strong> and before you click Order Received.
                  {' '}If the window has passed or you confirmed receipt by mistake, contact customer service at <strong>designexcellence1@gmail.com</strong> or <strong>(02) 413-6682</strong>.
                </div>
              )}
              {/* Return Policy Notice */}
              <div style={{ 
                marginBottom: '20px', 
                padding: '12px', 
                backgroundColor: '#fef3c7', 
                border: '1px solid #fbbf24',
                borderRadius: '8px',
                fontSize: '0.875rem'
              }}>
                <div style={{ fontWeight: '600', color: '#92400e', marginBottom: '6px' }}>
                  {returnModal.isPreReceive ? 'Pre-Receipt Return Policy:' : 'Return Policy Requirements:'}
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px', color: '#78350f' }}>
                  {returnModal.isPreReceive ? (
                    <>
                      <li>Eligible only while the order is in <strong>To Receive</strong> status (within <strong>{RETURN_POLICY.timeframeDays} days</strong>)</li>
                      <li><strong>Full refund</strong> of returned items plus original delivery fees</li>
                      <li>Return shipping is paid by the seller</li>
                      <li>Choose <strong>Refund</strong> (full refund including delivery) or <strong>Replacement</strong> (free replacement delivery)</li>
                      <li>Upload evidence of damage or wrong item</li>
                    </>
                  ) : (
                    <>
                      <li>Items must be returned within {RETURN_POLICY.timeframeDays} days of To Receive status (before Order Received)</li>
                      <li>Items must be unused, unmodified, and in original packaging</li>
                      <li>All parts, accessories, and documentation must be included</li>
                      <li>Original receipt or proof of purchase required</li>
                    </>
                  )}
                </ul>
              </div>

              {/* Refund or Replacement — choose before selecting items */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#111827' }}>
                  What would you like? *
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', transition: 'all 0.2s', backgroundColor: actionType === 'refund' ? '#fef3c7' : '#ffffff' }}>
                    <input
                      type="radio"
                      name="returnActionType"
                      value="refund"
                      checked={actionType === 'refund'}
                      onChange={(e) => setActionType(e.target.value)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: '600', color: '#111827', display: 'block' }}>Refund</span>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {returnModal.isPreReceive
                          ? 'Full refund including delivery fees. Seller pays return shipping.'
                          : 'Get your money back via original payment method'}
                      </span>
                    </div>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', transition: 'all 0.2s', backgroundColor: actionType === 'replacement' ? '#fef3c7' : '#ffffff' }}>
                    <input
                      type="radio"
                      name="returnActionType"
                      value="replacement"
                      checked={actionType === 'replacement'}
                      onChange={(e) => setActionType(e.target.value)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: '600', color: '#111827', display: 'block' }}>Replacement</span>
                      <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                        {returnModal.isPreReceive
                          ? 'Receive a replacement item. Seller pays return shipping; replacement delivery is free.'
                          : 'Receive a replacement item for the defective product'}
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Items Selection Section - DROPDOWN */}
              {returnModal.order && returnModal.order.items && returnModal.order.items.length > 0 && (
                <div style={{ 
                  marginBottom: '20px',
                  border: '3px solid #F0B21B',
                  backgroundColor: '#fefbf3',
                  borderRadius: '8px',
                  overflow: 'visible',
                  minHeight: 'auto'
                }}>
                  <div
                    onClick={() => setItemsSectionExpanded(!itemsSectionExpanded)}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '16px 20px',
                      cursor: 'pointer',
                      borderBottom: itemsSectionExpanded ? '2px solid #F0B21B' : 'none',
                      backgroundColor: '#F0B21B',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <ShoppingBagIcon size={20} color="#ffffff" />
                      <h4 style={{ 
                        fontSize: '18px', 
                        fontWeight: '700', 
                        color: '#ffffff',
                        margin: 0
                      }}>
                        Select Items to Return <span style={{ color: '#fef2f2' }}>*</span>
                        <span style={{ fontSize: '14px', fontWeight: '400', color: 'rgba(255,255,255,0.9)', marginLeft: '8px' }}>
                          ({returnModal.order.items.length} {returnModal.order.items.length === 1 ? 'item' : 'items'})
                        </span>
                      </h4>
                    </div>
                    <svg 
                      width="20" 
                      height="20" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      xmlns="http://www.w3.org/2000/svg"
                      style={{
                        transform: itemsSectionExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.3s ease',
                        flexShrink: 0
                      }}
                    >
                      <path d="M6 9l6 6 6-6" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  
                  {itemsSectionExpanded && (
                    <div style={{ 
                      padding: '20px', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '16px',
                      overflow: 'visible',
                      minHeight: 'auto',
                      maxHeight: 'none'
                    }}>
                      {returnModal.order.items.map((item, idx) => {
                      const itemId = item.ProductID || item.productId;
                      const variationId = item.VariationID || item.variationId || null;
                      const key = variationId ? `${itemId}_${variationId}` : `${itemId}_null`;
                      const selectedItem = selectedItems[key];
                      const maxQty = item.quantity || item.Quantity || 0;
                      const itemName = item.name || item.Name || item.ProductName || 'Unknown Product';
                      const itemPrice = item.price || item.PriceAtPurchase || 0;
                      const variationName = item.VariationName || item.variationName || null;
                      const color = item.Color || item.color || null;

                      if (!itemId) return null;

                      return (
                        <div key={key || idx} style={{
                          padding: '12px',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
                          backgroundColor: selectedItem?.returnQuantity > 0 ? '#f0f9ff' : '#ffffff',
                          width: '100%',
                          boxSizing: 'border-box'
                        }}>
                          <div style={{ marginBottom: '10px' }}>
                            <div style={{ fontWeight: '600', marginBottom: '4px', fontSize: '15px', wordBreak: 'break-word' }}>
                              {itemName}
                            </div>
                            {variationName && (
                              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px', wordBreak: 'break-word' }}>
                                {variationName} {color ? `(${color})` : ''}
                              </div>
                            )}
                            <div style={{ fontSize: '13px', color: '#6b7280' }}>
                              Ordered: {maxQty} × ₱{Number(itemPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <label style={{ fontSize: '14px', fontWeight: '500', whiteSpace: 'nowrap' }}>Return Quantity:</label>
                            <input
                              type="number"
                              min="0"
                              max={maxQty}
                              value={selectedItem?.returnQuantity ?? 0}
                              onChange={(e) => handleQuantityChange(key, e.target.value)}
                              style={{
                                width: '70px',
                                padding: '6px 8px',
                                border: '1px solid #e5e7eb',
                                borderRadius: '4px',
                                fontSize: '14px',
                                minWidth: '70px'
                              }}
                            />
                            <span style={{ fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>of {maxQty}</span>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  )}
                </div>
              )}

              {/* Return Conditions Checklist */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', color: '#111827' }}>
                  Return Conditions Checklist
                </label>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px', lineHeight: 1.55 }}>
                  These conditions will be reviewed by our team.
                </p>
                {!returnModal.isPreReceive && (
                  <ul style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 12px 1.1rem', padding: 0, lineHeight: 1.55 }}>
                    <li style={{ marginBottom: '6px' }}>
                      Meeting <strong>all</strong> requirements may result in a <strong>full refund of the product price</strong>. Delivery fees are <strong>not</strong> included in the refund.
                    </li>
                    <li>
                      If you leave <strong>1 or 2</strong> requirements unchecked, <strong>50% of the product price</strong> will be deducted from your refund.
                    </li>
                  </ul>
                )}
                {returnModal.isPreReceive && (
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 12px 0', lineHeight: 1.55 }}>
                    Approved pre-receipt <strong>refunds</strong> include delivery fees; <strong>replacements</strong> ship at no extra delivery charge. The seller pays return shipping in both cases.
                  </p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: returnConditions.originalPackaging ? '#f0fdf4' : '#ffffff', transition: 'all 0.2s' }}>
                    <input
                      type="checkbox"
                      checked={returnConditions.originalPackaging}
                      onChange={(e) => setReturnConditions(prev => ({ ...prev, originalPackaging: e.target.checked }))}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.875rem', color: '#111827' }}>
                      Item is in original, undamaged packaging
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: returnConditions.allParts ? '#f0fdf4' : '#ffffff', transition: 'all 0.2s' }}>
                    <input
                      type="checkbox"
                      checked={returnConditions.allParts}
                      onChange={(e) => setReturnConditions(prev => ({ ...prev, allParts: e.target.checked }))}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.875rem', color: '#111827' }}>
                      All parts, accessories, and documentation are included
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: returnConditions.unused ? '#f0fdf4' : '#ffffff', transition: 'all 0.2s' }}>
                    <input
                      type="checkbox"
                      checked={returnConditions.unused}
                      onChange={(e) => setReturnConditions(prev => ({ ...prev, unused: e.target.checked }))}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '0.875rem', color: '#111827' }}>
                      Item is unused and unmodified
                    </span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '6px', backgroundColor: returnConditions.proofOfPurchase ? '#f0fdf4' : '#ffffff', transition: 'all 0.2s' }}>
                    <input
                      type="checkbox"
                      checked={returnConditions.proofOfPurchase}
                      onChange={(e) => setReturnConditions(prev => ({ ...prev, proofOfPurchase: e.target.checked }))}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      required
                    />
                    <span style={{ fontSize: '0.875rem', color: '#111827' }}>
                      I have proof of purchase (Order #{returnModal.order?.ReferenceNumber || returnModal.orderId}) *
                    </span>
                  </label>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#111827' }}>
                  Return Reason Type *
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', transition: 'all 0.2s', backgroundColor: returnType === 'damage' ? '#fef3c7' : '#ffffff' }}>
                    <input
                      type="radio"
                      name="returnType"
                      value="damage"
                      checked={returnType === 'damage'}
                      onChange={(e) => setReturnType(e.target.value)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ fontWeight: '500', color: '#111827' }}>Item is Damaged</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', transition: 'all 0.2s', backgroundColor: returnType === 'wrong_item' ? '#fef3c7' : '#ffffff' }}>
                    <input
                      type="radio"
                      name="returnType"
                      value="wrong_item"
                      checked={returnType === 'wrong_item'}
                      onChange={(e) => setReturnType(e.target.value)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ fontWeight: '500', color: '#111827' }}>Wrong Item</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', transition: 'all 0.2s', backgroundColor: returnType === 'mixed' ? '#fef3c7' : '#ffffff' }}>
                    <input
                      type="radio"
                      name="returnType"
                      value="mixed"
                      checked={returnType === 'mixed'}
                      onChange={(e) => setReturnType(e.target.value)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ fontWeight: '500', color: '#111827' }}>Mixed Reason Type</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px', border: '2px solid #e5e7eb', borderRadius: '8px', transition: 'all 0.2s', backgroundColor: returnType === 'other' ? '#fef3c7' : '#ffffff' }}>
                    <input
                      type="radio"
                      name="returnType"
                      value="other"
                      checked={returnType === 'other'}
                      onChange={(e) => setReturnType(e.target.value)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ fontWeight: '500', color: '#111827' }}>Other Reason</span>
                  </label>
                </div>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#111827' }}>
                  Reason Details *
                </label>
                <textarea
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Please describe why you are returning this order..."
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                />
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', color: '#111827' }}>
                  Upload Evidence (Image or Video) *
                </label>
                <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                  Please upload at least one image or video showing the item and issue. This is required to submit your return request.
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                      Image (Max 10MB)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                    />
                    {returnImagePreview && (
                      <div style={{ marginTop: '8px' }}>
                        <img 
                          src={returnImagePreview} 
                          alt="Preview" 
                          style={{ 
                            maxWidth: '100%', 
                            maxHeight: '200px', 
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb'
                          }} 
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setReturnImage(null);
                            setReturnImagePreview(null);
                          }}
                          style={{
                            marginTop: '6px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                      Video (Max 50MB)
                    </label>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleVideoChange}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                    />
                    {returnVideoPreview && (
                      <div style={{ marginTop: '8px' }}>
                        <video 
                          src={returnVideoPreview} 
                          controls
                          style={{ 
                            maxWidth: '100%', 
                            maxHeight: '200px', 
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb'
                          }} 
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setReturnVideo(null);
                            setReturnVideoPreview(null);
                          }}
                          style={{
                            marginTop: '6px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#374151' }}>
                      Proof of Purchase Image (Order Receipt) *
                    </label>
                    <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                      Upload an image of your order receipt or proof of purchase (Order #{returnModal.order?.ReferenceNumber || returnModal.orderId})
                    </p>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleProofOfPurchaseImageChange}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '6px',
                        fontSize: '14px'
                      }}
                    />
                    {proofOfPurchaseImagePreview && (
                      <div style={{ marginTop: '8px' }}>
                        <img 
                          src={proofOfPurchaseImagePreview} 
                          alt="Proof of Purchase Preview" 
                          style={{ 
                            maxWidth: '100%', 
                            maxHeight: '200px', 
                            borderRadius: '6px',
                            border: '1px solid #e5e7eb'
                          }} 
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setProofOfPurchaseImage(null);
                            setProofOfPurchaseImagePreview(null);
                          }}
                          style={{
                            marginTop: '6px',
                            padding: '4px 8px',
                            fontSize: '12px',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={closeReturnModal}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    background: '#ffffff',
                    color: '#6b7280',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={requestReturnSubmit}
                  disabled={
                    returning[returnModal.orderId] || 
                    !actionType ||
                    !returnType || 
                    !returnReason.trim() ||
                    !returnConditions.proofOfPurchase ||
                    !proofOfPurchaseImage
                  }
                  style={{
                    padding: '10px 20px',
                    borderRadius: '6px',
                    border: 'none',
                    background: (
                      !actionType ||
                      !returnType || 
                      !returnReason.trim() ||
                      !returnConditions.proofOfPurchase ||
                      !proofOfPurchaseImage
                    ) ? '#d1d5db' : '#f59e0b',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: (
                      !actionType ||
                      !returnType || 
                      !returnReason.trim() ||
                      !returnConditions.proofOfPurchase ||
                      !proofOfPurchaseImage
                    ) ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {returning[returnModal.orderId] ? 'Submitting...' : 'Submit Return'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderHistory; 