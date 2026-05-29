import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../../shared/services/api/apiClient';
import { Bars } from 'react-loader-spinner';
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
import { canShowDeliveryTracking } from '../../../shared/utils/deliveryTracking';
import DeliveryTrackingPanel from '../../orders/components/DeliveryTrackingPanel';
import '../../orders/components/delivery-tracking.css';
import './account.css';

const statusBadgeClass = (status) => {
  if (status === 'Cancelled') return 'status-badge status-cancelled';
  if (status === 'Pending') return 'status-badge status-pending';
  if (status === 'Completed' || status === 'Delivered') return 'status-badge status-completed';
  if (status === 'Receive' || status === 'Received') return 'status-badge status-received';
  return 'status-badge';
};

const statusIcon = (status) => {
  const iconStyle = { width: '16px', height: '16px', marginRight: '8px' };
  
  if (status === 'Cancelled') return <XIcon size={16} color="#ef4444" style={iconStyle} />;
  if (status === 'Pending') return <ClockIcon size={16} color="#f59e0b" style={iconStyle} />;
  if (status === 'Processing') return <PackageIcon size={16} color="#3b82f6" style={iconStyle} />;
  if (status === 'Shipping' || status === 'Delivering') return <TruckIcon size={16} color="#8b5cf6" style={iconStyle} />;
  if (status === 'Completed' || status === 'Delivered') return <CheckCircleIcon size={16} color="#10b981" style={iconStyle} />;
  if (status === 'Receive' || status === 'Received') return <PackageIcon size={16} color="#f59e0b" style={iconStyle} />;
  return <PackageIcon size={16} color="#6b7280" style={iconStyle} />;
};

const statusBorderColor = (status) => {
  if (status === 'Cancelled') return '#ef4444';
  if (status === 'Pending') return '#f59e0b';
  if (status === 'Processing') return '#3b82f6';
  if (status === 'Shipping' || status === 'Delivering') return '#8b5cf6';
  if (status === 'Completed' || status === 'Delivered') return '#10b981';
  if (status === 'Receive' || status === 'Received') return '#f59e0b';
  return '#6b7280';
};

const orderFlow = [
  { key: 'Pending', label: 'Pending' },
  { key: 'Processing', label: 'Processing' },
  { key: 'Shipping', label: 'Shipping' },
  { key: 'Delivering', label: 'Delivering' },
  { key: 'To Receive', label: 'To Receive' },
];

const ConfirmModal = ({ open, onClose, onConfirm, countdown }) => {
  if (!open) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content confirm-modal">
        <div className="modal-header">
          <h3>Cancel Order?</h3>
        </div>
        <div className="modal-body">
          <p className="confirm-message">Are you sure you want to cancel this order? <br/>This action cannot be undone.</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>No, go back</button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={countdown > 0}>
            {countdown > 0 ? `OK (${countdown})` : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};

const DetailsModal = ({ open, onClose, order }) => {
  if (!open || !order) return null;
  const { user, address, items, Status, OrderID, OrderDate, PaymentMethod, TotalAmount, DeliveryType, DeliveryCost, DeliveryTypeName } = order;
  // Find the current step in the flow
  const statusIndex = orderFlow.findIndex(s => s.key.toLowerCase() === Status.toLowerCase());
  
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <div className="modal-header-content">
            <div className="modal-icon">
              <PackageIcon size={24} color="#ffffff" />
            </div>
            <div>
              <h3>Order #{OrderID}</h3>
              <p className="modal-subtitle">Order Details</p>
            </div>
          </div>
          <button 
            className="btn btn-secondary modal-close-btn" 
            onClick={onClose}
          >
            Close
          </button>
        </div>
        
        <div className="modal-body">
          <div className="detail-section">
            <div className="detail-section-header">
              <CalendarIcon size={16} color="#6b7280" />
              <span className="detail-section-title">Order Date</span>
            </div>
            <div className="detail-section-content">
              {new Date(OrderDate).toLocaleString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
          
          <div className="detail-section">
            <div className="detail-section-header">
              <UserIcon size={16} color="#6b7280" />
              <span className="detail-section-title">Customer Information</span>
            </div>
            <div className="detail-section-content customer-info">
              <div className="detail-item">
                <span className="detail-label">Name:</span>
                <span className="detail-value">{user?.fullName || '-'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Email:</span>
                <span className="detail-value">{user?.email || '-'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Phone:</span>
                <span className="detail-value">{user?.phoneNumber || '-'}</span>
              </div>
            </div>
          </div>
          
          <div className="detail-section">
            <div className="detail-section-header">
              <MapPinIcon size={16} color="#6b7280" />
              <span className="detail-section-title">Shipping Address</span>
            </div>
            <div className="detail-section-content">
              {address ? (
                <div className="address-details">
                  {address.Label && <div className="address-label">{address.Label}</div>}
                  <div className="address-text">
                    {[address.HouseNumber, address.Street, address.Barangay, address.City, address.Province, address.Region, address.PostalCode, address.Country].filter(Boolean).join(', ')}
                  </div>
                </div>
              ) : <div className="no-address">No shipping address provided</div>}
            </div>
          </div>
          <div className="detail-section">
            <div className="detail-section-header">
              <ShoppingBagIcon size={16} color="#6b7280" />
              <span className="detail-section-title">Products ({items?.length || 0})</span>
            </div>
            <div className="order-items-list">
              {items && items.length > 0 ? items.map((item, idx) => (
                <div key={idx} className="order-item-detail">
                  {item.image ? (
                    <img src={getImageUrl(item.image)} alt={item.name} className="item-image" />
                  ) : (
                    <div className="item-image-placeholder">
                      <PackageIcon size={24} color="#9ca3af" />
                    </div>
                  )}
                  <div className="item-info">
                    <div className="item-name">{item.name}</div>
                    <div className="item-details">
                      <div className="item-quantity">Quantity: {item.quantity}</div>
                    </div>
                  </div>
                  <div className="item-price">
                    ₱{Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
              )) : (
                <div className="no-items">
                  <PackageIcon size={32} color="#9ca3af" />
                  <div>No products found</div>
                </div>
              )}
            </div>
          </div>
        
          <div className="detail-section">
            <div className="detail-section-header">
              <CreditCardIcon size={16} color="#6b7280" />
              <span className="detail-section-title">Payment & Delivery Details</span>
            </div>
            
            <div className="payment-delivery-grid">
              <div className="detail-item">
                <span className="detail-label">Payment Method</span>
                <span className="detail-value">{PaymentMethod || 'Not specified'}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Delivery Method</span>
                <span className="detail-value">{DeliveryTypeName || 'Pick up'}</span>
              </div>
            </div>
            
            <div className="order-totals">
              <div className="detail-item">
                <span className="detail-label">Delivery Cost</span>
                <span className="detail-value">₱{Number(DeliveryCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Order Total</span>
                <span className="detail-value total-amount">₱{Number(TotalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
          {canShowDeliveryTracking(order) && (
            <div className="detail-section detail-section--tracking">
              <DeliveryTrackingPanel order={order} />
            </div>
          )}

          <div className="detail-section">
            <div className="detail-section-header">
              <ArrowRightIcon size={16} color="#6b7280" />
              <span className="detail-section-title">Order Status Flow</span>
            </div>
            <div className="status-flow">
              {orderFlow.map((step, idx) => (
                <React.Fragment key={step.key}>
                  <div className="status-step">
                    <div className={`status-icon ${idx <= statusIndex ? 'completed' : ''} ${idx === statusIndex ? 'current' : ''}`}>
                      {idx < statusIndex ? (
                        <CheckCircleIcon size={16} color="#ffffff" />
                      ) : idx === statusIndex ? (
                        <ClockIcon size={16} color="#ffffff" />
                      ) : (
                        <div className="status-dot" />
                      )}
                    </div>
                    <div className={`status-label ${idx === statusIndex ? 'current' : ''}`}>
                      {step.label}
                    </div>
                  </div>
                  {idx < orderFlow.length-1 && (
                    <div className={`status-connector ${idx < statusIndex ? 'completed' : ''}`} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const TABS = [
  { key: 'all', label: 'All Orders' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const SuccessModal = ({ open, onClose, message }) => {
  if (!open) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-content success-modal">
        <div className="modal-header">
          <h3>Order Received!</h3>
        </div>
        <div className="modal-body">
          <p className="success-message">{message || 'You have successfully received your order.'}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>OK</button>
        </div>
      </div>
    </div>
  );
};

const ReturnModal = ({ open, onClose, order, onConfirm, returning }) => {
  const overlayClickAt = useRef(0);
  const [selectedItems, setSelectedItems] = useState({});
  const [actionType, setActionType] = useState('');
  const [returnType, setReturnType] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open && order) {
      // Initialize selectedItems with all items set to 0
      const initialItems = {};
      
      // Check if order has items
      if (order.items && Array.isArray(order.items) && order.items.length > 0) {
        order.items.forEach(item => {
          const itemId = item.ProductID || item.productId;
          const variationId = item.VariationID || item.variationId || null;
          const key = variationId ? `${itemId}_${variationId}` : `${itemId}_null`;
          const quantity = item.quantity || item.Quantity || 0;
          
          if (itemId && quantity > 0) {
            initialItems[key] = {
              productId: itemId,
              variationId: variationId,
              maxQuantity: quantity,
              returnQuantity: 0
            };
          }
        });
      }
      
      setSelectedItems(initialItems);
      setActionType('');
      setReturnType('');
      setReturnReason('');
      setErrors({});
    }
  }, [open, order]);

  const handleQuantityChange = (key, value) => {
    const item = selectedItems[key];
    const numValue = parseInt(value) || 0;
    
    if (numValue < 0) return;
    if (numValue > item.maxQuantity) {
      setErrors(prev => ({ ...prev, [key]: `Cannot return more than ${item.maxQuantity}` }));
      return;
    }
    
    setSelectedItems(prev => ({
      ...prev,
      [key]: { ...item, returnQuantity: numValue }
    }));
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[key];
      return newErrors;
    });
  };

  const validateAndSubmit = () => {
    const newErrors = {};
    
    // Check if at least one item is selected for return
    const hasSelectedItems = Object.values(selectedItems).some(item => item.returnQuantity > 0);
    if (!hasSelectedItems) {
      newErrors.items = 'Please select at least one item to return.';
    }
    
    if (!actionType) {
      newErrors.actionType = 'Please select refund or replacement.';
    }
    
    if (!returnType) {
      newErrors.returnType = 'Please select return type.';
    }
    
    if (!returnReason || !returnReason.trim()) {
      newErrors.returnReason = 'Please provide a return reason.';
    }

    // Validate quantities don't exceed ordered quantities
    Object.keys(selectedItems).forEach(key => {
      const item = selectedItems[key];
      if (item.returnQuantity > item.maxQuantity) {
        newErrors[key] = `Cannot return more than ${item.maxQuantity}`;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Prepare return items array
    const returnItems = Object.values(selectedItems)
      .filter(item => item.returnQuantity > 0)
      .map(item => ({
        productId: item.productId,
        variationId: item.variationId,
        quantity: item.returnQuantity
      }));

    onConfirm({
      returnItems,
      actionType,
      returnType,
      returnReason: returnReason.trim()
    });
  };

  if (!open || !order) {
    console.log('🔴 ReturnModal not rendering - open:', open, 'order:', order);
    return null;
  }

  console.log('🔴 ReturnModal RENDERING - Order ID:', order?.OrderID);


  const hasItems = order.items && Array.isArray(order.items) && order.items.length > 0;

  // Debug: Log to verify modal is rendering
  console.log('[ReturnModal] Rendering with order:', {
    orderId: order?.OrderID,
    hasItems: hasItems,
    itemsCount: order?.items?.length,
    items: order?.items,
    selectedItemsKeys: Object.keys(selectedItems)
  });

  const handleOverlayClick = (e) => {
    if (e.target !== e.currentTarget) return;
    const now = Date.now();
    if (overlayClickAt.current && now - overlayClickAt.current < 450) {
      onClose();
      overlayClickAt.current = 0;
    } else {
      overlayClickAt.current = now;
    }
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content order-details-modal" style={{ maxWidth: '700px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-content">
            <div className="modal-icon">
              <XIcon size={24} color="#ffffff" />
            </div>
            <div>
              <h3>Return Order #{order.OrderID}</h3>
              <p className="modal-subtitle">Select items and quantities you want to return</p>
            </div>
          </div>
          <button 
            className="btn btn-secondary modal-close-btn" 
            onClick={onClose}
          >
            Close
          </button>
        </div>
        
        <div className="modal-body" style={{ display: 'block', padding: '20px' }}>
          {/* TEST ALERT - ALWAYS VISIBLE */}
          <div style={{
            padding: '15px',
            backgroundColor: '#fef3c7',
            border: '3px solid #f59e0b',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            fontWeight: '600',
            color: '#92400e'
          }}>
            🟡 TEST: Items Section Should Be Below<br/>
            Order ID: {order?.OrderID || 'N/A'}<br/>
            Items exist: {order?.items ? 'YES' : 'NO'}<br/>
            Items count: {order?.items?.length ?? 'N/A'}<br/>
            Has items: {hasItems ? 'YES' : 'NO'}
          </div>

          {/* ITEMS SELECTION SECTION - MUST BE FIRST AND ALWAYS VISIBLE */}
          <div 
            id="return-items-selection-section"
            className="return-items-section-force-visible"
            style={{
              border: '4px solid #3b82f6',
              backgroundColor: '#eff6ff',
              marginBottom: '24px',
              padding: '20px',
              borderRadius: '8px',
              minHeight: '150px',
              display: 'block !important',
              visibility: 'visible !important',
              opacity: '1 !important',
              position: 'relative',
              zIndex: 100
            }}
          >
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              marginBottom: '16px',
              borderBottom: '2px solid #3b82f6',
              paddingBottom: '12px'
            }}>
              <ShoppingBagIcon size={20} color="#1e40af" />
              <h4 style={{ 
                fontSize: '18px', 
                fontWeight: '700', 
                color: '#1e40af',
                margin: 0
              }}>
                Select Items to Return
                {order.items && Array.isArray(order.items) && (
                  <span style={{ fontSize: '14px', fontWeight: '400', color: '#6b7280', marginLeft: '8px' }}>
                    ({order.items.length} {order.items.length === 1 ? 'item' : 'items'})
                  </span>
                )}
              </h4>
            </div>
            
            {errors.items && (
              <div style={{ 
                color: '#ef4444', 
                fontSize: '14px', 
                marginBottom: '12px', 
                padding: '10px',
                backgroundColor: '#fee2e2',
                borderRadius: '6px',
                border: '1px solid #dc2626'
              }}>
                {errors.items}
              </div>
            )}
            
            {hasItems && order.items && order.items.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {order.items.map((item, idx) => {
                    const itemId = item.ProductID || item.productId;
                const variationId = item.VariationID || item.variationId || null;
                const key = variationId ? `${itemId}_${variationId}` : `${itemId}_null`;
                const selectedItem = selectedItems[key];
                const maxQty = item.quantity || item.Quantity || 0;
                const itemName = item.name || item.Name || item.ProductName || 'Unknown Product';
                const itemPrice = item.price || item.PriceAtPurchase || 0;
                const variationName = item.VariationName || item.variationName || null;
                const color = item.Color || item.color || null;

                if (!itemId) {
                  console.warn('Item missing ProductID:', item);
                  return null;
                }

                return (
                  <div key={key || idx} style={{
                    padding: '12px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    backgroundColor: selectedItem?.returnQuantity > 0 ? '#f0f9ff' : '#ffffff'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                          {itemName}
                        </div>
                        {variationName && (
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            {variationName} {color ? `(${color})` : ''}
                          </div>
                        )}
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                          Ordered: {maxQty} × ₱{Number(itemPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <label style={{ fontSize: '14px', fontWeight: '500' }}>Return Quantity:</label>
                      <input
                        type="number"
                        min="0"
                        max={maxQty}
                        value={selectedItem?.returnQuantity || 0}
                        onChange={(e) => handleQuantityChange(key, e.target.value)}
                        style={{
                          width: '80px',
                          padding: '6px 8px',
                          border: errors[key] ? '1px solid #ef4444' : '1px solid #e5e7eb',
                          borderRadius: '6px',
                          fontSize: '14px'
                        }}
                      />
                      <span style={{ fontSize: '14px', color: '#6b7280' }}>of {maxQty}</span>
                      {errors[key] && (
                        <span style={{ color: '#ef4444', fontSize: '12px' }}>{errors[key]}</span>
                      )}
                    </div>
                  </div>
                );
                })}
              </div>
            ) : (
              <div style={{ 
                padding: '20px', 
                textAlign: 'center', 
                color: '#6b7280',
                backgroundColor: '#fef2f2',
                border: '2px solid #fecaca',
                borderRadius: '8px'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '8px', color: '#dc2626', fontSize: '16px' }}>
                  ⚠️ No items available for return
                </div>
                <div style={{ fontSize: '14px', marginBottom: '8px' }}>
                  {!order.items 
                    ? 'Items not loaded. Please refresh and try again.'
                    : order.items && Array.isArray(order.items) && order.items.length === 0 
                    ? 'This order has no items to return.' 
                    : 'Unable to load order items. Please refresh the page and try again.'}
                </div>
              </div>
            )}
          </div>

          <div className="detail-section">
            <div className="detail-section-header">
              <span className="detail-section-title">
                What would you like? <span style={{ color: '#ef4444' }}>*</span>
              </span>
            </div>
            <div className="detail-section-content">
              {errors.actionType && <div style={{ color: '#ef4444', fontSize: '14px', marginBottom: '12px' }}>{errors.actionType}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px', borderRadius: '6px', border: actionType === 'refund' ? '2px solid #F0B21B' : '1px solid #e5e7eb' }}>
                  <input
                    type="radio"
                    value="refund"
                    checked={actionType === 'refund'}
                    onChange={(e) => setActionType(e.target.value)}
                  />
                  <div>
                    <div style={{ fontWeight: '600' }}>Refund</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Get your money back via original payment method</div>
                  </div>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '8px', borderRadius: '6px', border: actionType === 'replacement' ? '2px solid #F0B21B' : '1px solid #e5e7eb' }}>
                  <input
                    type="radio"
                    value="replacement"
                    checked={actionType === 'replacement'}
                    onChange={(e) => setActionType(e.target.value)}
                  />
                  <div>
                    <div style={{ fontWeight: '600' }}>Replacement</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Receive a replacement item for the defective product</div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-header">
              <span className="detail-section-title">
                Return Reason Type <span style={{ color: '#ef4444' }}>*</span>
              </span>
            </div>
            <div className="detail-section-content">
              {errors.returnType && <div style={{ color: '#ef4444', fontSize: '14px', marginBottom: '12px' }}>{errors.returnType}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    value="damage"
                    checked={returnType === 'damage'}
                    onChange={(e) => setReturnType(e.target.value)}
                  />
                  Item is Damaged
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    value="other"
                    checked={returnType === 'other'}
                    onChange={(e) => setReturnType(e.target.value)}
                  />
                  Other Reason
                </label>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <div className="detail-section-header">
              <span className="detail-section-title">
                Reason Details <span style={{ color: '#ef4444' }}>*</span>
              </span>
            </div>
            <div className="detail-section-content">
              {errors.returnReason && <div style={{ color: '#ef4444', fontSize: '14px', marginBottom: '8px' }}>{errors.returnReason}</div>}
              <textarea
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Please describe why you are returning this order..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: errors.returnReason ? '1px solid #ef4444' : '1px solid #e5e7eb',
                  borderRadius: '6px',
                  fontSize: '14px',
                  minHeight: '80px',
                  resize: 'vertical',
                  fontFamily: 'inherit'
                }}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={returning}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={validateAndSubmit}
            disabled={returning}
            style={{ background: '#F0B21B' }}
          >
            {returning ? 'Submitting...' : 'Submit Return Request'}
          </button>
        </div>
      </div>
    </div>
  );
};

const OrderHistory = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState({});
  const [modal, setModal] = useState({ open: false, orderId: null });
  const [countdown, setCountdown] = useState(5);
  const [activeTab, setActiveTab] = useState('all');
  const [detailsModal, setDetailsModal] = useState({ open: false, order: null });
  const [receiving, setReceiving] = useState({});
  const [successModal, setSuccessModal] = useState({ open: false, message: '' });
  const [returnModal, setReturnModal] = useState({ open: false, order: null });
  const [returning, setReturning] = useState({});

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
      } else {
        alert(res.message || 'Failed to cancel order.');
      }
    } catch (err) {
      alert('Failed to cancel order.');
    } finally {
      setCancelling((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  // Add handler for receiving order
  const handleReceiveOrder = async (orderId) => {
    setReceiving((prev) => ({ ...prev, [orderId]: true }));
    try {
      const res = await apiClient.put(`/api/customer/orders/${orderId}/receive`);
      if (res.success) {
        setOrders((prev) => prev.map(order => order.OrderID === orderId ? { ...order, Status: 'Completed' } : order));
        setSuccessModal({ open: true, message: 'Order has been marked as completed. Thank you for confirming receipt!' });
      } else {
        alert(res.message || 'Failed to mark order as received.');
      }
    } catch (err) {
      alert('Failed to mark order as received.');
    } finally {
      setReceiving((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  // Handler for opening return modal
  const openReturnModal = (order) => {
    console.log('🔴 openReturnModal called with order:', order);
    console.log('🔴 Order items:', order?.items);
    if (!order) {
      alert('Error: Order data not available. Please refresh the page.');
      return;
    }
    console.log('🔴 Setting returnModal state to open');
    setReturnModal({ open: true, order });
  };

  const closeReturnModal = () => {
    setReturnModal({ open: false, order: null });
  };

  // Handler for submitting return request
  const handleSubmitReturn = async (returnData) => {
    const orderId = returnModal.order.OrderID;
    setReturning((prev) => ({ ...prev, [orderId]: true }));
    
    try {
      const res = await apiClient.put(`/api/customer/orders/${orderId}/return`, returnData);
      
      if (res.success) {
        setOrders((prev) => prev.map(order => 
          order.OrderID === orderId ? { ...order, Status: 'Returned' } : order
        ));
        closeReturnModal();
        setSuccessModal({ 
          open: true, 
          message: 'Return request submitted successfully. We will review your request shortly.' 
        });
      } else {
        alert(res.message || 'Failed to submit return request.');
      }
    } catch (err) {
      console.error('Error submitting return:', err);
      alert(err.response?.data?.message || 'Failed to submit return request. Please try again.');
    } finally {
      setReturning((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  let filteredOrders = orders;
  if (activeTab === 'completed') {
    filteredOrders = orders.filter(order => order.Status === 'Completed' || order.Status === 'Delivered');
  } else if (activeTab === 'cancelled') {
    filteredOrders = orders.filter(order => order.Status === 'Cancelled');
  } else if (activeTab === 'all') {
    filteredOrders = orders.filter(order => order.Status !== 'Cancelled');
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
      <Bars 
        color="#F0B21B" 
        height={window.innerWidth < 768 ? 32 : 40} 
        width={window.innerWidth < 768 ? 32 : 40} 
      />
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
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h3 className="section-title" style={{ 
          fontSize: '24px', 
          fontWeight: '700', 
          color: '#1f2937', 
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <PackageIcon size={24} color="#F0B21B" />
          Order History
        </h3>
        <p style={{ color: '#6b7280', fontSize: '14px', margin: 0 }}>
          Track and manage all your orders
        </p>
      </div>
      
      <div className="order-history-tabs" style={{
        display:'flex',
        gap:8,
        marginBottom:32,
        backgroundColor:'#f9fafb',
        padding:'4px',
        borderRadius:'12px',
        border:'1px solid #e5e7eb'
      }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            className={`btn btn-secondary${activeTab === tab.key ? ' active-tab' : ''}`}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === tab.key ? '#F0B21B' : 'transparent',
              color: activeTab === tab.key ? '#fff' : '#6b7280',
              fontWeight: activeTab === tab.key ? 600 : 500,
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.key === 'all' && <PackageIcon size={16} color={activeTab === tab.key ? '#fff' : '#6b7280'} />}
            {tab.key === 'completed' && <CheckCircleIcon size={16} color={activeTab === tab.key ? '#fff' : '#6b7280'} />}
            {tab.key === 'cancelled' && <XIcon size={16} color={activeTab === tab.key ? '#fff' : '#6b7280'} />}
            {tab.label}
          </button>
        ))}
      </div>
      <div className="orders-list" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {filteredOrders.length === 0 ? (
          <div style={{
            padding: '60px 40px',
            textAlign: 'center',
            backgroundColor: '#f9fafb',
            borderRadius: '12px',
            border: '1px solid #e5e7eb'
          }}>
            <PackageIcon size={48} color="#9ca3af" style={{ marginBottom: '16px' }} />
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
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
              borderRadius: '16px',
              border: `1px solid #e5e7eb`,
              borderLeft: `6px solid ${statusBorderColor(order.Status)}`,
              padding: '24px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              transition: 'all 0.3s ease',
              position: 'relative',
              overflow: 'hidden'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 10px 25px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {/* Order Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '20px'
            }}>
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '8px'
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    backgroundColor: '#F0B21B',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <PackageIcon size={20} color="#ffffff" />
                  </div>
                  <div>
                    <div style={{
                      fontSize: '18px',
                      fontWeight: '700',
                      color: '#1f2937'
                    }}>
                      Order #{order.OrderID}
                    </div>
                    <div style={{
                      fontSize: '14px',
                      color: '#6b7280',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <CalendarIcon size={14} color="#6b7280" />
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
              <div>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  backgroundColor: statusBorderColor(order.Status) + '15',
                  color: statusBorderColor(order.Status),
                  fontWeight: '600',
                  fontSize: '14px',
                  border: `1px solid ${statusBorderColor(order.Status)}40`
                }}>
                  {statusIcon(order.Status)}
                  {order.Status}
                </span>
              </div>
            </div>

            {/* Order Items Preview */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                fontSize: '14px',
                fontWeight: '600',
                color: '#374151',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <ShoppingBagIcon size={16} color="#6b7280" />
                Items ({order.items?.length || 0})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {order.items && order.items.length > 0 ? order.items.slice(0, 3).map((item, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    backgroundColor: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb'
                  }}>
                    {item.image ? (
                      <img src={getImageUrl(item.image)} alt={item.name} style={{
                        width: '40px',
                        height: '40px',
                        objectFit: 'cover',
                        borderRadius: '6px',
                        background: '#e5e7eb'
                      }} />
                    ) : (
                      <div style={{
                        width: '40px',
                        height: '40px',
                        backgroundColor: '#e5e7eb',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <PackageIcon size={16} color="#9ca3af" />
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#374151',
                        marginBottom: '2px'
                      }}>
                        {item.name}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#6b7280'
                      }}>
                        Quantity: {item.quantity}
                      </div>
                    </div>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#374151'
                    }}>
                      ₱{Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                )) : (
                  <div style={{
                    padding: '16px',
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontSize: '14px'
                  }}>
                    No products found
                  </div>
                )}
                {order.items && order.items.length > 3 && (
                  <div style={{
                    fontSize: '12px',
                    color: '#6b7280',
                    textAlign: 'center',
                    padding: '8px',
                    fontStyle: 'italic'
                  }}>
                    +{order.items.length - 3} more items
                  </div>
                )}
              </div>
            </div>

            {/* Order Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '20px',
              borderTop: '1px solid #e5e7eb'
            }}>
              <div style={{
                fontSize: '16px',
                fontWeight: '700',
                color: '#1f2937',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <CreditCardIcon size={16} color="#6b7280" />
                Total: ₱{Number(order.TotalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setDetailsModal({ open: true, order })}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    background: '#ffffff',
                    color: '#374151',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <EyeIcon size={16} color="#374151" />
                  View Details
                </button>
                
                {order.Status !== 'Cancelled' && order.Status !== 'Completed' && order.Status !== 'Delivered' && order.Status !== 'Shipping' && order.Status !== 'Delivering' && order.Status !== 'Receive' && order.Status !== 'Received' && order.Status !== 'To Receive' && (
                  <button
                    className="btn btn-primary"
                    disabled={cancelling[order.OrderID]}
                    onClick={() => openModal(order.OrderID)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#ef4444',
                      color: '#ffffff',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <XIcon size={16} color="#ffffff" style={{ marginRight: '6px' }} />
                    {cancelling[order.OrderID] ? 'Cancelling...' : 'Cancel'}
                  </button>
                )}
                
                {(order.Status === 'Shipping' || order.Status === 'Delivering') && (
                  <span style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    background: '#f0f9ff',
                    color: '#0369a1',
                    fontSize: '14px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <TruckIcon size={16} color="#0369a1" />
                    Cannot Cancel - Order is Shipping
                  </span>
                )}
                
                {(order.Status === 'Receive' || order.Status === 'Received') && (
                  <button
                    className="btn btn-success"
                    disabled={receiving[order.OrderID]}
                    onClick={() => handleReceiveOrder(order.OrderID)}
                    style={{
                      padding: '10px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#10b981',
                      color: '#ffffff',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <CheckCircleIcon size={16} color="#ffffff" style={{ marginRight: '6px' }} />
                    {receiving[order.OrderID] ? 'Processing...' : 'Receive Order'}
                  </button>
                )}
                
                {(order.Status === 'Completed' || order.Status === 'Delivered') && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => openReturnModal(order)}
                      disabled={returning[order.OrderID]}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#ef4444',
                        color: '#ffffff',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <XIcon size={16} color="#ffffff" />
                      Return Order
                    </button>
                    {order.items && order.items.length > 0 && (
                      <button
                        className="btn btn-primary"
                        onClick={() => navigate(`/product/${order.items[0].ProductID}`)}
                        style={{
                          padding: '10px 16px',
                          borderRadius: '8px',
                          border: 'none',
                          background: '#F0B21B',
                          color: '#ffffff',
                          fontSize: '14px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <StarIcon size={16} color="#ffffff" />
                        Review Product
                      </button>
                    )}
                  </div>
                )}
                
                {order.Status === 'Cancelled' && (
                  <span style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    background: '#f9fafb',
                    color: '#9ca3af',
                    fontSize: '14px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <XIcon size={16} color="#9ca3af" />
                    Cancelled
                  </span>
                )}
                
                {(order.Status === 'Completed' || order.Status === 'Delivered') && (
                  <span style={{
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: '1px solid #10b981',
                    background: '#10b98115',
                    color: '#10b981',
                    fontSize: '14px',
                    fontWeight: '500',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <CheckCircleIcon size={16} color="#10b981" />
                    Completed
                  </span>
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
      />
      <DetailsModal
        open={detailsModal.open}
        onClose={() => setDetailsModal({ open: false, order: null })}
        order={detailsModal.order}
      />
      <SuccessModal
        open={successModal.open}
        onClose={() => setSuccessModal({ open: false, message: '' })}
        message={successModal.message}
      />
      {returnModal.open && (
        <div style={{ position: 'fixed', top: '10px', right: '10px', backgroundColor: 'red', color: 'white', padding: '10px', zIndex: 99999 }}>
          DEBUG: ReturnModal should be open! Order ID: {returnModal.order?.OrderID}
        </div>
      )}
      <ReturnModal
        open={returnModal.open}
        onClose={closeReturnModal}
        order={returnModal.order}
        onConfirm={handleSubmitReturn}
        returning={returning[returnModal.order?.OrderID] || false}
      />
    </div>
  );
};

export default OrderHistory; 