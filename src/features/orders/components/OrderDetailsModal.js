import React from 'react';
import DeliveryTrackingPanel from './DeliveryTrackingPanel';
import { canShowDeliveryTracking } from '../../../shared/utils/deliveryTracking';
import { getImageUrl } from '../../../shared/utils/imageUtils';

const OrderDetailsModal = ({ open, order, onClose, getStatusBadgeClass, getStatusIcon }) => {
  if (!open || !order) return null;

  const showTracking = canShowDeliveryTracking(order);

  return (
    <div className="order-details-overlay" onClick={onClose} role="presentation">
      <div className="order-details-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="order-details-title">
        <div className="order-details-modal-header">
          <div>
            <h2 id="order-details-title">Order #{order.OrderID}</h2>
            <p className="order-details-modal-date">
              {new Date(order.OrderDate).toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </p>
          </div>
          <button type="button" className="order-details-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="order-details-modal-body">
          <div className="order-details-summary-row">
            <span className={`${getStatusBadgeClass(order.Status)}`}>
              {getStatusIcon(order.Status)}
              <span>{order.Status}</span>
            </span>
            <span className="order-details-total">
              Total: ₱{parseFloat(order.TotalAmount).toLocaleString()}
            </span>
          </div>

          {showTracking && <DeliveryTrackingPanel order={order} />}

          <div className="order-details-section">
            <h4>Order items ({order.items?.length || 0})</h4>
            <div className="order-details-items">
              {order.items?.map((item, index) => (
                <div key={index} className="order-details-item">
                  <img
                    src={getImageUrl(item.image)}
                    alt={item.name}
                    onError={(e) => { e.target.src = '/logo192.png'; }}
                  />
                  <div className="order-details-item-info">
                    <strong>{item.name}</strong>
                    <span>Qty: {item.quantity}</span>
                  </div>
                  <span className="order-details-item-price">
                    ₱{((item.price || 0) * (item.quantity || 0)).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {(order.DeliveryTypeName || order.PaymentMethod) && (
            <div className="order-details-meta">
              {order.DeliveryTypeName && (
                <p><strong>Delivery:</strong> {order.DeliveryTypeName}</p>
              )}
              {order.PaymentMethod && (
                <p><strong>Payment:</strong> {order.PaymentMethod}</p>
              )}
            </div>
          )}
        </div>

        <div className="order-details-modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailsModal;
